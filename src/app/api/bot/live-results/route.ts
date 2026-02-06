/**
 * Live Pick Results API Route
 * Canlı pick'lerin sonuçlarını kontrol eder ve tweet atar
 * 
 * GET /api/bot/live-results - Aktif pick'leri kontrol et, bitenleri settle et
 * 
 * Vercel Cron ile her 10 dakikada bir çağrılır
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getActivePicks, 
  settlePick, 
  checkPickResult, 
  getDailyPicks,
  updateDailyStats,
  formatPickResultTweet,
  formatDailyPerformanceTweet,
  formatWinStreakTweet,
  type LivePick,
  type LivePickStats,
} from '@/lib/bot/live-pick-tracker';
import { sendTweet, sendReplyTweet } from '@/lib/bot/twitter';
import { cacheGet, cacheSet } from '@/lib/cache/redis-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const API_KEY = process.env.API_FOOTBALL_KEY || '';
const API_BASE = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

// Spam önleme - Redis tabanlı (Vercel cold start'a dayanıklı)
const RESULT_TWEET_COOLDOWN = 3 * 60 * 1000;     // 3 dk arası result tweet
const PERFORMANCE_TWEET_COOLDOWN = 60 * 60 * 1000; // 1 saat arası performans tweet
const REDIS_KEY_RESULT_TWEET_TIME = 'bot:results:lastResultTweetTime';
const REDIS_KEY_PERFORMANCE_TWEET_TIME = 'bot:results:lastPerformanceTweetTime';

async function getLastResultTweetTime(): Promise<number> {
  return (await cacheGet<number>(REDIS_KEY_RESULT_TWEET_TIME)) || 0;
}
async function setLastResultTweetTime(time: number): Promise<void> {
  await cacheSet(REDIS_KEY_RESULT_TWEET_TIME, time, 600); // 10 dk TTL
}
async function getLastPerformanceTweetTime(): Promise<number> {
  return (await cacheGet<number>(REDIS_KEY_PERFORMANCE_TWEET_TIME)) || 0;
}
async function setLastPerformanceTweetTime(time: number): Promise<void> {
  await cacheSet(REDIS_KEY_PERFORMANCE_TWEET_TIME, time, 7200); // 2 saat TTL
}

/**
 * Fixture'ın final skorunu çek
 */
