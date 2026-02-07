/**
 * Live Bot API Route
 * Canlı maçları takip eder ve fırsatları tespit eder
 * 
 * GET /api/bot/live - Canlı fırsatları getir
 * POST /api/bot/live - Fırsata bahis yap
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLiveFixtures, getFixtureStatistics } from '@/lib/api-football/fixtures';
import { 
  detectLiveOpportunities, 
  filterBestOpportunities,
} from '@/lib/bot/live-engine';
import { 
  DEFAULT_LIVE_BOT_CONFIG, 
  type LiveMatch, 
  type LiveOpportunity 
} from '@/lib/bot/live-types';
import type { ProcessedFixture, ProcessedStatistics } from '@/types/api-football';
import { isTop20League } from '@/config/league-priorities';
import { cacheGet, cacheSet } from '@/lib/cache/redis-cache';
import { sendTweet } from '@/lib/bot/twitter';
import { saveLivePick, type LivePick } from '@/lib/bot/live-pick-tracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Spam önleme - Redis tabanlı (Vercel cold start'a dayanıklı)
const LIVE_TWEET_COOLDOWN = 15 * 60 * 1000; // 15 dk arası
const REDIS_KEY_LIVE_TWEET_TIME = 'bot:live:lastTweetTime';
const REDIS_KEY_LIVE_TWEET_SNAPSHOT = 'bot:live:lastSnapshot';
const REDIS_KEY_TWEETED_FIXTURES = 'bot:live:tweetedFixtures'; // Duplicate prevention

async function getLastLiveTweetTime(): Promise<number> {
  return (await cacheGet<number>(REDIS_KEY_LIVE_TWEET_TIME)) || 0;
}
async function setLastLiveTweetTime(time: number): Promise<void> {
  await cacheSet(REDIS_KEY_LIVE_TWEET_TIME, time, 3600); // 1 saat TTL
}
async function getLastLiveTweetSnapshot(): Promise<string> {
  return (await cacheGet<string>(REDIS_KEY_LIVE_TWEET_SNAPSHOT)) || '';
}
async function setLastLiveTweetSnapshot(snapshot: string): Promise<void> {
  await cacheSet(REDIS_KEY_LIVE_TWEET_SNAPSHOT, snapshot, 3600);
}
// Fixture bazlı duplicate tweet önleme (cron + live arası)
async function isFixtureAlreadyTweeted(fixtureId: number): Promise<boolean> {
  const tweeted = (await cacheGet<number[]>(REDIS_KEY_TWEETED_FIXTURES)) || [];
  return tweeted.includes(fixtureId);
}
async function markFixtureTweeted(fixtureId: number): Promise<void> {
  const tweeted = (await cacheGet<number[]>(REDIS_KEY_TWEETED_FIXTURES)) || [];
  if (!tweeted.includes(fixtureId)) {
    tweeted.push(fixtureId);
    await cacheSet(REDIS_KEY_TWEETED_FIXTURES, tweeted, 3600); // 1 saat TTL
  }
}

/**
 * Canlı fırsat tweet metni oluştur
 */
function formatLiveOpportunityTweet(opportunities: LiveOpportunity[]): string {
  const lines: string[] = [];
  
  lines.push('🔴 CANLI ANALİZ - Fırsat Tespiti');
  lines.push('');
  
  opportunities.slice(0, 3).forEach((opp, i) => {
    const urgencyEmoji = opp.urgency === 'critical' ? '🔥' : opp.urgency === 'high' ? '⚡' : '📊';
    lines.push(`${i + 1}. ${opp.match.homeTeam} ${opp.match.score} ${opp.match.awayTeam}`);
    lines.push(`⏱️ ${opp.match.minute}' | ${urgencyEmoji} ${opp.market}`);
    lines.push(`🎯 ${opp.pick} @${opp.estimatedOdds.toFixed(2)} | Güven: %${opp.confidence}`);
    lines.push(`📈 ${opp.reasoning}`);
    if (i < Math.min(opportunities.length, 3) - 1) lines.push('');
  });
  
  lines.push('');
  lines.push('🔗 https://bilyoner-assistant.vercel.app/live');
  lines.push('');
  lines.push('#CanlıAnaliz #VeriAnalizi #Bahis');
  
  return lines.join('\n');
}

// ============ GET - Canlı Fırsatları Getir ============

