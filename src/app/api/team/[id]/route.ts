/**
 * Takım İstatistikleri API Endpoint
 * Detaylı takım bilgileri ve performans verileri
 */

import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_FOOTBALL_KEY!;
const BASE_URL = 'https://v3.football.api-sports.io';

async function fetchFromAPI(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
    next: { revalidate: 3600 }, // 1 saat cache
  });
  
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  
  return res.json();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const teamId = parseInt(id);
    
    if (isNaN(teamId)) {
      return NextResponse.json({ error: 'Invalid team ID' }, { status: 400 });
    }
    
    // Mevcut sezon
    const currentYear = new Date().getFullYear();
    const season = new Date().getMonth() >= 7 ? currentYear : currentYear - 1;
    
    // Paralel API çağrıları
    const [teamRes, statsRes, fixturesRes, squadRes] = await Promise.all([
      fetchFromAPI(`/teams?id=${teamId}`),
      fetchFromAPI(`/teams/statistics?team=${teamId}&season=${season}`).catch(() => ({ response: null })),
      fetchFromAPI(`/fixtures?team=${teamId}&last=10`),
      fetchFromAPI(`/players/squads?team=${teamId}`).catch(() => ({ response: [] })),
    ]);
    
    const team = teamRes.response?.[0];
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }
    
    const stats = statsRes.response;
    const recentFixtures = fixturesRes.response || [];
    const squad = squadRes.response?.[0]?.players || [];
    
    // Form hesapla
    const form = recentFixtures.slice(0, 5).map((f: any) => {
      const isHome = f.teams.home.id === teamId;
      const won = isHome ? f.teams.home.winner : f.teams.away.winner;
      if (won === true) return 'W';
      if (won === false) return 'L';
      return 'D';
    });
    
    // Son maçları işle
    const processedFixtures = recentFixtures.map((f: any) => {
      const isHome = f.teams.home.id === teamId;
      return {
        id: f.fixture.id,
        date: f.fixture.date,
        opponent: isHome ? f.teams.away : f.teams.home,
        isHome,
        score: {
          team: isHome ? f.goals.home : f.goals.away,
          opponent: isHome ? f.goals.away : f.goals.home,
        },
        result: isHome 
          ? (f.teams.home.winner === true ? 'W' : f.teams.home.winner === false ? 'L' : 'D')
          : (f.teams.away.winner === true ? 'W' : f.teams.away.winner === false ? 'L' : 'D'),
        league: f.league,
      };
    });
    
    // İstatistikleri işle
    const processedStats = stats ? {
      league: stats.league,
      form: stats.form,
      fixtures: {
        played: stats.fixtures.played.total,
        wins: stats.fixtures.wins.total,
        draws: stats.fixtures.draws.total,
        losses: stats.fixtures.loses.total,
        homeWins: stats.fixtures.wins.home,
        awayWins: stats.fixtures.wins.away,
      },
      goals: {
        for: stats.goals.for.total.total,
        against: stats.goals.against.total.total,
        forAvg: stats.goals.for.average.total,
        againstAvg: stats.goals.against.average.total,
        forHome: stats.goals.for.total.home,
        forAway: stats.goals.for.total.away,
        againstHome: stats.goals.against.total.home,
        againstAway: stats.goals.against.total.away,
      },
      cleanSheets: stats.clean_sheet.total,
      failedToScore: stats.failed_to_score.total,
      penalty: {
        scored: stats.penalty.scored.total,
        missed: stats.penalty.missed.total,
      },
      lineups: stats.lineups,
      cards: {
        yellow: stats.cards?.yellow || {},
        red: stats.cards?.red || {},
      },
    } : null;
    
    // Kadro özeti
    const squadSummary = {
      total: squad.length,
      byPosition: {
        goalkeepers: squad.filter((p: any) => p.position === 'Goalkeeper').length,
        defenders: squad.filter((p: any) => p.position === 'Defender').length,
        midfielders: squad.filter((p: any) => p.position === 'Midfielder').length,
        attackers: squad.filter((p: any) => p.position === 'Attacker').length,
      },
      topPlayers: squad.slice(0, 10).map((p: any) => ({
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        photo: p.photo,
        age: p.age,
      })),
    };
    
    return NextResponse.json({
      success: true,
      team: {
        id: team.team.id,
        name: team.team.name,
        code: team.team.code,
        country: team.team.country,
        founded: team.team.founded,
        logo: team.team.logo,
        venue: team.venue,
      },
      form,
      stats: processedStats,
      recentMatches: processedFixtures,
      squad: squadSummary,
    });
    
  } catch (error) {
    console.error('Team stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team statistics' },
      { status: 500 }
    );
  }
}
