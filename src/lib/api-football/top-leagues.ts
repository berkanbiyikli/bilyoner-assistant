/**
 * Dünyanın En İyi 10 Ligi API Functions
 * Önemli lig maçları için detaylı analiz ve kupon önerileri
 */

import { apiFootballFetch, getTodayForApi, formatDateForApi } from './client';
import { ProcessedFixture, FixtureResponse, ProcessedStatistics, MatchEvent } from '@/types/api-football';
import { getFixtureStatistics, getFixtureEvents } from './fixtures';

// === DÜNYANIN EN İYİ 10 LİGİ ===
export const TOP_10_LEAGUES = [
  { id: 39, name: 'Premier League', country: 'İngiltere', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#3D195B' },
  { id: 140, name: 'La Liga', country: 'İspanya', flag: '🇪🇸', color: '#FF4B44' },
  { id: 135, name: 'Serie A', country: 'İtalya', flag: '🇮🇹', color: '#008C45' },
  { id: 78, name: 'Bundesliga', country: 'Almanya', flag: '🇩🇪', color: '#D00027' },
  { id: 61, name: 'Ligue 1', country: 'Fransa', flag: '🇫🇷', color: '#091C3E' },
  { id: 203, name: 'Süper Lig', country: 'Türkiye', flag: '🇹🇷', color: '#E30A17' },
  { id: 94, name: 'Primeira Liga', country: 'Portekiz', flag: '🇵🇹', color: '#006600' },
  { id: 88, name: 'Eredivisie', country: 'Hollanda', flag: '🇳🇱', color: '#FF6600' },
  { id: 71, name: 'Serie A', country: 'Brezilya', flag: '🇧🇷', color: '#009739' },
  { id: 128, name: 'Liga Profesional', country: 'Arjantin', flag: '🇦🇷', color: '#75AADB' },
] as const;

export const TOP_LEAGUE_IDS: number[] = TOP_10_LEAGUES.map(l => l.id);

// Sezon (güncel sezon - Ocak 2026 = 2025-2026 sezonu)
const CURRENT_SEASON = 2025;

// Canlı maç status kodları
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const UPCOMING_STATUSES = ['NS', 'TBD'];

// Rate limit için delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let lastApiCall = 0;
const MIN_API_DELAY = 100;

async function rateLimitedFetch<T>(endpoint: string, params: Record<string, string | number>): Promise<{ response: T[] }> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < MIN_API_DELAY) {
    await delay(MIN_API_DELAY - timeSinceLastCall);
  }
  lastApiCall = Date.now();
  return apiFootballFetch<T[]>(endpoint, params);
}

// === Tip Tanımları ===

export interface InjuredPlayer {
  id: number;
  name: string;
  photo: string;
  type: string;
  reason: string;
}

export interface TeamLeagueStats {
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueId: number;
  leagueName: string;
  form: string;
  rank?: number;
  points?: number;
  fixtures: {
    played: number;
    wins: number;
    draws: number;
    losses: number;
    home: { played: number; wins: number; draws: number; losses: number };
    away: { played: number; wins: number; draws: number; losses: number };
  };
  goals: {
    for: number;
    against: number;
    average: {
      for: number;
      against: number;
    };
  };
  cleanSheets: number;
  failedToScore: number;
  recentMatches: ProcessedFixture[];
}

export interface PlayerStat {
  id: number;
  name: string;
  photo: string;
  position: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
  appearances: number;
}

export interface TeamPlayerStats {
  teamId: number;
  teamName: string;
  topScorers: PlayerStat[];
  mostCards: PlayerStat[];
  keyPlayers: PlayerStat[];
}

