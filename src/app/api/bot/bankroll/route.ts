/**
 * Bot Bankroll API - Kasa Durumu
 * Redis'ten okur/yazar
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBankrollState, saveBankrollState } from '@/lib/bot/bankroll-store';
import { formatTurkeyTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = await getBankrollState();
    
    // Aktif kupon varsa maç durumlarını ekle
    let activeCouponInfo = null;
    if (state.activeCoupon) {
      const now = new Date();
      activeCouponInfo = {
        id: state.activeCoupon.id,
        createdAt: state.activeCoupon.createdAt,
        totalOdds: state.activeCoupon.totalOdds,
        stake: state.activeCoupon.stake,
        potentialWin: state.activeCoupon.potentialWin,
        status: state.activeCoupon.status,
        tweetId: state.activeCoupon.tweetId,
        matches: state.activeCoupon.matches.map(m => {
          const kickoff = new Date(m.kickoff);
          const isStarted = now >= kickoff;
          const minutesSinceKickoff = isStarted ? Math.floor((now.getTime() - kickoff.getTime()) / 60000) : 0;
          
          return {
            fixtureId: m.fixtureId,
            teams: `${m.homeTeam} vs ${m.awayTeam}`,
            league: m.league,
            kickoffTime: formatTurkeyTime(m.kickoff),
            prediction: m.prediction.label,
            odds: m.prediction.odds,
            isStarted,
            minutesSinceKickoff: isStarted ? minutesSinceKickoff : null,
            status: isStarted 
              ? (minutesSinceKickoff > 105 ? 'Bitti' : `Canlı (~${minutesSinceKickoff}')`)
              : `Başlamadı (${formatTurkeyTime(m.kickoff)})`,
          };
        }),
      };
    }
    
    return NextResponse.json({
      success: true,
      data: {
        balance: state.balance,
        initialBalance: state.initialBalance,
        totalBets: state.totalBets,
        wonBets: state.wonBets,
        lostBets: state.lostBets,
        totalStaked: state.totalStaked,
        totalWon: state.totalWon,
        profitLoss: state.balance - state.initialBalance,
        winRate: state.totalBets > 0 ? (state.wonBets / state.totalBets) * 100 : 0,
        roi: state.totalStaked > 0 ? ((state.totalWon - state.totalStaked) / state.totalStaked) * 100 : 0,
        dailyCoupons: state.dailyCoupons,
      },
      activeCoupon: activeCouponInfo,
    });
  } catch (error) {
    console.error('[Bankroll API] Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to get bankroll state',
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const state = await getBankrollState();
    
    // Sadece izin verilen alanları güncelle
    if (typeof body.balance === 'number') {
      state.balance = body.balance;
    }
    
    state.lastUpdated = new Date();
    await saveBankrollState(state);
    
    return NextResponse.json({
      success: true,
      data: {
        balance: state.balance,
        profitLoss: state.balance - state.initialBalance,
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid request body',
    }, { status: 400 });
  }
}

// Kasayı sıfırla
export async function DELETE() {
  const initialState = {
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
      marketPerformance: {},
      timePerformance: {},
      confidenceCalibration: [],
    },
  };
  
  await saveBankrollState(initialState as any);
  
  return NextResponse.json({
    success: true,
    message: 'Bankroll reset to 500 TL',
    data: { balance: 500 },
  });
}
