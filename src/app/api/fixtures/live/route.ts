/**
 * Canlı maçları getiren API route
 * GET /api/fixtures/live
 */

import { NextResponse } from 'next/server';
import { getLiveFixtures } from '@/lib/api-football';

export async function GET() {
  try {
    const fixtures = await getLiveFixtures();

    return NextResponse.json({
      success: true,
      count: fixtures.length,
      fixtures,
    });
  } catch (error) {
    console.error('[API] Error fetching live fixtures:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
