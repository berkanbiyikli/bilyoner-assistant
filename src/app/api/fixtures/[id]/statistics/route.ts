/**
 * Maç istatistiklerini getiren API route
 * GET /api/fixtures/[id]/statistics
 */

import { NextResponse } from 'next/server';
import { getFixtureStatistics } from '@/lib/api-football';

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

    const statistics = await getFixtureStatistics(fixtureId);

    if (!statistics) {
      return NextResponse.json(
        { success: false, error: 'Statistics not available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      statistics,
    });
  } catch (error) {
    console.error('[API] Error fetching statistics:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
