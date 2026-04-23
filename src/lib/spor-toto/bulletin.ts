// ============================================
// Spor Toto Bülten Builder
// API-Football verisinden Spor Toto bülteni oluşturur
// ============================================

import {
  getFixturesByDate,
  getFixturesByLeague,
  getStandings,
  getH2H,
  getOdds,
  getPrediction,
  getInjuries,
  getCurrentSeason,
  LEAGUES,
} from "@/lib/api-football";
import type {
  FixtureResponse,
  StandingEntry,
  PredictionResponse,
  OddsResponse,
  InjuryResponse,
} from "@/types/api-football";
import type {
  TotoProgram,
  TotoMatch,
  TotoTeamInfo,
  TotoMatchStats,
  TotoH2H,
  TotoH2HMatch,
  TotoOdds,
  TotoAIPrediction,
  TotoKeyFactor,
  TotoMatchStatus,
  TotoRecentMatch,
  FormResult,
  TotoSelection,
  TeamRecord,
  TotoBulletinSummary,
  TotoSurprise,
  TotoMotivation,
  TeamMotivationContext,
  TotoInjuryInfo,
} from "@/types/spor-toto";
import { getCached, setCache } from "@/lib/cache";
import { format, addDays, parseISO } from "date-fns";
import { tr } from "date-fns/locale";

// Türkiye ligleri (banko olarak kabul edilir) — sadece Süper Lig
const TR_LEAGUE_IDS = [
  203,  // Süper Lig
];

// Yabancı ligler (sürpriz adayları)
const FOREIGN_LEAGUE_IDS = [
  39,   // Premier League
  140,  // La Liga
  135,  // Serie A
  78,   // Bundesliga
  61,   // Ligue 1
  94,   // Primeira Liga
  88,   // Eredivisie
  2,    // Champions League
  3,    // Europa League
  848,  // Conference League
];

const TOTO_LEAGUE_IDS = [...TR_LEAGUE_IDS, ...FOREIGN_LEAGUE_IDS];

// Spor Toto bülten boyutu (9 TR banko + 6 yabancı sürpriz = 15)
const MAX_TR_MATCHES = 9;
const MAX_FOREIGN_MATCHES = 6;
const MAX_TOTAL_MATCHES = 15;

// ---- Hafta Aralığı Hesabı (Cuma-Pazartesi) ----

/**
 * Verilen tarihe göre Spor Toto haftasının başlangıç tarihini (Cuma) bulur.
 * Bülten genelde Cumadan başlar Pazartesi biter.
 */
function getTotoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  // Cuma'ya en yakın geçmiş tarih (veya bugün)
  let diff: number;
  if (day === 5) diff = 0;             // Cuma
  else if (day === 6) diff = -1;       // Cumartesi → 1 gün geri
  else if (day === 0) diff = -2;       // Pazar → 2 gün geri
  else if (day === 1) diff = -3;       // Pazartesi → 3 gün geri
  else diff = (5 - day);               // Sal/Çar/Per → ileri Cuma'ya
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---- Ana Bülten Oluşturma ----

export async function buildTotoBulletin(
  targetDate?: string,
  daysAhead: number = 4, // Cuma-Pazartesi = 4 gün
  foreignFixtureIds?: number[] // Kullanıcının seçtiği 6 yabancı maç
): Promise<TotoProgram> {
  // Hafta başlangıcını Cuma'ya hizala
  const baseDate = targetDate ? parseISO(targetDate) : new Date();
  const weekStart = getTotoWeekStart(baseDate);
  const startDate = format(weekStart, "yyyy-MM-dd");

  const sortedForeignKey = foreignFixtureIds && foreignFixtureIds.length
    ? `:fids=${[...foreignFixtureIds].sort().join(",")}`
    : "";
  const cacheKey = `toto-bulletin:v2:${startDate}:${daysAhead}${sortedForeignKey}`;
  const cached = getCached<TotoProgram>(cacheKey);
  if (cached) return cached;

  // Cuma-Pazartesi arası maçları çek
  const allFixtures: FixtureResponse[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = format(addDays(weekStart, i), "yyyy-MM-dd");
    const fixtures = await getFixturesByDate(date);
    allFixtures.push(...fixtures);
  }

  // Toto liglerindeki maçları filtrele
  const totoFixtures = allFixtures.filter((f) =>
    TOTO_LEAGUE_IDS.includes(f.league.id)
  );

  // TR vs yabancı ayır
  const trFixtures = totoFixtures.filter((f) =>
    TR_LEAGUE_IDS.includes(f.league.id)
  );
  const foreignFixtures = totoFixtures.filter((f) =>
    FOREIGN_LEAGUE_IDS.includes(f.league.id)
  );

  // Tarihe göre sırala
  const sortByTime = (a: FixtureResponse, b: FixtureResponse) =>
    new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime();
  trFixtures.sort(sortByTime);

  // Yabancı maçları lig önceliği + tarih ile sırala (önemli ligler öncelik)
  foreignFixtures.sort((a, b) => {
    const leagueA = LEAGUES.find((l) => l.id === a.league.id);
    const leagueB = LEAGUES.find((l) => l.id === b.league.id);
    const prDiff = (leagueA?.priority ?? 5) - (leagueB?.priority ?? 5);
    if (prDiff !== 0) return prDiff;
    return sortByTime(a, b);
  });

  // 9 TR + 6 yabancı = 15 maç
  // Eğer kullanıcı yabancı maçları belirttiyse onları kullan, yoksa otomatik seç
  const selectedTR = trFixtures.slice(0, MAX_TR_MATCHES);
  const trShortfall = MAX_TR_MATCHES - selectedTR.length;
  const foreignSlots = MAX_FOREIGN_MATCHES + Math.max(0, trShortfall);

  let selectedForeign: FixtureResponse[];
  if (foreignFixtureIds && foreignFixtureIds.length > 0) {
    const idSet = new Set(foreignFixtureIds);
    const userPicked = foreignFixtures.filter((f) => idSet.has(f.fixture.id));
    // Kullanıcı seçimi 6'dan az ise otomatik tamamla
    const remaining = foreignFixtures.filter((f) => !idSet.has(f.fixture.id));
    const fillCount = Math.max(0, foreignSlots - userPicked.length);
    selectedForeign = [...userPicked, ...remaining.slice(0, fillCount)];
  } else {
    selectedForeign = foreignFixtures.slice(0, foreignSlots);
  }

  const selected = [...selectedTR, ...selectedForeign].slice(0, MAX_TOTAL_MATCHES);

  // Bilyoner sırası: TR önce (kendi içinde tarihe göre), sonra yabancılar
  // (lig grubunda + kendi içinde tarihe göre). selectedTR ve selectedForeign
  // zaten yukarıda sıralandığı için ek sıralamaya gerek yok.

  // Standing verileri
  const standingsMap = new Map<number, StandingEntry[]>();
  const uniqueLeagueIds = [...new Set(selected.map((f) => f.league.id))];
  const season = getCurrentSeason();

  await Promise.all(
    uniqueLeagueIds.map(async (leagueId) => {
      try {
        const standings = await getStandings(leagueId, season);
        if (standings?.league?.standings?.[0]) {
          standingsMap.set(leagueId, standings.league.standings[0]);
        }
      } catch {
        // Standings bulunamazsa devam et
      }
    })
  );

  // Maçları Toto formatına dönüştür
  const matches: TotoMatch[] = await Promise.all(
    selected.map(async (fixture, index) => {
      const tier: TotoMatch["totoTier"] = TR_LEAGUE_IDS.includes(fixture.league.id)
        ? "tr_banko"
        : "foreign_surprise";
      return buildTotoMatch(fixture, index + 1, standingsMap, tier);
    })
  );

  const weekNum = getWeekNumber(weekStart);
  const endDate = format(addDays(weekStart, daysAhead - 1), "yyyy-MM-dd");

  const program: TotoProgram = {
    id: `${format(weekStart, "yyyy")}-W${weekNum}`,
    name: `${weekNum}. Hafta Bülteni`,
    week: weekNum,
    season: `${season}-${season + 1}`,
    startDate,
    endDate,
    deadline: `${startDate}T12:00:00Z`,
    matches,
    status: "open",
    totalMatches: matches.length,
    createdAt: new Date().toISOString(),
  };

  setCache(cacheKey, program, 600); // 10 dk cache
  return program;
}

