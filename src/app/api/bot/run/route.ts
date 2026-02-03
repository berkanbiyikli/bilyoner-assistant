/**
 * Bot Run API - Action-based Cron Endpoint
 * 
 * Actions:
 * - new-coupon: Günün kuponu oluştur (sabah 1 kez)
 * - check-live: Canlı skorları kontrol et, quote tweet at
 * - check-result: Kupon sonucunu kontrol et
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateBotCoupon, checkCouponResults, DEFAULT_BOT_CONFIG } from '@/lib/bot/engine';
import { 
  tweetNewCoupon, 
  tweetResult, 
  sendQuoteTweet, 
  mockTweet, 
  formatNewCouponTweet, 
  formatResultTweet 
} from '@/lib/bot/twitter';
import type { BotCoupon, BankrollState } from '@/lib/bot/types';
import { 
  getBankrollState, 
  saveBankrollState,
  isDailyLimitReached,
  incrementDailyCoupon,
  getRemainingDailyCoupons,
  getDailyCouponCount,
} from '@/lib/bot/bankroll-store';

// Referans kupon tweet ID'si
const REFERENCE_TWEET_ID = '2018718852276715712';

// Authorization kontrolü
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Development'ta auth bypass
  if (process.env.NODE_ENV === 'development') return true;
  
  // Vercel Cron otomatik auth header ekler
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  
  return false;
}

export async function GET(request: NextRequest) {
  // Auth kontrolü - Vercel cron için bypass
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && !checkAuth(request)) {
    // Development'ta her zaman izin ver
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'new-coupon';
  
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Bot] ${msg}`);
    logs.push(msg);
  };
  
  try {
    log(`Bot çalışıyor - Action: ${action}`);
    
    // State'i yükle
    const state = await getBankrollState();
    log(`Güncel kasa: ${state.balance.toFixed(2)} TL`);
    
    switch (action) {
      case 'new-coupon':
        return await handleNewCoupon(state, log, logs);
        
      case 'check-live':
        return await handleCheckLive(state, log, logs);
        
      case 'check-result':
        return await handleCheckResult(state, log, logs);
        
      default:
        return NextResponse.json({ 
          error: 'Invalid action', 
          validActions: ['new-coupon', 'check-live', 'check-result'] 
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[Bot] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      logs,
    }, { status: 500 });
  }
}

/**
 * Yeni kupon oluştur (günde maks 3 kez)
 */
async function handleNewCoupon(
  state: BankrollState, 
  log: (msg: string) => void,
  logs: string[]
) {
  // Zaten aktif kupon varsa yeni oluşturma
  if (state.activeCoupon) {
    log('Zaten aktif kupon var, yeni kupon oluşturulmadı');
    return NextResponse.json({
      success: true,
      message: 'Aktif kupon mevcut',
      activeCoupon: state.activeCoupon.id,
      logs,
    });
  }
  
  // Günlük limit kontrolü
  const maxDaily = DEFAULT_BOT_CONFIG.maxDailyCoupons;
  if (isDailyLimitReached(state, maxDaily)) {
    const count = getDailyCouponCount(state);
    log(`Günlük kupon limiti doldu (${count}/${maxDaily})`);
    return NextResponse.json({
      success: true,
      message: 'Günlük kupon limiti doldu',
      dailyLimit: maxDaily,
      dailyCount: count,
      logs,
    });
  }
  
  const remaining = getRemainingDailyCoupons(state, maxDaily);
  log(`Günlük kalan kupon hakkı: ${remaining}/${maxDaily}`);
  log('Yeni kupon oluşturuluyor...');
  
  const newCoupon = await generateBotCoupon(DEFAULT_BOT_CONFIG, state.balance);
  
  if (!newCoupon) {
    log('Kriterlere uygun maç bulunamadı');
    return NextResponse.json({
      success: true,
      message: 'Uygun maç bulunamadı',
      logs,
    });
  }
  
  log(`Kupon oluşturuldu: ${newCoupon.id}`);
  log(`Maçlar: ${newCoupon.matches.map(m => `${m.homeTeam} vs ${m.awayTeam}`).join(', ')}`);
  
  // Tweet at
  const useMock = process.env.TWITTER_MOCK === 'true';
  let tweetId: string | undefined;
  
  if (useMock) {
    await mockTweet(formatNewCouponTweet(newCoupon, state.balance));
  } else {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bilyoner-assistant.vercel.app';
    const imageUrl = `${baseUrl}/api/og/coupon?id=${newCoupon.id}`;
    const result = await tweetNewCoupon(newCoupon, state.balance, imageUrl);
    tweetId = result?.tweetId;
  }
  
  // Tweet ID'yi kupona ekle
  newCoupon.tweetId = tweetId;
  
  // Günlük kupon sayacını artır
  state = incrementDailyCoupon(state, newCoupon.id);
  
  // State güncelle
  state.balance -= newCoupon.stake;
  state.totalBets += 1;
  state.totalStaked += newCoupon.stake;
  state.activeCoupon = newCoupon;
  state.lastUpdated = new Date();
  
  await saveBankrollState(state);
  
  log(`Bahis yerleştirildi, kalan kasa: ${state.balance.toFixed(2)} TL`);
  log('Kupon tweeti gönderildi');
  
  return NextResponse.json({
    success: true,
    message: 'Yeni kupon oluşturuldu ve tweet atıldı',
    coupon: {
      id: newCoupon.id,
      tweetId,
      matches: newCoupon.matches.map(m => ({
        teams: `${m.homeTeam} vs ${m.awayTeam}`,
        prediction: m.prediction.label,
        odds: m.prediction.odds,
      })),
      totalOdds: newCoupon.totalOdds,
      stake: newCoupon.stake,
      potentialWin: newCoupon.potentialWin,
    },
    state: {
      balance: state.balance,
      totalBets: state.totalBets,
    },
    logs,
  });
}

