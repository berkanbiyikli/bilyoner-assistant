/**
 * Hakem İstatistikleri API Route
 * Hakem ID'sine göre son maçlarından kart/penaltı ortalamalarını hesaplar
 * ISR ile 12 saat önbelleğe alınır
 */

import { NextResponse } from 'next/server';
import { isApiCallAllowed, updateRateLimitFromHeaders } from '@/lib/api-football/client';
import type { Referee } from '@/types/api-football';

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

// 12 saat ISR cache
export const revalidate = 43200;

interface FixtureStatResponse {
  fixture: {
    id: number;
    referee: string | null;
    date: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
  events?: Array<{
    type: string;
    detail: string;
    team: { id: number };
    time: { elapsed: number };
    player?: { name: string };
  }>;
  statistics?: Array<{
    team: { id: number };
    statistics: Array<{
      type: string;
      value: number | string | null;
    }>;
  }>;
}

interface AggregatedStats {
  totalMatches: number;
  yellowCards: number;
  redCards: number;
  penalties: number;
  homePenalties: number;
  awayPenalties: number;
  homeYellows: number;
  awayYellows: number;
}

/**
 * Hakem istatistiklerini API'den çek ve aggregate et
 */
async function fetchRefereeStats(refereeId: string): Promise<Referee | null> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    console.error('[Referee API] API key not configured');
    return null;
  }

  try {
    // Rate limit kontrolü
    if (!isApiCallAllowed('/fixtures')) {
      console.warn('[Referee API] Rate limit - istek engellendi');
      return null;
    }

    // Hakemin son 30 maçını çek
    // Not: API-Football'da doğrudan referee ID ile arama olmayabilir
    // Bu durumda fixtures endpoint'inden referee adıyla arama yapılır
    const response = await fetch(
      `${API_BASE_URL}/fixtures?referee=${refereeId}&last=30`,
      {
        headers: {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      }
    );

    updateRateLimitFromHeaders(response.headers);

    if (!response.ok) {
      console.error(`[Referee API] Fetch error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const fixtures: FixtureStatResponse[] = data.response || [];

    if (fixtures.length === 0) {
      console.log(`[Referee API] No fixtures found for referee: ${refereeId}`);
      return null;
    }

    // İstatistikleri topla
    const stats = await aggregateRefereeStats(fixtures);
    const refereeName = fixtures[0]?.fixture?.referee || `Referee ${refereeId}`;

    // Insights oluştur
    const insights = generateInsights(stats);

    const referee: Referee = {
      id: parseInt(refereeId) || 0,
      name: refereeName.split(',')[0] || refereeName, // "Name, Country" formatından sadece ismi al
      nationality: refereeName.split(',')[1]?.trim() || 'Unknown',
      appearance: stats.totalMatches,
      yellow_cards: stats.yellowCards,
      red_cards: stats.redCards,
      penalties: stats.penalties,
      averages: {
        yellow_per_match: stats.totalMatches > 0 ? Math.round((stats.yellowCards / stats.totalMatches) * 10) / 10 : 0,
        red_per_match: stats.totalMatches > 0 ? Math.round((stats.redCards / stats.totalMatches) * 100) / 100 : 0,
        pens_per_match: stats.totalMatches > 0 ? Math.round((stats.penalties / stats.totalMatches) * 100) / 100 : 0,
      },
      insights,
    };

    return referee;
  } catch (error) {
    console.error('[Referee API] Error:', error);
    return null;
  }
}

/**
 * Fixture verilerinden hakem istatistiklerini topla
 */
async function aggregateRefereeStats(fixtures: FixtureStatResponse[]): Promise<AggregatedStats> {
  const stats: AggregatedStats = {
    totalMatches: fixtures.length,
    yellowCards: 0,
    redCards: 0,
    penalties: 0,
    homePenalties: 0,
    awayPenalties: 0,
    homeYellows: 0,
    awayYellows: 0,
  };

  for (const fixture of fixtures) {
    // Events varsa eventlerden say
    if (fixture.events) {
      for (const event of fixture.events) {
        if (event.type === 'Card') {
          if (event.detail === 'Yellow Card') {
            stats.yellowCards++;
            if (event.team.id === fixture.teams.home.id) {
              stats.homeYellows++;
            } else {
              stats.awayYellows++;
            }
          } else if (event.detail === 'Red Card' || event.detail === 'Second Yellow card') {
            stats.redCards++;
          }
        }
        // Penaltı kontrolü (Penalty gol veya VAR penalty)
        if (event.type === 'Goal' && event.detail === 'Penalty') {
          stats.penalties++;
          if (event.team.id === fixture.teams.home.id) {
            stats.homePenalties++;
          } else {
            stats.awayPenalties++;
          }
        }
      }
    }
    
    // Events yoksa statistics'ten çek
    if (fixture.statistics && !fixture.events) {
      for (const teamStat of fixture.statistics) {
        const isHome = teamStat.team.id === fixture.teams.home.id;
        for (const stat of teamStat.statistics) {
          if (stat.type === 'Yellow Cards' && stat.value) {
            const val = parseInt(String(stat.value)) || 0;
            stats.yellowCards += val;
            if (isHome) stats.homeYellows += val;
          } else if (stat.type === 'Red Cards' && stat.value) {
            stats.redCards += parseInt(String(stat.value)) || 0;
          }
        }
      }
    }
  }

  return stats;
}

/**
 * Hakem için insight metinleri oluştur
 */
function generateInsights(stats: AggregatedStats): string[] {
  const insights: string[] = [];

  if (stats.totalMatches === 0) return insights;

  const yellowAvg = stats.yellowCards / stats.totalMatches;
  const redAvg = stats.redCards / stats.totalMatches;
  const penAvg = stats.penalties / stats.totalMatches;

  // Kart eğilimi
  if (yellowAvg >= 5) {
    insights.push(`🟨 Maç başına ${yellowAvg.toFixed(1)} sarı kart - Sert hakem`);
  } else if (yellowAvg <= 2.5) {
    insights.push(`🟨 Maç başına ${yellowAvg.toFixed(1)} sarı kart - Toleranslı hakem`);
  }

  // Kırmızı kart eğilimi
  if (redAvg >= 0.3) {
    insights.push(`🟥 Her 3 maçta 1 kırmızı kart gösteriyor`);
  }

  // Penaltı eğilimi
  if (penAvg >= 0.4) {
    insights.push(`⚽ Her 2-3 maçta 1 penaltı veriyor`);
  }

  // Ev/Deplasman penaltı dağılımı
  if (stats.penalties > 3) {
    const homeRatio = stats.homePenalties / stats.penalties;
    if (homeRatio >= 0.7) {
      insights.push(`🏠 Penaltıların %${Math.round(homeRatio * 100)}'ını ev sahibine veriyor`);
    } else if (homeRatio <= 0.3) {
      insights.push(`✈️ Penaltıların %${Math.round((1 - homeRatio) * 100)}'ını deplasmana veriyor`);
    }
  }

  // Ev/Deplasman kart dağılımı
  if (stats.yellowCards > 10) {
    const homeYellowRatio = stats.homeYellows / stats.yellowCards;
    if (homeYellowRatio >= 0.65) {
      insights.push(`🏠 Sarı kartların çoğunu ev sahibine gösteriyor`);
    } else if (homeYellowRatio <= 0.35) {
      insights.push(`✈️ Sarı kartların çoğunu deplasmana gösteriyor`);
    }
  }

  return insights.slice(0, 3); // Max 3 insight
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const refereeId = resolvedParams.id;

    if (!refereeId) {
      return NextResponse.json(
        { success: false, error: 'Referee ID is required' },
        { status: 400 }
      );
    }

    const referee = await fetchRefereeStats(refereeId);

    if (!referee) {
      return NextResponse.json(
        { success: false, error: 'Referee not found or no data available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: referee,
      cached: true,
      revalidateIn: '12 hours',
    });
  } catch (error) {
    console.error('[Referee API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referee statistics' },
      { status: 500 }
    );
  }
}