// ---- Yabancı Maç Adayları (kullanıcı seçimi için) ----

export interface ForeignCandidate {
  fixtureId: number;
  league: { id: number; name: string; country: string; logo: string; flag?: string | null };
  kickoff: string;
  homeTeam: { id: number; name: string; logo: string };
  awayTeam: { id: number; name: string; logo: string };
}

export async function getForeignCandidates(
  targetDate?: string,
  daysAhead: number = 4
): Promise<{ startDate: string; endDate: string; candidates: ForeignCandidate[] }> {
  const baseDate = targetDate ? parseISO(targetDate) : new Date();
  const weekStart = getTotoWeekStart(baseDate);
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(addDays(weekStart, daysAhead - 1), "yyyy-MM-dd");

  const cacheKey = `toto-foreign-candidates:${startDate}:${daysAhead}`;
  const cached = getCached<{ startDate: string; endDate: string; candidates: ForeignCandidate[] }>(cacheKey);
  if (cached) return cached;

  const all: FixtureResponse[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = format(addDays(weekStart, i), "yyyy-MM-dd");
    const fixtures = await getFixturesByDate(date);
    all.push(...fixtures);
  }

  const foreign = all.filter((f) => FOREIGN_LEAGUE_IDS.includes(f.league.id));

  // Lig önceliği + tarih sırası
  foreign.sort((a, b) => {
    const lA = LEAGUES.find((l) => l.id === a.league.id);
    const lB = LEAGUES.find((l) => l.id === b.league.id);
    const prDiff = (lA?.priority ?? 5) - (lB?.priority ?? 5);
    if (prDiff !== 0) return prDiff;
    return new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime();
  });

  const candidates: ForeignCandidate[] = foreign.map((f) => ({
    fixtureId: f.fixture.id,
    league: {
      id: f.league.id,
      name: f.league.name,
      country: f.league.country,
      logo: f.league.logo,
      flag: f.league.flag,
    },
    kickoff: f.fixture.date,
    homeTeam: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
    awayTeam: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
  }));

  const result = { startDate, endDate, candidates };
  setCache(cacheKey, result, 600);
  return result;
}

// ---- Tek Maç Builder ----

async function buildTotoMatch(
  fixture: FixtureResponse,
  order: number,
  standingsMap: Map<number, StandingEntry[]>,
  tier: TotoMatch["totoTier"]
): Promise<TotoMatch> {
  const standings = standingsMap.get(fixture.league.id) || [];

  // Paralel veri çekme (oran + tahmin + h2h + sakat)
  const [odds, prediction, h2hData, injuriesData] = await Promise.all([
    getOdds(fixture.fixture.id).catch(() => null),
    getPrediction(fixture.fixture.id).catch(() => null),
    getH2H(fixture.teams.home.id, fixture.teams.away.id, 10).catch(() => []),
    getInjuries(fixture.fixture.id).catch(() => [] as InjuryResponse[]),
  ]);

  const homeStanding = standings.find(
    (s) => s.team.id === fixture.teams.home.id
  );
  const awayStanding = standings.find(
    (s) => s.team.id === fixture.teams.away.id
  );

  const homeTeamInfo = buildTeamInfo(
    fixture.teams.home,
    homeStanding,
    prediction?.teams?.home,
    "home"
  );
  const awayTeamInfo = buildTeamInfo(
    fixture.teams.away,
    awayStanding,
    prediction?.teams?.away,
    "away"
  );

  const totoOdds = buildOdds(odds);
  const h2h = buildH2H(
    h2hData,
    fixture.teams.home.id,
    fixture.teams.away.id
  );
  const matchStats = buildMatchStats(
    homeTeamInfo,
    awayTeamInfo,
    h2h,
    prediction,
    totoOdds
  );
  const aiPrediction = buildAIPrediction(
    homeTeamInfo,
    awayTeamInfo,
    matchStats,
    totoOdds,
    prediction
  );

  // Yeni: motivasyon, sürpriz, sakat
  const motivation = buildMotivation(
    homeTeamInfo,
    awayTeamInfo,
    homeStanding,
    awayStanding,
    standings
  );
  const injuries = buildInjuries(
    injuriesData,
    fixture.teams.home.id,
    fixture.teams.away.id
  );
  const surprise = buildSurprise(
    homeTeamInfo,
    awayTeamInfo,
    matchStats,
    totoOdds,
    aiPrediction,
    motivation,
    injuries,
    h2h
  );

  const leagueConfig = LEAGUES.find((l) => l.id === fixture.league.id);

  return {
    id: `toto-${fixture.fixture.id}`,
    bulletinOrder: order,
    fixtureId: fixture.fixture.id,
    mbs: calculateMBS(totoOdds, matchStats),
    homeTeam: homeTeamInfo,
    awayTeam: awayTeamInfo,
    league: {
      id: fixture.league.id,
      name: fixture.league.name,
      country: fixture.league.country,
      flag: leagueConfig?.flag || "🏳️",
      logo: fixture.league.logo,
    },
    kickoff: fixture.fixture.date,
    status: mapFixtureStatus(fixture.fixture.status.short),
    elapsed: fixture.fixture.status.elapsed ?? undefined,
    score: fixture.goals,
    odds: totoOdds,
    stats: matchStats,
    aiPrediction,
    totoTier: tier,
    surprise,
    motivation,
    injuries,
    refereeName: fixture.fixture.referee || undefined,
    result:
      fixture.fixture.status.short === "FT"
        ? getMatchResult(fixture.goals)
        : undefined,
  };
}

// ---- Takım Bilgisi Builder ----