export async function GET(request: NextRequest) {
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
    
    const startTime = Date.now();
    
    // Cache kontrolü (30 saniye)
    const cacheKey = 'live-opportunities';
    const cached = await cacheGet<{
      opportunities: LiveOpportunity[];
      matches: number;
      timestamp: string;
    }>(cacheKey);
    
    if (cached) {
      return NextResponse.json({
        success: true,
        ...cached,
        cached: true,
      });
    }
    
    // Canlı maçları getir
    const liveFixtures = await getLiveFixtures();
    
    // Top 20 ligleri filtrele
    const topLeagueMatches = liveFixtures.filter(f => isTop20League(f.league.id));
    
    if (topLeagueMatches.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Şu an Top 20 liglerden canlı maç yok',
        opportunities: [],
        matches: 0,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Her maç için istatistikleri SIRAYLA çek ve LiveMatch formatına dönüştür
    const liveMatches: LiveMatch[] = [];
    for (const fixture of topLeagueMatches.slice(0, 10)) {
      let stats;
      try {
        stats = await getFixtureStatistics(fixture.id, true); // noCache for live
      } catch {
        stats = null;
      }
      liveMatches.push(convertToLiveMatch(fixture, stats));
      // Rate limit koruma
      await new Promise(r => setTimeout(r, 150));
    }
    
    // Fırsatları tespit et (artık async - gerçek oranları API'den çekiyor)
    const allOpportunities = await detectLiveOpportunities(liveMatches, DEFAULT_LIVE_BOT_CONFIG);
    
    // En iyi fırsatları filtrele
    const bestOpportunities = filterBestOpportunities(allOpportunities, 1, 5);
    
    // Yüksek güvenli fırsat varsa tweet at
    let tweetSent = false;
    let savedPicks: string[] = [];
    const tweetableOpportunities = bestOpportunities.filter(o => o.confidence >= 75);
    
    if (tweetableOpportunities.length > 0) {
      const oppSnapshot = tweetableOpportunities.map(o => 
        `${o.fixtureId}:${o.type}:${o.confidence}`
      ).join('|');
      
      const lastSnapshot = await getLastLiveTweetSnapshot();
      const lastTweetTime = await getLastLiveTweetTime();
      const isNew = oppSnapshot !== lastSnapshot;
      const canTweet = Date.now() - lastTweetTime >= LIVE_TWEET_COOLDOWN;
      const useMock = process.env.TWITTER_MOCK === 'true';
      
      // Duplicate fixture check: cron veya live zaten tweet attıysa atma
      const uniqueOpportunities = [];
      for (const opp of tweetableOpportunities) {
        if (!(await isFixtureAlreadyTweeted(opp.fixtureId))) {
          uniqueOpportunities.push(opp);
        }
      }
      
      if (isNew && canTweet && uniqueOpportunities.length > 0) {
        const tweetText = formatLiveOpportunityTweet(uniqueOpportunities);
        let tweetId: string | undefined;
        
        // OG Image URL oluştur
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bilyoner-assistant.vercel.app';
        const matchesData = uniqueOpportunities.map(o => ({
          home: o.match.homeTeam,
          away: o.match.awayTeam,
          score: o.match.score,
          minute: o.match.minute,
          league: liveMatches.find(m => m.fixtureId === o.fixtureId)?.league || '',
          pick: o.pick,
          odds: o.estimatedOdds,
          confidence: o.confidence,
          reasoning: o.reasoning,
        }));
        const imageUrl = `${baseUrl}/api/og/live?type=opportunity&matches=${encodeURIComponent(JSON.stringify(matchesData))}`;
        
        if (!useMock) {
          try {
            const tweetResult = await sendTweet(tweetText, { imageUrl });
            tweetSent = true;
            tweetId = tweetResult.tweetId;
            console.log('[Live Bot] Fırsat tweeti atıldı (görsel ile)!');
          } catch (tweetErr) {
            console.error('[Live Bot] Tweet hatası:', tweetErr);
          }
        } else {
          console.log(`[Live Bot][MOCK] Tweet (image: ${imageUrl}):\n${tweetText}`);
          tweetSent = true;
          tweetId = `mock_${Date.now()}`;
        }
        
        // Pick'leri kaydet (takip için)
        if (tweetSent) {
          for (const opp of uniqueOpportunities) {
            const pick: LivePick = {
              id: `pick_${opp.fixtureId}_${Date.now()}`,
              fixtureId: opp.fixtureId,
              homeTeam: opp.match.homeTeam,
              awayTeam: opp.match.awayTeam,
              league: liveMatches.find(m => m.fixtureId === opp.fixtureId)?.league || '',
              market: opp.market,
              pick: opp.pick,
              confidence: opp.confidence,
              estimatedOdds: opp.estimatedOdds,
              reasoning: opp.reasoning,
              tweetId,
              scoreAtPick: opp.match.score,
              minuteAtPick: opp.match.minute,
              status: 'active',
              createdAt: new Date().toISOString(),
              source: 'live-bot',
            };
            const saved = await saveLivePick(pick);
            if (saved) {
              savedPicks.push(`${opp.match.homeTeam} vs ${opp.match.awayTeam}: ${opp.pick}`);
              await markFixtureTweeted(opp.fixtureId);
            }
          }
        }
        
        await setLastLiveTweetSnapshot(oppSnapshot);
        await setLastLiveTweetTime(Date.now());
      }
    }
    
    // Canlı maç özetleri
    const matchSummaries = liveMatches.map(m => ({
      fixture: `${m.homeTeam} vs ${m.awayTeam}`,
      score: `${m.homeScore}-${m.awayScore}`,
      minute: m.minute,
      status: m.status,
      league: m.league,
      stats: m.stats ? {
        shots: `${m.stats.homeShotsTotal || 0}-${m.stats.awayShotsTotal || 0}`,
        shotsOnTarget: `${m.stats.homeShotsOnTarget || 0}-${m.stats.awayShotsOnTarget || 0}`,
        corners: `${m.stats.homeCorners || 0}-${m.stats.awayCorners || 0}`,
        cards: `${(m.stats.homeYellowCards || 0) + (m.stats.homeRedCards || 0)}-${(m.stats.awayYellowCards || 0) + (m.stats.awayRedCards || 0)}`,
        possession: `${m.stats.homePossession || 50}%-${m.stats.awayPossession || 50}%`,
      } : null,
    }));
    
    const result = {
      opportunities: bestOpportunities,
      allOpportunitiesCount: allOpportunities.length,
      matches: liveMatches.length,
      liveMatches: matchSummaries,
      tweetSent,
      savedPicks,
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
    };
    
    // Cache'e kaydet (30 saniye)
    await cacheSet(cacheKey, result, 30);
    
    return NextResponse.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    console.error('[Live Bot] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to detect live opportunities' },
      { status: 500 }
    );
  }
}

