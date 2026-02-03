/**
 * Bot Cron API - 5 dakikada bir çalışan ana sistem
 * 
 * İşlevler:
 * 1. Aktif kupon maçlarını gerçek zamanlı takip
 * 2. Her 30 dk'da bir kupon durumu tweet at
 * 3. Diğer canlı maçlarda fırsat tara ve an be an paylaş
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBankrollState, saveBankrollState } from '@/lib/bot/bankroll-store';
import { sendQuoteTweet, sendTweet } from '@/lib/bot/twitter';
import type { BotMatch } from '@/lib/bot/types';

// API Football config
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const API_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

// Son tweet zamanları (Redis'te tutulabilir ama şimdilik basit)
let lastCouponUpdateTweet = 0;
let lastOpportunityTweet = 0;

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
  const predType = match.prediction.type;
  const predLabel = match.prediction.label;
  
  // Maç bitti mi?
  const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
  const isFinished = finishedStatuses.includes(status);
  
  // Canlı mı?
  const liveStatuses = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'];
  const isLive = liveStatuses.includes(status);
  
  let predictionStatus: 'winning' | 'losing' | 'pending' | 'won' | 'lost' = 'pending';
  let neededMessage = '';
  
  // Üst 2.5 analizi
  if (predType === 'over25') {
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
  else if (predType === 'btts') {
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
  else if (predType === 'home') {
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
  else if (predType === 'away') {
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
 * Canlı fırsat tara - Diğer maçlarda value bet ara
 */
async function scanLiveOpportunities(): Promise<Array<{
  match: LiveMatchData;
  opportunity: string;
  confidence: number;
  odds: number;
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
    }> = [];
    
    for (const fixture of liveMatches.slice(0, 50)) {
      const homeScore = fixture.goals?.home ?? 0;
      const awayScore = fixture.goals?.away ?? 0;
      const minute = fixture.fixture?.status?.elapsed || 0;
      const totalGoals = homeScore + awayScore;
      
      const matchData: LiveMatchData = {
        fixtureId: fixture.fixture?.id,
        homeTeam: fixture.teams?.home?.name || '',
        awayTeam: fixture.teams?.away?.name || '',
        homeScore,
        awayScore,
        minute,
        status: fixture.fixture?.status?.short || '',
        league: fixture.league?.name || '',
      };
      
      // Fırsat 1: 0-0 ve 60+ dk → Alt 2.5 value
      if (totalGoals === 0 && minute >= 60 && minute <= 75) {
        opportunities.push({
          match: matchData,
          opportunity: 'Alt 2.5 Gol',
          confidence: 70 + Math.floor((minute - 60) * 1.5),
          odds: 1.30 + (75 - minute) * 0.02,
        });
      }
      
      // Fırsat 2: 2+ gol ve 45-60 dk → Üst 2.5 value
      if (totalGoals >= 2 && minute >= 45 && minute <= 60) {
        opportunities.push({
          match: matchData,
          opportunity: 'Üst 2.5 Gol',
          confidence: 65 + totalGoals * 5,
          odds: 1.50 + (60 - minute) * 0.02,
        });
      }
      
      // Fırsat 3: Bir taraf 2+ farkla önde ve 70+ dk → O taraf MS
      if (Math.abs(homeScore - awayScore) >= 2 && minute >= 70) {
        const leader = homeScore > awayScore ? matchData.homeTeam : matchData.awayTeam;
        opportunities.push({
          match: matchData,
          opportunity: `MS ${leader}`,
          confidence: 80 + (minute - 70),
          odds: 1.10 + (90 - minute) * 0.01,
        });
      }
      
      // Fırsat 4: Her iki takım da gol atmış ve 30-60 dk → 3.5 üstü value
      if (homeScore > 0 && awayScore > 0 && minute >= 30 && minute <= 60) {
        opportunities.push({
          match: matchData,
          opportunity: 'Üst 3.5 Gol',
          confidence: 55 + totalGoals * 5,
          odds: 2.00 + (60 - minute) * 0.03,
        });
      }
    }
    
    // En iyi 3 fırsatı döndür (confidence'a göre sırala)
    return opportunities
      .filter(o => o.confidence >= 65)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
      
  } catch (error) {
    console.error('[Cron] Fırsat tarama hatası:', error);
    return [];
  }
}

/**
 * Fırsat tweet metni oluştur
 */
function formatOpportunityTweet(opportunities: Array<{
  match: LiveMatchData;
  opportunity: string;
  confidence: number;
  odds: number;
}>): string {
  const lines: string[] = [];
  
  lines.push('🔥 CANLI FIRSAT!');
  lines.push('');
  
  opportunities.forEach((opp, i) => {
    const { match, opportunity, confidence, odds } = opp;
    
    lines.push(`${i + 1}. ${match.homeTeam} ${match.homeScore}-${match.awayScore} ${match.awayTeam}`);
    lines.push(`   ⏱️ ${match.minute}' | ${match.league}`);
    lines.push(`   🎯 ${opportunity} @${odds.toFixed(2)} | %${confidence} güven`);
    
    if (i < opportunities.length - 1) lines.push('');
  });
  
  lines.push('');
  lines.push('⚡ Hızlı hareket et!');
  lines.push('');
  lines.push('#CanlıBahis #LiveBet #BilyonerBot');
  
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
      
      // 30 dk'da bir kupon durumu tweet at
      const THIRTY_MINUTES = 30 * 60 * 1000;
      const shouldTweetCouponUpdate = now - lastCouponUpdateTweet >= THIRTY_MINUTES;
      
      // En az 1 canlı maç varsa tweet at
      const hasLiveMatch = couponStatuses.some(s => 
        s.live && ['1H', '2H', 'HT', 'ET', 'P', 'LIVE', 'BT'].includes(s.live.status)
      );
      
      if (shouldTweetCouponUpdate && hasLiveMatch) {
        const tweetText = formatCouponStatusTweet(couponStatuses);
        
        if (!useMock && state.activeCoupon.tweetId) {
          await sendQuoteTweet(tweetText, state.activeCoupon.tweetId);
          lastCouponUpdateTweet = now;
          log('Kupon durumu tweeti atıldı');
        } else if (useMock) {
          log(`[MOCK] Kupon durumu tweeti:\n${tweetText}`);
          lastCouponUpdateTweet = now;
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
      
      // 5 dk'da bir fırsat tweet at (her cron çağrısında)
      const FIVE_MINUTES = 5 * 60 * 1000;
      const shouldTweetOpportunity = now - lastOpportunityTweet >= FIVE_MINUTES;
      
      if (shouldTweetOpportunity) {
        const tweetText = formatOpportunityTweet(opportunities);
        
        if (!useMock) {
          await sendTweet(tweetText);
          lastOpportunityTweet = now;
          log('Fırsat tweeti atıldı');
        } else {
          log(`[MOCK] Fırsat tweeti:\n${tweetText}`);
          lastOpportunityTweet = now;
        }
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