function buildTeamInfo(
  team: { id: number; name: string; logo: string },
  standing: StandingEntry | undefined,
  predTeam: PredictionResponse["teams"]["home"] | undefined,
  side: "home" | "away"
): TotoTeamInfo {
  const form = parseForm(standing?.form || predTeam?.last_5?.form || "");
  const formPoints =
    form.length > 0
      ? (form.reduce(
          (sum, r) => sum + (r === "W" ? 3 : r === "D" ? 1 : 0),
          0
        ) /
          (form.length * 3)) *
        100
      : 50;

  const stats = side === "home" ? standing?.home : standing?.away;
  const allStats = standing?.all;
  const played = allStats?.played || 0;
  const goalsFor = allStats?.goals?.for || 0;
  const goalsAgainst = allStats?.goals?.against || 0;

  // Gol dağılımı (prediction API'den)
  const goalMinutes = predTeam?.league?.goals?.for?.minute || {};
  const goalsByPeriod = {
    "0-15": parsePercentage(goalMinutes["0-15"]?.percentage),
    "16-30": parsePercentage(goalMinutes["16-30"]?.percentage),
    "31-45": parsePercentage(goalMinutes["31-45"]?.percentage),
    "46-60": parsePercentage(goalMinutes["46-60"]?.percentage),
    "61-75": parsePercentage(goalMinutes["61-75"]?.percentage),
    "76-90": parsePercentage(goalMinutes["76-90"]?.percentage),
  };

  // Clean sheet & failed to score
  const cleanSheet = predTeam?.league?.clean_sheet || {};
  const failedToScore = predTeam?.league?.failed_to_score || {};
  const totalCleanSheet = Object.values(cleanSheet).reduce(
    (s: number, v) => s + (typeof v === "number" ? v : 0),
    0
  );
  const totalFailedToScore = Object.values(failedToScore).reduce(
    (s: number, v) => s + (typeof v === "number" ? v : 0),
    0
  );

  const homeRecord: TeamRecord | undefined = standing?.home
    ? {
        played: standing.home.played,
        won: standing.home.win,
        drawn: standing.home.draw,
        lost: standing.home.lose,
        goalsFor: standing.home.goals.for,
        goalsAgainst: standing.home.goals.against,
        avgGoals:
          standing.home.played > 0
            ? standing.home.goals.for / standing.home.played
            : 0,
        avgConceded:
          standing.home.played > 0
            ? standing.home.goals.against / standing.home.played
            : 0,
        winRate:
          standing.home.played > 0
            ? (standing.home.win / standing.home.played) * 100
            : 0,
        points: standing.home.win * 3 + standing.home.draw,
      }
    : undefined;

  const awayRecord: TeamRecord | undefined = standing?.away
    ? {
        played: standing.away.played,
        won: standing.away.win,
        drawn: standing.away.draw,
        lost: standing.away.lose,
        goalsFor: standing.away.goals.for,
        goalsAgainst: standing.away.goals.against,
        avgGoals:
          standing.away.played > 0
            ? standing.away.goals.for / standing.away.played
            : 0,
        avgConceded:
          standing.away.played > 0
            ? standing.away.goals.against / standing.away.played
            : 0,
        winRate:
          standing.away.played > 0
            ? (standing.away.win / standing.away.played) * 100
            : 0,
        points: standing.away.win * 3 + standing.away.draw,
      }
    : undefined;

  // Seri hesaplama
  const formReversed = [...form].reverse();
  let winStreak = 0,
    drawStreak = 0,
    loseStreak = 0,
    unbeatenStreak = 0;
  for (const r of formReversed) {
    if (r === "W") winStreak++;
    else break;
  }
  for (const r of formReversed) {
    if (r === "D") drawStreak++;
    else break;
  }
  for (const r of formReversed) {
    if (r === "L") loseStreak++;
    else break;
  }
  for (const r of formReversed) {
    if (r !== "L") unbeatenStreak++;
    else break;
  }

  return {
    id: team.id,
    name: team.name,
    shortName: team.name.substring(0, 3).toUpperCase(),
    logo: team.logo,
    form: form.slice(0, 5),
    formPoints: Math.round(formPoints),
    lastMatches: [], // H2H'den doldurulabilir
    position: standing?.rank || 0,
    points: standing?.points || 0,
    played,
    won: allStats?.win || 0,
    drawn: allStats?.draw || 0,
    lost: allStats?.lose || 0,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    homeRecord,
    awayRecord,
    avgGoalsScored: played > 0 ? goalsFor / played : 0,
    avgGoalsConceded: played > 0 ? goalsAgainst / played : 0,
    cleanSheetPct: played > 0 ? (totalCleanSheet / played) * 100 : 0,
    failedToScorePct: played > 0 ? (totalFailedToScore / played) * 100 : 0,
    bttsRate:
      played > 0
        ? ((played - totalCleanSheet - totalFailedToScore + Math.min(totalCleanSheet, totalFailedToScore)) / played) * 100
        : 50,
    goalsByPeriod,
    streak: {
      wins: winStreak,
      draws: drawStreak,
      losses: loseStreak,
      unbeaten: unbeatenStreak,
      scoreless: 0,
      cleanSheets: 0,
    },
  };
}

// ---- Oran Builder ----

function buildOdds(oddsData: OddsResponse | null): TotoOdds {
  if (!oddsData || !oddsData.bookmakers?.length) {
    return { home: 2.0, draw: 3.2, away: 3.5 };
  }

  const bk = oddsData.bookmakers[0];
  const result: TotoOdds = { home: 2.0, draw: 3.2, away: 3.5 };

  for (const bet of bk.bets) {
    const vals = bet.values;
    switch (bet.name) {
      case "Match Winner": {
        result.home = parseFloat(vals.find((v) => v.value === "Home")?.odd || "2.0");
        result.draw = parseFloat(vals.find((v) => v.value === "Draw")?.odd || "3.2");
        result.away = parseFloat(vals.find((v) => v.value === "Away")?.odd || "3.5");
        break;
      }
      case "Goals Over/Under": {
        for (const v of vals) {
          if (v.value === "Over 1.5") result.over15 = parseFloat(v.odd);
          if (v.value === "Under 1.5") result.under15 = parseFloat(v.odd);
          if (v.value === "Over 2.5") result.over25 = parseFloat(v.odd);
          if (v.value === "Under 2.5") result.under25 = parseFloat(v.odd);
          if (v.value === "Over 3.5") result.over35 = parseFloat(v.odd);
          if (v.value === "Under 3.5") result.under35 = parseFloat(v.odd);
        }
        break;
      }
      case "Both Teams Score": {
        result.bttsYes = parseFloat(vals.find((v) => v.value === "Yes")?.odd || "0");
        result.bttsNo = parseFloat(vals.find((v) => v.value === "No")?.odd || "0");
        break;
      }
      case "First Half Winner": {
        result.htHome = parseFloat(vals.find((v) => v.value === "Home")?.odd || "0");
        result.htDraw = parseFloat(vals.find((v) => v.value === "Draw")?.odd || "0");
        result.htAway = parseFloat(vals.find((v) => v.value === "Away")?.odd || "0");
        break;
      }
    }
  }

  result.bookmaker = bk.name;
  return result;
}

// ---- H2H Builder ----

