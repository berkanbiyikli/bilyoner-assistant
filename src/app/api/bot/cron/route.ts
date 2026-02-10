/**
 * Bot Cron API - 5 dakikada bir çalışan ana sistem
 * 
 * İşlevler:
 * 1. Aktif kupon maçlarını gerçek zamanlı takip
 * 2. Değişiklik varsa kupon durumu tweet at (quote tweet)
 * 3. Diğer canlı maçlarda fırsat tara, yeni fırsat varsa paylaş
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBankrollState, saveBankrollState } from '@/lib/bot/bankroll-store';
import { sendQuoteTweet, sendTweet } from '@/lib/bot/twitter';
import { isApiCallAllowed, updateRateLimitFromHeaders } from '@/lib/api-football/client';
import type { BotMatch, BankrollState } from '@/lib/bot/types';
import { isTop20League } from '@/config/league-priorities';
import { saveLivePick, type LivePick } from '@/lib/bot/live-pick-tracker';
import { cacheGet, cacheSet } from '@/lib/cache/redis-cache';
import { detectLiveOpportunities, filterBestOpportunities } from '@/lib/bot/live-engine';
import { DEFAULT_LIVE_BOT_CONFIG, type LiveMatch, type LiveMatchStats } from '@/lib/bot/live-types';

// API Football config
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const API_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

// ============ REDIS TABANLI SPAM ÖNLEME ============
// Vercel serverless cold start'lara dayanıklı

const REDIS_KEY_COUPON_SNAPSHOT = 'bot:cron:couponSnapshot';
const REDIS_KEY_OPP_SNAPSHOT = 'bot:cron:oppSnapshot';
const REDIS_KEY_COUPON_TWEET_TIME = 'bot:cron:couponTweetTime';
const REDIS_KEY_OPP_TWEET_TIME = 'bot:cron:oppTweetTime';
const REDIS_KEY_SCORE_SNAPSHOT = 'bot:cron:scoreSnapshot';
const REDIS_KEY_HALFTIME_SNAPSHOT = 'bot:cron:halftimeSnapshot';
const REDIS_KEY_SUGGESTED_MATCHES = 'bot:cron:suggestedMatches';
const REDIS_KEY_TWEETED_FIXTURES = 'bot:live:tweetedFixtures'; // Shared with live route

// Helper functions
async function getCronState<T>(key: string, fallback: T): Promise<T> {
  return (await cacheGet<T>(key)) ?? fallback;
}
async function setCronState<T>(key: string, value: T, ttl: number = 3600): Promise<void> {
  await cacheSet(key, value, ttl);
}

interface LiveMatchData {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: string;
  league: string;
  events?: Array<{
    type: string;
    player: string;
    minute: number;
  }>;
}

interface CouponMatchStatus {
  match: BotMatch;
  live: LiveMatchData | null;
  predictionStatus: 'winning' | 'losing' | 'pending' | 'won' | 'lost';
  neededMessage: string;
}

/**
 * Fixture ID ile canlı maç verisini çek
 */