export interface BetSuggestion {
  type: 'goal' | 'card' | 'ht_goals' | 'ht_btts' | 'surprise' | 'btts' | 'over_under' | 'ht_ft' | 'result';
  market: string;
  confidence: number;
  odds?: number;
  reasoning: string;
  players?: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface HtFtPrediction {
  combination: string;
  label: string;
  confidence: number;
  odds?: number;
  reasoning: string;
  homeHtWinRate: number;
  awayHtWinRate: number;
  drawHtRate: number;
  homeComebackRate: number;
  awayComebackRate: number;
}

export interface HtFtAnalysis {
  predictions: HtFtPrediction[];
  homeFirstHalfGoals: number;
  awayFirstHalfGoals: number;
  homeSecondHalfGoals: number;
  awaySecondHalfGoals: number;
  summary: string;
  surpriseStats: {
    twoOneChance: number;
    twoOneHomeComeback: number;
    twoOneAwayBlownLead: number;
    twoOneH2HCount: number;
    oneTwoChance: number;
    oneTwoAwayComeback: number;
    oneTwoHomeBlownLead: number;
    oneTwoH2HCount: number;
    totalHomeMatches: number;
    totalAwayMatches: number;
    totalH2HMatches: number;
  };
}

export interface TopLeagueMatch extends ProcessedFixture {
  leagueInfo: typeof TOP_10_LEAGUES[number];
  injuries: {
    home: InjuredPlayer[];
    away: InjuredPlayer[];
  };
  teamStats: {
    home: TeamLeagueStats | null;
    away: TeamLeagueStats | null;
  };
  h2h: ProcessedFixture[];
  playerStats?: {
    home: TeamPlayerStats | null;
    away: TeamPlayerStats | null;
  };
  betSuggestions?: BetSuggestion[];
  liveStats?: ProcessedStatistics | null;
  liveEvents?: MatchEvent[];
  liveBetSuggestions?: BetSuggestion[];
  htFtAnalysis?: HtFtAnalysis | null;
}

export interface LeagueGroup {
  id: number;
  name: string;
  country: string;
  flag: string;
  color: string;
  logo: string;
  live: ProcessedFixture[];
  upcoming: ProcessedFixture[];
  finished: ProcessedFixture[];
}

// API response types
interface InjuryResponse {
  player: {
    id: number;
    name: string;
    photo: string;
    type: string;
    reason: string;
  };
  team: { id: number; name: string; logo: string };
  fixture: { id: number };
  league: { id: number };
}

interface PlayerStatsResponse {
  player: {
    id: number;
    name: string;
    photo: string;
  };
  statistics: Array<{
    team: { id: number; name: string };
    games: {
      appearences: number;
      minutes: number;
      position: string;
    };
    goals: {
      total: number;
      assists: number;
    };
    cards: {
      yellow: number;
      red: number;
    };
  }>;
}

interface StandingsResponse {
  league: {
    id: number;
    name: string;
    standings: Array<Array<{
      rank: number;
      team: { id: number; name: string; logo: string };
      points: number;
      goalsDiff: number;
      form: string;
      all: {
        played: number;
        win: number;
        draw: number;
        lose: number;
        goals: { for: number; against: number };
      };
      home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
      away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
    }>>;
  };
}

// === Fixture işleme ===
function processFixture(fixture: FixtureResponse): ProcessedFixture {
  const status = fixture.fixture.status.short;
  const dateObj = new Date(fixture.fixture.date);
  const time = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  
  return {
    id: fixture.fixture.id,
    date: fixture.fixture.date,
    time,
    timestamp: fixture.fixture.timestamp,
    venue: fixture.fixture.venue?.name || null,
    status: {
      code: status,
      elapsed: fixture.fixture.status.elapsed || null,
      isLive: LIVE_STATUSES.includes(status),
      isFinished: FINISHED_STATUSES.includes(status),
      isUpcoming: UPCOMING_STATUSES.includes(status),
    },
    league: {
      id: fixture.league.id,
      name: fixture.league.name,
      logo: fixture.league.logo,
      country: fixture.league.country,
      flag: fixture.league.flag || null,
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
      halftimeHome: fixture.score?.halftime?.home ?? null,
      halftimeAway: fixture.score?.halftime?.away ?? null,
    },
  };
}

// === API Fonksiyonları ===

/**
 * Bugünkü top 10 lig maçlarını getir
 */
export async function getTopLeagueFixtures(date?: Date): Promise<ProcessedFixture[]> {
  const dateStr = date ? formatDateForApi(date) : getTodayForApi();
  
  // Tüm ligler için paralel istek (batch halinde)
  const batchSize = 3;
  const allFixtures: ProcessedFixture[] = [];
  
  for (let i = 0; i < TOP_LEAGUE_IDS.length; i += batchSize) {
    const batch = TOP_LEAGUE_IDS.slice(i, i + batchSize);
    
    const responses = await Promise.all(
      batch.map(leagueId =>
        apiFootballFetch<FixtureResponse[]>('/fixtures', {
          league: leagueId,
          date: dateStr,
          timezone: 'Europe/Istanbul',
          season: CURRENT_SEASON,
        }).catch(() => ({ response: [] }))
      )
    );
    
    responses.forEach(res => {
      allFixtures.push(...res.response.map(processFixture));
    });
    
    // Rate limit için bekle
    if (i + batchSize < TOP_LEAGUE_IDS.length) {
      await delay(100);
    }
  }
  
  // Saate göre sırala
  return allFixtures.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Bugün ve önümüzdeki X gün için top 10 lig maçlarını getir
 * @param days - Kaç gün ileriye bakılacak (varsayılan 3)
 */
export async function getTopLeagueFixturesMultiDay(days: number = 3): Promise<{
  fixtures: ProcessedFixture[];
  byDate: { date: string; dateLabel: string; fixtures: ProcessedFixture[] }[];
}> {
  const today = new Date();
  const dateLabels = ['Bugün', 'Yarın'];
  const weekDays = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  
  const allFixtures: ProcessedFixture[] = [];
  const byDate: { date: string; dateLabel: string; fixtures: ProcessedFixture[] }[] = [];
  
  for (let d = 0; d < days; d++) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + d);
    
    const dateStr = formatDateForApi(targetDate);
    const fixtures = await getTopLeagueFixtures(targetDate);
    
    allFixtures.push(...fixtures);
    
    // Tarih etiketi
    let dateLabel: string;
    if (d < 2) {
      dateLabel = dateLabels[d];
    } else {
      dateLabel = weekDays[targetDate.getDay()];
    }
    
    byDate.push({
      date: dateStr,
      dateLabel,
      fixtures,
    });
    
    // Rate limit
    if (d < days - 1) await delay(200);
  }
  