function buildH2H(
  h2hMatches: FixtureResponse[],
  homeTeamId: number,
  awayTeamId: number
): TotoH2H {
  if (!h2hMatches.length) {
    return {
      totalMatches: 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      avgGoals: 0,
      recentMatches: [],
    };
  }

  let homeWins = 0,
    draws = 0,
    awayWins = 0,
    totalGoals = 0;

  const recentMatches: TotoH2HMatch[] = h2hMatches.slice(0, 5).map((m) => {
    const hGoals = m.goals.home || 0;
    const aGoals = m.goals.away || 0;
    totalGoals += hGoals + aGoals;

    let winner: "home" | "draw" | "away";
    if (hGoals > aGoals) {
      if (m.teams.home.id === homeTeamId) homeWins++;
      else awayWins++;
      winner = m.teams.home.id === homeTeamId ? "home" : "away";
    } else if (hGoals < aGoals) {
      if (m.teams.away.id === homeTeamId) homeWins++;
      else awayWins++;
      winner = m.teams.away.id === awayTeamId ? "away" : "home";
    } else {
      draws++;
      winner = "draw";
    }

    return {
      date: m.fixture.date,
      homeTeam: m.teams.home.name,
      awayTeam: m.teams.away.name,
      score: `${hGoals}-${aGoals}`,
      winner,
    };
  });

  // Geri kalan maçları da say
  for (let i = 5; i < h2hMatches.length; i++) {
    const m = h2hMatches[i];
    const hG = m.goals.home || 0;
    const aG = m.goals.away || 0;
    totalGoals += hG + aG;
    if (hG > aG) {
      if (m.teams.home.id === homeTeamId) homeWins++;
      else awayWins++;
    } else if (aG > hG) {
      if (m.teams.away.id === homeTeamId) homeWins++;
      else awayWins++;
    } else {
      draws++;
    }
  }

  return {
    totalMatches: h2hMatches.length,
    homeWins,
    draws,
    awayWins,
    avgGoals: h2hMatches.length > 0 ? totalGoals / h2hMatches.length : 0,
    recentMatches,
  };
}

// ---- Maç İstatistikleri Builder ----

function buildMatchStats(
  home: TotoTeamInfo,
  away: TotoTeamInfo,
  h2h: TotoH2H,
  prediction: PredictionResponse | null,
  odds: TotoOdds
): TotoMatchStats {
  // Gol istatistikleri
  const avgTotalGoals = home.avgGoalsScored + away.avgGoalsScored;
  const homeScoreRate =
    home.played > 0 ? ((home.played - (home.failedToScorePct * home.played) / 100) / home.played) * 100 : 70;
  const awayScoreRate =
    away.played > 0 ? ((away.played - (away.failedToScorePct * away.played) / 100) / away.played) * 100 : 60;

  // Üst/Alt yüzdeleri (basit Poisson yaklaşımı)
  const lambda = avgTotalGoals;
  const over15Pct = Math.min(95, Math.max(20, (1 - poissonCDF(1, lambda)) * 100));
  const over25Pct = Math.min(90, Math.max(15, (1 - poissonCDF(2, lambda)) * 100));
  const over35Pct = Math.min(85, Math.max(5, (1 - poissonCDF(3, lambda)) * 100));
  const bttsPct = Math.min(85, Math.max(15, (homeScoreRate * awayScoreRate) / 100));

  // Güç karşılaştırması
  const homeAttack = Math.min(100, Math.max(10, home.avgGoalsScored * 40 + home.formPoints * 0.3));
  const homeDefense = Math.min(100, Math.max(10, (2 - home.avgGoalsConceded) * 35 + home.cleanSheetPct * 0.3));
  const awayAttack = Math.min(100, Math.max(10, away.avgGoalsScored * 40 + away.formPoints * 0.3));
  const awayDefense = Math.min(100, Math.max(10, (2 - away.avgGoalsConceded) * 35 + away.cleanSheetPct * 0.3));

  // Olasılık hesaplama (oran tabanlı + form tabanlı blend)
  const oddsTotal = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
  const oddsHomeProb = (1 / odds.home / oddsTotal) * 100;
  const oddsDrawProb = (1 / odds.draw / oddsTotal) * 100;
  const oddsAwayProb = (1 / odds.away / oddsTotal) * 100;

  // Prediction API'den gelen yüzdeler
  const predHomeProb = prediction
    ? parseFloat(prediction.predictions.percent.home)
    : oddsHomeProb;
  const predDrawProb = prediction
    ? parseFloat(prediction.predictions.percent.draw)
    : oddsDrawProb;
  const predAwayProb = prediction
    ? parseFloat(prediction.predictions.percent.away)
    : oddsAwayProb;

  // Blend (oran %60 + prediction %40)
  const homeWinProb = Math.round(oddsHomeProb * 0.6 + predHomeProb * 0.4);
  const drawProb = Math.round(oddsDrawProb * 0.6 + predDrawProb * 0.4);
  const awayWinProb = Math.round(100 - homeWinProb - drawProb);

  // Kilit faktörler
  const keyFactors = buildKeyFactors(home, away, h2h, odds);

  return {
    h2h,
    goalStats: {
      avgTotalGoals: Math.round(avgTotalGoals * 100) / 100,
      over15Pct: Math.round(over15Pct),
      over25Pct: Math.round(over25Pct),
      over35Pct: Math.round(over35Pct),
      bttsPct: Math.round(bttsPct),
      homeScoredPct: Math.round(homeScoreRate),
      awayScoredPct: Math.round(awayScoreRate),
    },
    powerComparison: {
      homeAttack: Math.round(homeAttack),
      homeDefense: Math.round(homeDefense),
      awayAttack: Math.round(awayAttack),
      awayDefense: Math.round(awayDefense),
    },
    probabilities: {
      homeWin: homeWinProb,
      draw: drawProb,
      awayWin: awayWinProb,
      over25: Math.round(over25Pct),
      btts: Math.round(bttsPct),
    },
    keyFactors,
  };
}

// ---- Kilit Faktörler Builder ----

