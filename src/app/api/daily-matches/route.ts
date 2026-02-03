/**
 * Daily Matches API Route
 * Top 20 ligden günlük maçları döndürür
 */

import { NextResponse } from 'next/server';
import { getDailyMatches, getDailyMatchStats, getDailyMatchesForLeagues } from '@/lib/api-football/daily-matches';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const leaguesParam = searchParams.get('leagues');
    const liveOnly = searchParams.get('live') === 'true';

    // Tarih parse
    let date: Date | undefined;
    if (dateParam && dateParam !== 'today') {
      date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { success: false, error: 'Invalid date format' },
          { status: 400 }
        );
      }
    }

    // Lig filtresi parse
    const leagueIds = leaguesParam
      ? leaguesParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
      : undefined;

    // Maçları getir
    let matches = leagueIds && leagueIds.length > 0
      ? await getDailyMatchesForLeagues(leagueIds, date)
      : await getDailyMatches(date);

    // Sadece canlı maçlar isteniyorsa filtrele
    if (liveOnly) {
      matches = matches.filter(m => m.status.isLive);
    }

    // İstatistikleri hesapla
    const stats = getDailyMatchStats(matches);

    return NextResponse.json({
      success: true,
      data: matches,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Daily Matches API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch daily matches' },
      { status: 500 }
    );
  }
}