  return {
    fixtures: allFixtures,
    byDate,
  };
}

/**
 * Canlı top 10 lig maçlarını getir
 */
export async function getLiveTopLeagueFixtures(): Promise<ProcessedFixture[]> {
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    live: 'all',
    timezone: 'Europe/Istanbul',
  });
  
  // Sadece top 10 lig maçlarını filtrele
  return response.response
    .filter(f => TOP_LEAGUE_IDS.includes(f.league.id))
    .map(processFixture);
}

/**
 * Takımın sakatlık listesini getir
 */
export async function getTeamInjuries(teamId: number, fixtureId?: number): Promise<InjuredPlayer[]> {
  try {
    const params: Record<string, string | number> = { team: teamId };
    if (fixtureId) params.fixture = fixtureId;
    
    const response = await apiFootballFetch<InjuryResponse[]>('/injuries', params);
    
    return response.response.map(injury => ({
      id: injury.player.id,
      name: injury.player.name,
      photo: injury.player.photo,
      type: injury.player.type,
      reason: injury.player.reason,
    }));
  } catch {
    console.warn(`Sakatlık verisi alınamadı: Team ${teamId}`);
    return [];
  }
}

/**
 * Takımın ligdeki istatistiklerini standings'ten al
 */
export async function getTeamLeagueStats(teamId: number, leagueId: number): Promise<TeamLeagueStats | null> {
  try {
    // Önce standings'i al
    const standingsRes = await rateLimitedFetch<StandingsResponse>('/standings', {
      league: leagueId,
      season: CURRENT_SEASON,
    });
    
    if (!standingsRes.response.length) return null;
    
    const standings = standingsRes.response[0].league.standings[0];
    const teamStanding = standings?.find(s => s.team.id === teamId);
    
    if (!teamStanding) return null;
    
    // Son maçları al
    await delay(50);
    const fixturesRes = await rateLimitedFetch<FixtureResponse>('/fixtures', {
      team: teamId,
      league: leagueId,
      season: CURRENT_SEASON,
      last: 6,
    });
    
    const recentMatches = fixturesRes.response
      .map(f => processFixture(f as unknown as FixtureResponse))
      .filter(m => m.status.isFinished)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
    
    return {
      teamId: teamStanding.team.id,
      teamName: teamStanding.team.name,
      teamLogo: teamStanding.team.logo,
      leagueId,
      leagueName: standingsRes.response[0].league.name,
      form: teamStanding.form || '',
      rank: teamStanding.rank,
      points: teamStanding.points,
      fixtures: {
        played: teamStanding.all.played,
        wins: teamStanding.all.win,
        draws: teamStanding.all.draw,
        losses: teamStanding.all.lose,
        home: {
          played: teamStanding.home.played,
          wins: teamStanding.home.win,
          draws: teamStanding.home.draw,
          losses: teamStanding.home.lose,
        },
        away: {
          played: teamStanding.away.played,
          wins: teamStanding.away.win,
          draws: teamStanding.away.draw,
          losses: teamStanding.away.lose,
        },
      },
      goals: {
        for: teamStanding.all.goals.for,
        against: teamStanding.all.goals.against,
        average: {
          for: teamStanding.all.played > 0 ? Math.round((teamStanding.all.goals.for / teamStanding.all.played) * 10) / 10 : 0,
          against: teamStanding.all.played > 0 ? Math.round((teamStanding.all.goals.against / teamStanding.all.played) * 10) / 10 : 0,
        },
      },
      cleanSheets: 0, // Standing'den bu bilgi gelmiyor
      failedToScore: 0,
      recentMatches,
    };
  } catch (error) {
    console.warn(`Takım istatistikleri alınamadı: Team ${teamId}, League ${leagueId}`, error);
    return null;
  }
}

/**
 * İki takımın H2H geçmişini getir
 */
export async function getH2H(team1Id: number, team2Id: number): Promise<ProcessedFixture[]> {
  try {
    const response = await apiFootballFetch<FixtureResponse[]>('/fixtures/headtohead', {
      h2h: `${team1Id}-${team2Id}`,
      last: 10,
      timezone: 'Europe/Istanbul',
    });
    
    return response.response.map(processFixture);
  } catch {
    return [];
  }
}

/**
 * Takımın oyuncu istatistiklerini getir
 */
