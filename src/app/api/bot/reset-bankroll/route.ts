/**
 * Bankroll Reset API - Kasayı sıfırla
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveBankrollState } from '@/lib/bot/bankroll-store';
import type { BankrollState } from '@/lib/bot/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  
  if (!isTestMode) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Temiz başlangıç state'i - aktif kupon YOK
  const newState: BankrollState = {
    balance: 500,
    initialBalance: 500,
    totalBets: 0,
    wonBets: 0,
    lostBets: 0,
    totalStaked: 0,
    totalWon: 0,
    activeCoupon: null, // Aktif kupon yok - yeni kupon oluşturulabilir
    history: [],
    dailyCoupons: {
      date: new Date().toISOString().split('T')[0],
      count: 0,
      couponIds: [],
    },
    streak: {
      currentStreak: 0,
      longestWinStreak: 0,
      longestLoseStreak: 0,
      lastResults: [],
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
      message: 'Kasa sıfırlandı! Yeni kupon oluşturulabilir.',
      state: {
        balance: newState.balance,
        totalBets: newState.totalBets,
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