function buildKeyFactors(
  home: TotoTeamInfo,
  away: TotoTeamInfo,
  h2h: TotoH2H,
  odds: TotoOdds
): TotoKeyFactor[] {
  const factors: TotoKeyFactor[] = [];

  // Form avantajı
  if (home.formPoints >= 80) {
    factors.push({
      type: "positive",
      icon: "Flame",
      title: "Ev sahibi mükemmel formda",
      description: `${home.name} son 5 maçta ${home.form.filter((f) => f === "W").length} galibiyet aldı`,
      impactLevel: "high",
      affectsTeam: "home",
    });
  }
  if (away.formPoints >= 80) {
    factors.push({
      type: "positive",
      icon: "Flame",
      title: "Deplasman mükemmel formda",
      description: `${away.name} son 5 maçta ${away.form.filter((f) => f === "W").length} galibiyet aldı`,
      impactLevel: "high",
      affectsTeam: "away",
    });
  }
  if (home.formPoints <= 25) {
    factors.push({
      type: "negative",
      icon: "TrendingDown",
      title: "Ev sahibi kötü formda",
      description: `${home.name} son 5 maçta yalnızca ${Math.round((home.formPoints / 100) * 15)} puan topladı`,
      impactLevel: "high",
      affectsTeam: "home",
    });
  }
  if (away.formPoints <= 25) {
    factors.push({
      type: "negative",
      icon: "TrendingDown",
      title: "Deplasman kötü formda",
      description: `${away.name} son 5 maçta yalnızca ${Math.round((away.formPoints / 100) * 15)} puan topladı`,
      impactLevel: "high",
      affectsTeam: "away",
    });
  }

  // Gol istatistikleri
  const totalAvgGoals = home.avgGoalsScored + away.avgGoalsScored;
  if (totalAvgGoals >= 3.0) {
    factors.push({
      type: "positive",
      icon: "Zap",
      title: "Gol zengini maç beklentisi",
      description: `İki takımın toplam gol ortalaması ${totalAvgGoals.toFixed(1)} — Üst 2.5 güçlü`,
      impactLevel: "medium",
      affectsTeam: "both",
    });
  }
  if (totalAvgGoals <= 1.8) {
    factors.push({
      type: "neutral",
      icon: "Shield",
      title: "Düşük skorlu maç beklentisi",
      description: `İki takımın toplam gol ortalaması ${totalAvgGoals.toFixed(1)} — Alt 2.5 güçlü`,
      impactLevel: "medium",
      affectsTeam: "both",
    });
  }

  // H2H avantajı
  if (h2h.totalMatches >= 3) {
    if (h2h.homeWins > h2h.awayWins + 2) {
      factors.push({
        type: "positive",
        icon: "History",
        title: "H2H'de ev sahibi baskın",
        description: `Son ${h2h.totalMatches} maçta: ${h2h.homeWins}G ${h2h.draws}B ${h2h.awayWins}M`,
        impactLevel: "medium",
        affectsTeam: "home",
      });
    } else if (h2h.awayWins > h2h.homeWins + 2) {
      factors.push({
        type: "positive",
        icon: "History",
        title: "H2H'de deplasman baskın",
        description: `Son ${h2h.totalMatches} maçta: ${h2h.homeWins}G ${h2h.draws}B ${h2h.awayWins}M`,
        impactLevel: "medium",
        affectsTeam: "away",
      });
    }
  }

  // Ev sahibi avantajı
  if (home.homeRecord && home.homeRecord.winRate >= 70) {
    factors.push({
      type: "positive",
      icon: "Home",
      title: "Güçlü iç saha performansı",
      description: `${home.name} evinde %${Math.round(home.homeRecord.winRate)} kazanma oranı`,
      impactLevel: "high",
      affectsTeam: "home",
    });
  }

  // Deplasman açığı
  if (away.awayRecord && away.awayRecord.winRate <= 20) {
    factors.push({
      type: "warning",
      icon: "AlertTriangle",
      title: "Deplasman zayıf dış saha",
      description: `${away.name} deplasmanda %${Math.round(away.awayRecord.winRate)} kazanma oranı`,
      impactLevel: "medium",
      affectsTeam: "away",
    });
  }

  // Galibiyet/yenilgi serisi
  if (home.streak.wins >= 3) {
    factors.push({
      type: "positive",
      icon: "Trophy",
      title: `${home.streak.wins} maçlık galibiyet serisi`,
      description: `${home.name} üst üste ${home.streak.wins} maç kazandı`,
      impactLevel: "high",
      affectsTeam: "home",
    });
  }
  if (away.streak.wins >= 3) {
    factors.push({
      type: "positive",
      icon: "Trophy",
      title: `${away.streak.wins} maçlık galibiyet serisi`,
      description: `${away.name} üst üste ${away.streak.wins} maç kazandı`,
      impactLevel: "high",
      affectsTeam: "away",
    });
  }
  if (home.streak.losses >= 3) {
    factors.push({
      type: "warning",
      icon: "AlertCircle",
      title: `${home.streak.losses} maçlık yenilgi serisi`,
      description: `${home.name} üst üste ${home.streak.losses} maç kaybetti`,
      impactLevel: "high",
      affectsTeam: "home",
    });
  }

  // Sıralama farkı
  if (home.position > 0 && away.position > 0) {
    const diff = away.position - home.position;
    if (diff >= 8) {
      factors.push({
        type: "positive",
        icon: "ArrowUp",
        title: "Büyük sıralama farkı (Ev sahibi lehine)",
        description: `${home.name} (${home.position}.) vs ${away.name} (${away.position}.) — ${diff} sıra fark`,
        impactLevel: "medium",
        affectsTeam: "home",
      });
    } else if (diff <= -8) {
      factors.push({
        type: "positive",
        icon: "ArrowUp",
        title: "Büyük sıralama farkı (Deplasman lehine)",
        description: `${away.name} (${away.position}.) vs ${home.name} (${home.position}.) — ${Math.abs(diff)} sıra fark`,
        impactLevel: "medium",
        affectsTeam: "away",
      });
    }
  }

  // KG oranı yüksekse
  if (home.bttsRate >= 65 && away.bttsRate >= 65) {
    factors.push({
      type: "neutral",
      icon: "Target",
      title: "Yüksek KG Var potansiyeli",
      description: `Her iki takımın KG Var oranı %65+`,
      impactLevel: "medium",
      affectsTeam: "both",
    });
  }

  return factors;
}

// ---- AI Tahmin Builder ----

function buildAIPrediction(
  home: TotoTeamInfo,
  away: TotoTeamInfo,
  stats: TotoMatchStats,
  odds: TotoOdds,
  prediction: PredictionResponse | null
): TotoAIPrediction {
  const probs = stats.probabilities;
  let recommendation: TotoSelection;
  let confidence: number;
  let reasoning: string;
  let riskLevel: "low" | "medium" | "high";

  // En yüksek olasılığı bul
  const maxProb = Math.max(probs.homeWin, probs.draw, probs.awayWin);

  if (probs.homeWin === maxProb) {
    recommendation = "1";
    confidence = Math.min(95, probs.homeWin);
    reasoning = `${home.name} ev sahibi avantajıyla %${probs.homeWin} olasılıkla favori`;

    if (home.formPoints >= 70) reasoning += `. İyi formda (${home.form.join("")})`;
    if (home.homeRecord && home.homeRecord.winRate >= 60) {
      reasoning += `. Evinde %${Math.round(home.homeRecord.winRate)} kazanma oranı`;
    }
  } else if (probs.awayWin === maxProb) {
    recommendation = "2";
    confidence = Math.min(95, probs.awayWin);
    reasoning = `${away.name} deplasmanla birlikte %${probs.awayWin} olasılıkla favori`;

    if (away.formPoints >= 70) reasoning += `. İyi formda (${away.form.join("")})`;
  } else {
    recommendation = "0";
    confidence = Math.min(85, probs.draw + 10);
    reasoning = `Dengeli maç, beraberlik olasılığı %${probs.draw}`;
  }

  // Güven seviyesine göre risk
  if (confidence >= 65) riskLevel = "low";
  else if (confidence >= 45) riskLevel = "medium";
  else riskLevel = "high";

  // Alternatif tahmin
  let alternativePick: TotoSelection | undefined;
  let alternativeReason: string | undefined;
  if (recommendation === "1" && probs.draw > probs.awayWin) {
    alternativePick = "0";
    alternativeReason = `Beraberlik ihtimali de %${probs.draw} ile yüksek`;
  } else if (recommendation === "2" && probs.draw > probs.homeWin) {
    alternativePick = "0";
    alternativeReason = `Beraberlik ihtimali %${probs.draw} ile göz ardı edilmemeli`;
  } else if (recommendation === "0") {
    alternativePick = probs.homeWin >= probs.awayWin ? "1" : "2";
    alternativeReason =
      alternativePick === "1"
        ? `Ev sahibi galibiyeti %${probs.homeWin}`
        : `Deplasman galibiyeti %${probs.awayWin}`;
  }

  // Score tahmini
  const apiScorePred = prediction?.predictions?.goals;
  const predictedScore = apiScorePred
    ? `${apiScorePred.home}-${apiScorePred.away}`
    : undefined;

  return {
    recommendation,
    confidence: Math.round(confidence),
    reasoning,
    riskLevel,
    alternativePick,
    alternativeReason,
    predictedScore,
  };
}

// ---- Bülten Özeti ----

