/**
 * Maç Detay API
 * GET /api/match/[id] - Maç detayları, H2H, form
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getFixtureById, 
  getFixtureStatistics, 
  getFixtureEvents,
  getHeadToHead,
  getTeamLastFixtures 
} from '@/lib/api-football/fixtures';
import { getPrediction, getOdds, processPrediction, processOdds } from '@/lib/api-football/predictions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fixtureId = parseInt(id, 10);
    
    if (isNaN(fixtureId)) {
      return NextResponse.json(
        { error: 'Geçersiz maç ID' },
        { status: 400 }
      );
    }
    
    // Temel maç bilgisi
    const fixture = await getFixtureById(fixtureId);
    
    if (!fixture) {
      return NextResponse.json(
        { error: 'Maç bulunamadı' },
        { status: 404 }
      );
    }
    
    // Paralel olarak ek verileri çek
    const [
      statistics,
      events,
      predictionRaw,
      oddsRaw,
      h2h,
      homeForm,
      awayForm
    ] = await Promise.all([
      getFixtureStatistics(fixtureId).catch(() => null),
      getFixtureEvents(fixtureId).catch(() => []),
      getPrediction(fixtureId).catch(() => null),
      getOdds(fixtureId).catch(() => null),
      getHeadToHead(fixture.homeTeam.id, fixture.awayTeam.id, 10).catch(() => []),
      getTeamLastFixtures(fixture.homeTeam.id, 5).catch(() => []),
      getTeamLastFixtures(fixture.awayTeam.id, 5).catch(() => []),
    ]);
    
    // Verileri işle
    const prediction = predictionRaw ? processPrediction(predictionRaw, fixtureId) : null;
    const odds = oddsRaw ? processOdds(oddsRaw, fixtureId) : null;
    
    // Form hesapla
    const homeFormResults = homeForm.map(f => {
      if (f.id === fixtureId) return null; // Kendisini hariç tut
      const isHome = f.homeTeam.id === fixture.homeTeam.id;
      const ownScore = isHome ? f.score.home : f.score.away;
      const oppScore = isHome ? f.score.away : f.score.home;
      
      if (ownScore === null || oppScore === null) return null;
      if (ownScore > oppScore) return 'W';
      if (ownScore < oppScore) return 'L';
      return 'D';
    }).filter(Boolean) as string[];
    
    const awayFormResults = awayForm.map(f => {
      if (f.id === fixtureId) return null;
      const isHome = f.homeTeam.id === fixture.awayTeam.id;
      const ownScore = isHome ? f.score.home : f.score.away;
      const oppScore = isHome ? f.score.away : f.score.home;
      
      if (ownScore === null || oppScore === null) return null;
      if (ownScore > oppScore) return 'W';
      if (ownScore < oppScore) return 'L';
      return 'D';
    }).filter(Boolean) as string[];
    
    // H2H istatistikler
    const h2hStats = {
      total: h2h.length,
      homeWins: h2h.filter(f => {
        if (f.score.home === null || f.score.away === null) return false;
        return f.homeTeam.id === fixture.homeTeam.id 
          ? f.score.home > f.score.away 
          : f.score.away > f.score.home;
      }).length,
      awayWins: h2h.filter(f => {
        if (f.score.home === null || f.score.away === null) return false;
        return f.homeTeam.id === fixture.awayTeam.id 
          ? f.score.home > f.score.away 
          : f.score.away > f.score.home;
      }).length,
      draws: h2h.filter(f => f.score.home === f.score.away && f.score.home !== null).length,
    };
    
    return NextResponse.json({
      success: true,
      data: {
        fixture,
        statistics,
        events,
        prediction,
        odds,
        h2h: {
          matches: h2h,
          stats: h2hStats,
        },
        form: {
          home: {
            results: homeFormResults,
            matches: homeForm.filter(f => f.id !== fixtureId),
          },
          away: {
            results: awayFormResults,
            matches: awayForm.filter(f => f.id !== fixtureId),
          },
        },
      },
    });
  } catch (error) {
    console.error('Maç detay hatası:', error);
    return NextResponse.json(
      { error: 'Maç detayları alınamadı', details: String(error) },
      { status: 500 }
    );
  }
}
