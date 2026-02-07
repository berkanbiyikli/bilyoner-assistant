/**
 * UEFA Şampiyonlar Ligi API Functions
 * Champions League (ID: 2) için özel API'ler
 */

import { apiFootballFetch, getTodayForApi } from './client';
import { ProcessedFixture, FixtureResponse, ProcessedStatistics, MatchEvent } from '@/types/api-football';
import { getFixtureStatistics, getFixtureEvents } from './fixtures';

// Liga ID'leri
export const CHAMPIONS_LEAGUE_ID = 2;
export const EUROPA_LEAGUE_ID = 3;
export const CONFERENCE_LEAGUE_ID = 848;

// Sezon (güncel sezon)
const CURRENT_SEASON = 2025;

// Bu sezon ana turnuva başlangıç tarihi (Grup/Lig aşaması)
// 2025-26 sezonu için Eylül 2025'te başladı
const MAIN_TOURNAMENT_START = new Date('2025-09-01');

// Canlı maç status kodları
const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
const UPCOMING_STATUSES = ['NS', 'TBD'];

// Rate limit için delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let lastApiCall = 0;
const MIN_API_DELAY = 100; // Minimum 100ms API çağrıları arasında

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
  type: string; // 'Missing Fixture', 'Questionable', 'Injured', etc.
  reason: string;
}

export interface TeamInjuries {
  teamId: number;
  teamName: string;
  teamLogo: string;
  players: InjuredPlayer[];
}

export interface TeamLeagueStats {
  teamId: number;
  teamName: string;
  teamLogo: string;
  leagueId: number;
  leagueName: string;
  form: string; // "WWDLW"
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
  recentMatches: ProcessedFixture[]; // Son 6 maç detayları
}

export interface EuropeanCupMatch extends ProcessedFixture {
  injuries: {
    home: InjuredPlayer[];
    away: InjuredPlayer[];
  };
  teamStats: {
    home: TeamLeagueStats | null;
    away: TeamLeagueStats | null;
  };
  h2h: ProcessedFixture[];
  leagueH2H: ProcessedFixture[]; // Sadece bu ligdeki karşılaşmalar
  // Yeni: Oyuncu istatistikleri
  playerStats?: {
    home: TeamPlayerStats | null;
    away: TeamPlayerStats | null;
  };
  // Yeni: Kupon önerileri
  betSuggestions?: BetSuggestion[];
  // Canlı maç verileri
  liveStats?: ProcessedStatistics | null;
  liveEvents?: MatchEvent[];
  liveBetSuggestions?: BetSuggestion[];
  // İY/MS Analizi
  htFtAnalysis?: HtFtAnalysis | null;
}

// Oyuncu istatistikleri
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

// Kupon önerisi
export interface BetSuggestion {
  type: 'goal' | 'card' | 'ht_goals' | 'ht_btts' | 'surprise' | 'btts' | 'over_under' | 'ht_ft';
  market: string; // "İY 1.5 Üst", "Maç Sonucu: 2", "KG Var", "İY/MS: 1/1" etc.
  confidence: number; // 0-100
  odds?: number;
  reasoning: string;
  players?: string[]; // İlgili oyuncular
  priority: 'high' | 'medium' | 'low';
}

// İY/MS Tahmin Sonucu
export interface HtFtPrediction {
  combination: string; // "1/1", "X/2", "2/1" vs.
  label: string; // "Ev/Ev", "Beraberlik/Deplasman" vs.
  confidence: number; // 0-100
  odds?: number;
  reasoning: string;
  homeHtWinRate: number; // Ev sahibi ilk yarı önde bitirme oranı
  awayHtWinRate: number;
  drawHtRate: number;
  homeComebackRate: number; // Geriden gelme oranları
  awayComebackRate: number;
}

// İY/MS Analiz Sonucu
export interface HtFtAnalysis {
  predictions: HtFtPrediction[];
  homeFirstHalfGoals: number; // Ev sahibi ilk yarı gol ortalaması
  awayFirstHalfGoals: number;
  homeSecondHalfGoals: number;
  awaySecondHalfGoals: number;
  summary: string;
  // Sürpriz kombinasyon istatistikleri
  surpriseStats: {
    // 2/1 için: Ev sahibi geriden gelme + deplasman liderlik kaybetme
    twoOneChance: number; // %
    twoOneHomeComeback: number; // Ev sahibi kaç kez geriden geldi
    twoOneAwayBlownLead: number; // Deplasman kaç kez liderlik kaybetti
    twoOneH2HCount: number; // H2H'da kaç kez 2/1 oldu
    // 1/2 için: Deplasman geriden gelme + ev sahibi liderlik kaybetme  
    oneTwoChance: number; // %
    oneTwoAwayComeback: number; // Deplasman kaç kez geriden geldi
    oneTwoHomeBlownLead: number; // Ev sahibi kaç kez liderlik kaybetti
    oneTwoH2HCount: number; // H2H'da kaç kez 1/2 oldu
    // Toplam maç sayıları
    totalHomeMatches: number;
    totalAwayMatches: number;
    totalH2HMatches: number;
  };
}

// CANLI FIRSAT - Yaşam döngüsü olan dinamik öneri
export interface LiveOpportunity {
  id: string; // unique id
  fixtureId: number;
  type: 'goal' | 'card' | 'corner' | 'momentum' | 'comeback' | 'over_under' | 'pressure' | 'possession' | 'tempo';
  market: string;
  team?: 'home' | 'away';
  teamName?: string;
  confidence: number;
  reasoning: string;
  
  // Yaşam döngüsü
  status: 'active' | 'hit' | 'missed' | 'expired' | 'cancelled';
  createdAt: number; // timestamp
  expiresAt?: number; // ne zaman geçersiz olacak (dakika cinsinden maç süresi)
  validUntilElapsed?: number; // maçın kaçıncı dakikasına kadar geçerli
  
  // Momentum takibi
  createdAtMomentum?: { home: number; away: number };
  
  // Sonuç
  result?: {
    hit: boolean;
    resolvedAt: number;
    description: string;
  };
}

// Fırsat Radarı - Tüm canlı maçların fırsatları
export interface OpportunityRadar {
  opportunities: LiveOpportunity[];
  lastUpdated: number;
  activeCount: number;
  hitCount: number;
  missedCount: number;
}

// === API Fonksiyonları ===

/**
 * Bugünkü Şampiyonlar Ligi maçlarını getir
 */
export async function getEuropeanCupFixtures(date?: Date): Promise<ProcessedFixture[]> {
  const dateStr = date ? formatDateForApi(date) : getTodayForApi();
  
  // Şampiyonlar Ligi maçlarını çek
  const championsResponse = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    league: CHAMPIONS_LEAGUE_ID,
    date: dateStr,
    timezone: 'Europe/Istanbul',
    season: CURRENT_SEASON,
  }).catch(() => ({ response: [] }));
  
  const allFixtures = championsResponse.response.map(processFixture);
  
  // Saate göre sırala
  return allFixtures.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Canlı Şampiyonlar Ligi maçlarını getir
 */
