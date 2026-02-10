/**
 * Daily Matches API Functions
 * Top 20 ligden günlük maçları çekme ve işleme
 */

import { apiFootballFetch, formatDateForApi, getTodayForApi } from './client';
import { formatTurkeyDate, formatTurkeyTime } from '@/lib/utils';
import { 
  FixtureResponse, 
  DailyMatchFixture,
  H2HResponse 
} from '@/types/api-football';
import { TOP_20_LEAGUE_IDS, getLeaguePriority, isTop20League } from '@/config/league-priorities';
import { cacheGet, cacheSet, redisCacheKeys, REDIS_TTL } from '@/lib/cache/redis-cache';

// Canlı maç status kodları
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const UPCOMING_STATUSES = ['NS', 'TBD'];

/**
 * Top 20 ligden günün maçlarını getir
 * Tek API çağrısı ile tüm günün maçlarını çeker, sonra Top 20 ligleri filtreler
 */
export async function getDailyMatches(date?: Date): Promise<DailyMatchFixture[]> {
  const dateStr = date ? formatDateForApi(date) : getTodayForApi();
  
  try {
    // Tek API çağrısı - günün TÜM maçlarını çek
    const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
      date: dateStr,
      timezone: 'Europe/Istanbul',
    });
    
    // Tüm maçları al (lig filtresi kaldırıldı - tüm ligler gösterilecek)
    const allFixtures = response.response;
    
    // Maçları işle ve DailyMatchFixture'a dönüştür
    const processedMatches = allFixtures.map(processDailyFixture);
    
    // Sırala: Önce lig önceliği, sonra canlı maçlar üstte, son olarak zamana göre
    return processedMatches.sort((a, b) => {
      // Önce lig önceliğine göre
      const priorityDiff = getLeaguePriority(b.league.id) - getLeaguePriority(a.league.id);
      if (priorityDiff !== 0) return priorityDiff;
      
      // Aynı lig içinde canlı maçlar üstte
      if (a.status.isLive && !b.status.isLive) return -1;
      if (!a.status.isLive && b.status.isLive) return 1;
      
      // Son olarak zamana göre
      return a.timestamp - b.timestamp;
    });
  } catch (error) {
    console.error('[Daily Matches] Error fetching fixtures:', error);
    return [];
  }
}

/**
 * Liglere göre gruplandırılmış günlük maçlar
 */
export async function getDailyMatchesByLeague(date?: Date): Promise<Map<number, DailyMatchFixture[]>> {
  const matches = await getDailyMatches(date);
  
  const grouped = new Map<number, DailyMatchFixture[]>();
  
  for (const match of matches) {
    const leagueId = match.league.id;
    if (!grouped.has(leagueId)) {
      grouped.set(leagueId, []);
    }
    
    const leagueMatches = grouped.get(leagueId)!;
    leagueMatches.push(match);
    
    // Lig içinde canlı maçları üste taşı
    leagueMatches.sort((a, b) => {
      if (a.status.isLive && !b.status.isLive) return -1;
      if (!a.status.isLive && b.status.isLive) return 1;
      return a.timestamp - b.timestamp;
    });
  }
  
  return grouped;
}

/**
 * Belirli liglerdeki günlük maçlar (filtreli)
 */
export async function getDailyMatchesForLeagues(leagueIds: number[], date?: Date): Promise<DailyMatchFixture[]> {
  const allMatches = await getDailyMatches(date);
  return allMatches.filter(match => leagueIds.includes(match.league.id));
}

/**
 * Maç detaylarını on-demand getir (accordion açıldığında)
 */
export async function getMatchDetail(fixtureId: number, homeTeamId: number, awayTeamId: number): Promise<{
  h2hSummary: DailyMatchFixture['h2hSummary'];
  prediction: DailyMatchFixture['prediction'];
  formComparison: DailyMatchFixture['formComparison'];
  lineupsAvailable: boolean;
}> {
  try {
    // Paralel olarak H2H ve tahmin verilerini çek
    const [h2hData, predictionData, lineupsData] = await Promise.all([
      fetchH2H(homeTeamId, awayTeamId),
      fetchPrediction(fixtureId),
      checkLineups(fixtureId),
    ]);

    return {
      h2hSummary: h2hData,
      prediction: predictionData?.prediction,
      formComparison: predictionData?.formComparison,
      lineupsAvailable: lineupsData,
    };
  } catch (error) {
    console.error(`[Match Detail] Error fetching details for ${fixtureId}:`, error);
    return {
      h2hSummary: undefined,
      prediction: undefined,
      formComparison: undefined,
      lineupsAvailable: false,
    };
  }
}

/**
 * H2H verilerini çek ve özetle
 */