export function buildBulletinSummary(program: TotoProgram): TotoBulletinSummary {
  const matches = program.matches;
  const leagueMap = new Map<string, { count: number; flag: string }>();

  let totalHome = 0,
    totalDraw = 0,
    totalAway = 0;
  let strongHome = 0,
    balanced = 0,
    strongAway = 0;

  for (const match of matches) {
    // Lig dağılımı
    const key = match.league.name;
    const existing = leagueMap.get(key) || { count: 0, flag: match.league.flag };
    existing.count++;
    leagueMap.set(key, existing);

    // Oran ortalaması
    totalHome += match.odds.home;
    totalDraw += match.odds.draw;
    totalAway += match.odds.away;

    // Dağılım
    const prob = match.stats.probabilities;
    if (prob.homeWin >= 60) strongHome++;
    else if (prob.awayWin >= 60) strongAway++;
    else balanced++;
  }

  const n = matches.length || 1;

  // Zorluk
  const balancedRatio = balanced / n;
  let difficulty: TotoBulletinSummary["difficulty"];
  if (balancedRatio >= 0.6) difficulty = "very_hard";
  else if (balancedRatio >= 0.4) difficulty = "hard";
  else if (balancedRatio >= 0.25) difficulty = "medium";
  else difficulty = "easy";

  // AI popüler pickler
  const popularPicks = matches
    .filter((m) => m.aiPrediction && m.aiPrediction.confidence >= 60)
    .sort((a, b) => (b.aiPrediction?.confidence || 0) - (a.aiPrediction?.confidence || 0))
    .slice(0, 5)
    .map((m) => ({
      matchId: m.id,
      pick: m.aiPrediction!.recommendation,
      reason: m.aiPrediction!.reasoning,
    }));

  // Beklenen doğru tahmin
  const expectedCorrect = matches.reduce((sum, m) => {
    const maxProb = Math.max(
      m.stats.probabilities.homeWin,
      m.stats.probabilities.draw,
      m.stats.probabilities.awayWin
    );
    return sum + maxProb / 100;
  }, 0);

  return {
    totalMatches: matches.length,
    matchesByLeague: Array.from(leagueMap.entries())
      .map(([league, data]) => ({
        league,
        count: data.count,
        flag: data.flag,
      }))
      .sort((a, b) => b.count - a.count),
    averageOdds: {
      home: Math.round((totalHome / n) * 100) / 100,
      draw: Math.round((totalDraw / n) * 100) / 100,
      away: Math.round((totalAway / n) * 100) / 100,
    },
    distribution: { strongHome, balanced, strongAway },
    aiSummary: buildSummaryNarrative(matches, strongHome, balanced, strongAway),
    difficulty,
    expectedCorrect: Math.round(expectedCorrect * 10) / 10,
    popularPicks,
    bankoCandidates: buildBankoCandidates(matches),
    surpriseAlerts: buildSurpriseAlerts(matches),
    doubleChanceCandidates: buildDoubleChanceCandidates(matches),
    tierBreakdown: {
      trBanko: matches.filter((m) => m.totoTier === "tr_banko").length,
      foreignSurprise: matches.filter((m) => m.totoTier === "foreign_surprise").length,
    },
  };
}

// ---- Banko Adayları (yüksek güven + düşük sürpriz) ----
function buildBankoCandidates(matches: TotoMatch[]) {
  return matches
    .filter(
      (m) =>
        m.aiPrediction &&
        m.aiPrediction.confidence >= 65 &&
        m.surprise.level !== "high" &&
        m.surprise.level !== "extreme"
    )
    .sort((a, b) => {
      // Önce TR ligler, sonra güvene göre
      if (a.totoTier !== b.totoTier) {
        return a.totoTier === "tr_banko" ? -1 : 1;
      }
      return (b.aiPrediction!.confidence) - (a.aiPrediction!.confidence);
    })
    .slice(0, 9)
    .map((m) => ({
      matchId: m.id,
      pick: m.aiPrediction!.recommendation,
      confidence: m.aiPrediction!.confidence,
      reason: m.aiPrediction!.reasoning,
    }));
}

// ---- Sürpriz Alarmları ----
function buildSurpriseAlerts(matches: TotoMatch[]) {
  return matches
    .filter((m) => m.surprise.level === "high" || m.surprise.level === "extreme")
    .sort((a, b) => b.surprise.score - a.surprise.score)
    .map((m) => ({
      matchId: m.id,
      favoritePick: m.aiPrediction?.recommendation || "1",
      upsetPick: m.surprise.upsetPick || (m.aiPrediction?.recommendation === "1" ? "2" : "1"),
      reason: m.surprise.reasons.join(" · ") || "Yüksek sürpriz potansiyeli",
      surpriseScore: m.surprise.score,
    }));
}

// ---- Çift Şans Adayları (1X, X2, 12) ----
function buildDoubleChanceCandidates(matches: TotoMatch[]) {
  return matches
    .filter((m) => {
      const probs = m.stats.probabilities;
      const max = Math.max(probs.homeWin, probs.draw, probs.awayWin);
      // Hiçbir seçenek %50'yi geçmiyorsa çift şans öner
      return max < 50 && max >= 35;
    })
    .map((m) => {
      const probs = m.stats.probabilities;
      // En düşük olasılığı çıkar
      let picks: TotoSelection[];
      let reason: string;
      if (probs.awayWin <= probs.homeWin && probs.awayWin <= probs.draw) {
        picks = ["1", "0"];
        reason = `Ev sahibi+beraberlik %${probs.homeWin + probs.draw} — deplasman zayıf`;
      } else if (probs.homeWin <= probs.awayWin && probs.homeWin <= probs.draw) {
        picks = ["0", "2"];
        reason = `Beraberlik+deplasman %${probs.draw + probs.awayWin} — ev sahibi zayıf`;
      } else {
        picks = ["1", "2"];
        reason = `Ev+deplasman %${probs.homeWin + probs.awayWin} — beraberlik düşük`;
      }
      return { matchId: m.id, picks, reason };
    });
}

// ---- Anlatımsal Özet ----
function buildSummaryNarrative(
  matches: TotoMatch[],
  strongHome: number,
  balanced: number,
  strongAway: number
): string {
  const n = matches.length || 1;
  const surpriseCount = matches.filter(
    (m) => m.surprise.level === "high" || m.surprise.level === "extreme"
  ).length;
  const bankoCount = matches.filter(
    (m) =>
      m.aiPrediction &&
      m.aiPrediction.confidence >= 65 &&
      m.surprise.level !== "high" &&
      m.surprise.level !== "extreme"
  ).length;
  const trCount = matches.filter((m) => m.totoTier === "tr_banko").length;

  const parts = [
    `Bu haftaki ${n} maçlık bültende ${trCount} TR ligi maçı var.`,
    `${bankoCount} maç banko adayı, ${surpriseCount} maçta sürpriz potansiyeli yüksek.`,
    `${strongHome} net ev sahibi favorisi, ${balanced} dengeli, ${strongAway} net deplasman favorisi.`,
  ];

  if (surpriseCount >= 4) {
    parts.push("⚠️ Sürpriz oranı yüksek — az kolonlu kupon riskli olabilir, çift şans değerlendirin.");
  } else if (bankoCount >= 10) {
    parts.push("✅ Banko bol — 1-2 kolonlu sıkı kupon mümkün.");
  }

  return parts.join(" ");
}