async function fetchLiveMatch(fixtureId: number): Promise<LiveMatchData | null> {
  try {
    if (!isApiCallAllowed('/fixtures')) return null;
    const res = await fetch(`${API_BASE}/fixtures?id=${fixtureId}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 0 },
    });
    updateRateLimitFromHeaders(res.headers);
    const data = await res.json();
    const fixture = data?.response?.[0];
    
    if (!fixture) return null;
    
    return {
      fixtureId,
      homeTeam: fixture.teams?.home?.name || '',
      awayTeam: fixture.teams?.away?.name || '',
      homeScore: fixture.goals?.home ?? 0,
      awayScore: fixture.goals?.away ?? 0,
      minute: fixture.fixture?.status?.elapsed || 0,
      status: fixture.fixture?.status?.short || '',
      league: fixture.league?.name || '',
    };
  } catch (error) {
    console.error(`[Cron] Fixture ${fixtureId} fetch hatası:`, error);
    return null;
  }
}

/**
 * Tahmin durumunu ve "bize ne lazım" mesajını hesapla
 */
function analyzePrediction(match: BotMatch, live: LiveMatchData): CouponMatchStatus {
  const { homeScore, awayScore, minute, status } = live;
  const totalGoals = homeScore + awayScore;
  const predType = match.prediction.type?.toLowerCase() || '';
  const predLabel = match.prediction.label?.toLowerCase() || '';
  
  // Maç bitti mi?
  const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
  const isFinished = finishedStatuses.includes(status);
  
  // Canlı mı?
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'];
  const isLive = liveStatuses.includes(status);
  
  let predictionStatus: 'winning' | 'losing' | 'pending' | 'won' | 'lost' = 'pending';
  let neededMessage = '';
  
  // Prediction type belirleme (label'dan da kontrol et)
  const isOver25 = predType === 'over25' || predLabel.includes('üst');
  const isBtts = predType === 'btts' || predLabel.includes('kg var') || predLabel.includes('var (');
  const isHome = predType === 'home' && !isBtts; // BTTS değilse home
  const isAway = predType === 'away';
  
  // Üst 2.5 analizi
  if (isOver25) {
    if (totalGoals >= 3) {
      predictionStatus = isFinished ? 'won' : 'winning';
      neededMessage = `✅ ${totalGoals} gol var, TUTTU!`;
    } else {
      const needed = 3 - totalGoals;
      if (isFinished) {
        predictionStatus = 'lost';
        neededMessage = `❌ ${totalGoals} gol, tutmadı`;
      } else {
        predictionStatus = 'losing';
        const minutesLeft = 90 - minute;
        neededMessage = `⏳ ${needed} gol lazım (${minutesLeft}' kaldı)`;
      }
    }
  }
  
  // KG Var analizi
  else if (isBtts) {
    if (homeScore > 0 && awayScore > 0) {
      predictionStatus = isFinished ? 'won' : 'winning';
      neededMessage = `✅ ${homeScore}-${awayScore} KG OLDU!`;
    } else {
      if (isFinished) {
        predictionStatus = 'lost';
        neededMessage = `❌ ${homeScore}-${awayScore}, KG olmadı`;
      } else {
        predictionStatus = 'losing';
        if (homeScore === 0 && awayScore === 0) {
          neededMessage = `⏳ İki takımın da gol atması lazım`;
        } else if (homeScore === 0) {
          neededMessage = `⏳ ${live.homeTeam} gol atmalı`;
        } else {
          neededMessage = `⏳ ${live.awayTeam} gol atmalı`;
        }
      }
    }
  }
  
  // MS 1 (Ev Sahibi) analizi
  else if (isHome) {
    if (homeScore > awayScore) {
      predictionStatus = isFinished ? 'won' : 'winning';
      neededMessage = `✅ ${homeScore}-${awayScore} Ev sahibi önde!`;
    } else if (homeScore === awayScore) {
      if (isFinished) {
        predictionStatus = 'lost';
        neededMessage = `❌ ${homeScore}-${awayScore} Berabere bitti`;
      } else {
        predictionStatus = 'losing';
        neededMessage = `⏳ ${live.homeTeam} gol atmalı`;
      }
    } else {
      if (isFinished) {
        predictionStatus = 'lost';
        neededMessage = `❌ ${homeScore}-${awayScore} Deplasman kazandı`;
      } else {
        predictionStatus = 'losing';
        const diff = awayScore - homeScore;
        neededMessage = `⏳ ${diff + 1} gol lazım ${live.homeTeam}'ya`;
      }
    }
  }
  
  // MS 2 (Deplasman) analizi
  else if (isAway) {
    if (awayScore > homeScore) {
      predictionStatus = isFinished ? 'won' : 'winning';
      neededMessage = `✅ ${homeScore}-${awayScore} Deplasman önde!`;
    } else if (homeScore === awayScore) {
      if (isFinished) {
        predictionStatus = 'lost';
        neededMessage = `❌ ${homeScore}-${awayScore} Berabere bitti`;
      } else {
        predictionStatus = 'losing';
        neededMessage = `⏳ ${live.awayTeam} gol atmalı`;
      }
    } else {
      if (isFinished) {
        predictionStatus = 'lost';
        neededMessage = `❌ ${homeScore}-${awayScore} Ev sahibi kazandı`;
      } else {
        predictionStatus = 'losing';
        const diff = homeScore - awayScore;
        neededMessage = `⏳ ${diff + 1} gol lazım ${live.awayTeam}'a`;
      }
    }
  }
  
  // Başlamadı
  if (!isLive && !isFinished) {
    predictionStatus = 'pending';
    neededMessage = `⏰ Henüz başlamadı`;
  }
  
  return { match, live, predictionStatus, neededMessage };
}

