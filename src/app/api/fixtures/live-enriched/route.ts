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
    // Canlı maçları getir (cache'siz)
    const fixtures = await getLiveFixtures();
    
    // Tüm liglerdeki canlı maçlar (filtre kaldırıldı)
    const topLeagueFixtures = fixtures;
    
    // Her maç için istatistikleri SIRAYLA çek (rate limit'e takılmamak için)
    // Max 10 maç — her biri ayrı API call
    const enrichedFixtures: EnrichedLiveFixture[] = [];
    const fixturesToFetch = topLeagueFixtures.slice(0, 10);
    
    for (const fixture of fixturesToFetch) {
      let statistics: ProcessedStatistics | null = null;
      try {
        statistics = await getFixtureStatistics(fixture.id, true); // noCache=true
      } catch (err) {
        console.error(`[Live-Enriched] Stats fetch failed for fixture ${fixture.id}:`, err);
      }
      enrichedFixtures.push({ fixture, statistics });
      
      // Rate limit önleme: maçlar arası 200ms bekle
      if (fixturesToFetch.indexOf(fixture) < fixturesToFetch.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    
    // İstatistik çekilemeyen kalan maçları da ekle (stats=null)
    for (const fixture of topLeagueFixtures.slice(10)) {
      enrichedFixtures.push({ fixture, statistics: null });
    }

    const statsCount = enrichedFixtures.filter(e => e.statistics !== null).length;
    console.log(`[Live-Enriched] ${enrichedFixtures.length} maç, ${statsCount} istatistik başarılı`);

    return NextResponse.json({
      success: true,
      count: enrichedFixtures.length,
      statsLoaded: statsCount,
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
