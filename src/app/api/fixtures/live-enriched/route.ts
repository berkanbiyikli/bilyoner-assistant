/**
 * Canlı maçları İSTATİSTİKLERİYLE BİRLİKTE getiren API route
 * GET /api/fixtures/live-enriched
 * 
 * Her maç için ayrı ayrı istatistik çeker ve zenginleştirilmiş veri döner.
 * Hunter dashboard ve canlı analiz paneli için kullanılır.
 */

import { NextResponse } from 'next/server';
import { getLiveFixtures, getFixtureStatistics } from '@/lib/api-football/fixtures';
import { isTop20League } from '@/config/league-priorities';
import type { ProcessedFixture, ProcessedStatistics } from '@/types/api-football';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export interface EnrichedLiveFixture {
  fixture: ProcessedFixture;
  statistics: ProcessedStatistics | null;
}

export async function GET() {
  try {
    // Canlı maçları getir
    const fixtures = await getLiveFixtures();
    
    // Top 20 ligleri filtrele
    const topLeagueFixtures = fixtures.filter(f => isTop20League(f.league.id));
    
    // Her maç için istatistikleri paralel çek (max 15 maç, API limiti)
    const enrichedFixtures: EnrichedLiveFixture[] = await Promise.all(
      topLeagueFixtures.slice(0, 15).map(async (fixture) => {
        let statistics: ProcessedStatistics | null = null;
        try {
          statistics = await getFixtureStatistics(fixture.id);
        } catch (err) {
          console.error(`[Live-Enriched] Stats fetch failed for fixture ${fixture.id}:`, err);
        }
        return { fixture, statistics };
      })
    );

    return NextResponse.json({
      success: true,
      count: enrichedFixtures.length,
      totalLive: fixtures.length,
      enrichedFixtures,
    });
  } catch (error) {
    console.error('[API] Error fetching enriched live fixtures:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
