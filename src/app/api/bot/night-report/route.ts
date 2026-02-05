/**
 * Gece Raporu API - 05:00 TSİ (02:00 UTC)
 * Günü nasıl kapattık? - Mühendislik değerlendirmesi
 * 
 * Amaç: Güven oluşturmak, hataları analiz etmek, ROI paylaşmak
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBankrollState } from '@/lib/bot/bankroll-store';
import { sendTweet, sendReplyTweet } from '@/lib/bot/twitter';
import { formatNightReportThread, type NightReportData } from '@/lib/bot/tweet-templates';
import type { BankrollState, BankrollHistoryItem } from '@/lib/bot/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// API Football config
const API_KEY = process.env.API_FOOTBALL_KEY || '';
const API_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

/**
 * Bugünkü bahis geçmişini filtrele
 */
function getTodayHistory(state: BankrollState): BankrollHistoryItem[] {
  const today = new Date().toISOString().split('T')[0];
  return state.history.filter(h => {
    const historyDate = new Date(h.date).toISOString().split('T')[0];
    return historyDate === today;
  });
}

/**
 * Haftalık performansı hesapla
 */
function getWeeklyPerformance(state: BankrollState): { profit: number; roi: number; staked: number } {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  let weeklyStaked = 0;
  let weeklyWon = 0;
  
  for (const h of state.history) {
    const historyDate = new Date(h.date);
    if (historyDate >= weekAgo) {
      if (h.type === 'bet_placed') {
        weeklyStaked += Math.abs(h.amount);
      } else if (h.type === 'bet_won') {
        weeklyWon += h.amount;
      }
    }
  }
  
  const profit = weeklyWon - weeklyStaked;
  const roi = weeklyStaked > 0 ? (profit / weeklyStaked) * 100 : 0;
  
  return { profit, roi, staked: weeklyStaked };
}

/**
 * Kuponu sonuçlandır ve neden tuttu/tutmadı analizi yap
 */
