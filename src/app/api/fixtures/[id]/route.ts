/**
 * Belirli bir maçın detaylarını ve analizini getiren API route
 * GET /api/fixtures/[id]
 */

import { NextResponse } from 'next/server';
import { 
  getFixtureById, 
  getFixtureStatistics, 
  getFixtureEvents,
  getPrediction,
  processPrediction,
  getOdds,
  processOdds
} from '@/lib/api-football';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fixtureId = parseInt(id);

    if (isNaN(fixtureId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid fixture ID' },
        { status: 400 }
      );
    }

    // Paralel istekler
    const [fixture, statistics, events, prediction, odds] = await Promise.all([
      getFixtureById(fixtureId),
      getFixtureStatistics(fixtureId).catch(() => null),
      getFixtureEvents(fixtureId).catch(() => []),
      getPrediction(fixtureId).catch(() => null),
      getOdds(fixtureId).catch(() => null),
    ]);

    if (!fixture) {
      return NextResponse.json(
        { success: false, error: 'Fixture not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      fixture,
      statistics,
      events,
      prediction: prediction ? processPrediction(prediction, fixtureId) : null,
      odds: odds ? processOdds(odds, fixtureId) : null,
    });
  } catch (error) {
    console.error('[API] Error fetching fixture details:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