// ---- Yardımcı Fonksiyonlar ----

function parseForm(formStr: string): FormResult[] {
  if (!formStr) return [];
  return formStr
    .split("")
    .filter((c) => "WDL".includes(c))
    .map((c) => c as FormResult);
}

function parsePercentage(pct: string | null | undefined): number {
  if (!pct) return 0;
  return parseFloat(pct.replace("%", "")) || 0;
}

function mapFixtureStatus(status: string): TotoMatchStatus {
  switch (status) {
    case "NS":
      return "scheduled";
    case "1H":
    case "2H":
    case "ET":
      return "live";
    case "HT":
      return "halftime";
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function getMatchResult(goals: { home: number | null; away: number | null }): TotoSelection | undefined {
  if (goals.home === null || goals.away === null) return undefined;
  if (goals.home > goals.away) return "1";
  if (goals.home < goals.away) return "2";
  return "0";
}

function calculateMBS(odds: TotoOdds, stats: TotoMatchStats): number {
  // MBS (Minimum Bahis Sayısı) hesaplama
  const maxProb = Math.max(
    stats.probabilities.homeWin,
    stats.probabilities.draw,
    stats.probabilities.awayWin
  );
  if (maxProb >= 70) return 1; // Çok net maç
  if (maxProb >= 55) return 2; // Orta kesinlikte
  return 3; // Dengeli maç
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function poissonCDF(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += (Math.pow(lambda, i) * Math.exp(-lambda)) / factorial(i);
  }
  return sum;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// ============================================
// Motivasyon Analizi
// ============================================

function buildMotivation(
  home: TotoTeamInfo,
  away: TotoTeamInfo,
  homeStanding: StandingEntry | undefined,
  awayStanding: StandingEntry | undefined,
  allStandings: StandingEntry[]
): TotoMotivation {
  const totalTeams = allStandings.length || 20;
  const homeContext = analyzeTeamMotivation(home, homeStanding, totalTeams, allStandings);
  const awayContext = analyzeTeamMotivation(away, awayStanding, totalTeams, allStandings);

  // Motivasyon yoğunluğu
  const urgencyScore = (urg: TeamMotivationContext["urgency"]) =>
    urg === "critical" ? 3 : urg === "high" ? 2 : urg === "medium" ? 1 : 0;
  const total = urgencyScore(homeContext.urgency) + urgencyScore(awayContext.urgency);
  const intensity: TotoMotivation["intensity"] =
    total >= 4 ? "high" : total >= 2 ? "medium" : "low";

  // Özet
  let summary = "";
  if (homeContext.status === "relegation_battle" && awayContext.status === "relegation_battle") {
    summary = "🔥 Dipte 6 puanlık maç — iki takım da düşme korkusuyla mücadele edecek.";
  } else if (homeContext.status === "title_race" && awayContext.status === "title_race") {
    summary = "🏆 Şampiyonluk yarışı — iki taraf da puan kaybını kaldıramaz.";
  } else if (homeContext.urgency === "critical" || awayContext.urgency === "critical") {
    const critical = homeContext.urgency === "critical" ? home.name : away.name;
    summary = `⚠️ ${critical} için kritik maç — ${homeContext.urgency === "critical" ? homeContext.label.toLowerCase() : awayContext.label.toLowerCase()}`;
  } else if (homeContext.status === "relegated_safe" && awayContext.status === "relegated_safe") {
    summary = "💤 Garanti kalan iki takım — motivasyon düşük olabilir.";
  } else {
    summary = `${home.name}: ${homeContext.label} · ${away.name}: ${awayContext.label}`;
  }

  return { homeContext, awayContext, intensity, summary };
}

function analyzeTeamMotivation(
  team: TotoTeamInfo,
  standing: StandingEntry | undefined,
  totalTeams: number,
  allStandings: StandingEntry[]
): TeamMotivationContext {
  if (!standing || standing.rank === 0) {
    return {
      status: "unknown",
      label: "Bilinmiyor",
      urgency: "low",
    };
  }

  const rank = standing.rank;
  const points = standing.points;

  // Lig dilimleri
  const titleZone = Math.max(2, Math.floor(totalTeams * 0.1));         // ilk %10
  const europeanZone = Math.max(4, Math.floor(totalTeams * 0.3));      // ilk %30
  const relegationZone = Math.max(3, Math.floor(totalTeams * 0.2));    // son %20
  const relegationStart = totalTeams - relegationZone + 1;

  // Şampiyonluk yarışı
  if (rank <= titleZone) {
    const leader = allStandings[0];
    const gap = leader ? leader.points - points : 0;
    return {
      status: "title_race",
      label: rank === 1 ? "Lider" : `Şampiyonluk yarışında (${rank}.)`,
      urgency: gap <= 6 ? "critical" : "high",
      pointsToTarget: gap > 0 ? gap : undefined,
      targetDescription: gap > 0 ? `Lidere ${gap} puan` : "Liderlik koltuğu",
    };
  }

  // Avrupa kupaları yarışı
  if (rank <= europeanZone) {
    const targetTeam = allStandings[europeanZone - 1] || allStandings[europeanZone] || allStandings[0];
    const gap = targetTeam ? targetTeam.points - points : 0;
    const aboveBoundary = rank < europeanZone;
    return {
      status: "european",
      label: aboveBoundary ? "Avrupa hattında" : "Avrupa hattı çevresinde",
      urgency: Math.abs(gap) <= 4 ? "high" : "medium",
      pointsToTarget: aboveBoundary ? undefined : gap,
      targetDescription: aboveBoundary
        ? "Avrupa kupası hattını koruyor"
        : `Avrupa hattına ${gap} puan`,
    };
  }

  // Küme düşme hattı
  if (rank >= relegationStart) {
    const safeTeam = allStandings[relegationStart - 2] || allStandings[relegationStart - 1];
    const gap = safeTeam ? safeTeam.points - points : 0;
    return {
      status: "relegation_battle",
      label: `Küme hattında (${rank}.)`,
      urgency: gap <= 3 ? "critical" : "high",
      pointsToTarget: gap > 0 ? gap : undefined,
      targetDescription: gap > 0 ? `Kalmaya ${gap} puan` : "Düşme hattının üstünde",
    };
  }

  // Küme hattının hemen üstü (3 puanlık tampon içinde)
  const safetyMargin = (allStandings[relegationStart - 1]?.points ?? points) - points;
  if (safetyMargin >= -3 && safetyMargin <= 5) {
    return {
      status: "relegation_battle",
      label: `Küme hattı çevresinde (${rank}.)`,
      urgency: "high",
      pointsToTarget: 5 - safetyMargin,
      targetDescription: "Düşme bölgesine yakın",
    };
  }

  // Mid-table
  return {
    status: "midtable",
    label: `Lig ortasında (${rank}.)`,
    urgency: "low",
  };
}

// ============================================
// Sakat / Cezalı Oyuncular
// ============================================

function buildInjuries(
  injuriesData: InjuryResponse[],
  homeTeamId: number,
  awayTeamId: number
): TotoMatch["injuries"] {
  const home: TotoInjuryInfo[] = [];
  const away: TotoInjuryInfo[] = [];

  for (const inj of injuriesData) {
    const info: TotoInjuryInfo = {
      name: inj.player.name,
      reason: inj.player.reason || "Belirtilmemiş",
      type: inj.player.type || "Missing Fixture",
      importance: classifyInjuryImportance(inj.player.reason),
    };
    if (inj.team.id === homeTeamId) home.push(info);
    else if (inj.team.id === awayTeamId) away.push(info);
  }

  // Sıralama: önce key, sonra regular
  const order = (i: TotoInjuryInfo) =>
    i.importance === "key" ? 0 : i.importance === "regular" ? 1 : 2;
  home.sort((a, b) => order(a) - order(b));
  away.sort((a, b) => order(a) - order(b));

  return {
    home,
    away,
    homeCount: home.length,
    awayCount: away.length,
  };
}

function classifyInjuryImportance(reason: string): TotoInjuryInfo["importance"] {
  const r = (reason || "").toLowerCase();
  // Kırmızı kart / ceza genelde kilit oyuncu için kritik
  if (r.includes("red card") || r.includes("suspended") || r.includes("ban")) return "key";
  // Uzun süreli sakatlıklar genelde önemli
  if (r.includes("acl") || r.includes("cruciate") || r.includes("surgery")) return "key";
  if (r.includes("muscle") || r.includes("hamstring") || r.includes("knock")) return "regular";
  return "regular";
}

// ============================================
// Sürpriz Skoru
// ============================================

function buildSurprise(
  home: TotoTeamInfo,
  away: TotoTeamInfo,
  stats: TotoMatchStats,
  odds: TotoOdds,
  ai: TotoAIPrediction,
  motivation: TotoMotivation,
  injuries: TotoMatch["injuries"],
  h2h: TotoH2H
): TotoSurprise {
  const reasons: string[] = [];
  let score = 0;

  // 1) AI güveni düşükse → temel sürpriz riski
  if (ai.confidence < 50) {
    score += 25;
    reasons.push(`AI güveni düşük (%${ai.confidence})`);
  } else if (ai.confidence < 60) {
    score += 12;
  }

  // Favori ve underdog tespiti (orana göre)
  const oddsArr: { pick: TotoSelection; odd: number }[] = [
    { pick: "1" as TotoSelection, odd: odds.home },
    { pick: "0" as TotoSelection, odd: odds.draw },
    { pick: "2" as TotoSelection, odd: odds.away },
  ].sort((a, b) => a.odd - b.odd);
  const favorite = oddsArr[0];
  const underdog = oddsArr[2];

  // 2) Underdog form patlaması
  const underdogTeam =
    underdog.pick === "1" ? home : underdog.pick === "2" ? away : null;
  const favoriteTeam =
    favorite.pick === "1" ? home : favorite.pick === "2" ? away : null;

  if (underdogTeam && underdogTeam.formPoints >= 70) {
    score += 20;
    reasons.push(`${underdogTeam.name} ateş formda (%${underdogTeam.formPoints})`);
  }

  if (favoriteTeam && favoriteTeam.formPoints <= 35) {
    score += 18;
    reasons.push(`Favori ${favoriteTeam.name} kötü formda (%${favoriteTeam.formPoints})`);
  }

  // 3) Favorinin sakatlık yükü
  const favoriteInjuries =
    favorite.pick === "1"
      ? injuries.homeCount
      : favorite.pick === "2"
        ? injuries.awayCount
        : 0;
  const keyInjuries =
    favorite.pick === "1"
      ? injuries.home.filter((i) => i.importance === "key").length
      : favorite.pick === "2"
        ? injuries.away.filter((i) => i.importance === "key").length
        : 0;

  if (keyInjuries >= 2) {
    score += 22;
    reasons.push(`Favoride ${keyInjuries} kilit eksik`);
  } else if (keyInjuries === 1 && favoriteInjuries >= 3) {
    score += 12;
    reasons.push(`Favoride kilit + toplam ${favoriteInjuries} eksik`);
  }

  // 4) H2H underdog lehine baskınsa
  if (h2h.totalMatches >= 3) {
    if (favorite.pick === "1" && h2h.awayWins > h2h.homeWins) {
      score += 12;
      reasons.push(`H2H'de deplasman üstün (${h2h.awayWins}-${h2h.homeWins})`);
    } else if (favorite.pick === "2" && h2h.homeWins > h2h.awayWins) {
      score += 12;
      reasons.push(`H2H'de ev sahibi üstün (${h2h.homeWins}-${h2h.awayWins})`);
    }
  }

  // 5) Motivasyon dengesizliği — underdog tarafının motivasyonu daha yüksekse
  const homeUrg = urgencyValue(motivation.homeContext.urgency);
  const awayUrg = urgencyValue(motivation.awayContext.urgency);
  if (favorite.pick === "1" && awayUrg > homeUrg && awayUrg >= 2) {
    score += 14;
    reasons.push(`Deplasman daha motive (${motivation.awayContext.label})`);
  } else if (favorite.pick === "2" && homeUrg > awayUrg && homeUrg >= 2) {
    score += 14;
    reasons.push(`Ev sahibi daha motive (${motivation.homeContext.label})`);
  } else if (favorite.pick !== "0" && motivation.intensity === "high") {
    score += 6;
  }

  // 6) Üç olasılık dengeliyse (hiçbiri %50'yi geçmiyorsa)
  const probs = stats.probabilities;
  const maxProb = Math.max(probs.homeWin, probs.draw, probs.awayWin);
  if (maxProb < 45) {
    score += 15;
    reasons.push("Hiçbir sonuç net favori değil");
  }

  // 7) Beraberlik olasılığı yüksekse + favori varsa → sürpriz
  if (probs.draw >= 30 && favorite.pick !== "0") {
    score += 8;
    reasons.push(`Beraberlik olasılığı yüksek (%${probs.draw})`);
  }

  // 8) Streak bozulması — uzun seri sona ererse sürpriz
  if (favoriteTeam && favoriteTeam.streak.wins >= 5) {
    score += 6;
    reasons.push(`Favori ${favoriteTeam.streak.wins} maçlık seri — düşüş normalleşebilir`);
  }

  score = Math.min(100, Math.round(score));

  let level: TotoSurprise["level"];
  if (score >= 70) level = "extreme";
  else if (score >= 50) level = "high";
  else if (score >= 30) level = "medium";
  else level = "low";

  // Sürpriz tahmin = favorinin tersi
  let upsetPick: TotoSelection | undefined;
  let upsetOdds: number | undefined;
  if (favorite.pick === "1") {
    // Underdog (deplasman) ya da beraberlik
    if (probs.draw > probs.awayWin && odds.draw <= odds.away) {
      upsetPick = "0";
      upsetOdds = odds.draw;
    } else {
      upsetPick = "2";
      upsetOdds = odds.away;
    }
  } else if (favorite.pick === "2") {
    if (probs.draw > probs.homeWin && odds.draw <= odds.home) {
      upsetPick = "0";
      upsetOdds = odds.draw;
    } else {
      upsetPick = "1";
      upsetOdds = odds.home;
    }
  } else {
    upsetPick = probs.homeWin >= probs.awayWin ? "1" : "2";
    upsetOdds = upsetPick === "1" ? odds.home : odds.away;
  }

  return { score, level, reasons, upsetPick, upsetOdds };
}

function urgencyValue(urg: TeamMotivationContext["urgency"]): number {
  return urg === "critical" ? 3 : urg === "high" ? 2 : urg === "medium" ? 1 : 0;
}
