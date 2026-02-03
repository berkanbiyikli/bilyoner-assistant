/**
 * Bankroll Reset API - Kasayı sıfırla ve tek kuponu ayarla
 */

import { NextRequest, NextResponse } from 'next/server';
import { saveBankrollState } from '@/lib/bot/bankroll-store';
import type { BankrollState, BotCoupon } from '@/lib/bot/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  
  if (!isTestMode) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Aktif kupon - gerçek fixture ID'ler
  const activeCoupon: BotCoupon = {
    id: 'BOT-20260203-1910',
    createdAt: new Date('2026-02-03T19:10:00Z'),
    tweetId: '1886462814777266323',
    matches: [
      {
        fixtureId: 1378084, // Bologna vs AC Milan
        homeTeam: 'Bologna',
        awayTeam: 'AC Milan',
        homeTeamId: 500,
        awayTeamId: 489,
        league: 'Serie A',
        leagueId: 135,
        kickoff: new Date('2026-02-03T19:45:00Z'), // 22:45 TSİ
        prediction: {
          type: 'over25',
          label: 'Üst 2.5',
          probability: 0.65,
          odds: 1.85,
        },
        confidenceScore: 72,
        valuePercent: 12,
        chaosLevel: 0.4,
        homeStyle: 'OFFENSIVE',
        awayStyle: 'OFFENSIVE',
      },
      {
        fixtureId: 1382815, // ST Mirren vs Hearts
        homeTeam: 'ST Mirren',
        awayTeam: 'Heart Of Midlothian',
        homeTeamId: 251,
        awayTeamId: 254,
        league: 'Scottish Premiership',
        leagueId: 179,
        kickoff: new Date('2026-02-03T20:00:00Z'), // 23:00 TSİ
        prediction: {
          type: 'btts',
          label: 'KG Var',
          probability: 0.62,
          odds: 1.90,
        },
        confidenceScore: 68,
        valuePercent: 15,
        chaosLevel: 0.5,
        homeStyle: 'CHAOTIC',
        awayStyle: 'OFFENSIVE',
      },
      {
        fixtureId: 1380417, // Piast Gliwice vs Lech Poznan
        homeTeam: 'Piast Gliwice',
        awayTeam: 'Lech Poznan',
        homeTeamId: 349,
        awayTeamId: 347,
        league: 'Ekstraklasa',
        leagueId: 106,
        kickoff: new Date('2026-02-03T19:30:00Z'), // 22:30 TSİ
        prediction: {
          type: 'away',
          label: 'MS 2',
          probability: 0.55,
          odds: 2.30,
        },
        confidenceScore: 65,
        valuePercent: 18,
        chaosLevel: 0.3,
        homeStyle: 'DEFENSIVE',
        awayStyle: 'OFFENSIVE',
      },
    ],
    totalOdds: 8.12,
    stake: 50,
    potentialWin: 406,
    status: 'pending',
  };
  
  // Tamamen yeni state oluştur
  const newState: BankrollState = {
    balance: 450, // 500 - 50 = 450
    initialBalance: 500,
    totalBets: 1,
    wonBets: 0,
    lostBets: 0,
    totalStaked: 50,
    totalWon: 0,
    activeCoupon,
    history: [],
    dailyCoupons: {
      date: new Date().toISOString().split('T')[0],
      count: 1,
      couponIds: ['BOT-20260203-1910'],
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
      message: 'Kasa sıfırlandı!',
      state: {
        balance: newState.balance,
        totalBets: newState.totalBets,
        activeCoupon: newState.activeCoupon?.id,
        matches: newState.activeCoupon?.matches.map(m => ({
          id: m.fixtureId,
          teams: `${m.homeTeam} vs ${m.awayTeam}`,
          kickoff: m.kickoff,
          prediction: m.prediction.label,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