async function fetchH2H(homeTeamId: number, awayTeamId: number): Promise<DailyMatchFixture['h2hSummary']> {
  // Redis cache kontrolü
  const rKey = redisCacheKeys.h2h(homeTeamId, awayTeamId);
  const cached = await cacheGet<DailyMatchFixture['h2hSummary']>(rKey);
  if (cached) return cached;
  
  try {
    const response = await apiFootballFetch<H2HResponse[]>('/fixtures/headtohead', {
      h2h: `${homeTeamId}-${awayTeamId}`,
      last: 10,
    });

    const matches = response.response;
    if (matches.length === 0) return undefined;

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;

    for (const match of matches) {
      const homeGoals = match.goals.home ?? 0;
      const awayGoals = match.goals.away ?? 0;
      
      // Hangi takım hangi tarafta oynuyor kontrol et
      const isHomeTeamHome = match.teams.home.id === homeTeamId;
      
      if (homeGoals > awayGoals) {
        if (isHomeTeamHome) homeWins++;
        else awayWins++;
      } else if (awayGoals > homeGoals) {
        if (isHomeTeamHome) awayWins++;
        else homeWins++;
      } else {
        draws++;
      }
    }

    const lastMatch = matches[0];

    const h2hResult = {
      totalMatches: matches.length,
      homeWins,
      awayWins,
      draws,
      lastMatch: `${lastMatch.goals.home}-${lastMatch.goals.away} (${formatTurkeyDate(lastMatch.fixture.date)})`,
    };
    
    // Redis cache'e kaydet (24 saat)
    cacheSet(rKey, h2hResult, REDIS_TTL.H2H).catch(() => {});
    
    return h2hResult;
  } catch {
    return undefined;
  }
}

/**
 * Tahmin verilerini çek
 */
async function fetchPrediction(fixtureId: number): Promise<{
  prediction: DailyMatchFixture['prediction'];
  formComparison: DailyMatchFixture['formComparison'];
} | null> {
  // Redis cache kontrolü
  const rKey = redisCacheKeys.predictions(fixtureId);
  const cached = await cacheGet<{
    prediction: DailyMatchFixture['prediction'];
    formComparison: DailyMatchFixture['formComparison'];
  }>(rKey);
  if (cached) return cached;
  
  try {
    const response = await apiFootballFetch<Array<{
      predictions: {
        winner: { name: string | null };
        percent: { home: string; draw: string; away: string };
        advice: string | null;
        under_over: string | null;
      };
      teams: {
        home: { last_5: { form: string } };
        away: { last_5: { form: string } };
      };
    }>>('/predictions', {
      fixture: fixtureId,
    });

    if (response.response.length === 0) return null;

    const data = response.response[0];
    
    // Yüzdeleri parse et
    const homePercent = parseInt(data.predictions.percent.home) || 0;
    const drawPercent = parseInt(data.predictions.percent.draw) || 0;
    const awayPercent = parseInt(data.predictions.percent.away) || 0;
    
    // En yüksek yüzdeyi bul
    const maxPercent = Math.max(homePercent, drawPercent, awayPercent);
    
    // Form stringlerini diziye çevir
    const homeForm = data.teams.home.last_5?.form?.split('') || [];
    const awayForm = data.teams.away.last_5?.form?.split('') || [];

    const predResult = {
      prediction: {
        winner: data.predictions.winner?.name || null,
        confidence: maxPercent,
        advice: data.predictions.advice,
        goalsAdvice: data.predictions.under_over ?? undefined,
      },
      formComparison: {
        home: data.teams.home.last_5?.form || '',
        away: data.teams.away.last_5?.form || '',
        homeLast5: homeForm,
        awayLast5: awayForm,
      },
    };
    
    // Redis cache'e kaydet (30 dakika)
    cacheSet(rKey, predResult, REDIS_TTL.PREDICTIONS).catch(() => {});
    
    return predResult;
  } catch {
    return null;
  }
}

/**
 * Kadroların açıklanıp açıklanmadığını kontrol et
 */
async function checkLineups(fixtureId: number): Promise<boolean> {
  try {
    const response = await apiFootballFetch<Array<{ team: { id: number }; startXI: unknown[] }>>('/fixtures/lineups', {
      fixture: fixtureId,
    });
    
    return response.response.length >= 2 && response.response[0]?.startXI?.length > 0;
  } catch {
    return false;
  }
}

// === Helper Functions ===

/**
 * Raw fixture verisini DailyMatchFixture'a dönüştür
 */
function processDailyFixture(fixture: FixtureResponse): DailyMatchFixture {
  const statusCode = fixture.fixture.status.short;

  // Hakem bilgisini parse et
  let referee: DailyMatchFixture['referee'] = undefined;
  if (fixture.fixture.referee) {
    // API'den gelen format: "Name, Country" veya sadece "Name"
    const refName = fixture.fixture.referee.split(',')[0].trim();
    referee = {
      id: null, // API'den ID gelmeyebilir
      name: refName,
    };
  }

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
    referee,
  };
}

/**
 * Günlük maç istatistikleri
 */
export function getDailyMatchStats(matches: DailyMatchFixture[]): {
  total: number;
  live: number;
  upcoming: number;
  finished: number;
  leagues: number;
} {
  const leagueSet = new Set(matches.map(m => m.league.id));
  
  return {
    total: matches.length,
    live: matches.filter(m => m.status.isLive).length,
    upcoming: matches.filter(m => m.status.isUpcoming).length,
    finished: matches.filter(m => m.status.isFinished).length,
    leagues: leagueSet.size,
  };
}
