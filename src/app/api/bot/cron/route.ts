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
import type { BotMatch, BankrollState } from '@/lib/bot/types';

// API Football config
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const API_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

// Son durum cache (spam önleme için)
let lastCouponSnapshot = '';
let lastOpportunitySnapshot = '';
let lastCouponTweetTime = 0;
let lastOpportunityTweetTime = 0; // Fırsat tweetleri için de cooldown

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
    const res = await fetch(`${API_BASE}/fixtures?id=${fixtureId}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 0 },
    });
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
 * Kupon durumu tweet metni oluştur
 */
function formatCouponStatusTweet(statuses: CouponMatchStatus[]): string {
  const lines: string[] = [];
  
  lines.push('🎯 KUPON DURUMU');
  lines.push('');
  
  let winningCount = 0;
  let losingCount = 0;
  
  statuses.forEach((s, i) => {
    const { match, live, predictionStatus, neededMessage } = s;
    const score = live ? `${live.homeScore}-${live.awayScore}` : '?-?';
    const minute = live?.minute || 0;
    const statusEmoji = predictionStatus === 'winning' || predictionStatus === 'won' ? '✅' : 
                       predictionStatus === 'losing' ? '⚠️' : 
                       predictionStatus === 'lost' ? '❌' : '⏰';
    
    if (predictionStatus === 'winning' || predictionStatus === 'won') winningCount++;
    if (predictionStatus === 'losing' || predictionStatus === 'lost') losingCount++;
    
    lines.push(`${statusEmoji} ${match.homeTeam} ${score} ${match.awayTeam}`);
    lines.push(`   ${match.prediction.label} @${match.prediction.odds.toFixed(2)}`);
    
    if (live && minute > 0) {
      lines.push(`   ${neededMessage} (${minute}')`);
    } else {
      lines.push(`   ${neededMessage}`);
    }
    
    if (i < statuses.length - 1) lines.push('');
  });
  
  lines.push('');
  
  // Özet
  if (winningCount === statuses.length) {
    lines.push('🔥 Tüm tahminler tutuyor!');
  } else if (losingCount > 0) {
    lines.push(`⚡ ${losingCount} tahmin riskli, takipteyiz!`);
  }
  
  lines.push('');
  lines.push('#Bahis #CanlıKupon #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Canlı fırsat tara - SADECE Sıradaki Gol bahislerine odaklan
 * 
 * Mantık:
 * - 80+ dk'da fırsat vermiyoruz (maç bitiyor)
 * - İstatistik bazlı karar: şut baskısı, top kontrolü, tehlikeli atak
 * - Dominant takımı bul → Sıradaki gol o atar
 * - Aynı maçı tekrar önerme
 */

// Daha önce önerilen maçları takip et (spam önleme)
const suggestedMatches = new Map<number, { timestamp: number; opportunity: string }>();
const SUGGESTION_COOLDOWN = 30 * 60 * 1000; // 30 dakika aynı maçı önerme

async function scanLiveOpportunities(): Promise<Array<{
  match: LiveMatchData;
  opportunity: string;
  confidence: number;
  odds: number;
  reasoning: string;
}>> {
  try {
    // Canlı maçları çek
    const res = await fetch(`${API_BASE}/fixtures?live=all`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 0 },
    });
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
    for (const [fixtureId, data] of suggestedMatches) {
      if (now - data.timestamp > SUGGESTION_COOLDOWN) {
        suggestedMatches.delete(fixtureId);
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
      
      // İstatistikleri çek (varsa)
      const stats = fixture.statistics;
      let homePossession = 50;
      let awayPossession = 50;
      let homeShotsOn = 0;
      let awayShotsOn = 0;
      let homeShots = 0;
      let awayShots = 0;
      let homeDangerous = 0;
      let awayDangerous = 0;
      
      if (stats && Array.isArray(stats) && stats.length >= 2) {
        const homeStats = stats[0]?.statistics || [];
        const awayStats = stats[1]?.statistics || [];
        
        for (const s of homeStats) {
          if (s.type === 'Ball Possession') homePossession = parseInt(s.value) || 50;
          if (s.type === 'Shots on Goal') homeShotsOn = parseInt(s.value) || 0;
          if (s.type === 'Total Shots') homeShots = parseInt(s.value) || 0;
          if (s.type === 'Dangerous Attacks') homeDangerous = parseInt(s.value) || 0;
        }
        for (const s of awayStats) {
          if (s.type === 'Ball Possession') awayPossession = parseInt(s.value) || 50;
          if (s.type === 'Shots on Goal') awayShotsOn = parseInt(s.value) || 0;
          if (s.type === 'Total Shots') awayShots = parseInt(s.value) || 0;
          if (s.type === 'Dangerous Attacks') awayDangerous = parseInt(s.value) || 0;
        }
      }
      
      // ===== SADECE SIRADAKİ GOL BAHİSLERİ =====
      
      // Dominant takımı tespit et
      const homeScore_dominance = (homeShotsOn * 3) + (homeShots * 1.5) + (homePossession * 0.5) + (homeDangerous * 0.5);
      const awayScore_dominance = (awayShotsOn * 3) + (awayShots * 1.5) + (awayPossession * 0.5) + (awayDangerous * 0.5);
      
      const totalShotsOn = homeShotsOn + awayShotsOn;
      const dominanceRatio = homeScore_dominance > 0 ? awayScore_dominance / homeScore_dominance : 1;
      
      // SIRADAKİ GOL - EV SAHİBİ
      // Şartlar: Ev sahibi dominant, istatistikler yeterli
      if (homeScore_dominance > awayScore_dominance * 1.4 && totalShotsOn >= 3) {
        const confidenceBase = 55;
        let bonus = 0;
        const reasons: string[] = [];
        
        // İsabetli şut üstünlüğü
        if (homeShotsOn >= awayShotsOn + 2) {
          bonus += 10;
          reasons.push(`${homeShotsOn} isabetli şut`);
        }
        
        // Top kontrolü
        if (homePossession >= 58) {
          bonus += 8;
          reasons.push(`%${homePossession} top`);
        }
        
        // Ev avantajı + golsüz
        if (totalGoals === 0 && minute >= 30) {
          bonus += 5;
          reasons.push(`${minute}' golsüz baskı`);
        }
        
        // Gerçekçi oran hesapla (dominance'a göre)
        const impliedProb = (confidenceBase + bonus) / 100;
        const odds = Math.max(1.50, Math.min(2.50, 1 / impliedProb + 0.15));
        
        const finalConfidence = confidenceBase + bonus;
        
        // Minimum %62 güven ve daha önce önerilmemiş
        const prevSuggestion = suggestedMatches.get(fixtureId);
        const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Ev Sahibi');
        
        if (finalConfidence >= 62 && !alreadySuggested) {
          opportunities.push({
            match: matchData,
            opportunity: 'Sıradaki Gol Ev Sahibi',
            confidence: finalConfidence,
            odds: parseFloat(odds.toFixed(2)),
            reasoning: reasons.join(', ') || 'Ev sahibi baskın',
          });
        }
      }
      
      // SIRADAKİ GOL - DEPLASMAN
      // Şartlar: Deplasman dominant, istatistikler yeterli
      if (awayScore_dominance > homeScore_dominance * 1.4 && totalShotsOn >= 3) {
        const confidenceBase = 52; // Deplasman için biraz düşük başla
        let bonus = 0;
        const reasons: string[] = [];
        
        // İsabetli şut üstünlüğü
        if (awayShotsOn >= homeShotsOn + 2) {
          bonus += 12;
          reasons.push(`${awayShotsOn} isabetli şut`);
        }
        
        // Top kontrolü
        if (awayPossession >= 55) {
          bonus += 8;
          reasons.push(`%${awayPossession} top`);
        }
        
        // Deplasmanda baskı yapmak daha zor, golsüz baskı önemli
        if (totalGoals === 0 && minute >= 35) {
          bonus += 8;
          reasons.push(`${minute}' deplasmanda baskın`);
        }
        
        // Gerçekçi oran hesapla
        const impliedProb = (confidenceBase + bonus) / 100;
        const odds = Math.max(1.65, Math.min(2.80, 1 / impliedProb + 0.20));
        
        const finalConfidence = confidenceBase + bonus;
        
        const prevSuggestion = suggestedMatches.get(fixtureId);
        const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Deplasman');
        
        if (finalConfidence >= 62 && !alreadySuggested) {
          opportunities.push({
            match: matchData,
            opportunity: 'Sıradaki Gol Deplasman',
            confidence: finalConfidence,
            odds: parseFloat(odds.toFixed(2)),
            reasoning: reasons.join(', ') || 'Deplasman baskın',
          });
        }
      }
      
      // ÜST 2.5 GOL - Açık maçlar (sadece 1-2 gol varsa ve tempolu)
      if (totalGoals >= 1 && totalGoals <= 2 && minute >= 25 && minute <= 60 && totalShotsOn >= 5) {
        const shotRate = totalShotsOn / minute;
        const goalRate = totalGoals / minute;
        
        // Dakikada 0.1+ isabetli şut = tempolu maç
        if (shotRate >= 0.10) {
          const projectedGoals = goalRate * 90;
          const confidenceBase = 55;
          let bonus = 0;
          const reasons: string[] = [];
          
          if (projectedGoals >= 3.5) {
            bonus += 12;
            reasons.push(`projeksiyon ${projectedGoals.toFixed(1)} gol`);
          }
          
          if (totalShotsOn >= 7) {
            bonus += 8;
            reasons.push(`${totalShotsOn} isabetli şut`);
          }
          
          // Mevcut gol avantajı
          if (totalGoals === 2) {
            bonus += 5;
            reasons.push(`${totalGoals} gol, 1 tane daha lazım`);
          }
          
          const finalConfidence = confidenceBase + bonus;
          const odds = totalGoals === 2 ? 1.55 : 1.85;
          
          const prevSuggestion = suggestedMatches.get(fixtureId);
          const alreadySuggested = prevSuggestion && prevSuggestion.opportunity.includes('Üst 2.5');
          
          if (finalConfidence >= 65 && !alreadySuggested) {
            opportunities.push({
              match: matchData,
              opportunity: 'Üst 2.5 Gol',
              confidence: finalConfidence,
              odds,
              reasoning: reasons.join(', ') || 'Tempolu maç',
            });
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
      suggestedMatches.set(opp.match.fixtureId, {
        timestamp: Date.now(),
        opportunity: opp.opportunity,
      });
    }
    
    return topOpps;
      
  } catch (error) {
    console.error('[Cron] Fırsat tarama hatası:', error);
    return [];
  }
}

/**
 * Fırsat tweet metni oluştur - Sıradaki Gol odaklı
 */
function formatOpportunityTweet(opportunities: Array<{
  match: LiveMatchData;
  opportunity: string;
  confidence: number;
  odds: number;
  reasoning: string;
}>): string {
  const lines: string[] = [];
  
  // Başlık - fırsat tipine göre
  const hasNextGoal = opportunities.some(o => o.opportunity.includes('Sıradaki'));
  
  if (hasNextGoal) {
    lines.push('⚽ SIRADAKİ GOL TAHMİNİ');
  } else {
    lines.push('🔥 CANLI FIRSAT!');
  }
  lines.push('');
  
  opportunities.forEach((opp, i) => {
    const { match, opportunity, confidence, odds, reasoning } = opp;
    
    // Takım ismi kısalt (çok uzunsa)
    const home = match.homeTeam.length > 18 ? match.homeTeam.substring(0, 16) + '..' : match.homeTeam;
    const away = match.awayTeam.length > 18 ? match.awayTeam.substring(0, 16) + '..' : match.awayTeam;
    
    lines.push(`${i + 1}. ${home} ${match.homeScore}-${match.awayScore} ${away}`);
    lines.push(`⏱️ ${match.minute}' | ${match.league}`);
    lines.push(`🎯 ${opportunity} @${odds.toFixed(2)}`);
    lines.push(`📊 ${reasoning}`);
    
    if (i < opportunities.length - 1) lines.push('');
  });
  
  lines.push('');
  lines.push('#CanlıBahis #SıradakiGol');
  
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
        const status = analyzePrediction(match, liveData!);
        couponStatuses.push(status);
        
        if (liveData) {
          log(`${match.homeTeam} ${liveData.homeScore}-${liveData.awayScore} ${match.awayTeam} (${liveData.minute}') - ${status.neededMessage}`);
        } else {
          log(`${match.homeTeam} vs ${match.awayTeam} - Veri alınamadı`);
        }
      }
      
      // Kupon snapshot oluştur (değişiklik kontrolü için)
      const currentSnapshot = couponStatuses.map(s => 
        `${s.match.fixtureId}:${s.live?.homeScore ?? '?'}-${s.live?.awayScore ?? '?'}:${s.predictionStatus}`
      ).join('|');
      
      // En az 1 canlı maç varsa ve değişiklik varsa tweet at
      const hasLiveMatch = couponStatuses.some(s => 
        s.live && ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'].includes(s.live.status)
      );
      
      const hasChange = currentSnapshot !== lastCouponSnapshot;
      const MIN_TWEET_INTERVAL = 10 * 60 * 1000; // Minimum 10 dk arası
      const canTweet = Date.now() - lastCouponTweetTime >= MIN_TWEET_INTERVAL;
      
      if (hasLiveMatch && hasChange && canTweet) {
        const tweetText = formatCouponStatusTweet(couponStatuses);
        
        if (!useMock && state.activeCoupon.tweetId) {
          // QUOTE TWEET olarak at - orijinal kuponu alıntıla
          await sendQuoteTweet(tweetText, state.activeCoupon.tweetId);
          lastCouponSnapshot = currentSnapshot;
          lastCouponTweetTime = Date.now();
          log('Kupon durumu quote tweeti atıldı');
        } else if (useMock) {
          log(`[MOCK] Kupon durumu quote tweeti:\n${tweetText}`);
          lastCouponSnapshot = currentSnapshot;
          lastCouponTweetTime = Date.now();
        }
      } else if (!hasChange) {
        log('Kupon durumunda değişiklik yok, tweet atılmadı');
      } else if (!canTweet) {
        log('Son tweetten 10 dk geçmedi, bekleniyor');
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
      
      const isNewOpportunity = oppSnapshot !== lastOpportunitySnapshot;
      const MIN_OPPORTUNITY_INTERVAL = 15 * 60 * 1000; // Minimum 15 dk arası
      const canTweetOpportunity = Date.now() - lastOpportunityTweetTime >= MIN_OPPORTUNITY_INTERVAL;
      
      if (isNewOpportunity && canTweetOpportunity) {
        const tweetText = formatOpportunityTweet(opportunities);
        
        if (!useMock) {
          await sendTweet(tweetText);
          lastOpportunitySnapshot = oppSnapshot;
          lastOpportunityTweetTime = Date.now();
          log('Yeni fırsat tweeti atıldı');
        } else {
          log(`[MOCK] Fırsat tweeti:\n${tweetText}`);
          lastOpportunitySnapshot = oppSnapshot;
          lastOpportunityTweetTime = Date.now();
        }
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
