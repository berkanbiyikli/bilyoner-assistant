/**
 * Injuries API Route
 * Takım sakatlık bilgilerini getirir
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiFootballFetch } from '@/lib/api-football/client';

interface ApiInjury {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string;
    reason: string;
  };
  team: {
    id: number;
    name: string;
    logo: string;
  };
  fixture: {
    id: number;
    date: string;
  };
  league: {
    id: number;
    name: string;
    season: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;
    
    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // Get current season
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const season = currentMonth >= 7 ? currentYear : currentYear - 1; // Temmuz sonrası yeni sezon

    // Fetch injuries from API-Football
    const response = await apiFootballFetch<ApiInjury[]>('/injuries', {
      team: teamId,
      season: season,
    });

    // Transform to our format
    const injuries = (response.response || []).map((injury) => ({
      playerId: injury.player.id,
      playerName: injury.player.name,
      playerPhoto: injury.player.photo,
      type: mapInjuryType(injury.player.type),
      reason: injury.player.reason || 'Bilinmiyor',
      teamId: injury.team.id,
      teamName: injury.team.name,
      fixtureId: injury.fixture?.id,
      fixtureDate: injury.fixture?.date,
      // Critical players would need additional data (starting XI info)
      // For now, we'll mark based on appearances if available
      isCritical: false, // Would need additional logic
    }));

    // Group by player to avoid duplicates, keep latest
    const uniqueInjuries = Array.from(
      injuries.reduce((map, injury) => {
        const existing = map.get(injury.playerId);
        if (!existing || new Date(injury.fixtureDate || 0) > new Date(existing.fixtureDate || 0)) {
          map.set(injury.playerId, injury);
        }
        return map;
      }, new Map()).values()
    );

    return NextResponse.json({
      success: true,
      data: {
        teamId: parseInt(teamId),
        injuries: uniqueInjuries,
        count: uniqueInjuries.length,
      },
    });
  } catch (error) {
    console.error('Error fetching injuries:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch injuries',
        data: { teamId: null, injuries: [], count: 0 }
      },
      { status: 500 }
    );
  }
}

function mapInjuryType(type: string): 'injury' | 'suspension' | 'doubtful' {
  const lowerType = type?.toLowerCase() || '';
  
  if (lowerType.includes('suspend') || lowerType.includes('red card') || lowerType.includes('yellow')) {
    return 'suspension';
  }
  if (lowerType.includes('doubt') || lowerType.includes('question')) {
    return 'doubtful';
  }
  return 'injury';
}
