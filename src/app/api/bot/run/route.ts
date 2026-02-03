/**
 * Bot Run API - Ana Cron Endpoint
 * 
 * 15 dakikada bir çalışır:
 * 1. Aktif kuponun maç sonuçlarını kontrol et
 * 2. Kasayı güncelle
 * 3. Yeni kupon oluştur
 * 4. Tweet at
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateBotCoupon, checkCouponResults, DEFAULT_BOT_CONFIG } from '@/lib/bot/engine';
import { tweetNewCoupon, tweetResult, mockTweet, formatNewCouponTweet, formatResultTweet } from '@/lib/bot/twitter';
import type { BotCoupon, BankrollState } from '@/lib/bot/types';

// Basit in-memory state (production'da localStorage veya KV kullanılacak)
let botState: BankrollState = {
  balance: 500,
  initialBalance: 500,
  totalBets: 0,
  wonBets: 0,
  lostBets: 0,
  totalStaked: 0,
  totalWon: 0,
  activeCoupon: null,
  history: [],
  lastUpdated: new Date(),
};

// Authorization kontrolü
function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Development'ta auth bypass
  if (process.env.NODE_ENV === 'development') return true;
  
  // Cron secret kontrolü
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  
  return false;
}

export async function GET(request: NextRequest) {
  // Auth kontrolü
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[Bot] ${msg}`);
    logs.push(msg);
  };
  
  try {
    log('Bot çalışmaya başladı...');
    log(`Güncel kasa: ${botState.balance.toFixed(2)} TL`);
    
    // ============ AŞAMA A: BİTEN MAÇLARI KONTROL ET ============
    
    if (botState.activeCoupon) {
      log('Aktif kupon kontrol ediliyor...');
      
      const updatedCoupon = await checkCouponResults(botState.activeCoupon);
      
      if (updatedCoupon.status !== 'pending') {
        // Kupon sonuçlandı
        const isWon = updatedCoupon.status === 'won';
        const winAmount = isWon ? updatedCoupon.potentialWin : 0;
        const profit = isWon ? updatedCoupon.result!.profit : -updatedCoupon.stake;
        
        log(`Kupon sonuçlandı: ${isWon ? 'KAZANDI' : 'KAYBETTİ'}`);
        log(`Kar/Zarar: ${profit.toFixed(2)} TL`);
        
        // Kasayı güncelle
        botState.balance += winAmount;
        botState.wonBets += isWon ? 1 : 0;
        botState.lostBets += isWon ? 0 : 1;
        botState.totalWon += winAmount;
        botState.activeCoupon = null;
        botState.lastUpdated = new Date();
        
        log(`Yeni kasa: ${botState.balance.toFixed(2)} TL`);
        
        // Sonuç tweeti
        const useMock = process.env.TWITTER_MOCK === 'true';
        if (useMock) {
          await mockTweet(formatResultTweet(updatedCoupon, botState.balance));
        } else {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
          const imageUrl = `${baseUrl}/api/og/coupon?id=${updatedCoupon.id}&result=true`;
          await tweetResult(updatedCoupon, botState.balance, imageUrl);
        }
        
        log('Sonuç tweeti gönderildi');
      } else {
        log('Aktif kupon henüz sonuçlanmadı');
        return NextResponse.json({
          success: true,
          message: 'Aktif kupon beklemede',
          state: {
            balance: botState.balance,
            activeCoupon: botState.activeCoupon?.id,
          },
          logs,
        });
      }
    }
    
    // ============ AŞAMA B: YENİ KUPON OLUŞTUR ============
    
    log('Yeni kupon oluşturuluyor...');
    
    const newCoupon = await generateBotCoupon(DEFAULT_BOT_CONFIG, botState.balance);
    
    if (!newCoupon) {
      log('Kriterlere uygun maç bulunamadı');
      return NextResponse.json({
        success: true,
        message: 'Uygun maç bulunamadı',
        state: {
          balance: botState.balance,
          activeCoupon: null,
        },
        logs,
      });
    }
    
    log(`Kupon oluşturuldu: ${newCoupon.id}`);
    log(`Maçlar: ${newCoupon.matches.map(m => `${m.homeTeam} vs ${m.awayTeam}`).join(', ')}`);
    log(`Toplam oran: ${newCoupon.totalOdds.toFixed(2)}, Stake: ${newCoupon.stake.toFixed(2)} TL`);
    
    // Kasadan düş
    botState.balance -= newCoupon.stake;
    botState.totalBets += 1;
    botState.totalStaked += newCoupon.stake;
    botState.activeCoupon = newCoupon;
    botState.lastUpdated = new Date();
    
    log(`Bahis yerleştirildi, kalan kasa: ${botState.balance.toFixed(2)} TL`);
    
    // Yeni kupon tweeti
    const useMock = process.env.TWITTER_MOCK === 'true';
    if (useMock) {
      await mockTweet(formatNewCouponTweet(newCoupon, botState.balance + newCoupon.stake));
    } else {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const imageUrl = `${baseUrl}/api/og/coupon?id=${newCoupon.id}`;
      await tweetNewCoupon(newCoupon, botState.balance + newCoupon.stake, imageUrl);
    }
    
    log('Kupon tweeti gönderildi');
    
    return NextResponse.json({
      success: true,
      message: 'Yeni kupon oluşturuldu ve tweet atıldı',
      coupon: {
        id: newCoupon.id,
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
        balance: botState.balance,
        totalBets: botState.totalBets,
        wonBets: botState.wonBets,
        lostBets: botState.lostBets,
      },
      logs,
    });
    
  } catch (error) {
    console.error('[Bot] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      logs,
    }, { status: 500 });
  }
}

// Manuel tetikleme için POST
export async function POST(request: NextRequest) {
  return GET(request);
}