/**
 * Canlı skorları kontrol et ve quote tweet at
 */
async function handleCheckLive(
  state: BankrollState, 
  log: (msg: string) => void,
  logs: string[]
) {
  if (!state.activeCoupon) {
    log('Aktif kupon yok');
    return NextResponse.json({
      success: true,
      message: 'Aktif kupon yok',
      logs,
    });
  }
  
  log('Canlı skorlar kontrol ediliyor...');
  
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  
  const liveUpdates: string[] = [];
  
  for (const match of state.activeCoupon.matches) {
    try {
      const res = await fetch(`${baseUrl}/fixtures?id=${match.fixtureId}`, {
        headers: { 'x-apisports-key': apiKey || '' },
      });
      const data = await res.json();
      const fixture = data?.response?.[0];
      
      if (!fixture) continue;
      
      const status = fixture.fixture?.status?.short;
      const homeScore = fixture.goals?.home ?? 0;
      const awayScore = fixture.goals?.away ?? 0;
      
      // Canlı maç mı?
      if (['1H', '2H', 'HT'].includes(status)) {
        const predType = match.prediction.type;
        const totalGoals = homeScore + awayScore;
        
        // Tahmin tuttu mu?
        let hit = false;
        if (predType === 'over25' && totalGoals >= 3) hit = true;
        if (predType === 'btts' && homeScore > 0 && awayScore > 0) hit = true;
        if (predType === 'home' && homeScore > awayScore) hit = true;
        if (predType === 'away' && awayScore > homeScore) hit = true;
        
        if (hit) {
          liveUpdates.push(`✅ ${match.homeTeam} ${homeScore}-${awayScore} ${match.awayTeam} - ${match.prediction.label} TUTTU!`);
        } else {
          liveUpdates.push(`⏳ ${match.homeTeam} ${homeScore}-${awayScore} ${match.awayTeam} (${status})`);
        }
      }
    } catch (error) {
      log(`Maç kontrolü hatası: ${match.fixtureId}`);
    }
  }
  
  // Canlı güncelleme varsa quote tweet at
  if (liveUpdates.length > 0) {
    const tweetText = `🔴 CANLI SKOR GÜNCELLEMESİ

${liveUpdates.join('\n')}

#Bahis #Kupon`;

    const useMock = process.env.TWITTER_MOCK === 'true';
    const quoteTweetId = state.activeCoupon.tweetId || REFERENCE_TWEET_ID;
    
    if (!useMock && quoteTweetId) {
      await sendQuoteTweet(tweetText, quoteTweetId);
      log('Canlı güncelleme tweeti atıldı');
    }
  }
  
  return NextResponse.json({
    success: true,
    message: 'Canlı kontrol tamamlandı',
    liveUpdates,
    logs,
  });
}

