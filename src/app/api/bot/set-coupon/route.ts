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
  
  // 5 Şubat 2026 - Bugünkü Kupon
  // Bilyoner kuponundan alınan veriler
  const tweetCoupon: BotCoupon = {
    id: 'BOT-20260205-1630',
    createdAt: new Date('2026-02-05T16:30:00'),
    tweetId: undefined, // Tweet atıldıktan sonra güncellenecek
    matches: [
      {
        fixtureId: 1394001, // Kocaelispor vs Beşiktaş - Türkiye Kupası
        homeTeam: 'Kocaelispor',
        awayTeam: 'Beşiktaş',
        homeTeamId: 3589,
        awayTeamId: 114,
        league: 'Türkiye Kupası',
        leagueId: 203,
        kickoff: new Date('2026-02-05T15:00:00Z'), // 18:00 TSİ
        prediction: {
          type: 'over25',
          label: 'Üst 2.5',
          probability: 0.68,
          odds: 1.59,
        },
        confidenceScore: 72,
        valuePercent: 10,
        chaosLevel: 0.4,
        homeStyle: 'OFFENSIVE',
        awayStyle: 'OFFENSIVE',
      },
      {
        fixtureId: 1394002, // Fenerbahçe vs Erzurumspor - Türkiye Kupası
        homeTeam: 'Fenerbahçe',
        awayTeam: 'Erzurumspor FK',
        homeTeamId: 611,
        awayTeamId: 7156,
        league: 'Türkiye Kupası',
        leagueId: 203,
        kickoff: new Date('2026-02-05T17:30:00Z'), // 20:30 TSİ
        prediction: {
          type: 'over25', // Gol Üst
          label: 'MS 2.5 Üst',
          probability: 0.62,
          odds: 1.78,
        },
        confidenceScore: 68,
        valuePercent: 15,
        chaosLevel: 0.3,
        homeStyle: 'OFFENSIVE',
        awayStyle: 'DEFENSIVE',
      },
      {
        fixtureId: 1378150, // Atalanta vs Juventus - Serie A
        homeTeam: 'Atalanta',
        awayTeam: 'Juventus',
        homeTeamId: 499,
        awayTeamId: 496,
        league: 'Serie A',
        leagueId: 135,
        kickoff: new Date('2026-02-05T20:00:00Z'), // 23:00 TSİ
        prediction: {
          type: 'btts',
          label: 'KG Var',
          probability: 0.65,
          odds: 1.57,
        },
        confidenceScore: 70,
        valuePercent: 12,
        chaosLevel: 0.5,
        homeStyle: 'OFFENSIVE',
        awayStyle: 'COUNTER',
      },
      {
        fixtureId: 1377005, // Strasbourg vs Monaco - Ligue 1
        homeTeam: 'Strasbourg',
        awayTeam: 'Monaco',
        homeTeamId: 95,
        awayTeamId: 91,
        league: 'Ligue 1',
        leagueId: 61,
        kickoff: new Date('2026-02-05T20:00:00Z'), // 23:00 TSİ
        prediction: {
          type: 'over25',
          label: 'Üst 2.5',
          probability: 0.70,
          odds: 1.47,
        },
        confidenceScore: 75,
        valuePercent: 8,
        chaosLevel: 0.4,
        homeStyle: 'CHAOTIC',
        awayStyle: 'OFFENSIVE',
      },
      {
        fixtureId: 1378201, // Real Betis vs Atletico Madrid - La Liga
        homeTeam: 'Real Betis',
        awayTeam: 'Atletico Madrid',
        homeTeamId: 543,
        awayTeamId: 530,
        league: 'La Liga',
        leagueId: 140,
        kickoff: new Date('2026-02-05T20:00:00Z'), // 23:00 TSİ
        prediction: {
          type: 'over25',
          label: 'Üst 2.5',
          probability: 0.63,
          odds: 1.63,
        },
        confidenceScore: 67,
        valuePercent: 14,
        chaosLevel: 0.5,
        homeStyle: 'OFFENSIVE',
        awayStyle: 'DEFENSIVE',
      },
      {
        fixtureId: 1375082, // Sporting Lizbon vs Avs Futebol - Liga Portugal
        homeTeam: 'Sporting Lizbon',
        awayTeam: 'AVS Futebol SAD',
        homeTeamId: 228,
        awayTeamId: 23122,
        league: 'Primeira Liga',
        leagueId: 94,
        kickoff: new Date('2026-02-05T20:45:00Z'), // 23:45 TSİ
        prediction: {
          type: 'over25', // Gol Üst
          label: 'MS 2.5 Üst',
          probability: 0.60,
          odds: 1.65,
        },
        confidenceScore: 66,
        valuePercent: 11,
        chaosLevel: 0.3,
        homeStyle: 'OFFENSIVE',
        awayStyle: 'DEFENSIVE',
      },
    ],
    totalOdds: 17.57, // 1.59 * 1.78 * 1.57 * 1.47 * 1.63 * 1.65 ≈ 17.57
    stake: 679, // 679 TL Bilyoner'den
    potentialWin: 11928.21, // Maks kazanç
    status: 'pending',
  };
  
  try {
    // State'i yükle
    const state = await getBankrollState();
    
    // Eğer bu kupon zaten varsa, tekrar düşürme
    const alreadyExists = state.activeCoupon?.id === tweetCoupon.id;
    
    // Kuponu ekle
    state.activeCoupon = tweetCoupon;
    
    if (!alreadyExists) {
      // İlk kez ekleniyor - kasadan düş
      // Mevcut bakiyeden stake'i düş (önceki state'i koru)
      state.balance = Math.max(0, (state.balance || 500) - tweetCoupon.stake);
      state.totalBets = (state.totalBets || 0) + 1;
      state.totalStaked = (state.totalStaked || 0) + tweetCoupon.stake;
    }
    
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