/**
 * Canlı proje durumu tweet metni oluştur - Mühendislik dili
 */
function formatCouponStatusTweet(statuses: CouponMatchStatus[]): string {
  const lines: string[] = [];
  
  lines.push('📡 CANLI PROJE TAKİBİ');
  lines.push('');
  
  let validatedCount = 0;
  let pendingCount = 0;
  let deviationCount = 0;
  
  statuses.forEach((s, i) => {
    const { match, live, predictionStatus, neededMessage } = s;
    const score = live ? `${live.homeScore}-${live.awayScore}` : '?-?';
    const minute = live?.minute || 0;
    const statusEmoji = predictionStatus === 'winning' || predictionStatus === 'won' ? '✓' : 
                       predictionStatus === 'losing' ? '⚠️' : 
                       predictionStatus === 'lost' ? '✗' : '⏳';
    
    if (predictionStatus === 'winning' || predictionStatus === 'won') validatedCount++;
    if (predictionStatus === 'pending') pendingCount++;
    if (predictionStatus === 'losing' || predictionStatus === 'lost') deviationCount++;
    
    lines.push(`${statusEmoji} ${match.homeTeam} ${score} ${match.awayTeam}`);
    lines.push(`   Model: ${match.prediction.label} @${match.prediction.odds.toFixed(2)}`);
    
    if (live && minute > 0) {
      lines.push(`   ${neededMessage} (${minute}')`);
    } else {
      lines.push(`   ${neededMessage}`);
    }
    
    if (i < statuses.length - 1) lines.push('');
  });
  
  lines.push('');
  
  // Özet - Mühendislik dili
  if (validatedCount === statuses.length) {
    lines.push('🔥 Tüm model çıktıları doğrulanıyor!');
  } else if (deviationCount > 0) {
    lines.push(`📊 ${deviationCount} çıktıda sapma, sistem takipte.`);
  } else if (pendingCount > 0) {
    lines.push(`⏳ ${pendingCount} maç henüz başlamadı.`);
  }
  
  lines.push('');
  lines.push('#Bahis #CanlıKupon #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Canlı fırsat tara - Genel bahis fırsatları (Üst Gol, Kart, Korner, KG Var)
 * 
 * Mantık:
 * - 80+ dk'da fırsat vermiyoruz (maç bitiyor)
 * - İstatistik bazlı karar: şut baskısı, faul yoğunluğu, korner temposu
 * - Gol üstü, kart üstü, korner üstü, KG var gibi genel bahisler öner
 * - Aynı maçı tekrar önerme
 */

// Daha önce önerilen maçları takip et (spam önleme - Redis tabanlı)
const SUGGESTION_COOLDOWN = 30 * 60 * 1000; // 30 dakika aynı maçı önerme

type SuggestedMatchesMap = Record<string, { timestamp: number; opportunity: string }>;

async function getSuggestedMatches(): Promise<SuggestedMatchesMap> {
  return (await cacheGet<SuggestedMatchesMap>(REDIS_KEY_SUGGESTED_MATCHES)) || {};
}
async function setSuggestedMatches(data: SuggestedMatchesMap): Promise<void> {
  await cacheSet(REDIS_KEY_SUGGESTED_MATCHES, data, 3600);
}

async function scanLiveOpportunities(): Promise<Array<{
  match: LiveMatchData;
  opportunity: string;
  confidence: number;
  odds: number;
  reasoning: string;
}>> {
  try {
    // Canlı maçları çek
    if (!isApiCallAllowed('/fixtures')) return [];
    const res = await fetch(`${API_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 0 },
    });
    updateRateLimitFromHeaders(res.headers);
    const data = await res.json();
    const liveMatches = data?.response || [];
    
    // Eski öneri kayıtlarını temizle
    const now = Date.now();
    const suggestedMatches = await getSuggestedMatches();
    for (const fixtureId of Object.keys(suggestedMatches)) {
      if (now - suggestedMatches[fixtureId].timestamp > SUGGESTION_COOLDOWN) {
        delete suggestedMatches[fixtureId];
      }
    }
    
    // Top 20 lig filtresi + LiveMatch formatına dönüştür
    const engineMatches: LiveMatch[] = [];
    
    for (const fixture of liveMatches.slice(0, 50)) {
      const fixtureId = fixture.fixture?.id;
      const minute = fixture.fixture?.status?.elapsed || 0;
      const status = fixture.fixture?.status?.short || '';
      const leagueId = fixture.league?.id || 0;
      
      // Tüm ligler kabul (filtre kaldırıldı)
      if (minute >= 85 || status === 'HT' || status === 'FT') continue;
      if (minute < 15) continue;
      
      // İstatistikleri çek
      const stats: LiveMatchStats = {
        homePossession: 50, awayPossession: 50,
        homeShotsTotal: 0, awayShotsTotal: 0,
        homeShotsOnTarget: 0, awayShotsOnTarget: 0,
        homeCorners: 0, awayCorners: 0,
        homeFouls: 0, awayFouls: 0,
        homeYellowCards: 0, awayYellowCards: 0,
        homeRedCards: 0, awayRedCards: 0,
        homeDangerousAttacks: 0, awayDangerousAttacks: 0,
      };
      
      try {
        if (isApiCallAllowed('/fixtures/statistics')) {
          const statsRes = await fetch(`${API_BASE}/fixtures/statistics?fixture=${fixtureId}`, {
            headers: { 'x-apisports-key': API_KEY },
            next: { revalidate: 0 },
          });
          updateRateLimitFromHeaders(statsRes.headers);
          const statsData = await statsRes.json();
          const statsArray = statsData?.response || [];
          
          if (Array.isArray(statsArray) && statsArray.length >= 2) {
            const homeArr = statsArray[0]?.statistics || [];
            const awayArr = statsArray[1]?.statistics || [];
            
            for (const s of homeArr) {
              if (s.type === 'Ball Possession') stats.homePossession = parseInt(s.value) || 50;
              if (s.type === 'Shots on Goal') stats.homeShotsOnTarget = parseInt(s.value) || 0;
              if (s.type === 'Total Shots') stats.homeShotsTotal = parseInt(s.value) || 0;
              if (s.type === 'Dangerous Attacks') stats.homeDangerousAttacks = parseInt(s.value) || 0;
              if (s.type === 'Yellow Cards') stats.homeYellowCards = parseInt(s.value) || 0;
              if (s.type === 'Red Cards') stats.homeRedCards = parseInt(s.value) || 0;
              if (s.type === 'Fouls') stats.homeFouls = parseInt(s.value) || 0;
              if (s.type === 'Corner Kicks') stats.homeCorners = parseInt(s.value) || 0;
            }
            for (const s of awayArr) {
              if (s.type === 'Ball Possession') stats.awayPossession = parseInt(s.value) || 50;
              if (s.type === 'Shots on Goal') stats.awayShotsOnTarget = parseInt(s.value) || 0;
              if (s.type === 'Total Shots') stats.awayShotsTotal = parseInt(s.value) || 0;
              if (s.type === 'Dangerous Attacks') stats.awayDangerousAttacks = parseInt(s.value) || 0;
              if (s.type === 'Yellow Cards') stats.awayYellowCards = parseInt(s.value) || 0;
              if (s.type === 'Red Cards') stats.awayRedCards = parseInt(s.value) || 0;
              if (s.type === 'Fouls') stats.awayFouls = parseInt(s.value) || 0;
              if (s.type === 'Corner Kicks') stats.awayCorners = parseInt(s.value) || 0;
            }
          }
        }
      } catch (statsErr) {
        console.error(`[Cron] Stats fetch failed for fixture ${fixtureId}:`, statsErr);
      }
      
      engineMatches.push({
        fixtureId,
        homeTeam: fixture.teams?.home?.name || '',
        awayTeam: fixture.teams?.away?.name || '',
        homeTeamId: fixture.teams?.home?.id || 0,
        awayTeamId: fixture.teams?.away?.id || 0,
        homeScore: fixture.goals?.home ?? 0,
        awayScore: fixture.goals?.away ?? 0,
        minute,
        status: status as LiveMatch['status'],
        league: fixture.league?.name || '',
        leagueId: fixture.league?.id || 0,
        stats,
        lastUpdated: new Date(),
      });
      
      // Rate limit koruma
      await new Promise(r => setTimeout(r, 150));
    }
    
    if (engineMatches.length === 0) return [];
    
    // === YENİ VALUE PİPELİNE: Poisson model + gerçek oranlar + value karşılaştırma ===
    const engineOpps = await detectLiveOpportunities(engineMatches, DEFAULT_LIVE_BOT_CONFIG);
    const bestOpps = filterBestOpportunities(engineOpps, 1, 3);
    
    // LiveOpportunity → eski format dönüşümü (tweet + pick sistemi ile uyum)
    const results: Array<{
      match: LiveMatchData;
      opportunity: string;
      confidence: number;
      odds: number;
      reasoning: string;
    }> = [];
    
    for (const opp of bestOpps) {
      // Daha önce önerildiyse atla
      const prevSuggestion = suggestedMatches[String(opp.fixtureId)];
      if (prevSuggestion && prevSuggestion.opportunity === opp.pick) continue;
      
      const [homeScoreStr, awayScoreStr] = opp.match.score.split('-');
      
      results.push({
        match: {
          fixtureId: opp.fixtureId,
          homeTeam: opp.match.homeTeam,
          awayTeam: opp.match.awayTeam,
          homeScore: parseInt(homeScoreStr) || 0,
          awayScore: parseInt(awayScoreStr) || 0,
          minute: opp.match.minute,
          status: 'LIVE',
          league: engineMatches.find(m => m.fixtureId === opp.fixtureId)?.league || '',
        },
        opportunity: opp.pick,
        confidence: opp.confidence,
        odds: opp.estimatedOdds,
        reasoning: opp.reasoning,
      });
    }
    
    // Önerilen maçları kaydet (spam önleme)
    for (const opp of results) {
      suggestedMatches[String(opp.match.fixtureId)] = {
        timestamp: Date.now(),
        opportunity: opp.opportunity,
      };
    }
    await setSuggestedMatches(suggestedMatches);
    
    return results;
      
  } catch (error) {
    console.error('[Cron] Fırsat tarama hatası:', error);
    return [];
  }
}

/**
 * Canlı analiz fırsatı tweet metni - Mühendislik dili
 */
function formatOpportunityTweet(opportunities: Array<{
  match: LiveMatchData;
  opportunity: string;
  confidence: number;
  odds: number;
  reasoning: string;
}>): string {
  const lines: string[] = [];
  
  // Başlık - veri odaklı
  const hasCards = opportunities.some(o => o.opportunity.includes('Kart'));
  const hasCorners = opportunities.some(o => o.opportunity.includes('Korner'));
  const hasBTTS = opportunities.some(o => o.opportunity.includes('KG'));
  
  if (hasCards || hasCorners) {
    lines.push('📊 CANLI VERİ ANALİZİ');
  } else if (hasBTTS) {
    lines.push('🎯 SİSTEM TESPİTİ');
  } else {
    lines.push('🔍 CANLI FIRSAT ANALİZİ');
  }
  lines.push('');
  
  opportunities.forEach((opp, i) => {
    const { match, opportunity, confidence, odds, reasoning } = opp;
    
    // Takım ismi kısalt (çok uzunsa)
    const home = match.homeTeam.length > 18 ? match.homeTeam.substring(0, 16) + '..' : match.homeTeam;
    const away = match.awayTeam.length > 18 ? match.awayTeam.substring(0, 16) + '..' : match.awayTeam;
    
    lines.push(`${i + 1}. ${home} ${match.homeScore}-${match.awayScore} ${away}`);
    lines.push(`⏱️ ${match.minute}' | ${match.league}`);
    lines.push(`🎯 Model Çıktısı: ${opportunity} @${odds.toFixed(2)}`);
    // Oran doğrulanamadıysa belirt
    const isEstimated = reasoning.includes('oran doğrulanamadı');
    lines.push(`📈 Veri: ${isEstimated ? `Model: %${confidence} ⚠️ oran doğrulanamadı` : reasoning}`);
    
    if (i < opportunities.length - 1) lines.push('');
  });
  
  lines.push('');
  lines.push('🔗 https://bilyoner-assistant.vercel.app/live');
  lines.push('');
  lines.push('#VeriAnalizi #Algoritma');
  
  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  
  // Auth kontrolü
  if (!isVercelCron && !isTestMode && process.env.NODE_ENV !== 'development') {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Cron] ${msg}`);
    logs.push(msg);
  };
  
  const now = Date.now();
  const useMock = process.env.TWITTER_MOCK === 'true';
  
  try {
    log('Cron çalışıyor...');
    
    // 1. Aktif kuponu kontrol et
    const state = await getBankrollState();
    const couponStatuses: CouponMatchStatus[] = [];
    
    if (state.activeCoupon) {
      log(`Aktif kupon: ${state.activeCoupon.id}`);
      
      // Her maç için canlı veri çek
      for (const match of state.activeCoupon.matches) {
        const liveData = await fetchLiveMatch(match.fixtureId);
        
        if (!liveData) {
          log(`${match.homeTeam} vs ${match.awayTeam} - Veri alınamadı, atlanıyor`);
          continue;
        }
        
        const status = analyzePrediction(match, liveData);
        couponStatuses.push(status);
        log(`${match.homeTeam} ${liveData.homeScore}-${liveData.awayScore} ${match.awayTeam} (${liveData.minute}') - ${status.neededMessage}`);
      }
      
      // Kupon snapshot oluştur (değişiklik kontrolü için)
      const currentSnapshot = couponStatuses.map(s => 
        `${s.match.fixtureId}:${s.live?.homeScore ?? '?'}-${s.live?.awayScore ?? '?'}:${s.predictionStatus}`
      ).join('|');
      
      // SKOR snapshot (sadece gol takibi için)
      const currentScoreSnapshot = couponStatuses.map(s => 
        `${s.match.fixtureId}:${s.live?.homeScore ?? 0}-${s.live?.awayScore ?? 0}`
      ).join('|');
      
      // DEVRE ARASI snapshot
      const currentHalftimeSnapshot = couponStatuses.map(s => 
        `${s.match.fixtureId}:${s.live?.status === 'HT' ? 'HT' : 'LIVE'}`
      ).join('|');
      
      // En az 1 canlı maç varsa
      const hasLiveMatch = couponStatuses.some(s => 
        s.live && ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'].includes(s.live.status)
      );
      
      // Redis'ten önceki snapshot'ları al
      const prevScoreSnapshot = await getCronState<string>(REDIS_KEY_SCORE_SNAPSHOT, '');
      const prevHalftimeSnapshot = await getCronState<string>(REDIS_KEY_HALFTIME_SNAPSHOT, '');
      const prevCouponTweetTime = await getCronState<number>(REDIS_KEY_COUPON_TWEET_TIME, 0);
      
      // GOL OLDU MU? (Skor değişikliği kontrolü)
      const isGoalScored = currentScoreSnapshot !== prevScoreSnapshot && prevScoreSnapshot !== '';
      
      // DEVRE ARASI MI? (HT'ye geçiş kontrolü)
      const isHalftime = currentHalftimeSnapshot.includes(':HT') && !prevHalftimeSnapshot.includes(':HT');
      
      // SADECE GOL VEYA DEVRE ARASINDA TWEET AT (Spam önleme)
      const MIN_TWEET_INTERVAL = 3 * 60 * 1000; // Gol durumunda minimum 3 dk arası
      const canTweet = Date.now() - prevCouponTweetTime >= MIN_TWEET_INTERVAL;
      
      if (hasLiveMatch && (isGoalScored || isHalftime) && canTweet) {
        // Gol durumunda "Dediğimiz gibi!" veya normal güncelleme
        const tweetText = formatCouponStatusTweet(couponStatuses);
        
        if (!useMock && state.activeCoupon.tweetId) {
          // QUOTE TWEET olarak at - orijinal kuponu alıntıla
          await sendQuoteTweet(tweetText, state.activeCoupon.tweetId);
          await setCronState(REDIS_KEY_COUPON_SNAPSHOT, currentSnapshot);
          await setCronState(REDIS_KEY_SCORE_SNAPSHOT, currentScoreSnapshot);
          await setCronState(REDIS_KEY_HALFTIME_SNAPSHOT, currentHalftimeSnapshot);
          await setCronState(REDIS_KEY_COUPON_TWEET_TIME, Date.now());
          log(isGoalScored ? '⚽ GOL! Kupon durumu tweeti atıldı' : '⏸️ Devre arası tweeti atıldı');
        } else if (useMock) {
          log(`[MOCK] ${isGoalScored ? 'GOL' : 'DEVRE ARASI'} tweeti:\n${tweetText}`);
          await setCronState(REDIS_KEY_COUPON_SNAPSHOT, currentSnapshot);
          await setCronState(REDIS_KEY_SCORE_SNAPSHOT, currentScoreSnapshot);
          await setCronState(REDIS_KEY_HALFTIME_SNAPSHOT, currentHalftimeSnapshot);
          await setCronState(REDIS_KEY_COUPON_TWEET_TIME, Date.now());
        }
      } else {
        // Snapshot'ları güncelle ama tweet atma
        await setCronState(REDIS_KEY_SCORE_SNAPSHOT, currentScoreSnapshot);
        await setCronState(REDIS_KEY_HALFTIME_SNAPSHOT, currentHalftimeSnapshot);
        
        if (!hasLiveMatch) {
          log('Canlı maç yok, tweet atılmadı');
        } else if (!isGoalScored && !isHalftime) {
          log('Gol veya devre arası yok, tweet atılmadı');
        } else if (!canTweet) {
          log('Son tweetten 3 dk geçmedi, bekleniyor');
        }
      }
    } else {
      log('Aktif kupon yok');
    }
    
    // 2. Diğer canlı maçlarda fırsat tara
    log('Canlı fırsat taranıyor...');
    const opportunities = await scanLiveOpportunities();
    
    if (opportunities.length > 0) {
      log(`${opportunities.length} fırsat bulundu!`);
      
      // Fırsat snapshot oluştur (aynı fırsatları tekrar tweet etme)
      const oppSnapshot = opportunities.map(o => 
        `${o.match.fixtureId}:${o.opportunity}`
      ).join('|');
      
      const prevOppSnapshot = await getCronState<string>(REDIS_KEY_OPP_SNAPSHOT, '');
      const prevOppTweetTime = await getCronState<number>(REDIS_KEY_OPP_TWEET_TIME, 0);
      
      const isNewOpportunity = oppSnapshot !== prevOppSnapshot;
      const MIN_OPPORTUNITY_INTERVAL = 8 * 60 * 1000; // Minimum 8 dk arası
      const canTweetOpportunity = Date.now() - prevOppTweetTime >= MIN_OPPORTUNITY_INTERVAL;
      
      // Duplicate check: live route zaten tweet attıysa atma (market bazlı)
      const tweetedFixtures = (await cacheGet<string[]>(REDIS_KEY_TWEETED_FIXTURES)) || [];
      const uniqueOpportunities = opportunities.filter(o => 
        !tweetedFixtures.some(t => t === `${o.match.fixtureId}:${o.opportunity}` || t === String(o.match.fixtureId))
      );
      
      if (isNewOpportunity && canTweetOpportunity && uniqueOpportunities.length > 0) {
        const tweetText = formatOpportunityTweet(uniqueOpportunities);
        let tweetId: string | undefined;
        
        // OG image URL oluştur
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bilyoner-assistant.vercel.app';
        const matchesData = uniqueOpportunities.map(o => ({
          home: o.match.homeTeam,
          away: o.match.awayTeam,
          score: `${o.match.homeScore}-${o.match.awayScore}`,
          minute: o.match.minute,
          league: o.match.league || 'Unknown League',
          pick: o.opportunity,
          odds: o.odds,
          confidence: o.confidence,
          reasoning: o.reasoning,
        }));
        const imageUrl = `${baseUrl}/api/og/live?type=opportunity&matches=${encodeURIComponent(JSON.stringify(matchesData))}`;
        
        if (!useMock) {
          const tweetResult = await sendTweet(tweetText, { imageUrl });
          tweetId = tweetResult.tweetId;
          await setCronState(REDIS_KEY_OPP_SNAPSHOT, oppSnapshot);
          await setCronState(REDIS_KEY_OPP_TWEET_TIME, Date.now());
          log('Yeni fırsat tweeti atıldı (resimli)');
        } else {
          log(`[MOCK] Fırsat tweeti:\n${tweetText}\n[IMAGE] ${imageUrl}`);
          tweetId = `mock_${Date.now()}`;
          await setCronState(REDIS_KEY_OPP_SNAPSHOT, oppSnapshot);
          await setCronState(REDIS_KEY_OPP_TWEET_TIME, Date.now());
        }
        
        // Pick'leri kaydet (takip için) + fixture'ları tweeted olarak işaretle
        for (const opp of uniqueOpportunities) {
          const pick: LivePick = {
            id: `pick_cron_${opp.match.fixtureId}_${Date.now()}`,
            fixtureId: opp.match.fixtureId,
            homeTeam: opp.match.homeTeam,
            awayTeam: opp.match.awayTeam,
            league: opp.match.league,
            market: opp.opportunity,
            pick: opp.opportunity,
            confidence: opp.confidence,
            estimatedOdds: opp.odds,
            reasoning: opp.reasoning,
            tweetId,
            scoreAtPick: `${opp.match.homeScore}-${opp.match.awayScore}`,
            minuteAtPick: opp.match.minute,
            status: 'active',
            createdAt: new Date().toISOString(),
            source: 'cron-bot',
          };
          await saveLivePick(pick);
          // Fixture:market'ı tweeted olarak işaretle (duplicate prevention)
          tweetedFixtures.push(`${opp.match.fixtureId}:${opp.opportunity}`);
        }
        await cacheSet(REDIS_KEY_TWEETED_FIXTURES, tweetedFixtures, 7200); // 2 saat TTL
        log(`${uniqueOpportunities.length} pick kaydedildi (takip için)`);
      } else if (!isNewOpportunity) {
        log('Aynı fırsatlar, tweet atılmadı');
      } else if (!canTweetOpportunity) {
        log('Son fırsat tweetinden 8 dk geçmedi, bekleniyor');
      }
    } else {
      log('Şu an uygun fırsat yok');
    }
    
    return NextResponse.json({
      success: true,
      couponStatuses: couponStatuses.map(s => ({
        match: `${s.match.homeTeam} vs ${s.match.awayTeam}`,
        prediction: s.match.prediction.label,
        score: s.live ? `${s.live.homeScore}-${s.live.awayScore}` : 'N/A',
        minute: s.live?.minute || 0,
        status: s.predictionStatus,
        needed: s.neededMessage,
      })),
      opportunities: opportunities.map(o => ({
        match: `${o.match.homeTeam} ${o.match.homeScore}-${o.match.awayScore} ${o.match.awayTeam}`,
        minute: o.match.minute,
        opportunity: o.opportunity,
        confidence: o.confidence,
      })),
      logs,
    });
    
  } catch (error) {
    console.error('[Cron] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      logs,
    }, { status: 500 });
  }
}