export async function getTeamPlayerStats(teamId: number, leagueId: number): Promise<TeamPlayerStats | null> {
  try {
    const response = await apiFootballFetch<PlayerStatsResponse[]>('/players', {
      team: teamId,
      league: leagueId,
      season: CURRENT_SEASON,
    });
    
    if (!response.response || response.response.length === 0) {
      return null;
    }
    
    const players: PlayerStat[] = response.response.map(p => ({
      id: p.player.id,
      name: p.player.name,
      photo: p.player.photo,
      position: p.statistics[0]?.games?.position || 'Unknown',
      goals: p.statistics[0]?.goals?.total || 0,
      assists: p.statistics[0]?.goals?.assists || 0,
      yellowCards: p.statistics[0]?.cards?.yellow || 0,
      redCards: p.statistics[0]?.cards?.red || 0,
      minutesPlayed: p.statistics[0]?.games?.minutes || 0,
      appearances: p.statistics[0]?.games?.appearences || 0,
    }));
    
    const topScorers = [...players].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5);
    const mostCards = [...players].filter(p => p.yellowCards + p.redCards > 0).sort((a, b) => (b.yellowCards + b.redCards * 2) - (a.yellowCards + a.redCards * 2)).slice(0, 5);
    const keyPlayers = [...players].filter(p => p.goals + p.assists > 0).sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists)).slice(0, 5);
    
    return {
      teamId,
      teamName: response.response[0]?.statistics[0]?.team?.name || 'Unknown',
      topScorers,
      mostCards,
      keyPlayers,
    };
  } catch (error) {
    console.warn(`Oyuncu istatistikleri alınamadı: Team ${teamId}, League ${leagueId}`, error);
    return null;
  }
}

/**
 * Top league maçı için detaylı analiz verisi oluştur
 */
export async function getTopLeagueMatchDetail(fixture: ProcessedFixture, includePlayerStats: boolean = false): Promise<TopLeagueMatch> {
  const leagueId = fixture.league.id;
  const leagueInfo = TOP_10_LEAGUES.find(l => l.id === leagueId) || TOP_10_LEAGUES[0];
  
  // Seri istekler - rate limit için
  const homeInjuries = await getTeamInjuries(fixture.homeTeam.id, fixture.id);
  await delay(50);
  const awayInjuries = await getTeamInjuries(fixture.awayTeam.id, fixture.id);
  await delay(50);
  const homeStats = await getTeamLeagueStats(fixture.homeTeam.id, leagueId);
  await delay(50);
  const awayStats = await getTeamLeagueStats(fixture.awayTeam.id, leagueId);
  await delay(50);
  const h2h = await getH2H(fixture.homeTeam.id, fixture.awayTeam.id);
  
  // Oyuncu istatistikleri
  let homePlayerStats: TeamPlayerStats | null = null;
  let awayPlayerStats: TeamPlayerStats | null = null;
  
  if (includePlayerStats) {
    await delay(50);
    homePlayerStats = await getTeamPlayerStats(fixture.homeTeam.id, leagueId).catch(() => null);
    await delay(50);
    awayPlayerStats = await getTeamPlayerStats(fixture.awayTeam.id, leagueId).catch(() => null);
  }
  
  // Kupon önerilerini oluştur
  const betSuggestions = generateBetSuggestions(
    fixture,
    homeStats,
    awayStats,
    homePlayerStats,
    awayPlayerStats,
    homeInjuries,
    awayInjuries,
    h2h
  );
  
  // Canlı maç verileri
  let liveStats: ProcessedStatistics | null = null;
  let liveEvents: MatchEvent[] = [];
  let liveBetSuggestions: BetSuggestion[] = [];
  
  if (fixture.status.isLive) {
    await delay(50);
    liveStats = await getFixtureStatistics(fixture.id).catch(() => null);
    await delay(50);
    liveEvents = await getFixtureEvents(fixture.id).catch(() => []);
    
    if (liveStats) {
      liveBetSuggestions = generateLiveBetSuggestions(fixture, liveStats, liveEvents);
    }
  }
  
  return {
    ...fixture,
    leagueInfo,
    injuries: { home: homeInjuries, away: awayInjuries },
    teamStats: { home: homeStats, away: awayStats },
    playerStats: { home: homePlayerStats, away: awayPlayerStats },
    h2h,
    betSuggestions,
    liveStats,
    liveEvents,
    liveBetSuggestions,
    htFtAnalysis: fixture.status.isUpcoming ? generateHtFtAnalysis(homeStats, awayStats, h2h) : null,
  };
}

// === Kupon Önerisi Fonksiyonları ===

