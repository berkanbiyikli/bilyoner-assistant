/**
 * Live Bot API Route
 * Canlı maçları takip eder ve fırsatları tespit eder
 * 
 * GET /api/bot/live - Canlı fırsatları getir
 * POST /api/bot/live - Fırsata bahis yap
 */

import { NextResponse } from 'next/server';
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

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ============ GET - Canlı Fırsatları Getir ============

export async function GET() {
  try {
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
    
    // Her maç için istatistikleri çek ve LiveMatch formatına dönüştür
    const liveMatches: LiveMatch[] = await Promise.all(
      topLeagueMatches.slice(0, 10).map(async (fixture) => { // Max 10 maç (API limit)
        let stats;
        try {
          stats = await getFixtureStatistics(fixture.id);
        } catch {
          stats = null;
        }
        
        return convertToLiveMatch(fixture, stats);
      })
    );
    
    // Fırsatları tespit et
    const allOpportunities = detectLiveOpportunities(liveMatches, DEFAULT_LIVE_BOT_CONFIG);
    
    // En iyi fırsatları filtrele
    const bestOpportunities = filterBestOpportunities(allOpportunities, 1, 5);
    
    const result = {
      opportunities: bestOpportunities,
      allOpportunitiesCount: allOpportunities.length,
      matches: liveMatches.length,
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
