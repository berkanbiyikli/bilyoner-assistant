/**
 * Fixtures (Maçlar) API Endpoint Functions
 */

import { apiFootballFetch, getTodayForApi, formatDateForApi } from './client';
import { formatTurkeyDate, formatTurkeyTime } from '@/lib/utils';
import { 
  FixtureResponse, 
  ProcessedFixture,
  FixtureStatisticsResponse,
  ProcessedStatistics,
  MatchEvent,
  StatisticItem
} from '@/types/api-football';

// Canlı maç status kodları
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const UPCOMING_STATUSES = ['NS', 'TBD'];

/**
 * Günün tüm maçlarını getir
 */
export async function getFixturesByDate(date?: Date): Promise<ProcessedFixture[]> {
  const dateStr = date ? formatDateForApi(date) : getTodayForApi();
  
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    date: dateStr,
    timezone: 'Europe/Istanbul',
  });

  return response.response.map(processFixture);
}

/**
 * Canlı maçları getir
 */
export async function getLiveFixtures(): Promise<ProcessedFixture[]> {
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    live: 'all',
    timezone: 'Europe/Istanbul',
  }, { noCache: true });

  return response.response.map(processFixture);
}

/**
 * Belirli bir maçın detaylarını getir
 */
export async function getFixtureById(fixtureId: number): Promise<ProcessedFixture | null> {
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    id: fixtureId,
    timezone: 'Europe/Istanbul',
  });

  if (response.response.length === 0) {
    return null;
  }

  return processFixture(response.response[0]);
}

/**
 * Maç istatistiklerini getir
 * @param live - true ise cache devre dışı (canlı maçlar için)
 */
export async function getFixtureStatistics(fixtureId: number, live?: boolean): Promise<ProcessedStatistics | null> {
  const response = await apiFootballFetch<FixtureStatisticsResponse[]>('/fixtures/statistics', {
    fixture: fixtureId,
  }, live ? { noCache: true } : undefined);

  if (response.response.length < 2) {
    return null;
  }

  return processStatistics(fixtureId, response.response);
}

/**
 * Maç olaylarını getir (goller, kartlar, vs.)
 */
export async function getFixtureEvents(fixtureId: number): Promise<MatchEvent[]> {
  const response = await apiFootballFetch<MatchEvent[]>('/fixtures/events', {
    fixture: fixtureId,
  });

  return response.response;
}

/**
 * Head to Head (karşılıklı maçlar)
 */
export async function getHeadToHead(team1Id: number, team2Id: number, last?: number): Promise<ProcessedFixture[]> {
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures/headtohead', {
    h2h: `${team1Id}-${team2Id}`,
    last: last || 10,
    timezone: 'Europe/Istanbul',
  });

  return response.response.map(processFixture);
}

/**
 * Takımın son maçlarını getir (form)
 */
export async function getTeamLastFixtures(teamId: number, last?: number): Promise<ProcessedFixture[]> {
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    team: teamId,
    last: last || 5,
    timezone: 'Europe/Istanbul',
  });

  return response.response.map(processFixture);
}

// === Helper Functions ===

/**
 * Raw fixture verisini işle
 */
function processFixture(fixture: FixtureResponse): ProcessedFixture {
  const statusCode = fixture.fixture.status.short;

  return {
    id: fixture.fixture.id,
    date: formatTurkeyDate(fixture.fixture.date),
    time: formatTurkeyTime(fixture.fixture.date),
    timestamp: fixture.fixture.timestamp,
    status: {
      code: statusCode,
      elapsed: fixture.fixture.status.elapsed,
      isLive: LIVE_STATUSES.includes(statusCode),
      isFinished: FINISHED_STATUSES.includes(statusCode),
      isUpcoming: UPCOMING_STATUSES.includes(statusCode),
    },
    league: {
      id: fixture.league.id,
      name: fixture.league.name,
      country: fixture.league.country,
      logo: fixture.league.logo,
      flag: fixture.league.flag,
    },
    homeTeam: {
      id: fixture.teams.home.id,
      name: fixture.teams.home.name,
      logo: fixture.teams.home.logo,
    },
    awayTeam: {
      id: fixture.teams.away.id,
      name: fixture.teams.away.name,
      logo: fixture.teams.away.logo,
    },
    score: {
      home: fixture.goals.home,
      away: fixture.goals.away,
      halftimeHome: fixture.score.halftime.home,
      halftimeAway: fixture.score.halftime.away,
    },
    venue: fixture.fixture.venue.name,
  };
}

/**
 * İstatistik tipinden değer çıkar
 */
function getStatValue(statistics: StatisticItem[], type: string): number {
  const stat = statistics.find(s => s.type === type);
  if (!stat || stat.value === null) return 0;
  
  // Yüzde değerlerinden % işaretini kaldır
  if (typeof stat.value === 'string') {
    const numValue = parseFloat(stat.value.replace('%', ''));
    return isNaN(numValue) ? 0 : numValue;
  }
  
  return stat.value;
}

// =====================================
// 📊 xG Extraction Utilities (Faz 2)
// =====================================

