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
    
    const opportunities: Array<{
      match: LiveMatchData;
      opportunity: string;
      confidence: number;
      odds: number;
      reasoning: string;
    }> = [];
    
    // Eski öneri kayıtlarını temizle
    const now = Date.now();
    const suggestedMatches = await getSuggestedMatches();
    for (const fixtureId of Object.keys(suggestedMatches)) {
      if (now - suggestedMatches[fixtureId].timestamp > SUGGESTION_COOLDOWN) {
        delete suggestedMatches[fixtureId];
      }
    }
    
    for (const fixture of liveMatches.slice(0, 50)) {
      const fixtureId = fixture.fixture?.id;
      const homeScore = fixture.goals?.home ?? 0;
      const awayScore = fixture.goals?.away ?? 0;
      const minute = fixture.fixture?.status?.elapsed || 0;
      const totalGoals = homeScore + awayScore;
      const status = fixture.fixture?.status?.short || '';
      const leagueName = fixture.league?.name || '';
      const leagueId = fixture.league?.id || 0;
      
      // Sadece Top 20 liglere odaklan (API call sayısını azalt)
      if (!isTop20League(leagueId)) continue;
      
      // 80+ dk veya devre arası/maç sonu - fırsat yok
      if (minute >= 80 || status === 'HT' || status === 'FT') continue;
      
      // 15 dk'dan önce veri yetersiz
      if (minute < 15) continue;
      
      const matchData: LiveMatchData = {
        fixtureId,
        homeTeam: fixture.teams?.home?.name || '',
        awayTeam: fixture.teams?.away?.name || '',
        homeScore,
        awayScore,
        minute,
        status,
        league: leagueName,
      };
      
      // İstatistikleri ayrı endpoint'ten çek (fixture response'da gelmiyor!)
      let homePossession = 50;
      let awayPossession = 50;
      let homeShotsOn = 0;
      let awayShotsOn = 0;
      let homeShots = 0;
      let awayShots = 0;
      let homeDangerous = 0;
      let awayDangerous = 0;
      // Kart ve korner istatistikleri
      let homeYellowCards = 0;
      let awayYellowCards = 0;
      let homeRedCards = 0;
      let awayRedCards = 0;
      let homeFouls = 0;
      let awayFouls = 0;
      let homeCorners = 0;
      let awayCorners = 0;
      
      try {
        if (!isApiCallAllowed('/fixtures/statistics')) {
          // Rate limit - istatistik atla
        } else {
          const statsRes = await fetch(`${API_BASE}/fixtures/statistics?fixture=${fixtureId}`, {
            headers: { 'x-apisports-key': API_KEY },
            next: { revalidate: 0 },
          });
          updateRateLimitFromHeaders(statsRes.headers);
          const statsData = await statsRes.json();
          const statsArray = statsData?.response || [];
        
          if (Array.isArray(statsArray) && statsArray.length >= 2) {
            const homeStats = statsArray[0]?.statistics || [];
            const awayStats = statsArray[1]?.statistics || [];
          
            for (const s of homeStats) {
              if (s.type === 'Ball Possession') homePossession = parseInt(s.value) || 50;
              if (s.type === 'Shots on Goal') homeShotsOn = parseInt(s.value) || 0;
              if (s.type === 'Total Shots') homeShots = parseInt(s.value) || 0;
              if (s.type === 'Dangerous Attacks') homeDangerous = parseInt(s.value) || 0;
              if (s.type === 'Yellow Cards') homeYellowCards = parseInt(s.value) || 0;
              if (s.type === 'Red Cards') homeRedCards = parseInt(s.value) || 0;
              if (s.type === 'Fouls') homeFouls = parseInt(s.value) || 0;
              if (s.type === 'Corner Kicks') homeCorners = parseInt(s.value) || 0;
            }
            for (const s of awayStats) {
              if (s.type === 'Ball Possession') awayPossession = parseInt(s.value) || 50;
              if (s.type === 'Shots on Goal') awayShotsOn = parseInt(s.value) || 0;
              if (s.type === 'Total Shots') awayShots = parseInt(s.value) || 0;
              if (s.type === 'Dangerous Attacks') awayDangerous = parseInt(s.value) || 0;
              if (s.type === 'Yellow Cards') awayYellowCards = parseInt(s.value) || 0;
              if (s.type === 'Red Cards') awayRedCards = parseInt(s.value) || 0;
              if (s.type === 'Fouls') awayFouls = parseInt(s.value) || 0;
              if (s.type === 'Corner Kicks') awayCorners = parseInt(s.value) || 0;
            }
          }
        }
      } catch (statsErr) {
        console.error(`[Cron] Stats fetch failed for fixture ${fixtureId}:`, statsErr);
      }
      
      // ===== KAPSAMLI CANLI ANALİZ =====
      // Gol Üstü, Kart Üstü, Korner Üstü, KG Var gibi genel bahisler
      
      const totalShotsOn = homeShotsOn + awayShotsOn;
      const totalShots = homeShots + awayShots;
      const totalCards = homeYellowCards + awayYellowCards + homeRedCards + awayRedCards;
      const totalFouls = homeFouls + awayFouls;
      const totalCorners = homeCorners + awayCorners;
      const remainingMinutes = 90 - minute;
      
      // ===== 1. AKILLI ÜST GOL BAHİSLERİ (3.5 / 4.5) =====
      // Gol sayısı ve tempo bazlı - en güvenilir bahis türü
      
      const goalRate = totalGoals / minute;
      const shotRate = totalShotsOn / minute;
      const projectedGoals = goalRate * 90;
      
      // ÜST 3.5 GOL - 3 gol varsa
      if (totalGoals >= 3 && minute <= 78 && minute >= 35) {
        let confidence = 68;
        const reasons: string[] = [];
        
        // Gol temposu
        if (goalRate >= 0.06) { confidence += 12; reasons.push(`tempo: ${projectedGoals.toFixed(1)} gol/maç`); }
        else if (goalRate >= 0.04) { confidence += 8; }
        
        // Şut baskısı
        if (totalShotsOn >= 8) { confidence += 10; reasons.push(`${totalShotsOn} isabetli şut`); }
        else if (totalShotsOn >= 5) { confidence += 5; }
        
        // Açık maç (iki takım da gol attıysa)
        if (homeScore > 0 && awayScore > 0) { confidence += 8; reasons.push('açık maç'); }
        
        // Kalan süre
        if (remainingMinutes >= 30) confidence += 6;
        else if (remainingMinutes >= 15) confidence += 3;
        
        if (confidence >= 70) {
          // Gerçekçi oran: 3+ gol varsa kalan süreye göre
          const odds = remainingMinutes >= 35 ? 1.75 : remainingMinutes >= 25 ? 1.60 : 1.40;
          if (odds < 1.50) continue; // Değer yok, önerme
          const prevSuggestion = suggestedMatches[String(fixtureId)];
          const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Üst 3.5');
          
          if (!alreadySuggested) {
            opportunities.push({
              match: matchData,
              opportunity: 'Üst 3.5 Gol',
              confidence,
              odds,
              reasoning: reasons.join(', ') || `${totalGoals} gol, hâlâ vakit var`,
            });
          }
        }
      }
      
      // ÜST 4.5 GOL - 4+ gol varsa
      if (totalGoals >= 4 && minute <= 75) {
        let confidence = 65;
        const reasons: string[] = [];
        
        // Gol temposu çok yüksek
        if (goalRate >= 0.07) { confidence += 15; reasons.push(`festival maç: ${projectedGoals.toFixed(1)}/maç`); }
        else if (goalRate >= 0.05) { confidence += 10; }
        
        // Açık maç
        if (homeScore >= 2 && awayScore >= 2) { confidence += 12; reasons.push('iki taraf da atakta'); }
        else if (homeScore > 0 && awayScore > 0) { confidence += 6; }
        
        // Şut baskısı
        if (totalShotsOn >= 10) { confidence += 8; reasons.push(`${totalShotsOn} isabetli şut`); }
        
        if (confidence >= 72) {
          // Üst 4.5: hala zor hedef, oran daha yüksek
          const odds = remainingMinutes >= 30 ? 1.85 : remainingMinutes >= 20 ? 1.65 : 1.40;
          if (odds < 1.50) continue;
          const prevSuggestion = suggestedMatches[String(fixtureId)];
          const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Üst 4.5');
          
          if (!alreadySuggested) {
            opportunities.push({
              match: matchData,
              opportunity: 'Üst 4.5 Gol',
              confidence,
              odds,
              reasoning: reasons.join(', ') || `${totalGoals} gol, çılgın maç`,
            });
          }
        }
      }
      
      // ÜST 2.5 GOL - 2 gol + güçlü baskı (daha iyi oran için)
      if (totalGoals === 2 && minute >= 30 && minute <= 65 && totalShotsOn >= 5) {
        let confidence = 55;
        const reasons: string[] = [];
        
        // Şut baskısı
        if (totalShotsOn >= 10) { confidence += 18; reasons.push(`${totalShotsOn} isabetli şut`); }
        else if (totalShotsOn >= 7) { confidence += 12; reasons.push(`${totalShotsOn} isabetli şut`); }
        else if (totalShotsOn >= 5) { confidence += 6; }
        
        // Açık maç
        if (homeScore > 0 && awayScore > 0) { confidence += 8; reasons.push('KG var'); }
        
        // Projeksiyon
        if (projectedGoals >= 3.5) { confidence += 10; reasons.push(`projeksiyon: ${projectedGoals.toFixed(1)}`); }
        
        if (confidence >= 68) {
          const prevSuggestion = suggestedMatches[String(fixtureId)];
          const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Üst 2.5');
          
          if (!alreadySuggested) {
            opportunities.push({
              match: matchData,
              opportunity: 'Üst 2.5 Gol',
              confidence,
              odds: 1.85,
              reasoning: reasons.join(', ') || '2 gol + baskı',
            });
          }
        }
      }
      
      // ===== 2. KART BAHİSLERİ =====
      // Faul yoğunluğu bazlı akıllı kart tahmini
      
      if (minute >= 18 && minute <= 80 && totalFouls >= 6) {
        const foulRate = totalFouls / minute;
        const cardRate = totalCards / minute;
        
        // Faul bazlı kart öngörüsü (her 7.5 faulde ~1 kart)
        const foulBasedCardRate = foulRate / 7.5;
        const blendedCardRate = totalCards > 0 
          ? (cardRate * 0.4) + (foulBasedCardRate * 0.6)
          : foulBasedCardRate;
        const expectedRemainingCards = blendedCardRate * remainingMinutes;
        
        // Hedef eşik belirle (mevcut karttan en az 2 fazla)
        const cardThresholds = [2.5, 3.5, 4.5, 5.5, 6.5];
        const minGap = remainingMinutes >= 25 ? 2 : 1.5;
        const targetCardThreshold = cardThresholds.find(t => t >= totalCards + minGap);
        
        if (targetCardThreshold) {
          const cardsNeeded = targetCardThreshold - totalCards + 0.5;
          
          // Projeksiyon hedefe ulaşabilir mi
          if (expectedRemainingCards >= cardsNeeded * 0.65) {
            let confidence = 48;
            const reasons: string[] = [];
            
            // Projeksiyon bonus
            const projRatio = expectedRemainingCards / cardsNeeded;
            if (projRatio >= 1.5) { confidence += 18; }
            else if (projRatio >= 1.2) { confidence += 12; }
            else if (projRatio >= 1.0) { confidence += 8; }
            else if (projRatio >= 0.8) { confidence += 4; }
            
            // Faul yoğunluğu (kartların habercisi)
            if (foulRate >= 0.55) { confidence += 16; reasons.push(`faul temposu: ${(foulRate * 90).toFixed(0)}/maç`); }
            else if (foulRate >= 0.45) { confidence += 12; reasons.push(`${totalFouls} faul`); }
            else if (foulRate >= 0.35) { confidence += 7; reasons.push(`${totalFouls} faul`); }
            else if (foulRate >= 0.25) { confidence += 3; }
            
            // Gergin maç (skor farkı az)
            if (Math.abs(homeScore - awayScore) <= 1) { confidence += 8; reasons.push('gergin skor'); }
            
            // 2. yarı bonus
            if (minute >= 45) { confidence += 6; }
            
            // İki takım da kart gördüyse
            if (homeYellowCards >= 1 && awayYellowCards >= 1) { confidence += 6; reasons.push('iki taraf da kartlı'); }
            
            // Kart açığı bonusu: faul/kart oranı yüksekse hakem sonra patlatır
            const expectedCardsFromFouls = totalFouls / 7.5;
            if (expectedCardsFromFouls > totalCards + 1.5) { confidence += 8; reasons.push('kart açığı var'); }
            else if (expectedCardsFromFouls > totalCards + 0.5) { confidence += 4; }
            
            // İki takım da foul yapıyorsa
            if (homeFouls >= 5 && awayFouls >= 5) { confidence += 4; }
            
            reasons.unshift(`${totalCards} kart`);
            
            if (confidence >= 64) {
              const difficulty = cardsNeeded / (remainingMinutes / 30);
              let odds: number;
              if (difficulty <= 0.8) odds = 1.60;
              else if (difficulty <= 1.2) odds = 1.80;
              else if (difficulty <= 1.6) odds = 2.00;
              else odds = 2.30;
              if (odds < 1.50) continue; // Oran çok düşük
              
              const prevSuggestion = suggestedMatches[String(fixtureId)];
              const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Kart');
              
              if (!alreadySuggested) {
                opportunities.push({
                  match: matchData,
                  opportunity: `Üst ${targetCardThreshold} Kart`,
                  confidence,
                  odds,
                  reasoning: reasons.join(', '),
                });
              }
            }
          }
        }
      }
      
      // ===== 3. KORNER BAHİSLERİ =====
      // Korner temposu + şut baskısına göre
      
      if (minute >= 25 && minute <= 80 && totalCorners >= 4) {
        const cornerRate = totalCorners / minute;
        const projectedCorners = cornerRate * 90;
        
        // Hedef eşik belirle
        const cornerThresholds = [7.5, 8.5, 9.5, 10.5, 11.5];
        const minGap = remainingMinutes >= 25 ? 2.5 : 2;
        const targetCornerThreshold = cornerThresholds.find(t => t >= totalCorners + minGap);
        
        if (targetCornerThreshold) {
          const cornersNeeded = targetCornerThreshold - totalCorners + 0.5;
          const expectedRemainingCorners = cornerRate * remainingMinutes;
          
          if (expectedRemainingCorners >= cornersNeeded * 0.7) {
            let confidence = 52;
            const reasons: string[] = [];
            
            // Projeksiyon bonus
            const projRatio = expectedRemainingCorners / cornersNeeded;
            if (projRatio >= 1.5) { confidence += 16; }
            else if (projRatio >= 1.2) { confidence += 10; }
            else if (projRatio >= 1.0) { confidence += 5; }
            
            // Korner temposu
            if (cornerRate >= 0.15) { confidence += 10; reasons.push(`tempo: ${projectedCorners.toFixed(1)}/maç`); }
            else if (cornerRate >= 0.12) { confidence += 6; }
            
            // Şut baskısı (korner potansiyeli)
            if (totalShots >= 20) { confidence += 10; reasons.push(`${totalShots} şut baskısı`); }
            else if (totalShots >= 15) { confidence += 6; }
            else if (totalShots >= 10) { confidence += 3; }
            
            // Dengeli korner (iki takım da atakta)
            if (homeCorners >= 3 && awayCorners >= 3) { confidence += 6; reasons.push('iki taraf da korner alıyor'); }
            
            reasons.unshift(`${totalCorners} korner`);
            
            if (confidence >= 68) {
              const difficulty = cornersNeeded / (remainingMinutes / 15);
              let odds: number;
              if (difficulty <= 0.7) odds = 1.60;
              else if (difficulty <= 1.0) odds = 1.80;
              else if (difficulty <= 1.4) odds = 2.00;
              else odds = 2.30;
              if (odds < 1.50) continue; // Oran çok düşük
              
              const prevSuggestion = suggestedMatches[String(fixtureId)];
              const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Korner');
              
              if (!alreadySuggested) {
                opportunities.push({
                  match: matchData,
                  opportunity: `Üst ${targetCornerThreshold} Korner`,
                  confidence,
                  odds,
                  reasoning: reasons.join(', '),
                });
              }
            }
          }
        }
      }
      
      // ===== 4. KG VAR (Karşılıklı Gol) =====
      // 0-0 veya tek taraflı skor + baskı varsa
      
      if ((totalGoals === 0 || (homeScore === 0 || awayScore === 0)) && minute >= 30 && minute <= 70) {
        // Henüz KG yok, olma potansiyeli var mı?
        if (!(homeScore > 0 && awayScore > 0)) {
          let confidence = 50;
          const reasons: string[] = [];
          
          // Gol atmayan takımın baskısı
          const nonScoringTeamShots = homeScore === 0 ? homeShotsOn : awayShotsOn;
          const nonScoringTeamName = homeScore === 0 ? matchData.homeTeam : matchData.awayTeam;
          
          // Gerideki takım şut çekiyor mu
          if (nonScoringTeamShots >= 4) { confidence += 18; reasons.push(`${nonScoringTeamName} ${nonScoringTeamShots} isabetli şut`); }
          else if (nonScoringTeamShots >= 2) { confidence += 10; reasons.push(`${nonScoringTeamName} ${nonScoringTeamShots} isabetli şut`); }
          
          // Toplam şut yoğunluğu
          if (totalShotsOn >= 8) { confidence += 10; reasons.push('yoğun şut trafiği'); }
          else if (totalShotsOn >= 5) { confidence += 5; }
          
          // Dakika bonus (erken = daha fazla şans)
          if (minute <= 50) { confidence += 8; }
          else if (minute <= 60) { confidence += 4; }
          
          // 0-0 ise iki taraf da gol atmalı = daha zor
          if (totalGoals === 0 && totalShotsOn >= 6) { confidence += 5; reasons.push('iki taraf da baskı yapıyor'); }
          
          if (confidence >= 68) {
            // KG Var oranları: 0-0 daha yüksek (2 gol gerekli), tek taraflı daha düşük
            const odds = totalGoals === 0 ? 1.85 : 2.05;
            const prevSuggestion = suggestedMatches[String(fixtureId)];
            const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('KG Var');
            
            if (!alreadySuggested) {
              opportunities.push({
                match: matchData,
                opportunity: 'KG Var',
                confidence,
                odds,
                reasoning: reasons.join(', ') || 'İki taraf da gol potansiyeli',
              });
            }
          }
        }
      }
    }
    
    // En iyi 3 fırsatı döndür (confidence'a göre sırala)
    const topOpps = opportunities
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
    
    // Önerilen maçları kaydet (spam önleme)
    for (const opp of topOpps) {
      suggestedMatches[String(opp.match.fixtureId)] = {
        timestamp: Date.now(),
        opportunity: opp.opportunity,
      };
    }
    
    // Redis'e kaydet
    await setSuggestedMatches(suggestedMatches);
    
    return topOpps;
      
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
    lines.push(`📈 Veri: ${reasoning}`);
    
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
      const MIN_OPPORTUNITY_INTERVAL = 15 * 60 * 1000; // Minimum 15 dk arası
      const canTweetOpportunity = Date.now() - prevOppTweetTime >= MIN_OPPORTUNITY_INTERVAL;
      
      // Duplicate check: live route zaten tweet attıysa atma
      const tweetedFixtures = (await cacheGet<number[]>(REDIS_KEY_TWEETED_FIXTURES)) || [];
      const uniqueOpportunities = opportunities.filter(o => !tweetedFixtures.includes(o.match.fixtureId));
      
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
          // Fixture'ı tweeted olarak işaretle (duplicate prevention)
          tweetedFixtures.push(opp.match.fixtureId);
        }
        await cacheSet(REDIS_KEY_TWEETED_FIXTURES, tweetedFixtures, 3600);
        log(`${uniqueOpportunities.length} pick kaydedildi (takip için)`);
      } else if (!isNewOpportunity) {
        log('Aynı fırsatlar, tweet atılmadı');
      } else if (!canTweetOpportunity) {
        log('Son fırsat tweetinden 15 dk geçmedi, bekleniyor');
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