export async function getLiveEuropeanCupFixtures(): Promise<ProcessedFixture[]> {
  const response = await apiFootballFetch<FixtureResponse[]>('/fixtures', {
    live: 'all',
    timezone: 'Europe/Istanbul',
  });
  
  // Sadece Şampiyonlar Ligi maçlarını filtrele
  return response.response
    .filter(f => f.league.id === CHAMPIONS_LEAGUE_ID)
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
 * Takımın belirli bir ligdeki istatistiklerini getir
 * NOT: API'den gelen veriler elemeleri de içerebilir, bu yüzden
 * takımın bu ligdeki maçlarını çekip kendimiz hesaplıyoruz
 */
export async function getTeamLeagueStats(teamId: number, leagueId: number): Promise<TeamLeagueStats | null> {
  try {
    // Rate limited fetch kullan
    const response = await rateLimitedFetch<FixtureResponse>('/fixtures', {
      team: teamId,
      league: leagueId,
      season: CURRENT_SEASON,
      timezone: 'Europe/Istanbul',
    });
    
    const matches = response.response
      .map(processFixture)
      // Sadece biten maçlar
      .filter(m => m.status.isFinished)
      // Sadece ana turnuva (Eylül'den sonraki maçlar - elemeler hariç)
      .filter(m => {
        const matchDate = new Date(m.timestamp * 1000);
        return matchDate >= MAIN_TOURNAMENT_START;
      })
      // En yeni maçlar önce
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (matches.length === 0) {
      return null;
    }
    
    // İstatistikleri hesapla
    let wins = 0, draws = 0, losses = 0;
    let goalsFor = 0, goalsAgainst = 0;
    let cleanSheets = 0, failedToScore = 0;
    const formArray: string[] = [];
    
    // EV ve DEPLASMAN istatistikleri ayrı tut
    let homeWins = 0, homeLosses = 0, homeDraws = 0;
    let awayWins = 0, awayLosses = 0, awayDraws = 0;
    
    matches.forEach(match => {
      const isHome = match.homeTeam.id === teamId;
      const teamGoals = isHome ? (match.score.home ?? 0) : (match.score.away ?? 0);
      const opponentGoals = isHome ? (match.score.away ?? 0) : (match.score.home ?? 0);
      
      goalsFor += teamGoals;
      goalsAgainst += opponentGoals;
      
      if (opponentGoals === 0) cleanSheets++;
      if (teamGoals === 0) failedToScore++;
      
      if (teamGoals > opponentGoals) {
        wins++;
        formArray.push('W');
        if (isHome) homeWins++; else awayWins++;
      } else if (teamGoals < opponentGoals) {
        losses++;
        formArray.push('L');
        if (isHome) homeLosses++; else awayLosses++;
      } else {
        draws++;
        formArray.push('D');
        if (isHome) homeDraws++; else awayDraws++;
      }
    });
    
    const played = matches.length;
    const form = formArray.slice(0, 6).join(''); // Son 6 maç formu
    
    // Takım bilgisi için ilk maçtan al
    const firstMatch = matches[0];
    const isHomeTeam = firstMatch.homeTeam.id === teamId;
    const team = isHomeTeam ? firstMatch.homeTeam : firstMatch.awayTeam;
    const league = firstMatch.league;
    
    return {
      teamId: team.id,
      teamName: team.name,
      teamLogo: team.logo,
      leagueId: league.id,
      leagueName: league.name,
      form,
      fixtures: {
        played,
        wins,
        draws,
        losses,
        home: { played: homeWins + homeDraws + homeLosses, wins: homeWins, draws: homeDraws, losses: homeLosses },
        away: { played: awayWins + awayDraws + awayLosses, wins: awayWins, draws: awayDraws, losses: awayLosses },
      },
      goals: {
        for: goalsFor,
        against: goalsAgainst,
        average: {
          for: played > 0 ? Math.round((goalsFor / played) * 10) / 10 : 0,
          against: played > 0 ? Math.round((goalsAgainst / played) * 10) / 10 : 0,
        },
      },
      cleanSheets,
      failedToScore,
      recentMatches: matches.slice(0, 6), // Son 6 maç
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
      last: 20,
      timezone: 'Europe/Istanbul',
    });
    
    return response.response.map(processFixture);
  } catch {
    return [];
  }
}

/**
 * H2H'ı sadece belirli bir lige göre filtrele
 */
export function filterH2HByLeague(h2h: ProcessedFixture[], leagueId: number): ProcessedFixture[] {
  return h2h.filter(match => match.league.id === leagueId);
}

/**
 * Avrupa kupası maçı için detaylı analiz verisi oluştur
 * NOT: Player stats liste görünümünde çekilmez, sadece tek maç detayında çekilir
 * İstekler seri yapılır rate limit'e takılmamak için
 */
export async function getEuropeanCupMatchDetail(fixture: ProcessedFixture, includePlayerStats: boolean = false): Promise<EuropeanCupMatch> {
  const leagueId = fixture.league.id;
  
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
  
  // Liga bazlı H2H filtrele
  const leagueH2H = filterH2HByLeague(h2h, leagueId);
  
  // Oyuncu istatistiklerini sadece istenirse al (tek maç detayı için)
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
  
  // CANLI MAÇ İÇİN: İstatistikler ve olayları çek
  let liveStats: ProcessedStatistics | null = null;
  let liveEvents: MatchEvent[] = [];
  let liveBetSuggestions: BetSuggestion[] = [];
  
  if (fixture.status.isLive) {
    await delay(50);
    liveStats = await getFixtureStatistics(fixture.id).catch(() => null);
    await delay(50);
    liveEvents = await getFixtureEvents(fixture.id).catch(() => []);
    
    // Canlı bahis fırsatlarını oluştur
    if (liveStats) {
      liveBetSuggestions = generateLiveBetSuggestions(fixture, liveStats, liveEvents);
    }
  }
  
  return {
    ...fixture,
    injuries: {
      home: homeInjuries,
      away: awayInjuries,
    },
    teamStats: {
      home: homeStats,
      away: awayStats,
    },
    playerStats: {
      home: homePlayerStats,
      away: awayPlayerStats,
    },
    h2h,
    leagueH2H,
    betSuggestions,
    liveStats,
    liveEvents,
    liveBetSuggestions,
    // İY/MS Analizi (sadece maç başlamamışsa)
    htFtAnalysis: fixture.status.isUpcoming ? generateHtFtAnalysis(homeStats, awayStats, h2h) : null,
  };
}

