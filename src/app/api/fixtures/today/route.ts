/**
 * Günün maçlarını getiren API route
 * GET /api/fixtures/today
 */

import { NextResponse } from 'next/server';
import { getFixturesByDate } from '@/lib/api-football';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    
    const date = dateParam ? new Date(dateParam) : new Date();
    const fixtures = await getFixturesByDate(date);

    // Saate göre sırala
    const sorted = fixtures.sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json({
      success: true,
      date: date.toISOString().split('T')[0],
      count: sorted.length,
      fixtures: sorted,
    });
  } catch (error) {
    console.error('[API] Error fetching today fixtures:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