/**
 * Son maçlardan xG verisi çıkar
 * API-Football'dan gelen son maçları analiz ederek takım bazlı xG değerlerini döndürür
 * xG yoksa gerçek gol sayısını fallback olarak kullanır
 * 
 * @param lastMatches Son oynanan maçlar (ProcessedFixture[])
 * @param teamId Takım ID'si
 * @param maxMatches Maksimum maç sayısı (default: 5)
 * @returns { xgValues, goals, hasRealXG } - xG değerleri, gerçek goller ve xG varlığı
 */
export async function extractRecentXG(
  lastMatches: ProcessedFixture[],
  teamId: number,
  maxMatches: number = 5
): Promise<{ xgValues: number[]; goals: number[]; hasRealXG: boolean }> {
  const xgValues: number[] = [];
  const goals: number[] = [];
  let realXGCount = 0;
  
  // Son maçları sınırla
  const matches = lastMatches.slice(0, maxMatches);
  
  for (const match of matches) {
    // Maç bitmiş mi kontrol et
    if (!match.status.isFinished) continue;
    
    // Takımın ev sahibi mi deplasman mı olduğunu bul
    const isHome = match.homeTeam.id === teamId;
    const teamGoals = isHome ? match.score.home : match.score.away;
    
    // Gol değerini kaydet (null ise 0)
    goals.push(teamGoals ?? 0);
    
    // xG verisi için maç istatistiklerini çekmeye çalış
    try {
      const stats = await getFixtureStatistics(match.id);
      if (stats) {
        const teamXG = isHome ? stats.home.expectedGoals : stats.away.expectedGoals;
        if (teamXG !== null && teamXG !== undefined) {
          xgValues.push(teamXG);
          realXGCount++;
        } else {
          // xG yoksa gerçek golü kullan
          xgValues.push(teamGoals ?? 0);
        }
      } else {
        // İstatistik yoksa gerçek golü kullan
        xgValues.push(teamGoals ?? 0);
      }
    } catch {
      // Hata durumunda gerçek golü kullan
      xgValues.push(teamGoals ?? 0);
    }
  }
  
  // En az yarısında gerçek xG varsa "hasRealXG" true
  const hasRealXG = realXGCount >= Math.ceil(xgValues.length / 2);
  
  return { xgValues, goals, hasRealXG };
}

/**
 * Basit xG çıkarma (API çağrısı yapmadan)
 * Sadece mevcut verilerdeki gol sayılarını döndürür
 * 
 * @param lastMatches Son oynanan maçlar
 * @param teamId Takım ID'si
 * @param maxMatches Maksimum maç sayısı
 * @returns Gol dizisi (xG yoksa fallback olarak kullanılır)
 */
export function extractRecentGoals(
  lastMatches: ProcessedFixture[],
  teamId: number,
  maxMatches: number = 5
): number[] {
  const goals: number[] = [];
  
  lastMatches.slice(0, maxMatches).forEach(match => {
    if (!match.status.isFinished) return;
    
    const isHome = match.homeTeam.id === teamId;
    const teamGoals = isHome ? match.score.home : match.score.away;
    goals.push(teamGoals ?? 0);
  });
  
  return goals;
}

/**
 * Raw istatistik verisini işle
 */
function processStatistics(fixtureId: number, stats: FixtureStatisticsResponse[]): ProcessedStatistics {
  const homeStats = stats[0].statistics;
  const awayStats = stats[1].statistics;

  return {
    fixtureId,
    home: {
      shotsOnGoal: getStatValue(homeStats, 'Shots on Goal'),
      shotsOffGoal: getStatValue(homeStats, 'Shots off Goal'),
      totalShots: getStatValue(homeStats, 'Total Shots'),
      possession: getStatValue(homeStats, 'Ball Possession'),
      fouls: getStatValue(homeStats, 'Fouls'),
      yellowCards: getStatValue(homeStats, 'Yellow Cards'),
      redCards: getStatValue(homeStats, 'Red Cards'),
      corners: getStatValue(homeStats, 'Corner Kicks'),
      offsides: getStatValue(homeStats, 'Offsides'),
      saves: getStatValue(homeStats, 'Goalkeeper Saves'),
      passAccuracy: getStatValue(homeStats, 'Passes %'),
      expectedGoals: getStatValue(homeStats, 'expected_goals') || null,
    },
    away: {
      shotsOnGoal: getStatValue(awayStats, 'Shots on Goal'),
      shotsOffGoal: getStatValue(awayStats, 'Shots off Goal'),
      totalShots: getStatValue(awayStats, 'Total Shots'),
      possession: getStatValue(awayStats, 'Ball Possession'),
      fouls: getStatValue(awayStats, 'Fouls'),
      yellowCards: getStatValue(awayStats, 'Yellow Cards'),
      redCards: getStatValue(awayStats, 'Red Cards'),
      corners: getStatValue(awayStats, 'Corner Kicks'),
      offsides: getStatValue(awayStats, 'Offsides'),
      saves: getStatValue(awayStats, 'Goalkeeper Saves'),
      passAccuracy: getStatValue(awayStats, 'Passes %'),
      expectedGoals: getStatValue(awayStats, 'expected_goals') || null,
    },
  };
}
