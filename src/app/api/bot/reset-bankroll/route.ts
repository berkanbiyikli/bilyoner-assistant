/**
 * Bankroll Reset API - Kasayı ayarla
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveBankrollState } from '@/lib/bot/bankroll-store';
import type { BankrollState } from '@/lib/bot/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const balance = parseFloat(searchParams.get('balance') || '500');
  
  if (!isTestMode) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Kasa durumu - kazanç dahil
  // Dünkü kupon: 50 TL stake, 8.12 oran = ~406 TL potansiyel
  // Ama kullanıcı 2100 TL kazandığını söyledi
  const wonBets = balance > 500 ? 1 : 0;
  const totalWon = balance > 500 ? balance : 0;
  const profit = balance - 500;
  
  const newState: BankrollState = {
    balance: balance,
    initialBalance: 500,
    totalBets: 1,
    wonBets: wonBets,
    lostBets: wonBets > 0 ? 0 : 1,
    totalStaked: 50,
    totalWon: totalWon,
    activeCoupon: null, // Aktif kupon yok - yeni kupon oluşturulabilir
    history: [],
    dailyCoupons: {
      date: new Date().toISOString().split('T')[0],
      count: 0,
      couponIds: [],
    },
    streak: {
      currentStreak: wonBets > 0 ? 1 : -1,
      longestWinStreak: wonBets > 0 ? 1 : 0,
      longestLoseStreak: wonBets > 0 ? 0 : 1,
      lastResults: wonBets > 0 ? ['W'] : ['L'],
      milestones: [],
    },
    aiLearning: {
      leaguePerformance: {},
      predictionTypePerformance: {},
      oddsRangePerformance: {
        low: { range: '1.10-1.50', total: 0, won: 0, winRate: 0 },
        medium: { range: '1.50-2.50', total: 0, won: 0, winRate: 0 },
        high: { range: '2.50+', total: 0, won: 0, winRate: 0 },
      },
      confidenceCalibration: {
        ranges: {},
      },
      lastUpdated: new Date(),
    },
    lastUpdated: new Date(),
  };
  
  try {
    await saveBankrollState(newState);
    
    return NextResponse.json({
      success: true,
      message: `Kasa ${balance} TL olarak ayarlandı!`,
      state: {
        balance: newState.balance,
        totalBets: newState.totalBets,
        wonBets: newState.wonBets,
        profit: profit,
        activeCoupon: null,
        dailyCouponsRemaining: 3,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
