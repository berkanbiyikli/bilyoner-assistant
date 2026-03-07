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
  getCurrentSeason,
  LEAGUES,
} from "@/lib/api-football";
import type {
  FixtureResponse,
  StandingEntry,
  PredictionResponse,
  OddsResponse,
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
} from "@/types/spor-toto";
import { getCached, setCache } from "@/lib/cache";
import { format, addDays, parseISO } from "date-fns";
import { tr } from "date-fns/locale";

// Spor Toto'da genellikle yer alan lig ID'leri
const TOTO_LEAGUE_IDS = [
  203,  // Süper Lig
  204,  // 1. Lig
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

// ---- Ana Bülten Oluşturma ----

export async function buildTotoBulletin(
  targetDate?: string,
  daysAhead: number = 3
): Promise<TotoProgram> {
  const startDate = targetDate || format(new Date(), "yyyy-MM-dd");
  const cacheKey = `toto-bulletin:${startDate}:${daysAhead}`;
  const cached = getCached<TotoProgram>(cacheKey);
  if (cached) return cached;

  // Birkaç günlük maçları çek
  const allFixtures: FixtureResponse[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = format(addDays(parseISO(startDate), i), "yyyy-MM-dd");
    const fixtures = await getFixturesByDate(date);
    allFixtures.push(...fixtures);
  }

  // Sadece Spor Toto liglerindeki maçları filtrele
  const totoFixtures = allFixtures.filter((f) =>
    TOTO_LEAGUE_IDS.includes(f.league.id)
  );

  // Fixture'ları sırala: önce tarih, sonra lig önceliği
  totoFixtures.sort((a, b) => {
    const timeA = new Date(a.fixture.date).getTime();
    const timeB = new Date(b.fixture.date).getTime();
    if (timeA !== timeB) return timeA - timeB;

    const leagueA = LEAGUES.find((l) => l.id === a.league.id);
    const leagueB = LEAGUES.find((l) => l.id === b.league.id);
    return (leagueA?.priority ?? 5) - (leagueB?.priority ?? 5);
  });

  // Standing verileri (lig bazında cache)
  const standingsMap = new Map<number, StandingEntry[]>();
  const uniqueLeagueIds = [...new Set(totoFixtures.map((f) => f.league.id))];
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
    totoFixtures.map(async (fixture, index) => {
      return buildTotoMatch(fixture, index + 1, standingsMap);
    })
  );

  const weekNum = getWeekNumber(new Date(startDate));
  const endDate = format(
    addDays(parseISO(startDate), daysAhead - 1),
    "yyyy-MM-dd"
  );

  const program: TotoProgram = {
    id: `${format(new Date(startDate), "yyyy")}-W${weekNum}`,
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

// ---- Tek Maç Builder ----

async function buildTotoMatch(
  fixture: FixtureResponse,
  order: number,
  standingsMap: Map<number, StandingEntry[]>
): Promise<TotoMatch> {
  const standings = standingsMap.get(fixture.league.id) || [];

  // Paralel veri çekme (oran + tahmin)
  const [odds, prediction, h2hData] = await Promise.all([
    getOdds(fixture.fixture.id).catch(() => null),
    getPrediction(fixture.fixture.id).catch(() => null),
    getH2H(fixture.teams.home.id, fixture.teams.away.id, 10).catch(() => []),
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
    aiSummary: `Bu hafta ${n} maçlık bültende ${strongHome} net favori, ${balanced} dengeli, ${strongAway} deplasman favori maç bulunuyor.`,
    difficulty,
    expectedCorrect: Math.round(expectedCorrect * 10) / 10,
    popularPicks,
  };
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