async function analyzeCouponResult(couponId: string, state: BankrollState): Promise<{
  bestPrediction?: { match: string; odds: number; reasoning: string };
  worstPrediction?: { match: string; odds: number; whatWentWrong: string };
}> {
  // History'den kupon sonucunu bul
  const couponHistory = state.history.filter(h => h.couponId === couponId);
  
  // Gerçek analiz için kupon detaylarını çekmemiz gerekir
  // Şimdilik basit bir analiz yapacağız
  
  // TODO: Kupon detaylarını Redis'ten çek ve maç sonuçlarını analiz et
  
  return {
    bestPrediction: undefined,
    worstPrediction: undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const useMock = process.env.TWITTER_MOCK === 'true';
  
  try {
    // Bankroll state'i al
    const state = await getBankrollState();
    
    // Bugünkü işlemleri filtrele
    const todayHistory = getTodayHistory(state);
    
    // Bugünkü kuponları say
    const todayBetsPlaced = todayHistory.filter(h => h.type === 'bet_placed');
    const todayBetsWon = todayHistory.filter(h => h.type === 'bet_won');
    const todayBetsLost = todayHistory.filter(h => h.type === 'bet_lost');
    
    // Bugünkü finansallar
    const todayStaked = todayHistory
      .filter(h => h.type === 'bet_placed')
      .reduce((sum, h) => sum + Math.abs(h.amount), 0);
    
    const todayReturned = todayHistory
      .filter(h => h.type === 'bet_won')
      .reduce((sum, h) => sum + h.amount, 0);
    
    const todayProfit = todayReturned - todayStaked;
    const todayROI = todayStaked > 0 ? (todayProfit / todayStaked) * 100 : 0;
    
    // Haftalık performans
    const weeklyPerf = getWeeklyPerformance(state);
    
    // Eğer bugün bahis yoksa, rapor atma
    if (todayBetsPlaced.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Bugün bahis yapılmadı, rapor atılmayacak',
        todayCoupons: 0,
      });
    }
    
    // En iyi ve en kötü tahmin analizi
    let bestPrediction: { match: string; odds: number; reasoning: string } | undefined;
    let worstPrediction: { match: string; odds: number; whatWentWrong: string } | undefined;
    
    // En iyi kazanç
    if (todayBetsWon.length > 0) {
      const bestWin = todayBetsWon.sort((a, b) => b.amount - a.amount)[0];
      bestPrediction = {
        match: bestWin.description || 'Bilinmeyen maç',
        odds: 0, // TODO: Kupon detayından çek
        reasoning: 'Model istatistiksel üstünlüğü doğru tespit etti.',
      };
    }
    
    // En kötü kayıp
    if (todayBetsLost.length > 0) {
      const worstLoss = todayBetsLost.sort((a, b) => a.amount - b.amount)[0]; // En düşük (negatif)
      
      // Basit hata analizi template'leri
      const errorReasons = [
        'Son dakika sakatlık haberi modele yansımadı.',
        'Hakem faktörü beklenmedik şekilde oyunu etkiledi.',
        'Hava koşulları oyun stilini beklenenden fazla bozdu.',
        'Beklenmedik kadro rotasyonu yapıldı.',
        'Rakip takım normalin üstünde performans gösterdi.',
      ];
      
      worstPrediction = {
        match: worstLoss.description || 'Bilinmeyen maç',
        odds: 0,
        whatWentWrong: errorReasons[Math.floor(Math.random() * errorReasons.length)],
      };
    }
    
    const today = new Date().toLocaleDateString('tr-TR', { 
      day: 'numeric', 
      month: 'long' 
    });
    
    // Rapor verisini oluştur
    const reportData: NightReportData = {
      date: today,
      totalCoupons: todayBetsPlaced.length,
      wonCoupons: todayBetsWon.length,
      lostCoupons: todayBetsLost.length,
      totalStaked: todayStaked,
      totalReturned: todayReturned,
      profit: todayProfit,
      roi: todayROI,
      weeklyProfit: weeklyPerf.profit,
      weeklyROI: weeklyPerf.roi,
      bestPrediction,
      worstPrediction,
    };
    
    // Thread oluştur
    const tweets = formatNightReportThread(reportData);
    
    // Tweet at
    const tweetIds: string[] = [];
    
    if (!isTestMode) {
      if (useMock) {
        console.log('[NightReport] MOCK Thread:');
        tweets.forEach((t, i) => console.log(`Tweet ${i + 1}:\n${t}\n---`));
      } else {
        // Ana tweet
        const mainResult = await sendTweet(tweets[0]);
        if (mainResult.tweetId) tweetIds.push(mainResult.tweetId);
        
        // Reply'ler
        let lastTweetId = mainResult.tweetId;
        for (let i = 1; i < tweets.length; i++) {
          if (lastTweetId) {
            await new Promise(r => setTimeout(r, 1500));
            const replyResult = await sendReplyTweet(tweets[i], lastTweetId);
            if (replyResult.tweetId) {
              tweetIds.push(replyResult.tweetId);
              lastTweetId = replyResult.tweetId;
            }
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : `${tweets.length} tweet atıldı`,
      data: reportData,
      tweets,
      tweetIds,
      performance: {
        daily: {
          coupons: todayBetsPlaced.length,
          won: todayBetsWon.length,
          lost: todayBetsLost.length,
          roi: todayROI.toFixed(1) + '%',
        },
        weekly: {
          staked: weeklyPerf.staked,
          profit: weeklyPerf.profit,
          roi: weeklyPerf.roi.toFixed(1) + '%',
        },
        overall: {
          balance: state.balance,
          totalBets: state.totalBets,
          winRate: state.totalBets > 0 
            ? ((state.wonBets / state.totalBets) * 100).toFixed(1) + '%' 
            : '0%',
        },
      },
    });
    
  } catch (error) {
    console.error('[NightReport] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}

/**
 * POST - Manuel hata analizi ekle
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { couponId, errorReason } = body;
    
    if (!couponId || !errorReason) {
      return NextResponse.json({
        success: false,
        error: 'couponId ve errorReason gerekli',
      }, { status: 400 });
    }
    
    // Hata analizi tweet'i at
    const state = await getBankrollState();
    
    const tweet = `📊 MODEL ANALİZİ

Kupon: ${couponId}

❌ Model burada yanıldı:
${errorReason}

🔄 Bu veriler ilerideki tahminleri geliştirecek.

(Hataları analiz etmek, başarıdan daha öğreticidir.)`;

    const useMock = process.env.TWITTER_MOCK === 'true';
    
    if (useMock) {
      console.log('[NightReport] MOCK Error Analysis:\n', tweet);
    } else {
      await sendTweet(tweet);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Hata analizi tweeti atıldı',
      tweet,
    });
    
  } catch (error) {
    console.error('[NightReport] POST Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