/**
 * Kupon sonucunu kontrol et - Tüm maçlar bitene kadar bekler
 */
async function handleCheckResult(
  state: BankrollState, 
  log: (msg: string) => void,
  logs: string[]
) {
  if (!state.activeCoupon) {
    log('Aktif kupon yok');
    return NextResponse.json({
      success: true,
      message: 'Aktif kupon yok',
      logs,
    });
  }
  
  log('Kupon sonucu kontrol ediliyor...');
  
  // Tüm maçların durumunu kontrol et
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
  
  let allMatchesFinished = true;
  let finishedCount = 0;
  const totalMatches = state.activeCoupon.matches.length;
  
  for (const match of state.activeCoupon.matches) {
    try {
      const res = await fetch(`${baseUrl}/fixtures?id=${match.fixtureId}`, {
        headers: { 'x-apisports-key': apiKey || '' },
      });
      const data = await res.json();
      const fixture = data?.response?.[0];
      
      if (!fixture) continue;
      
      const status = fixture.fixture?.status?.short;
      const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
      
      if (finishedStatuses.includes(status)) {
        finishedCount++;
      } else {
        allMatchesFinished = false;
      }
    } catch (error) {
      log(`Maç durumu kontrol hatası: ${match.fixtureId}`);
      allMatchesFinished = false;
    }
  }
  
  // Tüm maçlar bitmedişse bekle
  if (!allMatchesFinished) {
    log(`Maçlar henüz bitmiyor (${finishedCount}/${totalMatches} tamamlandı)`);
    return NextResponse.json({
      success: true,
      message: `Maçlar devam ediyor (${finishedCount}/${totalMatches} bitti)`,
      finishedCount,
      totalMatches,
      logs,
    });
  }
  
  log(`Tüm maçlar bitti (${finishedCount}/${totalMatches})`);
  
  const updatedCoupon = await checkCouponResults(state.activeCoupon);
  
  if (updatedCoupon.status === 'pending') {
    log('Kupon henüz sonuçlanmadı (API gecikmesi olabilir)');
    return NextResponse.json({
      success: true,
      message: 'Kupon henüz sonuçlanmadı',
      logs,
    });
  }
  
  // Kupon sonuçlandı
  const isWon = updatedCoupon.status === 'won';
  const winAmount = isWon ? updatedCoupon.potentialWin : 0;
  const profit = isWon ? updatedCoupon.result!.profit : -updatedCoupon.stake;
  
  log(`Kupon sonuçlandı: ${isWon ? 'KAZANDI' : 'KAYBETTİ'}`);
  log(`Kar/Zarar: ${profit.toFixed(2)} TL`);
  
  // Kasayı güncelle
  state.balance += winAmount;
  state.wonBets += isWon ? 1 : 0;
  state.lostBets += isWon ? 0 : 1;
  state.totalWon += winAmount;
  
  // History'ye ekle
  state.history.push({
    id: `H-${Date.now()}`,
    date: new Date(),
    type: isWon ? 'bet_won' : 'bet_lost',
    couponId: updatedCoupon.id,
    amount: profit,
    balanceAfter: state.balance,
    description: `Kupon ${isWon ? 'kazandı' : 'kaybetti'}: ${profit.toFixed(2)} TL`,
  });
  
  state.activeCoupon = null;
  state.lastUpdated = new Date();
  
  await saveBankrollState(state);
  
  log(`Yeni kasa: ${state.balance.toFixed(2)} TL`);
  
  // Z RAPORU - Gün sonu özet tweeti
  const useMock = process.env.TWITTER_MOCK === 'true';
  const quoteTweetId = updatedCoupon.tweetId || REFERENCE_TWEET_ID;
  
  if (!useMock) {
    const { formatDailyReportTweet } = await import('@/lib/bot/twitter');
    const zRaporuText = formatDailyReportTweet(updatedCoupon, state);
    await sendQuoteTweet(zRaporuText, quoteTweetId);
    log('Z Raporu gönderildi');
  }
  
  return NextResponse.json({
    success: true,
    message: `Kupon ${isWon ? 'KAZANDI' : 'KAYBETTİ'} - Z Raporu gönderildi`,
    result: {
      status: updatedCoupon.status,
      profit,
      newBalance: state.balance,
    },
    logs,
  });
}

// Manuel tetikleme için POST
export async function POST(request: NextRequest) {
  return GET(request);
}
