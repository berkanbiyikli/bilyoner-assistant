/**
 * Manuel Kupon Kaydet - Mevcut tweet'teki kuponu Redis'e kaydet
 * Sadece test=1 ile çalışır
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBankrollState, saveBankrollState } from '@/lib/bot/bankroll-store';
import type { BotCoupon, BotMatch } from '@/lib/bot/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  
  if (!isTestMode) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Tweet'teki kupon bilgileri (3 Şubat 2026 - 19:10)
  // GERÇEK fixture ID'ler!
  const tweetCoupon: BotCoupon = {
    id: 'BOT-20260203-1910',
    createdAt: new Date('2026-02-03T19:10:00'),
    tweetId: '1886462814777266323', // Tweet ID (varsa)
    matches: [
      {
        fixtureId: 1378084, // Bologna vs AC Milan - GERÇEK ID
        homeTeam: 'Bologna',
        awayTeam: 'AC Milan',
        homeTeamId: 500,
        awayTeamId: 489,
        league: 'Serie A',
        leagueId: 135,
        kickoff: new Date('2026-02-03T20:45:00'),
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
        fixtureId: 1382815, // ST Mirren vs Hearts - GERÇEK ID
        homeTeam: 'ST Mirren',
        awayTeam: 'Heart Of Midlothian',
        homeTeamId: 251,
        awayTeamId: 254,
        league: 'Scottish Premiership',
        leagueId: 179,
        kickoff: new Date('2026-02-03T21:00:00'),
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
        fixtureId: 1380417, // Piast Gliwice vs Lech Poznan - GERÇEK ID
        homeTeam: 'Piast Gliwice',
        awayTeam: 'Lech Poznan',
        homeTeamId: 349,
        awayTeamId: 347,
        league: 'Ekstraklasa',
        leagueId: 106,
        kickoff: new Date('2026-02-03T19:30:00'),
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
  
  try {
    // State'i yükle
    const state = await getBankrollState();
    
    // Kuponu ekle
    state.activeCoupon = tweetCoupon;
    state.balance = state.balance - tweetCoupon.stake; // 500 - 50 = 450
    state.totalBets += 1;
    state.totalStaked += tweetCoupon.stake;
    state.lastUpdated = new Date();
    
    // Redis'e kaydet
    await saveBankrollState(state);
    
    return NextResponse.json({
      success: true,
      message: 'Kupon Redis\'e kaydedildi!',
      coupon: {
        id: tweetCoupon.id,
        matches: tweetCoupon.matches.map(m => `${m.homeTeam} vs ${m.awayTeam}: ${m.prediction.label}`),
        totalOdds: tweetCoupon.totalOdds,
        stake: tweetCoupon.stake,
      },
      state: {
        balance: state.balance,
        totalBets: state.totalBets,
        activeCoupon: state.activeCoupon?.id,
      }
    });
  } catch (error) {
    console.error('Kupon kaydetme hatası:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