/**
 * Takımın bu ligdeki oyuncu istatistiklerini getir
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
    
    // En golcüler (gol sayısına göre sırala)
    const topScorers = [...players]
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5);
    
    // En çok kart görenler
    const mostCards = [...players]
      .filter(p => p.yellowCards + p.redCards > 0)
      .sort((a, b) => (b.yellowCards + b.redCards * 2) - (a.yellowCards + a.redCards * 2))
      .slice(0, 5);
    
    // Kilit oyuncular (gol + asist)
    const keyPlayers = [...players]
      .filter(p => p.goals + p.assists > 0)
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
      .slice(0, 5);
    
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
 * Kupon önerilerini oluştur
 */
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
  
  // === 1. GOL ATMA ANALİZİ ===
  if (homePlayerStats?.topScorers.length && awayPlayerStats?.topScorers.length) {
    const homeTopScorer = homePlayerStats.topScorers[0];
    const awayTopScorer = awayPlayerStats.topScorers[0];
    
    // Ev sahibi golcü aktifse
    if (homeTopScorer.goals >= 2 && !homeInjuries.some(i => i.name.includes(homeTopScorer.name.split(' ').pop() || ''))) {
      suggestions.push({
        type: 'goal',
        market: `${homeTopScorer.name} Gol Atar`,
        confidence: Math.min(85, 50 + homeTopScorer.goals * 8),
        reasoning: `${homeTopScorer.name} bu ligde ${homeTopScorer.goals} gol attı (${homeTopScorer.appearances} maçta)`,
        players: [homeTopScorer.name],
        priority: homeTopScorer.goals >= 4 ? 'high' : 'medium',
      });
    }
    
    // Deplasman golcüsü aktifse
    if (awayTopScorer.goals >= 2 && !awayInjuries.some(i => i.name.includes(awayTopScorer.name.split(' ').pop() || ''))) {
      suggestions.push({
        type: 'goal',
        market: `${awayTopScorer.name} Gol Atar`,
        confidence: Math.min(80, 45 + awayTopScorer.goals * 8),
        reasoning: `${awayTopScorer.name} bu ligde ${awayTopScorer.goals} gol attı (${awayTopScorer.appearances} maçta)`,
        players: [awayTopScorer.name],
        priority: awayTopScorer.goals >= 4 ? 'high' : 'medium',
      });
    }
  }
  
  // === 2. KART ANALİZİ ===
  if (homePlayerStats?.mostCards.length) {
    const cardPlayer = homePlayerStats.mostCards[0];
    if (cardPlayer.yellowCards >= 2) {
      suggestions.push({
        type: 'card',
        market: `${cardPlayer.name} Kart Görür`,
        confidence: Math.min(75, 40 + cardPlayer.yellowCards * 10),
        reasoning: `${cardPlayer.name} bu ligde ${cardPlayer.yellowCards} sarı kart gördü`,
        players: [cardPlayer.name],
        priority: cardPlayer.yellowCards >= 4 ? 'high' : 'medium',
      });
    }
  }
  
  if (awayPlayerStats?.mostCards.length) {
    const cardPlayer = awayPlayerStats.mostCards[0];
    if (cardPlayer.yellowCards >= 2) {
      suggestions.push({
        type: 'card',
        market: `${cardPlayer.name} Kart Görür`,
        confidence: Math.min(75, 40 + cardPlayer.yellowCards * 10),
        reasoning: `${cardPlayer.name} bu ligde ${cardPlayer.yellowCards} sarı kart gördü`,
        players: [cardPlayer.name],
        priority: cardPlayer.yellowCards >= 4 ? 'high' : 'medium',
      });
    }
  }
  
  // === 3. İLK YARI 1.5 ÜST ANALİZİ ===
  if (homeStats && awayStats) {
    // Son maçlardaki ilk yarı gollerini analiz et
    const homeHtGoals = calculateHalfTimeGoals(homeStats.recentMatches, homeStats.teamId);
    const awayHtGoals = calculateHalfTimeGoals(awayStats.recentMatches, awayStats.teamId);
    
    const avgHtGoals = (homeHtGoals.avgFor + homeHtGoals.avgAgainst + awayHtGoals.avgFor + awayHtGoals.avgAgainst) / 2;
    
    if (avgHtGoals >= 1.3 || (homeHtGoals.over15Rate >= 50 && awayHtGoals.over15Rate >= 50)) {
      suggestions.push({
        type: 'ht_goals',
        market: 'İY 1.5 Üst',
        confidence: Math.min(80, Math.round(avgHtGoals * 35)),
        reasoning: `Her iki takımın da maçlarının %${Math.round((homeHtGoals.over15Rate + awayHtGoals.over15Rate) / 2)}'inde ilk yarı 1.5 üst`,
        priority: avgHtGoals >= 1.8 ? 'high' : 'medium',
      });
    }
    
    // İY KG Var
    if (homeHtGoals.bttsRate >= 40 && awayHtGoals.bttsRate >= 40) {
      suggestions.push({
        type: 'ht_btts',
        market: 'İY KG Var',
        confidence: Math.round((homeHtGoals.bttsRate + awayHtGoals.bttsRate) / 2),
        reasoning: `Ev sahibi %${homeHtGoals.bttsRate}, deplasman %${awayHtGoals.bttsRate} İY KG Var oranı`,
        priority: (homeHtGoals.bttsRate + awayHtGoals.bttsRate) / 2 >= 50 ? 'high' : 'medium',
      });
    }
  }
  
  // === 4. MAÇTA KG VAR ===
  if (homeStats && awayStats) {
    const homeScoringRate = homeStats.fixtures.played > 0 ? (1 - homeStats.failedToScore / homeStats.fixtures.played) * 100 : 50;
    const awayScoringRate = awayStats.fixtures.played > 0 ? (1 - awayStats.failedToScore / awayStats.fixtures.played) * 100 : 50;
    
    const homeConcedingRate = homeStats.fixtures.played > 0 ? (1 - homeStats.cleanSheets / homeStats.fixtures.played) * 100 : 50;
    const awayConcedingRate = awayStats.fixtures.played > 0 ? (1 - awayStats.cleanSheets / awayStats.fixtures.played) * 100 : 50;
    
    const bttsConfidence = Math.round((homeScoringRate * awayConcedingRate * awayScoringRate * homeConcedingRate) ** 0.25);
    
    if (bttsConfidence >= 60) {
      suggestions.push({
        type: 'btts',
        market: 'KG Var',
        confidence: bttsConfidence,
        reasoning: `Ev sahibi %${Math.round(homeScoringRate)} gol atıyor, deplasman %${Math.round(awayScoringRate)} gol atıyor`,
        priority: bttsConfidence >= 75 ? 'high' : 'medium',
      });
    }
  }
  
  // === 5. TOPLAM GOL (2.5 ÜST/ALT) ===
  if (homeStats && awayStats) {
    const totalAvgGoals = homeStats.goals.average.for + homeStats.goals.average.against + 
                          awayStats.goals.average.for + awayStats.goals.average.against;
    const avgPerMatch = totalAvgGoals / 2;
    
    if (avgPerMatch >= 3.0) {
      suggestions.push({
        type: 'over_under',
        market: '2.5 Üst',
        confidence: Math.min(85, Math.round(avgPerMatch * 25)),
        reasoning: `Ortalama maç başı ${avgPerMatch.toFixed(1)} gol beklentisi`,
        priority: avgPerMatch >= 3.5 ? 'high' : 'medium',
      });
    } else if (avgPerMatch <= 2.0) {
      suggestions.push({
        type: 'over_under',
        market: '2.5 Alt',
        confidence: Math.min(80, Math.round((4 - avgPerMatch) * 25)),
        reasoning: `Ortalama maç başı ${avgPerMatch.toFixed(1)} gol beklentisi`,
        priority: avgPerMatch <= 1.5 ? 'high' : 'medium',
      });
    }
  }
  
  // === 6. SÜRPRİZ MAÇ (Zayıf Form + Ev Avantajı) ===
  if (homeStats && awayStats) {
    // Deplasman takımı formda, ev sahibi formsuz ama evinde güçlü
    const homeFormScore = calculateFormScore(homeStats.form);
    const awayFormScore = calculateFormScore(awayStats.form);
    
    // Ev sahibi formsuz ama evinde iyi
    if (homeFormScore < 50 && homeStats.fixtures.home.wins >= homeStats.fixtures.home.losses) {
      if (awayFormScore >= 60) {
        suggestions.push({
          type: 'surprise',
          market: `MS 1 (${fixture.homeTeam.name})`,
          confidence: 55,
          reasoning: `${fixture.homeTeam.name} formsuz görünüyor ama evinde ${homeStats.fixtures.home.wins}G-${homeStats.fixtures.home.draws}B-${homeStats.fixtures.home.losses}M`,
          priority: 'medium',
        });
      }
    }
    
    // Ev sahibi çok formda, deplasman zayıf
    if (homeFormScore >= 70 && awayFormScore <= 40) {
      suggestions.push({
        type: 'surprise',
        market: `MS 1 + 2.5 Üst`,
        confidence: 65,
        reasoning: `${fixture.homeTeam.name} formda (${homeStats.form}), ${fixture.awayTeam.name} zayıf (${awayStats.form})`,
        priority: 'high',
      });
    }
  }
  
  // === 7. H2H BAZLI ÖNERİLER ===
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
    const h2hBttsRate = (bttsCount / recentH2H.length) * 100;
    
    if (avgH2HGoals >= 3.0) {
      suggestions.push({
        type: 'over_under',
        market: '2.5 Üst (H2H)',
        confidence: Math.min(80, Math.round(avgH2HGoals * 22)),
        reasoning: `Son ${recentH2H.length} H2H maçta ortalama ${avgH2HGoals.toFixed(1)} gol`,
        priority: avgH2HGoals >= 3.5 ? 'high' : 'medium',
      });
    }
    
    if (h2hBttsRate >= 60) {
      suggestions.push({
        type: 'btts',
        market: 'KG Var (H2H)',
        confidence: Math.round(h2hBttsRate),
        reasoning: `Son ${recentH2H.length} H2H maçın %${Math.round(h2hBttsRate)}'inde KG Var`,
        priority: h2hBttsRate >= 80 ? 'high' : 'medium',
      });
    }
  }
  
  // Güvene göre sırala
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/**
 * İlk yarı gol istatistiklerini hesapla
 */
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

/**
 * Form skorunu hesapla (0-100)
 */
function calculateFormScore(form: string): number {
  if (!form) return 50;
  
  let score = 0;
  const chars = form.split('');
  
  chars.forEach((char, index) => {
    const weight = chars.length - index; // Son maçlar daha önemli
    if (char === 'W') score += 3 * weight;
    else if (char === 'D') score += 1 * weight;
    // L = 0 puan
  });
  
  const maxScore = chars.reduce((sum, _, i) => sum + 3 * (chars.length - i), 0);
  return Math.round((score / maxScore) * 100);
}

/**
 * İY/MS (Halftime/Fulltime) Analizi
 * Takımların ilk yarı ve maç sonu performanslarını analiz eder
 */
