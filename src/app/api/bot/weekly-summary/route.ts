/**
 * Haftalık Performans Özeti API
 * Her pazar akşamı haftalık kasa durumunu tweetler
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBankrollState } from '@/lib/bot/bankroll-store';
import { sendTweet } from '@/lib/bot/twitter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isTestMode = searchParams.get('test') === '1';
  const useMock = process.env.TWITTER_MOCK === 'true';
  
  try {
    const state = await getBankrollState();
    
    // Haftalık istatistikleri hesapla
    const totalBets = state.totalBets;
    const wonBets = state.wonBets;
    const lostBets = state.lostBets;
    const winRate = totalBets > 0 ? (wonBets / totalBets * 100) : 0;
    const profit = state.balance - state.initialBalance;
    const roi = state.totalStaked > 0 ? (profit / state.totalStaked * 100) : 0;
    
    // Seri bilgisi
    const currentStreak = state.streak?.currentStreak || 0;
    const streakText = currentStreak > 0 
      ? `🔥 ${currentStreak} maç kazanma serisi!` 
      : currentStreak < 0 
        ? `❄️ ${Math.abs(currentStreak)} maç kayıp serisi` 
        : '';
    
    // En iyi performans gösteren lig
    let bestLeague = '';
    let bestLeagueWinRate = 0;
    if (state.aiLearning?.leaguePerformance) {
      for (const [league, perf] of Object.entries(state.aiLearning.leaguePerformance)) {
        if (perf.totalPredictions >= 3 && perf.winRate > bestLeagueWinRate) {
          bestLeagueWinRate = perf.winRate;
          bestLeague = league;
        }
      }
    }
    
    // Tweet formatla
    const tweetText = formatWeeklySummaryTweet({
      totalBets,
      wonBets,
      lostBets,
      winRate,
      profit,
      roi,
      balance: state.balance,
      streakText,
      bestLeague,
      bestLeagueWinRate,
    });
    
    // Tweet at
    if (!isTestMode) {
      if (useMock) {
        console.log('[WeeklySummary] MOCK Tweet:\n', tweetText);
      } else {
        await sendTweet(tweetText);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isTestMode ? 'Test modu - tweet atılmadı' : 'Haftalık özet tweeti atıldı',
      tweet: tweetText,
      stats: {
        totalBets,
        wonBets,
        lostBets,
        winRate,
        profit,
        roi,
        balance: state.balance,
      },
    });
    
  } catch (error) {
    console.error('[WeeklySummary] Hata:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}

interface SummaryStats {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  winRate: number;
  profit: number;
  roi: number;
  balance: number;
  streakText: string;
  bestLeague: string;
  bestLeagueWinRate: number;
}

function formatWeeklySummaryTweet(stats: SummaryStats): string {
  const lines: string[] = [];
  
  // Başlık
  lines.push('📊 HAFTALIK KASA RAPORU');
  lines.push('');
  
  // Ana istatistikler
  const profitEmoji = stats.profit >= 0 ? '📈' : '📉';
  const profitSign = stats.profit >= 0 ? '+' : '';
  
  lines.push(`✅ Kazanan: ${stats.wonBets} kupon`);
  lines.push(`❌ Kaybeden: ${stats.lostBets} kupon`);
  lines.push(`🎯 Başarı: %${stats.winRate.toFixed(1)}`);
  lines.push('');
  
  lines.push(`${profitEmoji} Kar/Zarar: ${profitSign}${stats.profit.toFixed(0)} TL`);
  lines.push(`💰 Güncel Kasa: ${stats.balance.toFixed(0)} TL`);
  lines.push(`📊 ROI: ${profitSign}${stats.roi.toFixed(1)}%`);
  
  // Seri bilgisi
  if (stats.streakText) {
    lines.push('');
    lines.push(stats.streakText);
  }
  
  // En iyi lig
  if (stats.bestLeague && stats.bestLeagueWinRate > 60) {
    lines.push('');
    lines.push(`🏆 En iyi lig: ${stats.bestLeague} (%${stats.bestLeagueWinRate.toFixed(0)})`);
  }
  
  lines.push('');
  lines.push('#bahis #iddaa #haftalık #kasa');
  
  return lines.join('\n');
}