function generateBetSuggestions(
  fixture: ProcessedFixture,
  homeStats: TeamLeagueStats | null,
  awayStats: TeamLeagueStats | null,
  homePlayerStats: TeamPlayerStats | null,
  awayPlayerStats: TeamPlayerStats | null,
  homeInjuries: InjuredPlayer[],
  awayInjuries: InjuredPlayer[],
  h2h: ProcessedFixture[]
): BetSuggestion[] {
  const suggestions: BetSuggestion[] = [];
  
  // === 1. MAÇ SONUCU ANALİZİ ===
  if (homeStats && awayStats) {
    const homeFormScore = calculateFormScore(homeStats.form);
    const awayFormScore = calculateFormScore(awayStats.form);
    const rankDiff = (awayStats.rank || 10) - (homeStats.rank || 10);
    
    // Ev sahibi favorisi
    if (homeFormScore >= 70 && homeStats.fixtures.home.wins > homeStats.fixtures.home.losses && rankDiff > 5) {
      suggestions.push({
        type: 'result',
        market: `MS 1 (${fixture.homeTeam.name})`,
        confidence: Math.min(85, 55 + homeFormScore * 0.3 + rankDiff * 2),
        reasoning: `${fixture.homeTeam.name} formda (${homeStats.form}), evinde ${homeStats.fixtures.home.wins}G-${homeStats.fixtures.home.draws}B-${homeStats.fixtures.home.losses}M, sıralama farkı +${rankDiff}`,
        priority: 'high',
      });
    }
    
    // Deplasman favorisi
    if (awayFormScore >= 70 && awayStats.fixtures.away.wins > awayStats.fixtures.away.losses && rankDiff < -5) {
      suggestions.push({
        type: 'result',
        market: `MS 2 (${fixture.awayTeam.name})`,
        confidence: Math.min(80, 50 + awayFormScore * 0.3 + Math.abs(rankDiff) * 2),
        reasoning: `${fixture.awayTeam.name} formda (${awayStats.form}), deplasmanda ${awayStats.fixtures.away.wins}G-${awayStats.fixtures.away.draws}B-${awayStats.fixtures.away.losses}M`,
        priority: 'high',
      });
    }
  }
  
  // === 2. GOL ATMA ANALİZİ ===
  if (homePlayerStats?.topScorers.length && awayPlayerStats?.topScorers.length) {
    const homeTopScorer = homePlayerStats.topScorers[0];
    const awayTopScorer = awayPlayerStats.topScorers[0];
    
    if (homeTopScorer.goals >= 5 && !homeInjuries.some(i => i.name.includes(homeTopScorer.name.split(' ').pop() || ''))) {
      suggestions.push({
        type: 'goal',
        market: `${homeTopScorer.name} Gol Atar`,
        confidence: Math.min(85, 50 + homeTopScorer.goals * 5),
        reasoning: `${homeTopScorer.name} bu sezon ${homeTopScorer.goals} gol attı (${homeTopScorer.appearances} maçta)`,
        players: [homeTopScorer.name],
        priority: homeTopScorer.goals >= 10 ? 'high' : 'medium',
      });
    }
    
    if (awayTopScorer.goals >= 5 && !awayInjuries.some(i => i.name.includes(awayTopScorer.name.split(' ').pop() || ''))) {
      suggestions.push({
        type: 'goal',
        market: `${awayTopScorer.name} Gol Atar`,
        confidence: Math.min(80, 45 + awayTopScorer.goals * 5),
        reasoning: `${awayTopScorer.name} bu sezon ${awayTopScorer.goals} gol attı (${awayTopScorer.appearances} maçta)`,
        players: [awayTopScorer.name],
        priority: awayTopScorer.goals >= 10 ? 'high' : 'medium',
      });
    }
  }
  
  // === 3. KART ANALİZİ ===
  if (homePlayerStats?.mostCards.length) {
    const cardPlayer = homePlayerStats.mostCards[0];
    if (cardPlayer.yellowCards >= 4) {
      suggestions.push({
        type: 'card',
        market: `${cardPlayer.name} Kart Görür`,
        confidence: Math.min(75, 40 + cardPlayer.yellowCards * 7),
        reasoning: `${cardPlayer.name} bu sezon ${cardPlayer.yellowCards} sarı kart gördü`,
        players: [cardPlayer.name],
        priority: cardPlayer.yellowCards >= 8 ? 'high' : 'medium',
      });
    }
  }
  
  if (awayPlayerStats?.mostCards.length) {
    const cardPlayer = awayPlayerStats.mostCards[0];
    if (cardPlayer.yellowCards >= 4) {
      suggestions.push({
        type: 'card',
        market: `${cardPlayer.name} Kart Görür`,
        confidence: Math.min(75, 40 + cardPlayer.yellowCards * 7),
        reasoning: `${cardPlayer.name} bu sezon ${cardPlayer.yellowCards} sarı kart gördü`,
        players: [cardPlayer.name],
        priority: cardPlayer.yellowCards >= 8 ? 'high' : 'medium',
      });
    }
  }
  
  // === 4. TOPLAM GOL ===
  if (homeStats && awayStats) {
    const avgPerMatch = (homeStats.goals.average.for + homeStats.goals.average.against + 
                         awayStats.goals.average.for + awayStats.goals.average.against) / 2;
    
    if (avgPerMatch >= 3.0) {
      suggestions.push({
        type: 'over_under',
        market: '2.5 Üst',
        confidence: Math.min(85, Math.round(avgPerMatch * 25)),
        reasoning: `Her iki takımın maç başı gol ortalaması: ${avgPerMatch.toFixed(1)}`,
        priority: avgPerMatch >= 3.5 ? 'high' : 'medium',
      });
    } else if (avgPerMatch <= 2.0) {
      suggestions.push({
        type: 'over_under',
        market: '2.5 Alt',
        confidence: Math.min(80, Math.round((4 - avgPerMatch) * 25)),
        reasoning: `Her iki takımın maç başı gol ortalaması: ${avgPerMatch.toFixed(1)}`,
        priority: avgPerMatch <= 1.5 ? 'high' : 'medium',
      });
    }
  }
  
  // === 5. KG VAR ===
  if (homeStats && awayStats) {
    const homeGoalRate = homeStats.goals.average.for;
    const awayGoalRate = awayStats.goals.average.for;
    const homeConcede = homeStats.goals.average.against;
    const awayConcede = awayStats.goals.average.against;
    
    if (homeGoalRate >= 1.3 && awayGoalRate >= 1.0 && homeConcede >= 0.8 && awayConcede >= 0.8) {
      const bttsConfidence = Math.round((homeGoalRate * awayGoalRate * homeConcede * awayConcede) ** 0.5 * 40);
      if (bttsConfidence >= 55) {
        suggestions.push({
          type: 'btts',
          market: 'KG Var',
          confidence: Math.min(80, bttsConfidence),
          reasoning: `Ev: ${homeGoalRate.toFixed(1)} gol/maç, Dep: ${awayGoalRate.toFixed(1)} gol/maç`,
          priority: bttsConfidence >= 70 ? 'high' : 'medium',
        });
      }
    }
  }
  
  // === 6. İLK YARI ===
  if (homeStats && awayStats) {
    const htData = calculateHalfTimeGoals(homeStats.recentMatches, homeStats.teamId);
    const htDataAway = calculateHalfTimeGoals(awayStats.recentMatches, awayStats.teamId);
    
    const avgHtGoals = (htData.avgFor + htData.avgAgainst + htDataAway.avgFor + htDataAway.avgAgainst) / 2;
    
    if (avgHtGoals >= 1.3 || (htData.over15Rate >= 50 && htDataAway.over15Rate >= 50)) {
      suggestions.push({
        type: 'ht_goals',
        market: 'İY 1.5 Üst',
        confidence: Math.min(75, Math.round(avgHtGoals * 35)),
        reasoning: `İlk yarı gol ortalaması: ${avgHtGoals.toFixed(1)}`,
        priority: avgHtGoals >= 1.8 ? 'high' : 'medium',
      });
    }
  }
  
  // === 7. H2H BAZLI ===
  if (h2h.length >= 3) {
    const recentH2H = h2h.slice(0, 5);
    let totalGoals = 0;
    let bttsCount = 0;
    
    recentH2H.forEach(match => {
      const goals = (match.score.home ?? 0) + (match.score.away ?? 0);
      totalGoals += goals;
      if ((match.score.home ?? 0) > 0 && (match.score.away ?? 0) > 0) bttsCount++;
    });
    
    const avgH2HGoals = totalGoals / recentH2H.length;
    
    if (avgH2HGoals >= 3.0) {
      suggestions.push({
        type: 'over_under',
        market: '2.5 Üst (H2H)',
        confidence: Math.min(80, Math.round(avgH2HGoals * 22)),
        reasoning: `Son ${recentH2H.length} H2H maçta ortalama ${avgH2HGoals.toFixed(1)} gol`,
        priority: 'medium',
      });
    }
  }
  
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function generateLiveBetSuggestions(
  fixture: ProcessedFixture,
  stats: ProcessedStatistics,
  events: MatchEvent[]
): BetSuggestion[] {
  const suggestions: BetSuggestion[] = [];
  const elapsed = fixture.status.elapsed || 0;
  const currentScore = (fixture.score.home ?? 0) + (fixture.score.away ?? 0);
  
  // Şut analizi
  const homeShots = stats.home.shotsOnGoal || 0;
  const awayShots = stats.away.shotsOnGoal || 0;
  const totalShots = homeShots + awayShots;
  
  // Gol beklentisi
  if (elapsed <= 70 && totalShots >= 8 && currentScore <= 1) {
    suggestions.push({
      type: 'over_under',
      market: 'Sonraki Gol Var',
      confidence: Math.min(80, 50 + totalShots * 3),
      reasoning: `Toplam ${totalShots} isabetli şut, gol beklentisi yüksek`,
      priority: 'high',
    });
  }
  
  // Baskı analizi
  const homePossession = stats.home.possession || 50;
  const homeCorners = stats.home.corners || 0;
  const awayCorners = stats.away.corners || 0;
  
  if (elapsed <= 60 && homePossession >= 65 && homeShots >= 5 && (fixture.score.home ?? 0) === 0) {
    suggestions.push({
      type: 'goal',
      market: `${fixture.homeTeam.name} Gol Atar`,
      confidence: 70,
      reasoning: `%${homePossession} top, ${homeShots} isabetli şut ama henüz gol yok`,
      priority: 'high',
    });
  }
  
  // Korner analizi
  if (elapsed >= 30 && elapsed <= 70) {
    const cornerRate = (homeCorners + awayCorners) / (elapsed / 15);
    if (cornerRate >= 1.5) {
      const remainingMinutes = 90 - elapsed;
      const expectedCorners = (homeCorners + awayCorners) + (cornerRate * remainingMinutes / 15);
      
      if (expectedCorners >= 10) {
        suggestions.push({
          type: 'over_under',
          market: 'Toplam Korner 9.5 Üst',
          confidence: Math.min(75, Math.round(cornerRate * 40)),
          reasoning: `${homeCorners + awayCorners} korner (her 15dk ${cornerRate.toFixed(1)} korner)`,
          priority: 'medium',
        });
      }
    }
  }
  
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function calculateHalfTimeGoals(matches: ProcessedFixture[], teamId: number): {
  avgFor: number;
  avgAgainst: number;
  over15Rate: number;
  bttsRate: number;
} {
  if (!matches || matches.length === 0) {
    return { avgFor: 0.5, avgAgainst: 0.5, over15Rate: 30, bttsRate: 20 };
  }
  
  let totalFor = 0, totalAgainst = 0;
  let over15Count = 0, bttsCount = 0;
  
  matches.forEach(match => {
    const isHome = match.homeTeam.id === teamId;
    const htHome = match.score.halftimeHome ?? 0;
    const htAway = match.score.halftimeAway ?? 0;
    
    const forGoals = isHome ? htHome : htAway;
    const againstGoals = isHome ? htAway : htHome;
    
    totalFor += forGoals;
    totalAgainst += againstGoals;
    
    if (htHome + htAway >= 2) over15Count++;
    if (htHome > 0 && htAway > 0) bttsCount++;
  });
  
  return {
    avgFor: totalFor / matches.length,
    avgAgainst: totalAgainst / matches.length,
    over15Rate: Math.round((over15Count / matches.length) * 100),
    bttsRate: Math.round((bttsCount / matches.length) * 100),
  };
}

function calculateFormScore(form: string): number {
  if (!form) return 50;
  
  let score = 0;
  const chars = form.split('');
  
  chars.forEach((char, index) => {
    const weight = chars.length - index;
    if (char === 'W') score += 3 * weight;
    else if (char === 'D') score += 1 * weight;
  });
  
  const maxScore = chars.reduce((sum, _, i) => sum + 3 * (chars.length - i), 0);
  return Math.round((score / maxScore) * 100);
}

function generateHtFtAnalysis(
  homeStats: TeamLeagueStats | null,
  awayStats: TeamLeagueStats | null,
  h2h: ProcessedFixture[]
): HtFtAnalysis | null {
  if (!homeStats?.recentMatches?.length && !awayStats?.recentMatches?.length) {
    return null;
  }
  
  const homeMatches = homeStats?.recentMatches || [];
  const awayMatches = awayStats?.recentMatches || [];
  const homeTeamId = homeStats?.teamId || 0;
  const awayTeamId = awayStats?.teamId || 0;
  
  // Ev sahibi analizi
  let homeHtWins = 0, homeHtDraws = 0;
  let homeFtWins = 0;
  let homeFirstHalfGoals = 0, homeSecondHalfGoals = 0;
  let homeComebacks = 0, homeBlownLeads = 0;
  
  homeMatches.forEach(match => {
    const isHome = match.homeTeam.id === homeTeamId;
    const htHome = match.score.halftimeHome ?? 0;
    const htAway = match.score.halftimeAway ?? 0;
    const ftHome = match.score.home ?? 0;
    const ftAway = match.score.away ?? 0;
    
    const htFor = isHome ? htHome : htAway;
    const htAgainst = isHome ? htAway : htHome;
    const ftFor = isHome ? ftHome : ftAway;
    const ftAgainst = isHome ? ftAway : ftHome;
    
    if (htFor > htAgainst) homeHtWins++;
    else if (htFor === htAgainst) homeHtDraws++;
    
    if (ftFor > ftAgainst) homeFtWins++;
    
    homeFirstHalfGoals += htFor;
    homeSecondHalfGoals += (ftFor - htFor);
    
    if (htFor < htAgainst && ftFor > ftAgainst) homeComebacks++;
    if (htFor > htAgainst && ftFor < ftAgainst) homeBlownLeads++;
  });
  
  // Deplasman analizi
  let awayHtWins = 0, awayHtDraws = 0;
  let awayFtWins = 0;
  let awayFirstHalfGoals = 0, awaySecondHalfGoals = 0;
  let awayComebacks = 0, awayBlownLeads = 0;
  
  awayMatches.forEach(match => {
    const isHome = match.homeTeam.id === awayTeamId;
    const htHome = match.score.halftimeHome ?? 0;
    const htAway = match.score.halftimeAway ?? 0;
    const ftHome = match.score.home ?? 0;
    const ftAway = match.score.away ?? 0;
    
    const htFor = isHome ? htHome : htAway;
    const htAgainst = isHome ? htAway : htHome;
    const ftFor = isHome ? ftHome : ftAway;
    const ftAgainst = isHome ? ftAway : ftHome;
    
    if (htFor > htAgainst) awayHtWins++;
    else if (htFor === htAgainst) awayHtDraws++;
    
    if (ftFor > ftAgainst) awayFtWins++;
    
    awayFirstHalfGoals += htFor;
    awaySecondHalfGoals += (ftFor - htFor);
    
    if (htFor < htAgainst && ftFor > ftAgainst) awayComebacks++;
    if (htFor > htAgainst && ftFor < ftAgainst) awayBlownLeads++;
  });
  
  const homeMatchCount = homeMatches.length || 1;
  const awayMatchCount = awayMatches.length || 1;
  
  const homeHtWinRate = Math.round((homeHtWins / homeMatchCount) * 100);
  const awayHtWinRate = Math.round((awayHtWins / awayMatchCount) * 100);
  const drawHtRate = Math.round(((homeHtDraws / homeMatchCount + awayHtDraws / awayMatchCount) / 2) * 100);
  const homeFtWinRate = Math.round((homeFtWins / homeMatchCount) * 100);
  const homeComebackRate = Math.round((homeComebacks / homeMatchCount) * 100);
  const awayComebackRate = Math.round((awayComebacks / awayMatchCount) * 100);
  
  const predictions: HtFtPrediction[] = [];
  
  // 1/1
  const oneOne = Math.round((homeHtWinRate * 0.4) + (homeFtWinRate * 0.4) + ((100 - awayComebackRate) * 0.2));
  predictions.push({
    combination: '1/1',
    label: 'Ev Önde / Ev Kazanır',
    confidence: Math.min(85, oneOne),
    reasoning: `Ev sahibi İY'de %${homeHtWinRate} önde, MS'de %${homeFtWinRate} kazanıyor`,
    homeHtWinRate, awayHtWinRate, drawHtRate, homeComebackRate, awayComebackRate,
  });
  
  // X/1
  const drawOne = Math.round((drawHtRate * 0.4) + (homeFtWinRate * 0.4) + (homeComebackRate * 0.2));
  if (drawOne >= 30) {
    predictions.push({
      combination: 'X/1',
      label: 'Berabere / Ev Kazanır',
      confidence: Math.min(70, drawOne),
      reasoning: `İY beraberlik oranı %${drawHtRate}, ev sahibi %${homeComebackRate} geriden geliyor`,
      homeHtWinRate, awayHtWinRate, drawHtRate, homeComebackRate, awayComebackRate,
    });
  }
  
  // 2/2
  const awayFtWinRate = Math.round((awayFtWins / awayMatchCount) * 100);
  const twoTwo = Math.round((awayHtWinRate * 0.4) + (awayFtWinRate * 0.4) + ((100 - homeComebackRate) * 0.2));
  if (twoTwo >= 35) {
    predictions.push({
      combination: '2/2',
      label: 'Dep Önde / Dep Kazanır',
      confidence: Math.min(75, twoTwo),
      reasoning: `Deplasman İY'de %${awayHtWinRate} önde, MS'de %${awayFtWinRate} kazanıyor`,
      homeHtWinRate, awayHtWinRate, drawHtRate, homeComebackRate, awayComebackRate,
    });
  }
  
  return {
    predictions: predictions.sort((a, b) => b.confidence - a.confidence),
    homeFirstHalfGoals: homeFirstHalfGoals / homeMatchCount,
    awayFirstHalfGoals: awayFirstHalfGoals / awayMatchCount,
    homeSecondHalfGoals: homeSecondHalfGoals / homeMatchCount,
    awaySecondHalfGoals: awaySecondHalfGoals / awayMatchCount,
    summary: `Ev: İY ${homeFirstHalfGoals / homeMatchCount}G, 2Y ${homeSecondHalfGoals / homeMatchCount}G | Dep: İY ${awayFirstHalfGoals / awayMatchCount}G, 2Y ${awaySecondHalfGoals / awayMatchCount}G`,
    surpriseStats: {
      twoOneChance: Math.round((homeComebackRate + awayBlownLeads / awayMatchCount * 100) / 2),
      twoOneHomeComeback: homeComebacks,
      twoOneAwayBlownLead: awayBlownLeads,
      twoOneH2HCount: 0,
      oneTwoChance: Math.round((awayComebackRate + homeBlownLeads / homeMatchCount * 100) / 2),
      oneTwoAwayComeback: awayComebacks,
      oneTwoHomeBlownLead: homeBlownLeads,
      oneTwoH2HCount: 0,
      totalHomeMatches: homeMatches.length,
      totalAwayMatches: awayMatches.length,
      totalH2HMatches: h2h.length,
    },
  };
}

/**
 * Maçları lige göre grupla
 */
export function groupFixturesByLeague(fixtures: ProcessedFixture[]): LeagueGroup[] {
  const groups: LeagueGroup[] = [];
  
  TOP_10_LEAGUES.forEach(league => {
    const leagueFixtures = fixtures.filter(f => f.league.id === league.id);
    
    if (leagueFixtures.length > 0) {
      groups.push({
        id: league.id,
        name: league.name,
        country: league.country,
        flag: league.flag,
        color: league.color,
        logo: leagueFixtures[0].league.logo,
        live: leagueFixtures.filter(f => f.status.isLive),
        upcoming: leagueFixtures.filter(f => f.status.isUpcoming),
        finished: leagueFixtures.filter(f => f.status.isFinished),
      });
    }
  });
  
  return groups;
}