// ============ YARDIMCI FONKSİYONLAR ============

/**
 * Fixture'ı LiveMatch formatına dönüştür
 */
function convertToLiveMatch(
  fixture: ProcessedFixture, 
  stats: ProcessedStatistics | null
): LiveMatch {
  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    homeTeamId: fixture.homeTeam.id,
    awayTeamId: fixture.awayTeam.id,
    league: fixture.league.name,
    leagueId: fixture.league.id,
    leagueLogo: fixture.league.logo,
    
    homeScore: fixture.score.home ?? 0,
    awayScore: fixture.score.away ?? 0,
    
    minute: fixture.status.elapsed ?? 0,
    status: fixture.status.code as LiveMatch['status'],
    
    stats: {
      homeShotsOnTarget: stats?.home.shotsOnGoal ?? 0,
      awayShotsOnTarget: stats?.away.shotsOnGoal ?? 0,
      homeShotsTotal: stats?.home.totalShots ?? 0,
      awayShotsTotal: stats?.away.totalShots ?? 0,
      
      homePossession: stats?.home.possession ?? 50,
      awayPossession: stats?.away.possession ?? 50,
      
      homeCorners: stats?.home.corners ?? 0,
      awayCorners: stats?.away.corners ?? 0,
      
      homeFouls: stats?.home.fouls ?? 0,
      awayFouls: stats?.away.fouls ?? 0,
      homeYellowCards: stats?.home.yellowCards ?? 0,
      awayYellowCards: stats?.away.yellowCards ?? 0,
      homeRedCards: stats?.home.redCards ?? 0,
      awayRedCards: stats?.away.redCards ?? 0,
      
      homeDangerousAttacks: 0, // API'de yok
      awayDangerousAttacks: 0,
    },
    
    lastUpdated: new Date(),
  };
}