export function generateHtFtAnalysis(
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
  
  // === EV SAHİBİ ANALİZİ ===
  let homeHtWins = 0, homeHtDraws = 0, homeHtLosses = 0;
  let homeFtWins = 0, homeFtDraws = 0, homeFtLosses = 0;
  let homeFirstHalfGoals = 0, homeSecondHalfGoals = 0;
  let homeComebacks = 0; // Geriden gelme
  let homeBlownLeads = 0; // Öne geçip kaybetme
  
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
    
    // İlk yarı durumu
    if (htFor > htAgainst) homeHtWins++;
    else if (htFor < htAgainst) homeHtLosses++;
    else homeHtDraws++;
    
    // Maç sonu durumu
    if (ftFor > ftAgainst) homeFtWins++;
    else if (ftFor < ftAgainst) homeFtLosses++;
    else homeFtDraws++;
    
    // Gol dağılımı
    homeFirstHalfGoals += htFor;
    homeSecondHalfGoals += (ftFor - htFor);
    
    // Geriden gelme
    if (htFor < htAgainst && ftFor > ftAgainst) homeComebacks++;
    // Öne geçip kaybetme
    if (htFor > htAgainst && ftFor < ftAgainst) homeBlownLeads++;
  });
  
  // === DEPLASMAN ANALİZİ ===
  let awayHtWins = 0, awayHtDraws = 0, awayHtLosses = 0;
  let awayFtWins = 0, awayFtDraws = 0, awayFtLosses = 0;
  let awayFirstHalfGoals = 0, awaySecondHalfGoals = 0;
  let awayComebacks = 0;
  let awayBlownLeads = 0;
  
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
    else if (htFor < htAgainst) awayHtLosses++;
    else awayHtDraws++;
    
    if (ftFor > ftAgainst) awayFtWins++;
    else if (ftFor < ftAgainst) awayFtLosses++;
    else awayFtDraws++;
    
    awayFirstHalfGoals += htFor;
    awaySecondHalfGoals += (ftFor - htFor);
    
    if (htFor < htAgainst && ftFor > ftAgainst) awayComebacks++;
    if (htFor > htAgainst && ftFor < ftAgainst) awayBlownLeads++;
  });
  
  // === H2H ANALİZİ ===
  let h2hHomeHtWins = 0, h2hAwayHtWins = 0, h2hHtDraws = 0;
  
  h2h.slice(0, 5).forEach(match => {
    const htHome = match.score.halftimeHome ?? 0;
    const htAway = match.score.halftimeAway ?? 0;
    
    // Bu maçtaki ev sahibi bizim ev sahibimiz mi?
    const isOurHomeTeamHome = match.homeTeam.id === homeTeamId;
    
    if (htHome > htAway) {
      if (isOurHomeTeamHome) h2hHomeHtWins++;
      else h2hAwayHtWins++;
    } else if (htAway > htHome) {
      if (isOurHomeTeamHome) h2hAwayHtWins++;
      else h2hHomeHtWins++;
    } else {
      h2hHtDraws++;
    }
  });
  
  // === ORANLAR HESAPLA ===
  const homeMatchCount = homeMatches.length || 1;
  const awayMatchCount = awayMatches.length || 1;
  
  const homeHtWinRate = Math.round((homeHtWins / homeMatchCount) * 100);
  const awayHtWinRate = Math.round((awayHtWins / awayMatchCount) * 100);
  const homeHtDrawRate = Math.round((homeHtDraws / homeMatchCount) * 100);
  const awayHtDrawRate = Math.round((awayHtDraws / awayMatchCount) * 100);
  const homeFtWinRate = Math.round((homeFtWins / homeMatchCount) * 100);
  const awayFtWinRate = Math.round((awayFtWins / awayMatchCount) * 100);
  const homeComebackRate = Math.round((homeComebacks / homeMatchCount) * 100);
  const awayComebackRate = Math.round((awayComebacks / awayMatchCount) * 100);
  
  const homeAvgFirstHalf = homeFirstHalfGoals / homeMatchCount;
  const homeAvgSecondHalf = homeSecondHalfGoals / homeMatchCount;
  const awayAvgFirstHalf = awayFirstHalfGoals / awayMatchCount;
  const awayAvgSecondHalf = awaySecondHalfGoals / awayMatchCount;
  
  // === İY/MS TAHMİNLERİ ===
  const predictions: HtFtPrediction[] = [];
  
  // 1/1 - Ev önde, ev kazanır
  const oneOne = Math.round(
    (homeHtWinRate * 0.4) + 
    (homeFtWinRate * 0.3) + 
    ((100 - awayHtWinRate) * 0.2) +
    ((100 - awayComebackRate) * 0.1)
  );
  predictions.push({
    combination: '1/1',
    label: 'Ev Önde / Ev Kazanır',
    confidence: Math.min(85, oneOne),
    reasoning: `Ev sahibi İY'de %${homeHtWinRate} önde, MS'de %${homeFtWinRate} kazanıyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // X/1 - Berabere, ev kazanır (geç açılma)
  const drawOne = Math.round(
    (homeHtDrawRate * 0.25) + 
    (awayHtDrawRate * 0.25) + 
    (homeFtWinRate * 0.3) +
    (homeAvgSecondHalf > homeAvgFirstHalf ? 15 : 0) + // İkinci yarı daha golcü
    ((100 - awayFtWinRate) * 0.1)
  );
  predictions.push({
    combination: 'X/1',
    label: 'Berabere / Ev Kazanır',
    confidence: Math.min(75, drawOne),
    reasoning: `İY beraberlik oranı yüksek, ev sahibi 2. yarıda ${homeAvgSecondHalf.toFixed(1)} gol atıyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // 2/2 - Deplasman önde, deplasman kazanır
  const twoTwo = Math.round(
    (awayHtWinRate * 0.4) + 
    (awayFtWinRate * 0.3) + 
    ((100 - homeHtWinRate) * 0.2) +
    ((100 - homeComebackRate) * 0.1)
  );
  predictions.push({
    combination: '2/2',
    label: 'Dep. Önde / Dep. Kazanır',
    confidence: Math.min(80, twoTwo),
    reasoning: `Deplasman İY'de %${awayHtWinRate} önde, MS'de %${awayFtWinRate} kazanıyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // X/2 - Berabere, deplasman kazanır
  const drawTwo = Math.round(
    (homeHtDrawRate * 0.25) + 
    (awayHtDrawRate * 0.25) + 
    (awayFtWinRate * 0.3) +
    (awayAvgSecondHalf > awayAvgFirstHalf ? 15 : 0) +
    ((100 - homeFtWinRate) * 0.1)
  );
  predictions.push({
    combination: 'X/2',
    label: 'Berabere / Dep. Kazanır',
    confidence: Math.min(75, drawTwo),
    reasoning: `İY beraberlik oranı yüksek, deplasman 2. yarıda ${awayAvgSecondHalf.toFixed(1)} gol atıyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // 2/1 - Deplasman önde, ev kazanır (SÜRPRİZ!)
  const twoOne = Math.round(
    (homeComebackRate * 0.5) + 
    (awayBlownLeads / awayMatchCount * 100 * 0.3) +
    (homeAvgSecondHalf > 1 ? 10 : 0) +
    (homeFtWinRate * 0.1)
  );
  predictions.push({
    combination: '2/1',
    label: '💎 Dep. Önde / Ev Kazanır',
    confidence: Math.min(50, twoOne),
    reasoning: `Ev sahibi %${homeComebackRate} geriden geliyor, deplasman liderlik kaybediyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // 1/2 - Ev önde, deplasman kazanır (SÜRPRİZ!)
  const oneTwo = Math.round(
    (awayComebackRate * 0.5) + 
    (homeBlownLeads / homeMatchCount * 100 * 0.3) +
    (awayAvgSecondHalf > 1 ? 10 : 0) +
    (awayFtWinRate * 0.1)
  );
  predictions.push({
    combination: '1/2',
    label: '💎 Ev Önde / Dep. Kazanır',
    confidence: Math.min(50, oneTwo),
    reasoning: `Deplasman %${awayComebackRate} geriden geliyor, ev sahibi liderlik kaybediyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // X/X - Berabere / Berabere
  const drawDraw = Math.round(
    (homeHtDrawRate * 0.3) + 
    (awayHtDrawRate * 0.3) +
    ((100 - homeFtWinRate - awayFtWinRate) * 0.3) +
    (homeAvgFirstHalf < 0.8 && awayAvgFirstHalf < 0.8 ? 10 : 0)
  );
  predictions.push({
    combination: 'X/X',
    label: 'Berabere / Berabere',
    confidence: Math.min(60, drawDraw),
    reasoning: `Düşük skorlu maç beklentisi, iki takım da zor gol buluyor`,
    homeHtWinRate,
    awayHtWinRate,
    drawHtRate: Math.round((homeHtDrawRate + awayHtDrawRate) / 2),
    homeComebackRate,
    awayComebackRate,
  });
  
  // Güvene göre sırala
  predictions.sort((a, b) => b.confidence - a.confidence);
  
  // En iyi tahmin için özet
  const best = predictions[0];
  const summary = `En güçlü tahmin: ${best.combination} (${best.label}) - %${best.confidence} güven`;
  
  // H2H'da 2/1 ve 1/2 sayısını hesapla
  let h2hTwoOneCount = 0;
  let h2hOneTwoCount = 0;
  if (h2h && h2h.length > 0) {
    h2h.forEach((match) => {
      const htHome = match.score.halftimeHome ?? 0;
      const htAway = match.score.halftimeAway ?? 0;
      const ftHome = match.score.home ?? 0;
      const ftAway = match.score.away ?? 0;
      
      // 2/1: Deplasman İY'de önde, Ev MS'de kazandı
      if (htAway > htHome && ftHome > ftAway) {
        h2hTwoOneCount++;
      }
      // 1/2: Ev İY'de önde, Deplasman MS'de kazandı
      if (htHome > htAway && ftAway > ftHome) {
        h2hOneTwoCount++;
      }
    });
  }
  
  const h2hMatchCount = h2h?.length || 0;
  
  // 2/1 ihtimali hesapla (geriden gelme + liderlik kaybetme)
  const twoOneChance = Math.round(
    (homeComebackRate * 0.4) + 
    (awayBlownLeads / awayMatchCount * 100 * 0.4) +
    (h2hTwoOneCount / Math.max(h2hMatchCount, 1) * 100 * 0.2)
  );
  
  // 1/2 ihtimali hesapla
  const oneTwoChance = Math.round(
    (awayComebackRate * 0.4) + 
    (homeBlownLeads / homeMatchCount * 100 * 0.4) +
    (h2hOneTwoCount / Math.max(h2hMatchCount, 1) * 100 * 0.2)
  );
  
  const surpriseStats = {
    twoOneChance: Math.min(40, twoOneChance), // 2/1 nadir, max %40
    twoOneHomeComeback: homeComebacks,
    twoOneAwayBlownLead: awayBlownLeads,
    twoOneH2HCount: h2hTwoOneCount,
    oneTwoChance: Math.min(40, oneTwoChance), // 1/2 nadir, max %40
    oneTwoAwayComeback: awayComebacks,
    oneTwoHomeBlownLead: homeBlownLeads,
    oneTwoH2HCount: h2hOneTwoCount,
    totalHomeMatches: homeMatchCount,
    totalAwayMatches: awayMatchCount,
    totalH2HMatches: h2hMatchCount,
  };
  
  return {
    predictions: predictions.slice(0, 5), // En iyi 5'i döndür
    homeFirstHalfGoals: homeAvgFirstHalf,
    awayFirstHalfGoals: awayAvgFirstHalf,
    homeSecondHalfGoals: homeAvgSecondHalf,
    awaySecondHalfGoals: awayAvgSecondHalf,
    summary,
    surpriseStats,
  };
}

/**
 * CANLI MAÇ için bahis fırsatları oluştur
 * Momentum, istatistikler ve olaylara göre anlık öneriler
 */
export function generateLiveBetSuggestions(
  fixture: ProcessedFixture,
  stats: ProcessedStatistics,
  events: MatchEvent[]
): BetSuggestion[] {
  const suggestions: BetSuggestion[] = [];
  const elapsed = fixture.status.elapsed || 0;
  const homeScore = fixture.score.home ?? 0;
  const awayScore = fixture.score.away ?? 0;
  const totalGoals = homeScore + awayScore;
  
  // Momentum hesapla (şut, korner, tehlikeli atak)
  const homeMomentum = (stats.home.totalShots * 2) + (stats.home.shotsOnGoal * 3) + stats.home.corners;
  const awayMomentum = (stats.away.totalShots * 2) + (stats.away.shotsOnGoal * 3) + stats.away.corners;
  const momentumDiff = homeMomentum - awayMomentum;
  const totalMomentum = homeMomentum + awayMomentum;
  
  // Kart baskısı
  const totalFouls = stats.home.fouls + stats.away.fouls;
  const totalCards = stats.home.yellowCards + stats.away.yellowCards + stats.home.redCards + stats.away.redCards;
  
  // === 1. AKILLI ÜST GOL FIRSATI (3.5 / 4.5 Üst) ===
  const totalShotsOnGoal = (stats.home.shotsOnGoal || 0) + (stats.away.shotsOnGoal || 0);
  const goalRate = elapsed > 0 ? totalGoals / elapsed : 0;
  const isOpenMatch = homeScore > 0 && awayScore > 0;
  const remainingMin = 90 - elapsed;
  
  // 3+ gol varsa → 3.5 Üst
  if (totalGoals >= 3 && elapsed <= 80 && remainingMin >= 10) {
    let conf = 70;
    if (goalRate >= 0.06) conf += 10;
    if (totalShotsOnGoal >= 8) conf += 8;
    if (isOpenMatch) conf += 7;
    if (remainingMin >= 25) conf += 5;
    
    if (conf >= 72) {
      suggestions.push({
        type: 'over_under',
        market: '3.5 Üst',
        confidence: Math.min(92, conf),
        reasoning: `${totalGoals} gol ${elapsed}' - gol hızı: ${(goalRate * 90).toFixed(1)}/maç, ${totalShotsOnGoal} isabetli şut${isOpenMatch ? ', açık maç' : ''}`,
        priority: conf >= 85 ? 'high' : 'medium',
      });
    }
  }
  
  // 4+ gol varsa → 4.5 Üst
  if (totalGoals >= 4 && elapsed <= 78 && remainingMin >= 12) {
    let conf = 65;
    if (goalRate >= 0.07) conf += 15;
    else if (goalRate >= 0.05) conf += 10;
    if (isOpenMatch && homeScore >= 2 && awayScore >= 2) conf += 12;
    else if (isOpenMatch) conf += 6;
    if (totalShotsOnGoal >= 10) conf += 8;
    if (remainingMin >= 20) conf += 5;
    
    if (conf >= 72) {
      suggestions.push({
        type: 'over_under',
        market: '4.5 Üst',
        confidence: Math.min(90, conf),
        reasoning: `Gol festivali! ${totalGoals} gol ${elapsed}', hız: ${(goalRate * 90).toFixed(1)}/maç, şut baskısı devam ediyor`,
        priority: conf >= 82 ? 'high' : 'medium',
      });
    }
  }
  
  // Momentum bazlı üst bahis (2 gol + güçlü baskı → 3.5 Üst)
  if (elapsed > 25 && elapsed < 70 && totalGoals === 2) {
    if (totalMomentum > 30 && totalShotsOnGoal >= 6) {
      let conf = 60;
      if (isOpenMatch) conf += 8;
      if (totalShotsOnGoal >= 8) conf += 10;
      if (totalMomentum > 40) conf += 8;
      
      if (conf >= 72) {
        suggestions.push({
          type: 'over_under',
          market: '3.5 Üst',
          confidence: Math.min(85, conf),
          reasoning: `2 gol + güçlü baskı: ${totalShotsOnGoal} isab. şut, momentum: ${totalMomentum}${isOpenMatch ? ', açık maç' : ''}`,
          priority: conf >= 80 ? 'high' : 'medium',
        });
      }
    }
  }
  
  // === 2. GOL BEKLENTISI ===
  const xG = (stats.home.expectedGoals || 0) + (stats.away.expectedGoals || 0);
  if (xG > 0 && xG > totalGoals + 0.8) {
    suggestions.push({
      type: 'over_under',
      market: `${totalGoals + 0.5} Üst`,
      confidence: Math.min(80, Math.round(50 + (xG - totalGoals) * 20)),
      reasoning: `xG: ${xG.toFixed(2)} > Mevcut skor: ${totalGoals}. Gol bekleniyor!`,
      priority: xG > totalGoals + 1.2 ? 'high' : 'medium',
    });
  }
  
  // === 3. AKILLI KART FIRSATI (Dakikaya göre akıllı eşik seçimi) ===
  // Sabit eşikler: 2.5, 3.5, 4.5, 5.5, 6.5
  // Eşik mevcut kart sayısından EN AZ 2 fazla olmalı (anlamlı oran için)
  const isTenseMatch = Math.abs(homeScore - awayScore) <= 1;
  const isSecondHalf = elapsed >= 45;
  
  if (elapsed > 20 && elapsed < 82) {
    const faulPerMin = totalFouls / elapsed;
    const cardRate = totalCards / elapsed;
    const cardRemaining = 90 - elapsed;
    const expectedRemainingCards = cardRate * cardRemaining;
    
    // Akıllı eşik seçimi
    const cardThresholds = [2.5, 3.5, 4.5, 5.5, 6.5];
    const cardMinGap = cardRemaining >= 20 ? 2 : 1.5;
    const cardTarget = cardThresholds.find(t => t >= totalCards + cardMinGap);
    
    if (cardTarget) {
      const cardsNeeded = cardTarget - totalCards + 0.5;
      const canReachCards = expectedRemainingCards >= cardsNeeded * 0.7;
      
      if (canReachCards) {
        let conf = 50;
        
        const projRatio = expectedRemainingCards / cardsNeeded;
        if (projRatio >= 1.5) conf += 18;
        else if (projRatio >= 1.2) conf += 12;
        else if (projRatio >= 1.0) conf += 6;
        
        if (faulPerMin >= 0.55) conf += 15;
        else if (faulPerMin >= 0.45) conf += 10;
        else if (faulPerMin >= 0.35) conf += 5;
        
        if (isTenseMatch) conf += 8;
        if (isSecondHalf) conf += 5;
        if (stats.home.yellowCards >= 1 && stats.away.yellowCards >= 1) conf += 5;
        
        // Kart açığı bonusu
        const expectedCardsByFouls = totalFouls / 8;
        if (expectedCardsByFouls > totalCards + 1) conf += 8;
        
        if (conf >= 70) {
          const difficulty = cardsNeeded / (cardRemaining / 30);
          let estimatedOdds: number;
          if (difficulty <= 0.8) estimatedOdds = 1.45;
          else if (difficulty <= 1.2) estimatedOdds = 1.65;
          else if (difficulty <= 1.6) estimatedOdds = 1.85;
          else estimatedOdds = 2.10;
          
          suggestions.push({
            type: 'card',
            market: `${cardTarget} Üst Kart`,
            confidence: Math.min(88, conf),
            reasoning: `${totalCards} kart ${elapsed}' (${totalFouls} faul) - projeksiyon: ${(cardRate * 90).toFixed(1)} kart/maç${isTenseMatch ? ', gergin maç' : ''}`,
            priority: conf >= 82 ? 'high' : 'medium',
          });
        }
      }
    }
  }
  
  // === 4. AKILLI KORNER FIRSATI (Dakikaya göre akıllı eşik seçimi) ===
  // Sabit eşikler: 7.5, 8.5, 9.5, 10.5, 11.5
  // Eşik mevcut kornerden EN AZ 2.5 fazla olmalı (anlamlı oran için)
  const totalCorners = stats.home.corners + stats.away.corners;
  const cornerPerMin = elapsed > 0 ? totalCorners / elapsed : 0;
  const projectedCorners = cornerPerMin * 90;
  const totalShotsAll = (stats.home.totalShots || 0) + (stats.away.totalShots || 0);
  const cornerRemaining = 90 - elapsed;
  
  if (elapsed > 20 && elapsed < 82) {
    const expectedRemainingCorners = cornerPerMin * cornerRemaining;
    
    const cornerThresholds = [7.5, 8.5, 9.5, 10.5, 11.5];
    const cornerMinGap = cornerRemaining >= 25 ? 2.5 : cornerRemaining >= 15 ? 2 : 1.5;
    const cornerTarget = cornerThresholds.find(t => t >= totalCorners + cornerMinGap);
    
    if (cornerTarget) {
      const cornersNeeded = cornerTarget - totalCorners + 0.5;
      const canReachCorners = expectedRemainingCorners >= cornersNeeded * 0.7;
      
      if (canReachCorners) {
        let conf = 50;
        
        const projRatio = expectedRemainingCorners / cornersNeeded;
        if (projRatio >= 1.5) conf += 18;
        else if (projRatio >= 1.2) conf += 12;
        else if (projRatio >= 1.0) conf += 6;
        
        if (totalShotsAll >= 20) conf += 12;
        else if (totalShotsAll >= 15) conf += 8;
        else if (totalShotsAll >= 10) conf += 4;
        
        if (stats.home.corners >= 3 && stats.away.corners >= 3) conf += 7;
        else if (stats.home.corners >= 2 && stats.away.corners >= 2) conf += 3;
        
        if (cornerPerMin >= 0.15) conf += 8;
        else if (cornerPerMin >= 0.12) conf += 5;
        
        if (conf >= 70) {
          const difficulty = cornersNeeded / (cornerRemaining / 15);
          let estimatedOdds: number;
          if (difficulty <= 0.7) estimatedOdds = 1.45;
          else if (difficulty <= 1.0) estimatedOdds = 1.65;
          else if (difficulty <= 1.4) estimatedOdds = 1.85;
          else estimatedOdds = 2.15;
          
          suggestions.push({
            type: 'over_under',
            market: `${cornerTarget} Üst Korner`,
            confidence: Math.min(88, conf),
            reasoning: `${totalCorners} korner ${elapsed}' (tempo: ${projectedCorners.toFixed(1)}/maç) - hedef ${cornerTarget}, ${totalShotsAll} şut baskısı`,
            priority: conf >= 82 ? 'high' : 'medium',
          });
        }
      }
    }
  }
  
  // === 5. GOLSÜZ MAÇ ANALİZİ ===
  if (totalGoals === 0 && elapsed > 55) {
    // Çok şut ama gol yok
    const totalShots = stats.home.totalShots + stats.away.totalShots;
    if (totalShots >= 15) {
      suggestions.push({
        type: 'goal',
        market: 'Gol Olur (Kalan Süre)',
        confidence: Math.min(85, 60 + totalShots * 1.5),
        reasoning: `${totalShots} şut, 0 gol! Baskı var, gol an meselesi`,
        priority: totalShots >= 20 ? 'high' : 'medium',
      });
    } else if (elapsed > 70 && totalShots < 10) {
      suggestions.push({
        type: 'surprise',
        market: '0-0 Beraberlik',
        confidence: Math.min(75, 55 + (90 - elapsed) / 2),
        reasoning: `Düşük tempolu maç. ${elapsed}. dakikada sadece ${totalShots} şut`,
        priority: elapsed > 80 ? 'high' : 'medium',
      });
    }
  }
  
  // === 6. GERİDEN GELME FIRSATI ===
  if (homeScore !== awayScore && elapsed > 45 && elapsed < 80) {
    const losingTeam = homeScore < awayScore ? 'home' : 'away';
    const losingStats = losingTeam === 'home' ? stats.home : stats.away;
    const losingTeamName = losingTeam === 'home' ? fixture.homeTeam.name : fixture.awayTeam.name;
    
    if (losingStats.shotsOnGoal >= 4 && losingStats.possession > 52) {
      // Skorun toplamına göre akıllı üst bahis
      const smartMarket = totalGoals >= 3 ? '4.5 Üst' : totalGoals >= 2 ? '3.5 Üst' : '2.5 Üst';
      suggestions.push({
        type: 'over_under',
        market: smartMarket,
        confidence: Math.min(80, 55 + losingStats.shotsOnGoal * 4),
        reasoning: `${losingTeamName} geride ama baskı yapıyor: %${losingStats.possession} top, ${losingStats.shotsOnGoal} isabetli şut - gol bekleniyor`,
        priority: losingStats.shotsOnGoal >= 6 ? 'high' : 'medium',
      });
    }
  }
  
  // === 7. İKİNCİ YARI GOL BEKLENTISI ===
  if (fixture.status.code === '2H' && totalGoals === 0 && elapsed < 65) {
    const secondHalfMomentum = totalMomentum; // İkinci yarı istatistikleri
    if (secondHalfMomentum > 20) {
      suggestions.push({
        type: 'over_under',
        market: '2. Yarı 0.5 Üst',
        confidence: Math.min(80, 55 + secondHalfMomentum / 2),
        reasoning: `İkinci yarıda ${stats.home.totalShots + stats.away.totalShots} şut. Gol geliyor!`,
        priority: secondHalfMomentum > 30 ? 'high' : 'medium',
      });
    }
  }
  
  // Güvene göre sırala ve en iyi 5'i döndür
  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

// === Yardımcı Fonksiyonlar ===

function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

function processFixture(fixture: FixtureResponse): ProcessedFixture {
  const date = new Date(fixture.fixture.date);
  const statusCode = fixture.fixture.status.short;

  return {
    id: fixture.fixture.id,
    date: date.toLocaleDateString('tr-TR'),
    time: date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
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

// === API Response Tipleri ===

interface InjuryResponse {
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
}

interface TeamStatsResponse {
  team: { id: number; name: string; logo: string };
  league: { id: number; name: string; country: string };
  form: string;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
    };
    against: {
      total: { home: number; away: number; total: number };
      average: { home: string; away: string; total: string };
    };
  };
  clean_sheet: { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
  biggest: {
    wins: { home: string; away: string };
    loses: { home: string; away: string };
  };
}

interface PlayerStatsResponse {
  player: {
    id: number;
    name: string;
    firstname: string;
    lastname: string;
    photo: string;
    nationality: string;
  };
  statistics: Array<{
    team: { id: number; name: string; logo: string };
    league: { id: number; name: string; country: string };
    games: {
      appearences: number;
      minutes: number;
      position: string;
      rating: string;
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

// ============================================
// FIRSAT RADARI - Akıllı Canlı Fırsat Sistemi
// ============================================

/**
 * Canlı fırsat oluştur - ID ve yaşam döngüsü ile
 */
export function createLiveOpportunity(
  fixture: ProcessedFixture,
  stats: ProcessedStatistics,
  type: LiveOpportunity['type'],
  market: string,
  team: 'home' | 'away' | undefined,
  confidence: number,
  reasoning: string,
  validForMinutes: number = 10 // Varsayılan 10 dk geçerli
): LiveOpportunity {
  const elapsed = fixture.status.elapsed || 0;
  const homeMomentum = (stats.home.totalShots * 2) + (stats.home.shotsOnGoal * 3) + stats.home.corners;
  const awayMomentum = (stats.away.totalShots * 2) + (stats.away.shotsOnGoal * 3) + stats.away.corners;
  
  return {
    id: `${fixture.id}-${type}-${team || 'both'}-${elapsed}`,
    fixtureId: fixture.id,
    type,
    market,
    team,
    teamName: team === 'home' ? fixture.homeTeam.name : team === 'away' ? fixture.awayTeam.name : undefined,
    confidence,
    reasoning,
    status: 'active',
    createdAt: Date.now(),
    validUntilElapsed: Math.min(elapsed + validForMinutes, 90),
    createdAtMomentum: { home: homeMomentum, away: awayMomentum },
  };
}

/**
 * Fırsatları güncelle - tuttu/kaçtı/iptal kontrolü
 */
export function updateOpportunities(
  existingOpportunities: LiveOpportunity[],
  fixture: ProcessedFixture,
  stats: ProcessedStatistics,
  events: MatchEvent[],
  previousScore: { home: number; away: number }
): LiveOpportunity[] {
  const elapsed = fixture.status.elapsed || 0;
  const currentScore = { home: fixture.score.home ?? 0, away: fixture.score.away ?? 0 };
  
  // Mevcut momentum
  const homeMomentum = (stats.home.totalShots * 2) + (stats.home.shotsOnGoal * 3) + stats.home.corners;
  const awayMomentum = (stats.away.totalShots * 2) + (stats.away.shotsOnGoal * 3) + stats.away.corners;
  
  // Gol oldu mu?
  const homeScored = currentScore.home > previousScore.home;
  const awayScored = currentScore.away > previousScore.away;
  
  // Son olayları kontrol et (kartlar)
  const recentCards = events.filter(e => 
    e.type === 'Card' && 
    e.time?.elapsed && 
    e.time.elapsed >= elapsed - 2 // Son 2 dk içinde
  );
  
  return existingOpportunities.map(opp => {
    // Zaten çözülmüş fırsatları atla
    if (opp.status !== 'active') return opp;
    
    // Farklı maçın fırsatı
    if (opp.fixtureId !== fixture.id) return opp;
    
    // === SÜRE KONTROLÜ ===
    if (opp.validUntilElapsed && elapsed > opp.validUntilElapsed) {
      return {
        ...opp,
        status: 'expired' as const,
        result: {
          hit: false,
          resolvedAt: Date.now(),
          description: 'Süre doldu',
        },
      };
    }
    
    // === GOL FIRSATI KONTROLÜ ===
    if (opp.type === 'goal' || opp.type === 'momentum') {
      if (opp.team === 'home' && homeScored) {
        return {
          ...opp,
          status: 'hit' as const,
          result: {
            hit: true,
            resolvedAt: Date.now(),
            description: `✅ ${fixture.homeTeam.name} gol attı!`,
          },
        };
      }
      if (opp.team === 'away' && awayScored) {
        return {
          ...opp,
          status: 'hit' as const,
          result: {
            hit: true,
            resolvedAt: Date.now(),
            description: `✅ ${fixture.awayTeam.name} gol attı!`,
          },
        };
      }
      // Yanlış takım gol attı
      if (opp.team === 'home' && awayScored) {
        return {
          ...opp,
          status: 'missed' as const,
          result: {
            hit: false,
            resolvedAt: Date.now(),
            description: `❌ Deplasman gol attı`,
          },
        };
      }
      if (opp.team === 'away' && homeScored) {
        return {
          ...opp,
          status: 'missed' as const,
          result: {
            hit: false,
            resolvedAt: Date.now(),
            description: `❌ Ev sahibi gol attı`,
          },
        };
      }
    }
    
    // === KART FIRSATI KONTROLÜ ===
    if (opp.type === 'card' && recentCards.length > 0) {
      if (opp.team) {
        const teamId = opp.team === 'home' ? fixture.homeTeam.id : fixture.awayTeam.id;
        const teamCard = recentCards.find(c => c.team?.id === teamId);
        if (teamCard) {
          return {
            ...opp,
            status: 'hit' as const,
            result: {
              hit: true,
              resolvedAt: Date.now(),
              description: `✅ ${opp.teamName} kart gördü!`,
            },
          };
        }
      } else {
        // Herhangi bir kart
        return {
          ...opp,
          status: 'hit' as const,
          result: {
            hit: true,
            resolvedAt: Date.now(),
            description: `✅ Kart çıktı!`,
          },
        };
      }
    }
    
    // === MOMENTUM DEĞİŞİMİ KONTROLÜ ===
    if (opp.createdAtMomentum && opp.type === 'momentum') {
      const momentumShift = 8; // Eşik değer
      
      if (opp.team === 'home') {
        // Ev sahibi momentumu düştü mü?
        const homeDropped = opp.createdAtMomentum.home - homeMomentum > momentumShift;
        const awayRose = awayMomentum - opp.createdAtMomentum.away > momentumShift;
        
        if (homeDropped || awayRose) {
          return {
            ...opp,
            status: 'cancelled' as const,
            result: {
              hit: false,
              resolvedAt: Date.now(),
              description: `🔄 Momentum tersine döndü`,
            },
          };
        }
      } else if (opp.team === 'away') {
        // Deplasman momentumu düştü mü?
        const awayDropped = opp.createdAtMomentum.away - awayMomentum > momentumShift;
        const homeRose = homeMomentum - opp.createdAtMomentum.home > momentumShift;
        
        if (awayDropped || homeRose) {
          return {
            ...opp,
            status: 'cancelled' as const,
            result: {
              hit: false,
              resolvedAt: Date.now(),
              description: `🔄 Momentum tersine döndü`,
            },
          };
        }
      }
    }
    
    return opp;
  });
}

/**
 * Yeni fırsatlar üret - mevcut fırsatlarla çakışmayan
 */
export function generateNewOpportunities(
  fixture: ProcessedFixture,
  stats: ProcessedStatistics,
  existingOpportunities: LiveOpportunity[]
): LiveOpportunity[] {
  const newOpportunities: LiveOpportunity[] = [];
  const elapsed = fixture.status.elapsed || 0;
  
  if (elapsed < 3 || elapsed > 90) return []; // Çok erken veya geç
  
  // Mevcut aktif fırsat ID'leri
  const activeIds = new Set(
    existingOpportunities
      .filter(o => o.status === 'active' && o.fixtureId === fixture.id)
      .map(o => o.type + '-' + o.team)
  );
  
  // Momentum hesapla
  const homeMomentum = (stats.home.totalShots * 2) + (stats.home.shotsOnGoal * 3) + stats.home.corners;
  const awayMomentum = (stats.away.totalShots * 2) + (stats.away.shotsOnGoal * 3) + stats.away.corners;
  const momentumDiff = homeMomentum - awayMomentum;
  const totalShots = stats.home.totalShots + stats.away.totalShots;
  
  // === ERKEN BASI FIRSATI (10+ dk, şut var) ===
  if (elapsed >= 8 && elapsed < 35) {
    if (stats.home.totalShots >= 2 && stats.home.totalShots > stats.away.totalShots + 1 && !activeIds.has('pressure-home')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'pressure',
        `${fixture.homeTeam.name} İlk Yarı Gol`,
        'home',
        Math.min(75, 50 + stats.home.totalShots * 5),
        `Erken baskı! ${stats.home.totalShots} şut, rakip ${stats.away.totalShots} şut`,
        10
      ));
    } else if (stats.away.totalShots >= 2 && stats.away.totalShots > stats.home.totalShots + 1 && !activeIds.has('pressure-away')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'pressure',
        `${fixture.awayTeam.name} İlk Yarı Gol`,
        'away',
        Math.min(75, 50 + stats.away.totalShots * 5),
        `Erken baskı! ${stats.away.totalShots} şut, rakip ${stats.home.totalShots} şut`,
        10
      ));
    }
  }
  
  // === TOP HAKİMİYETİ FIRSATI ===
  if (elapsed >= 10 && elapsed < 80) {
    if (stats.home.possession >= 60 && !activeIds.has('possession-home')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'possession',
        `${fixture.homeTeam.name} Gol Bulur`,
        'home',
        Math.min(72, 48 + Math.round((stats.home.possession - 50) * 1.2)),
        `%${stats.home.possession} top hakimiyeti, oyunu kontrol ediyor`,
        12
      ));
    } else if (stats.away.possession >= 60 && !activeIds.has('possession-away')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'possession',
        `${fixture.awayTeam.name} Gol Bulur`,
        'away',
        Math.min(72, 48 + Math.round((stats.away.possession - 50) * 1.2)),
        `%${stats.away.possession} top hakimiyeti, oyunu kontrol ediyor`,
        12
      ));
    }
  }
  
  // === MOMENTUM BAZLI GOL FIRSATI ===
  if (elapsed > 15 && elapsed < 85) {
    if (momentumDiff > 6 && stats.home.shotsOnGoal >= 1 && !activeIds.has('momentum-home')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'momentum',
        `Sonraki Gol: ${fixture.homeTeam.name}`,
        'home',
        Math.min(85, 55 + Math.round(momentumDiff * 2)),
        `Baskı yapıyor! ${stats.home.totalShots} şut (${stats.home.shotsOnGoal} isab.), ${stats.home.corners} korner`,
        8
      ));
    } else if (momentumDiff < -6 && stats.away.shotsOnGoal >= 1 && !activeIds.has('momentum-away')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'momentum',
        `Sonraki Gol: ${fixture.awayTeam.name}`,
        'away',
        Math.min(85, 55 + Math.round(Math.abs(momentumDiff) * 2)),
        `Baskı yapıyor! ${stats.away.totalShots} şut (${stats.away.shotsOnGoal} isab.), ${stats.away.corners} korner`,
        8
      ));
    }
  }
  
  // === TEMPO YÜKSEK - GOL BEKLENTISI ===
  if (elapsed >= 15 && elapsed < 75 && !activeIds.has('tempo-undefined')) {
    const shotsPerMin = totalShots / elapsed;
    if (shotsPerMin > 0.35) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'tempo',
        '1.5 Gol Üst',
        undefined,
        Math.min(80, 52 + Math.round(shotsPerMin * 50)),
        `Yüksek tempo! ${elapsed} dk'da ${totalShots} şut atıldı`,
        15
      ));
    }
  }
  
  // === KART FIRSATI ===
  const totalFouls = stats.home.fouls + stats.away.fouls;
  const totalCards = stats.home.yellowCards + stats.away.yellowCards;
  
  if (elapsed > 20 && elapsed < 85 && !activeIds.has('card-undefined')) {
    const faulPerMin = totalFouls / elapsed;
    if (faulPerMin > 0.35 && totalCards < 4) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'card',
        'Kart Çıkacak',
        undefined,
        Math.min(82, Math.round(50 + faulPerMin * 60)),
        `${totalFouls} faul, sadece ${totalCards} kart. Hakem toleranslı!`,
        6
      ));
    }
  }
  
  // === KORNER FIRSATI ===
  const totalCorners = stats.home.corners + stats.away.corners;
  if (elapsed > 20 && elapsed < 80 && !activeIds.has('corner-undefined')) {
    const projectedCorners = (totalCorners / elapsed) * 90;
    if (projectedCorners > 9 && totalCorners >= 2) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'corner',
        '8.5 Korner Üst',
        undefined,
        Math.min(78, Math.round(50 + (projectedCorners - 8.5) * 4)),
        `Tempo yüksek! ${elapsed}. dk'da ${totalCorners} korner`,
        12
      ));
    }
  }
  
  // === GERİDEN GELME FIRSATI ===
  const homeScore = fixture.score.home ?? 0;
  const awayScore = fixture.score.away ?? 0;
  
  if (homeScore !== awayScore && elapsed > 45 && elapsed < 82) {
    if (homeScore < awayScore && stats.home.shotsOnGoal >= 2 && stats.home.possession > 50 && !activeIds.has('comeback-home')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'comeback',
        `${fixture.homeTeam.name} Gol Atar`,
        'home',
        Math.min(78, 50 + stats.home.shotsOnGoal * 5),
        `Geride ama baskı var: %${stats.home.possession} top, ${stats.home.shotsOnGoal} isabetli şut`,
        10
      ));
    } else if (awayScore < homeScore && stats.away.shotsOnGoal >= 2 && stats.away.possession > 50 && !activeIds.has('comeback-away')) {
      newOpportunities.push(createLiveOpportunity(
        fixture, stats, 'comeback',
        `${fixture.awayTeam.name} Gol Atar`,
        'away',
        Math.min(78, 50 + stats.away.shotsOnGoal * 5),
        `Geride ama baskı var: %${stats.away.possession} top, ${stats.away.shotsOnGoal} isabetli şut`,
        10
      ));
    }
  }
  
  return newOpportunities;
}

/**
 * Süresi dolan fırsatları temizle (5 saniye sonra)
 */
export function cleanupResolvedOpportunities(opportunities: LiveOpportunity[]): LiveOpportunity[] {
  const now = Date.now();
  const CLEANUP_DELAY = 5000; // 5 saniye göster sonra sil
  
  return opportunities.filter(opp => {
    if (opp.status === 'active') return true;
    
    // Çözülmüş fırsatları 5 sn sonra sil
    if (opp.result?.resolvedAt && now - opp.result.resolvedAt > CLEANUP_DELAY) {
      return false;
    }
    
    return true;
  });
}