async function getFixtureFinalScore(fixtureId: number): Promise<{
  homeScore: number;
  awayScore: number;
  status: string;
  isFinished: boolean;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/fixtures?id=${fixtureId}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    const fixture = data?.response?.[0];
    
    if (!fixture) return null;
    
    const status = fixture.fixture?.status?.short || '';
    const finishedStatuses = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
    
    return {
      homeScore: fixture.goals?.home ?? 0,
      awayScore: fixture.goals?.away ?? 0,
      status,
      isFinished: finishedStatuses.includes(status),
    };
  } catch (err) {
    console.error(`[LiveResults] Fixture ${fixtureId} fetch hatası:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[LiveResults] ${msg}`);
    logs.push(msg);
  };
  
  try {
    // Auth kontrolü
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const { searchParams } = new URL(request.url);
    const isTestMode = searchParams.get('test') === '1';
    
    if (!isVercelCron && !isTestMode && process.env.NODE_ENV !== 'development') {
      const authHeader = request.headers.get('authorization');
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    
    const useMock = process.env.TWITTER_MOCK === 'true';
    
    // Aktif pick'leri al
    const activePicks = await getActivePicks();
    
    if (activePicks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aktif pick yok',
        logs,
      });
    }
    
    log(`${activePicks.length} aktif pick kontrol ediliyor...`);
    
    const settledPicks: LivePick[] = [];
    const recentWins: LivePick[] = [];
    
    // Her aktif pick için maç skorunu kontrol et
    for (const pick of activePicks) {
      const scoreData = await getFixtureFinalScore(pick.fixtureId);
      
      if (!scoreData) {
        log(`${pick.homeTeam} vs ${pick.awayTeam} - Veri alınamadı`);
        continue;
      }
      
      if (!scoreData.isFinished) {
        log(`${pick.homeTeam} vs ${pick.awayTeam} - Henüz bitmedi (${scoreData.status})`);
        continue;
      }
      
      // Maç bitti! Sonucu kontrol et
      const finalScore = `${scoreData.homeScore}-${scoreData.awayScore}`;
      const result = checkPickResult(pick, scoreData.homeScore, scoreData.awayScore);
      
      // Pick'i settle et
      const settledPick = await settlePick(pick.fixtureId, pick.market, result, finalScore);
      if (settledPick) {
        settledPicks.push(settledPick);
        if (result === 'won') recentWins.push(settledPick);
        log(`${pick.homeTeam} ${finalScore} ${pick.awayTeam} - ${pick.pick}: ${result === 'won' ? '✅ TUTTU' : '❌ TUTMADI'}`);
      }
    }
    
    // Sonuç tweet'leri at
    const today = new Date().toISOString().split('T')[0];
    const stats = await updateDailyStats(today);
    
    if (settledPicks.length > 0) {
      const lastResultTime = await getLastResultTweetTime();
      const canTweetResult = Date.now() - lastResultTime >= RESULT_TWEET_COOLDOWN;
      
      if (canTweetResult) {
        // Birden fazla kazanan pick varsa toplu kutlama tweeti
        if (recentWins.length >= 2) {
          const tweetText = formatWinStreakTweet(recentWins, stats);
          
          if (!useMock) {
            try {
              // Orijinal fırsat tweetine reply olarak at
              const replyToId = recentWins[0].tweetId;
              if (replyToId && !replyToId.startsWith('mock_')) {
                await sendReplyTweet(tweetText, replyToId);
              } else {
                await sendTweet(tweetText);
              }
              log(`🔥 ${recentWins.length} tuttu! Kutlama tweeti atıldı`);
            } catch (err) {
              console.error('[LiveResults] Tweet hatası:', err);
            }
          } else {
            log(`[MOCK] Kutlama tweeti:\n${tweetText}`);
          }
          await setLastResultTweetTime(Date.now());
        }
        // Tek pick settle olduysa sonuç tweeti
        else {
          for (const pick of settledPicks) {
            const tweetText = formatPickResultTweet(pick, stats);
            
            if (!useMock) {
              try {
                // Orijinal tweete reply olarak at
                const replyToId = pick.tweetId;
                if (replyToId && !replyToId.startsWith('mock_')) {
                  await sendReplyTweet(tweetText, replyToId);
                } else {
                  await sendTweet(tweetText);
                }
                log(`${pick.status === 'won' ? '✅' : '❌'} Sonuç tweeti: ${pick.homeTeam} vs ${pick.awayTeam}`);
              } catch (err) {
                console.error('[LiveResults] Tweet hatası:', err);
              }
            } else {
              log(`[MOCK] Sonuç tweeti:\n${tweetText}`);
            }
          }
          await setLastResultTweetTime(Date.now());
        }
      }
    }
    
    // Günlük performans tweeti (belirli milestonelar'da)
    const settled = stats.won + stats.lost;
    const lastPerfTime = await getLastPerformanceTweetTime();
    const canTweetPerformance = Date.now() - lastPerfTime >= PERFORMANCE_TWEET_COOLDOWN;
    
    // 5+ pick settle olmuşsa ve 1 saattir performans tweeti atılmadıysa
    if (settled >= 5 && canTweetPerformance && stats.pending === 0) {
      const perfTweet = formatDailyPerformanceTweet(stats);
      
      if (!useMock) {
        try {
          await sendTweet(perfTweet);
          log(`📊 Günlük performans tweeti atıldı (${stats.won}/${settled} - %${stats.winRate})`);
        } catch (err) {
          console.error('[LiveResults] Performance tweet hatası:', err);
        }
      } else {
        log(`[MOCK] Performans tweeti:\n${perfTweet}`);
      }
      await setLastPerformanceTweetTime(Date.now());
    }
    
    return NextResponse.json({
      success: true,
      activePicks: activePicks.length - settledPicks.length,
      settled: settledPicks.map(p => ({
        match: `${p.homeTeam} vs ${p.awayTeam}`,
        pick: p.pick,
        result: p.status,
        finalScore: p.finalScore,
      })),
      dailyStats: {
        won: stats.won,
        lost: stats.lost,
        pending: stats.pending,
        winRate: stats.winRate,
        streak: stats.streak,
      },
      logs,
    });
    
  } catch (error) {
    console.error('[LiveResults] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      logs,
    }, { status: 500 });
  }
}
