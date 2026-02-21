// ============================================
// Prediction Engine v3
// xG, Gol Zamanlaması, Korner/Kart, Benzerlik Analizi
// ============================================

import type {
  FixtureResponse,
  PredictionResponse,
  OddsResponse,
  H2HResponse,
  InjuryResponse,
  PredictionTeam,
} from "@/types/api-football";
import type {
  MatchPrediction,
  MatchAnalysis,
  Pick,
  PickType,
  MatchOdds,
  MatchInsights,
  MonteCarloResult,
  RefereeProfile,
  GoalTimingData,
  CornerCardData,
  MatchSimilarity,
  KeyMissingPlayer,
} from "@/types";
import { getPrediction, getH2H, getOdds, getInjuries } from "@/lib/api-football";
import { getCached, setCache } from "@/lib/cache";
import { simulateMatch, getSimProbability } from "@/lib/prediction/simulator";
import { getRefereeProfile } from "@/lib/prediction/referees";
import { calculateMatchImportance, type MatchImportance } from "@/lib/prediction/importance";
import { getOptimalWeights } from "@/lib/prediction/validator";

const CACHE_TTL = 30 * 60; // 30 dakika

export async function analyzeMatch(fixture: FixtureResponse): Promise<MatchPrediction> {
  const fixtureId = fixture.fixture.id;
  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;

  // Cache kontrol
  const cacheKey = `prediction-v3-${fixtureId}`;
  const cached = getCached<MatchPrediction>(cacheKey);
  if (cached) return cached;

  // Paralel veri çekimi (tüm kaynaklardan)
  const [prediction, h2h, odds, injuries, importance] = await Promise.all([
    getPrediction(fixtureId).catch(() => null),
    getH2H(homeId, awayId, 10).catch(() => []),
    getOdds(fixtureId).catch(() => null),
    getInjuries(fixtureId).catch(() => []),
    calculateMatchImportance(fixture.league.id, homeId, awayId).catch(() => ({
      homeImportance: 1.0,
      awayImportance: 1.0,
      homeContext: "Veri yok",
      awayContext: "Veri yok",
      motivationGap: 0,
    } as MatchImportance)),
  ]);

  // Analizleri oluştur
  const keyMissingPlayers = analyzeInjuries(injuries, homeId, awayId);
  const injuryImpact = calculateInjuryImpact(keyMissingPlayers);
  const goalTiming = extractGoalTiming(prediction);
  const cornerData = extractCornerData(prediction);
  const cardData = extractCardData(prediction);
  const xgData = extractXgData(prediction);
  const similarity = findSimilarMatch(prediction, h2h);

  // Hakem profili
  const refereeProfile = getRefereeProfile(fixture.fixture.referee);

  const analysis = buildAnalysis(fixture, prediction, h2h, injuryImpact, {
    goalTiming,
    cornerData,
    cardData,
    xgData,
    similarity,
    keyMissingPlayers,
  }, refereeProfile);

  const matchOdds = extractOdds(odds);

  // Monte Carlo simülasyon (analiz + odds hazır olduktan sonra)
  // Liga bazlı ev sahibi avantajı + motivasyon çarpanı → dinamik lambda
  const simulation = simulateMatch(analysis, matchOdds, fixture.league.id, importance);
  analysis.simulation = simulation;

  // Self-calibrating ağırlıklar al (cache'li)
  const weights = await getOptimalWeights().catch(() => ({ heuristic: 0.4, sim: 0.6 }));

  const picks = generatePicks(analysis, matchOdds, prediction, fixture, weights);

  // Derinlemesine bilgiler (insights)
  const insights = buildInsights(analysis, xgData, goalTiming, keyMissingPlayers, matchOdds, importance);

  const result: MatchPrediction = {
    fixtureId,
    fixture,
    league: fixture.league,
    homeTeam: fixture.teams.home,
    awayTeam: fixture.teams.away,
    kickoff: fixture.fixture.date,
    picks: picks.sort((a, b) => b.confidence - a.confidence),
    analysis,
    odds: matchOdds,
    isLive: false,
    insights,
  };

  setCache(cacheKey, result, CACHE_TTL);
  return result;
}

// ============================================
// xG Analizi
// ============================================

interface XgData {
  homeXg: number;
  awayXg: number;
  homeActualGoals: number;
  awayActualGoals: number;
  homeXgDelta: number;
  awayXgDelta: number;
}

function extractXgData(prediction: PredictionResponse | null): XgData {
  const defaults: XgData = {
    homeXg: 1.2, awayXg: 1.0,
    homeActualGoals: 1.2, awayActualGoals: 1.0,
    homeXgDelta: 0, awayXgDelta: 0,
  };
  if (!prediction?.teams) return defaults;

  const homeTeam = prediction.teams.home;
  const awayTeam = prediction.teams.away;

  const homeGoalsFor = parseFloat(homeTeam?.last_5?.goals?.for?.average || "1.2");
  const awayGoalsFor = parseFloat(awayTeam?.last_5?.goals?.for?.average || "1.0");

  const homeAtt = parseStrength(homeTeam?.last_5?.att);
  const awayAtt = parseStrength(awayTeam?.last_5?.att);

  // xG proxy: Hücum gücü * gol verimliliği / 60 (referans)
  const homeXg = homeGoalsFor * (homeAtt / 60);
  const awayXg = awayGoalsFor * (awayAtt / 60);

  return {
    homeXg: Math.round(homeXg * 100) / 100,
    awayXg: Math.round(awayXg * 100) / 100,
    homeActualGoals: homeGoalsFor,
    awayActualGoals: awayGoalsFor,
    homeXgDelta: Math.round((homeXg - homeGoalsFor) * 100) / 100,
    awayXgDelta: Math.round((awayXg - awayGoalsFor) * 100) / 100,
  };
}

// ============================================
// Gol Zamanlaması Analizi
// ============================================

function extractGoalTiming(prediction: PredictionResponse | null): GoalTimingData {
  const defaultTiming: GoalTimingData = {
    home: { first15: 15, first45: 45, last30: 35, last15: 20 },
    away: { first15: 15, first45: 45, last30: 35, last15: 20 },
    lateGoalProb: 40,
    firstHalfGoalProb: 50,
  };
  if (!prediction?.teams) return defaultTiming;

  const parseMinuteData = (team: PredictionTeam) => {
    const minutes = team?.league?.goals?.for?.minute;
    if (!minutes) return { first15: 15, first45: 45, last30: 35, last15: 20 };

    const p = (key: string) => {
      const val = (minutes as Record<string, { total: number | null; percentage: string | null }>)[key]?.percentage;
      return val ? parseFloat(val.replace("%", "")) : 0;
    };

    return {
      first15: p("0-15"),
      first45: p("0-15") + p("16-30") + p("31-45"),
      last30: p("61-75") + p("76-90"),
      last15: p("76-90") + p("91-105"),
    };
  };

  const homeTiming = parseMinuteData(prediction.teams.home);
  const awayTiming = parseMinuteData(prediction.teams.away);

  const lateGoalProb = Math.min(85, (homeTiming.last15 + awayTiming.last15) / 2 + 10);
  const firstHalfGoalProb = Math.min(85, (homeTiming.first45 + awayTiming.first45) / 2);

  return {
    home: homeTiming,
    away: awayTiming,
    lateGoalProb: Math.round(lateGoalProb),
    firstHalfGoalProb: Math.round(firstHalfGoalProb),
  };
}

// ============================================
// Korner ve Kart Analizi
// ============================================

function extractCornerData(prediction: PredictionResponse | null): CornerCardData {
  if (!prediction?.teams) {
    return { homeAvg: 4.5, awayAvg: 4.0, totalAvg: 8.5, overProb: 50 };
  }

  const homeAtt = parseStrength(prediction.teams.home?.last_5?.att);
  const awayAtt = parseStrength(prediction.teams.away?.last_5?.att);
  const homeDef = parseStrength(prediction.teams.home?.last_5?.def);
  const awayDef = parseStrength(prediction.teams.away?.last_5?.def);

  const homeCornerAvg = 3.0 + (homeAtt / 100) * 4 + (awayDef / 100) * 1.5;
  const awayCornerAvg = 2.5 + (awayAtt / 100) * 4 + (homeDef / 100) * 1.5;
  const totalAvg = homeCornerAvg + awayCornerAvg;
  const overProb = Math.min(80, Math.max(20, (totalAvg - 8.5) * 15 + 50));

  return {
    homeAvg: Math.round(homeCornerAvg * 10) / 10,
    awayAvg: Math.round(awayCornerAvg * 10) / 10,
    totalAvg: Math.round(totalAvg * 10) / 10,
    overProb: Math.round(overProb),
  };
}

function extractCardData(prediction: PredictionResponse | null): CornerCardData {
  if (!prediction?.teams) {
    return { homeAvg: 2.0, awayAvg: 2.0, totalAvg: 4.0, overProb: 50 };
  }

  const homeCards = prediction.teams.home?.league?.cards;
  const awayCards = prediction.teams.away?.league?.cards;

  let homeTotal = 0;
  let awayTotal = 0;
  let homeMatches = 15;
  let awayMatches = 15;

  if (homeCards) {
    for (const [, minutes] of Object.entries(homeCards)) {
      if (typeof minutes === "object" && minutes !== null) {
        for (const [, data] of Object.entries(minutes as Record<string, { total: number | null }>)) {
          if (data?.total) homeTotal += data.total;
        }
      }
    }
    const fixtures = prediction.teams.home?.league?.fixtures;
    if (fixtures?.played) {
      homeMatches = (fixtures.played as unknown as Record<string, number>)?.total || 15;
    }
  }

  if (awayCards) {
    for (const [, minutes] of Object.entries(awayCards)) {
      if (typeof minutes === "object" && minutes !== null) {
        for (const [, data] of Object.entries(minutes as Record<string, { total: number | null }>)) {
          if (data?.total) awayTotal += data.total;
        }
      }
    }
    const fixtures = prediction.teams.away?.league?.fixtures;
    if (fixtures?.played) {
      awayMatches = (fixtures.played as unknown as Record<string, number>)?.total || 15;
    }
  }

  const homeAvg = homeMatches > 0 ? homeTotal / homeMatches : 2.0;
  const awayAvg = awayMatches > 0 ? awayTotal / awayMatches : 2.0;
  const totalAvg = homeAvg + awayAvg;
  const overProb = Math.min(80, Math.max(20, (totalAvg - 3.5) * 20 + 50));

  return {
    homeAvg: Math.round(homeAvg * 10) / 10,
    awayAvg: Math.round(awayAvg * 10) / 10,
    totalAvg: Math.round(totalAvg * 10) / 10,
    overProb: Math.round(overProb),
  };
}

// ============================================
// Sakatlık Analizi (Kilit Oyuncu Etkisi)
// ============================================

function analyzeInjuries(
  injuries: InjuryResponse[],
  homeId: number,
  awayId: number
): KeyMissingPlayer[] {
  if (!injuries || injuries.length === 0) return [];

  const keyPlayers: KeyMissingPlayer[] = [];

  for (const injury of injuries) {
    const team: "home" | "away" = injury.team.id === homeId ? "home" : "away";
    const pos = injury.player.type || "Unknown";

    let impactLevel: "critical" | "high" | "medium" = "medium";
    let position = "MID";

    const posLower = pos.toLowerCase();
    if (posLower.includes("goalkeeper") || posLower === "g") {
      position = "GK";
      impactLevel = "critical";
    } else if (posLower.includes("defender") || posLower === "d") {
      position = "DEF";
      impactLevel = "high";
    } else if (posLower.includes("midfielder") || posLower === "m") {
      position = "MID";
      impactLevel = "high";
    } else if (posLower.includes("attacker") || posLower.includes("forward") || posLower === "f") {
      position = "FWD";
      impactLevel = "critical";
    }

    keyPlayers.push({
      name: injury.player.name,
      team,
      position,
      reason: injury.player.reason || "Belirsiz",
      impactLevel,
    });
  }

  return keyPlayers;
}

function calculateInjuryImpact(keyMissing: KeyMissingPlayer[]): { home: number; away: number } {
  if (keyMissing.length === 0) return { home: 0, away: 0 };

  let homeImpact = 0;
  let awayImpact = 0;

  for (const player of keyMissing) {
    const weight = player.impactLevel === "critical" ? 5 : player.impactLevel === "high" ? 3 : 1;
    if (player.team === "home") homeImpact += weight;
    else awayImpact += weight;
  }

  return {
    home: Math.min(20, homeImpact),
    away: Math.min(20, awayImpact),
  };
}

// ============================================
// Maç Benzerliği (Cluster Analysis)
// ============================================

function findSimilarMatch(
  prediction: PredictionResponse | null,
  h2h: H2HResponse[]
): MatchSimilarity | undefined {
  if (!prediction || h2h.length === 0) return undefined;

  const homeAtt = parseStrength(prediction.teams?.home?.last_5?.att);
  const homeDef = parseStrength(prediction.teams?.home?.last_5?.def);
  const awayAtt = parseStrength(prediction.teams?.away?.last_5?.att);
  const awayDef = parseStrength(prediction.teams?.away?.last_5?.def);

  let bestMatch: H2HResponse | null = null;
  let bestSimilarity = 0;
  const features: string[] = [];

  for (const match of h2h) {
    let similarity = 50;

    const homeGoals = match.goals?.home ?? 0;
    const awayGoals = match.goals?.away ?? 0;
    const totalGoals = homeGoals + awayGoals;

    const expectedTotal = (homeAtt + awayAtt) / 2 - (homeDef + awayDef) / 2;
    if ((expectedTotal > 0 && totalGoals > 2) || (expectedTotal <= 0 && totalGoals <= 2)) {
      similarity += 15;
    }

    if (match.teams.home.winner && homeAtt > awayAtt) similarity += 10;
    if (match.teams.away.winner && awayAtt > homeAtt) similarity += 10;
    if (!match.teams.home.winner && !match.teams.away.winner && Math.abs(homeAtt - awayAtt) < 15) similarity += 10;

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = match;
    }
  }

  if (!bestMatch || bestSimilarity < 55) return undefined;

  const homeGoals = bestMatch.goals?.home ?? 0;
  const awayGoals = bestMatch.goals?.away ?? 0;
  const totalGoals = homeGoals + awayGoals;

  if (Math.abs(homeAtt - awayAtt) < 15) features.push("Dengeli hücum güçleri");
  if (homeAtt > 65) features.push("Ev sahibi hücum odaklı");
  if (awayAtt > 65) features.push("Deplasman hücum odaklı");
  if (homeDef > 60 && awayDef > 60) features.push("Her iki savunma güçlü");
  if (totalGoals <= 2) features.push("Düşük gollü H2H pattern");
  if (totalGoals >= 3) features.push("Yüksek gollü H2H pattern");

  const resultNotes: string[] = [];
  if (totalGoals > 2.5) resultNotes.push("Üst 2.5");
  else resultNotes.push("Alt 2.5");
  if (homeGoals > 0 && awayGoals > 0) resultNotes.push("KG Var");
  else resultNotes.push("KG Yok");

  return {
    similarMatch: `${bestMatch.teams.home.name} ${homeGoals}-${awayGoals} ${bestMatch.teams.away.name}`,
    similarityScore: Math.min(95, bestSimilarity),
    result: resultNotes.join(", "),
    features,
  };
}

// ============================================
// Analiz Oluşturma
// ============================================

interface AdvancedData {
  goalTiming: GoalTimingData;
  cornerData: CornerCardData;
  cardData: CornerCardData;
  xgData: XgData;
  similarity?: MatchSimilarity;
  keyMissingPlayers: KeyMissingPlayer[];
}

function buildAnalysis(
  fixture: FixtureResponse,
  prediction: PredictionResponse | null,
  h2h: H2HResponse[],
  injuryImpact: { home: number; away: number },
  advanced: AdvancedData,
  refereeProfile?: RefereeProfile
): MatchAnalysis {
  let homeWinProb = 33;
  let awayWinProb = 33;
  let drawProb = 34;
  let homeAttack = 50;
  let awayAttack = 50;
  let homeDefense = 50;
  let awayDefense = 50;

  if (prediction) {
    homeWinProb = parseInt(prediction.predictions.percent.home) || 33;
    awayWinProb = parseInt(prediction.predictions.percent.away) || 33;
    drawProb = parseInt(prediction.predictions.percent.draw) || 34;

    const total = homeWinProb + awayWinProb + drawProb;
    if (total > 0 && total !== 100) {
      homeWinProb = Math.round((homeWinProb / total) * 100);
      awayWinProb = Math.round((awayWinProb / total) * 100);
      drawProb = 100 - homeWinProb - awayWinProb;
    }

    if (prediction.teams?.home?.last_5) {
      homeAttack = parseStrength(prediction.teams.home.last_5.att);
      homeDefense = parseStrength(prediction.teams.home.last_5.def);
    }
    if (prediction.teams?.away?.last_5) {
      awayAttack = parseStrength(prediction.teams.away.last_5.att);
      awayDefense = parseStrength(prediction.teams.away.last_5.def);
    }

    if (prediction.teams?.home?.last_5?.form) {
      homeAttack = adjustByForm(homeAttack, prediction.teams.home.last_5.form);
    }
    if (prediction.teams?.away?.last_5?.form) {
      awayAttack = adjustByForm(awayAttack, prediction.teams.away.last_5.form);
    }
  }

  // xG Delta etkisi — şanssız takımın hücumuna bonus
  if (advanced.xgData.homeXgDelta > 0.3) {
    homeAttack = Math.min(95, homeAttack + Math.round(advanced.xgData.homeXgDelta * 5));
  }
  if (advanced.xgData.awayXgDelta > 0.3) {
    awayAttack = Math.min(95, awayAttack + Math.round(advanced.xgData.awayXgDelta * 5));
  }

  // H2H analizi
  let h2hAdvantage: "home" | "away" | "neutral" = "neutral";
  let h2hGoalAvg = 0;
  if (h2h.length >= 3) {
    let homeWins = 0;
    let awayWins = 0;
    let totalGoals = 0;

    for (const match of h2h) {
      totalGoals += (match.goals?.home ?? 0) + (match.goals?.away ?? 0);
      if (match.teams.home.winner) homeWins++;
      else if (match.teams.away.winner) awayWins++;
    }

    h2hGoalAvg = totalGoals / h2h.length;
    if (homeWins > awayWins + 1) h2hAdvantage = "home";
    else if (awayWins > homeWins + 1) h2hAdvantage = "away";

    if (h2hGoalAvg > 2.8) {
      homeAttack = Math.min(95, homeAttack + 5);
      awayAttack = Math.min(95, awayAttack + 5);
    } else if (h2hGoalAvg < 2.0) {
      homeDefense = Math.min(95, homeDefense + 5);
      awayDefense = Math.min(95, awayDefense + 5);
    }
  }

  // Sakatlık etkisi
  homeWinProb = Math.max(5, homeWinProb - injuryImpact.home + Math.floor(injuryImpact.away / 2));
  awayWinProb = Math.max(5, awayWinProb - injuryImpact.away + Math.floor(injuryImpact.home / 2));

  // Kilit forvet eksikliği → hücum düşsün
  const homeFwdMissing = advanced.keyMissingPlayers.filter((p) => p.team === "home" && p.position === "FWD").length;
  const awayFwdMissing = advanced.keyMissingPlayers.filter((p) => p.team === "away" && p.position === "FWD").length;
  if (homeFwdMissing > 0) homeAttack = Math.max(20, homeAttack - homeFwdMissing * 8);
  if (awayFwdMissing > 0) awayAttack = Math.max(20, awayAttack - awayFwdMissing * 8);

  // Kilit stoper eksikliği → savunma düşsün
  const homeDefMissing = advanced.keyMissingPlayers.filter((p) => p.team === "home" && p.position === "DEF" && p.impactLevel !== "medium").length;
  const awayDefMissing = advanced.keyMissingPlayers.filter((p) => p.team === "away" && p.position === "DEF" && p.impactLevel !== "medium").length;
  if (homeDefMissing > 0) homeDefense = Math.max(20, homeDefense - homeDefMissing * 6);
  if (awayDefMissing > 0) awayDefense = Math.max(20, awayDefense - awayDefMissing * 6);

  // Normalize
  const totalAfterInjury = homeWinProb + awayWinProb + drawProb;
  if (totalAfterInjury > 0) {
    homeWinProb = Math.round((homeWinProb / totalAfterInjury) * 100);
    awayWinProb = Math.round((awayWinProb / totalAfterInjury) * 100);
    drawProb = 100 - homeWinProb - awayWinProb;
  }

  const summary = buildSmartSummary(prediction, advanced, homeWinProb, awayWinProb, fixture);

  return {
    homeForm: homeWinProb,
    awayForm: awayWinProb,
    drawProb,
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    h2hAdvantage,
    h2hGoalAvg,
    homeAdvantage: 5,
    injuryImpact,
    summary,
    homeXg: advanced.xgData.homeXg,
    awayXg: advanced.xgData.awayXg,
    xgDelta: advanced.xgData.homeXgDelta + advanced.xgData.awayXgDelta,
    goalTiming: advanced.goalTiming,
    cornerData: advanced.cornerData,
    cardData: advanced.cardData,
    similarity: advanced.similarity,
    keyMissingPlayers: advanced.keyMissingPlayers.length > 0 ? advanced.keyMissingPlayers : undefined,
    referee: fixture.fixture.referee ?? undefined,
    refereeProfile,
  };
}

function buildSmartSummary(
  prediction: PredictionResponse | null,
  advanced: AdvancedData,
  homeProb: number,
  awayProb: number,
  fixture: FixtureResponse
): string {
  const parts: string[] = [];

  if (prediction?.predictions?.advice) {
    parts.push(prediction.predictions.advice);
  }

  if (advanced.xgData.homeXgDelta > 0.4) {
    parts.push(`⚠️ ${fixture.teams.home.name} xG verimsiz — patlama potansiyeli`);
  }
  if (advanced.xgData.awayXgDelta > 0.4) {
    parts.push(`⚠️ ${fixture.teams.away.name} xG verimsiz — patlama potansiyeli`);
  }

  const criticals = advanced.keyMissingPlayers.filter((p) => p.impactLevel === "critical");
  if (criticals.length > 0) {
    const names = criticals.map((p) => `${p.name} (${p.position})`).join(", ");
    parts.push(`🚑 Kilit eksik: ${names}`);
  }

  if (advanced.goalTiming.lateGoalProb > 55) {
    parts.push(`⏰ Geç gol olasılığı yüksek (%${advanced.goalTiming.lateGoalProb})`);
  }

  return parts.join(" | ") || "Analiz mevcut değil";
}

// ============================================
// Pick Üretimi
// ============================================

function generatePicks(
  analysis: MatchAnalysis,
  odds: MatchOdds | undefined,
  prediction: PredictionResponse | null,
  fixture: FixtureResponse,
  weights: { heuristic: number; sim: number } = { heuristic: 0.4, sim: 0.6 }
): Pick[] {
  const picks: Pick[] = [];
  if (!odds) return picks;

  const sim = analysis.simulation;
  const refProfile = analysis.refereeProfile;

  const homeProbability = analysis.homeForm / 100;
  const awayProbability = analysis.awayForm / 100;
  const drawProbability = (analysis.drawProb ?? (100 - analysis.homeForm - analysis.awayForm)) / 100;

  const impliedHome = 1 / odds.home;
  const impliedAway = 1 / odds.away;
  const impliedDraw = 1 / odds.draw;

  // Hibrit confidence hesaplama: self-calibrating ağırlıklar
  const hybridConfidence = (heuristicConf: number, pickType: string): number => {
    if (!sim) return heuristicConf;
    const simProb = getSimProbability(sim, pickType);
    if (simProb === undefined) return heuristicConf;
    const simConf = Math.min(95, simProb); // simProb zaten % cinsinden
    return Math.round(heuristicConf * weights.heuristic + simConf * weights.sim);
  };

  // H2H benzerlik filtresi: çelişen pick'lerin confidence'ını düşür
  const applyH2HFilter = (conf: number, pickType: string): number => {
    if (!analysis.similarity || analysis.similarity.similarityScore < 70) return conf;
    const simResult = analysis.similarity.result.toLowerCase();
    
    // Benzer maç "Alt 2.5" diyor ama biz "Over 2.5" diyorsak → düşür
    if (pickType === "Over 2.5" && simResult.includes("alt")) return Math.max(10, conf - 10);
    if (pickType === "Under 2.5" && simResult.includes("üst")) return Math.max(10, conf - 10);
    if (pickType === "BTTS Yes" && simResult.includes("yok")) return Math.max(10, conf - 10);
    if (pickType === "BTTS No" && simResult.includes("var")) return Math.max(10, conf - 10);
    
    return conf;
  };

  // Pick üretici yardımcı
  const addPick = (
    type: PickType,
    modelProb: number,
    impliedProb: number,
    oddsValue: number,
    extraSignal: boolean,
    minConf: number = 45
  ) => {
    // Gerçek oran yoksa pick üretme (fallback 0 demek API'de veri yok)
    if (!oddsValue || oddsValue <= 1.0) return;

    let conf = calculateConfidence(modelProb, impliedProb, extraSignal);
    conf = hybridConfidence(conf, type);
    conf = applyH2HFilter(conf, type);

    const ev = modelProb * oddsValue - 1;
    const simProb = sim ? getSimProbability(sim, type) : undefined;

    if (conf >= minConf) {
      picks.push({
        type,
        confidence: conf,
        odds: oddsValue,
        reasoning: getPickReasoning(type, conf, prediction, analysis),
        expectedValue: Math.round(ev * 100) / 100,
        isValueBet: ev > 0.05,
        simProbability: simProb,
      });
    }
  };

  // --- 1X2 ---
  if (homeProbability >= 0.35) addPick("1", homeProbability, impliedHome, odds.home, analysis.h2hAdvantage === "home");
  if (drawProbability >= 0.25) addPick("X", drawProbability, impliedDraw, odds.draw, false);
  if (awayProbability >= 0.35) addPick("2", awayProbability, impliedAway, odds.away, analysis.h2hAdvantage === "away");

  // --- Üst/Alt 2.5 ---
  const avgAttack = (analysis.homeAttack + analysis.awayAttack) / 2;
  const avgDefense = (analysis.homeDefense + analysis.awayDefense) / 2;
  const goalIndicator = avgAttack - avgDefense;
  const h2hGoalAvg = analysis.h2hGoalAvg ?? 0;
  const xgBonus = ((analysis.homeXg ?? 1.2) + (analysis.awayXg ?? 1.0)) > 2.6 ? 0.05 : 0;

  if (goalIndicator > 8 || (goalIndicator > 3 && h2hGoalAvg > 2.5)) {
    const overProb = Math.min(0.75, (avgAttack / 100) * 0.7 + (h2hGoalAvg > 2.5 ? 0.15 : 0) + xgBonus);
    addPick("Over 2.5", overProb, 1 / odds.over25, odds.over25, h2hGoalAvg > 3.0, 50);
  }

  if (goalIndicator < -8 || (goalIndicator < -3 && h2hGoalAvg < 2.2)) {
    const underProb = Math.min(0.75, (avgDefense / 100) * 0.7 + (h2hGoalAvg < 2.0 ? 0.15 : 0));
    addPick("Under 2.5", underProb, 1 / odds.under25, odds.under25, h2hGoalAvg < 1.8, 50);
  }

  // --- KG Var ---
  if (analysis.homeAttack > 60 && analysis.awayAttack > 55) {
    const bttsProb = Math.min(0.75, ((analysis.homeAttack + analysis.awayAttack) / 200) * 0.85);
    addPick("BTTS Yes", bttsProb, 1 / odds.bttsYes, odds.bttsYes, false, 50);
  }

  // --- İY KG Var (HT BTTS Yes) ---
  // İlk yarıda her iki takımın da gol atma olasılığı
  if (sim && sim.simHtBttsProb != null && sim.simHtBttsProb > 15) {
    const htBttsProb = sim.simHtBttsProb / 100;
    // IY KG oran tahmini: MS KG oranından türetme (~1.45x çarpan) veya gerçek oran
    const htBttsOdds = odds.bttsYes > 1.0 ? odds.bttsYes * 1.45 : 0;
    if (htBttsOdds > 1.0) {
      const impliedHtBtts = 1 / htBttsOdds;
      addPick("HT BTTS Yes", htBttsProb, impliedHtBtts, htBttsOdds, 
        analysis.homeAttack > 65 && analysis.awayAttack > 60, 50);
    }
  }

  // --- İY/MS (Half Time / Full Time) ---
  if (odds.htft && Object.keys(odds.htft).length > 0) {
    // İY/MS olasılıkları hesapla: Basit Poisson yarı-maç modeli
    // İlk yarı xG ~ toplam xG * 0.42 (ampirik olarak ilk yarıda gollerin ~%42'si atılır)
    const htFactor = 0.42;
    const homeLambdaHT = (analysis.homeXg ?? (analysis.homeAttack / 100) * 1.5) * htFactor;
    const awayLambdaHT = (analysis.awayXg ?? (analysis.awayAttack / 100) * 1.5) * htFactor;
    const homeLambdaFT = analysis.homeXg ?? (analysis.homeAttack / 100) * 1.5;
    const awayLambdaFT = analysis.awayXg ?? (analysis.awayAttack / 100) * 1.5;

    // Poisson olasılık fonksiyonu
    const poisson = (k: number, lambda: number): number => {
      return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
    };
    const factorial = (n: number): number => {
      if (n <= 1) return 1;
      let result = 1;
      for (let i = 2; i <= n; i++) result *= i;
      return result;
    };

    // İY 1X2 olasılıkları (Poisson, max 6 gol)
    let htHomeWin = 0, htDraw = 0, htAwayWin = 0;
    for (let h = 0; h <= 6; h++) {
      for (let a = 0; a <= 6; a++) {
        const p = poisson(h, homeLambdaHT) * poisson(a, awayLambdaHT);
        if (h > a) htHomeWin += p;
        else if (h === a) htDraw += p;
        else htAwayWin += p;
      }
    }

    // MS 1X2 olasılıkları — heuristik + sim hybrid
    const ftHomeWin = homeProbability;
    const ftDraw = drawProbability;
    const ftAwayWin = awayProbability;

    // İY/MS kombinasyon olasılıkları (bağımsız değil — koşullu düzeltme)
    // P(İY=X, MS=Y) ≈ P(İY=X) * P(MS=Y|İY=X)
    // Koşullu düzeltme: İY'de önde olan MS'de de önde olma eğiliminde
    const htftProbs: Record<string, number> = {};

    // Koşullu olasılık düzeltme çarpanları
    // İY'de önde olan takımın MS'de de kazanma olasılığı artmalı
    const conditionalFactor = 1.35; // Öndeki takım avantajı
    const reverseFactor = 0.45;     // Geri dönüş zorluğu
    const holdDrawFactor = 0.80;    // Beraberliği koruma

    // 1/1: İY ev - MS ev (en doğal)
    htftProbs["1/1"] = htHomeWin * ftHomeWin * conditionalFactor;
    // 1/X: İY ev - MS beraberlik (gol farkı kapatılır)
    htftProbs["1/X"] = htHomeWin * ftDraw * holdDrawFactor;
    // 1/2: İY ev - MS deplasman (comeBack — nadir)
    htftProbs["1/2"] = htHomeWin * ftAwayWin * reverseFactor;
    // X/1: İY beraberlik - MS ev
    htftProbs["X/1"] = htDraw * ftHomeWin * 0.95;
    // X/X: İY beraberlik - MS beraberlik
    htftProbs["X/X"] = htDraw * ftDraw * conditionalFactor;
    // X/2: İY beraberlik - MS deplasman
    htftProbs["X/2"] = htDraw * ftAwayWin * 0.95;
    // 2/1: İY deplasman - MS ev (comeback — nadir)
    htftProbs["2/1"] = htAwayWin * ftHomeWin * reverseFactor;
    // 2/X: İY deplasman - MS beraberlik
    htftProbs["2/X"] = htAwayWin * ftDraw * holdDrawFactor;
    // 2/2: İY deplasman - MS deplasman
    htftProbs["2/2"] = htAwayWin * ftAwayWin * conditionalFactor;

    // Normalize et (toplam = 1 olmalı)
    const totalProb = Object.values(htftProbs).reduce((s, v) => s + v, 0);
    for (const key of Object.keys(htftProbs)) {
      htftProbs[key] = htftProbs[key] / totalProb;
    }

    // En iyi İY/MS seçeneklerini değerlendir
    const htftEntries = Object.entries(htftProbs)
      .filter(([key]) => odds.htft![key] && odds.htft![key] > 1.0)
      .map(([key, prob]) => ({
        key,
        prob,
        odds: odds.htft![key],
        implied: 1 / odds.htft![key],
        ev: prob * odds.htft![key] - 1,
      }))
      .filter((e) => e.prob > 0.08) // En az %8 olasılık — çok düşük prob'ları elele
      .sort((a, b) => b.ev - a.ev);

    // En iyi 2 İY/MS pick'i üret (aynı maçtan max 2)
    let htftCount = 0;
    for (const entry of htftEntries) {
      if (htftCount >= 2) break;
      const type = entry.key as PickType;
      let conf = calculateConfidence(entry.prob, entry.implied, entry.prob > 0.20);
      conf = hybridConfidence(conf, type);

      if (conf >= 50 && entry.ev > -0.05) {
        const htLabel = entry.key.split("/")[0] === "1" ? "Ev" : entry.key.split("/")[0] === "X" ? "Beraberlik" : "Deplasman";
        const ftLabel = entry.key.split("/")[1] === "1" ? "Ev" : entry.key.split("/")[1] === "X" ? "Beraberlik" : "Deplasman";
        picks.push({
          type,
          confidence: conf,
          odds: entry.odds,
          reasoning: `İY ${htLabel} → MS ${ftLabel} — olasılık %${(entry.prob * 100).toFixed(1)}`,
          expectedValue: Math.round(entry.ev * 100) / 100,
          isValueBet: entry.ev > 0.05,
          simProbability: undefined,
        });
        htftCount++;
      }
    }
  }

  // --- Korner 8.5 Üst/Alt DEVRE DIŞI ---
  // Korner verileri sentetik (gerçek istatistik yok), tahmin güvenilir değil.
  // Korner bilgisi sadece insight olarak kullanılıyor.

  // --- Kart 3.5 Üst/Alt DEVRE DIŞI ---
  // Kart verileri de sentetik — gerçek istatistik olmadan pick üretilmiyor.
  // Hakem profili yalnızca insight olarak kullanılıyor.

  return picks;
}

// ============================================
// Insights Builder
// ============================================

function buildInsights(
  analysis: MatchAnalysis,
  xgData: XgData,
  goalTiming: GoalTimingData,
  keyMissing: KeyMissingPlayer[],
  odds?: MatchOdds,
  importance?: MatchImportance
): MatchInsights {
  const notes: string[] = [];

  // Simülasyon bilgileri — en üstte
  const sim = analysis.simulation;
  let simTopScoreline: string | undefined;
  let simEdgeNote: string | undefined;

  if (sim && sim.topScorelines.length > 0) {
    const top = sim.topScorelines[0];
    simTopScoreline = `${top.score} (%${top.probability})`;
    notes.push(`🎲 Simülasyon (${sim.simRuns.toLocaleString()} maç): En olası skor ${top.score} (%${top.probability})`);

    // Pazar edge'leri — sadece gerçek odds varsa
    if (odds) {
      if (odds.over25 > 1.0) {
        const impliedOver25 = (1 / odds.over25) * 100;
        const simOverEdge = sim.simOver25Prob - impliedOver25;
        if (simOverEdge > 10) {
          simEdgeNote = `Üst 2.5 piyasadan %${Math.round(simOverEdge)} fazla`;
          notes.push(`📊 Simülasyon: Üst 2.5 olasılığı %${sim.simOver25Prob.toFixed(1)} — piyasa %${impliedOver25.toFixed(1)} (edge: +%${Math.round(simOverEdge)})`);
        }
      }

      if (odds.bttsYes > 1.0) {
        const impliedBtts = (1 / odds.bttsYes) * 100;
        const simBttsEdge = sim.simBttsProb - impliedBtts;
        if (simBttsEdge > 10) {
          notes.push(`📊 Simülasyon: KG Var olasılığı %${sim.simBttsProb.toFixed(1)} — piyasa %${impliedBtts.toFixed(1)} (edge: +%${Math.round(simBttsEdge)})`);
        }
      }

      // İY KG bilgisi
      if (sim.simHtBttsProb != null && sim.simHtBttsProb > 18) {
        notes.push(`⚽ IY KG Var: %${sim.simHtBttsProb.toFixed(1)} — Ev gol: %${(sim.simHtHomeGoalProb ?? 0).toFixed(0)}, Dep gol: %${(sim.simHtAwayGoalProb ?? 0).toFixed(0)}`);
        if (sim.htScorelines?.length) {
          const htScores = sim.htScorelines.slice(0, 3).map((s) => `${s.score} (%${s.probability})`).join(", ");
          notes.push(`🎯 İY skor: ${htScores}`);
        }
      }
    }

    // İkinci ve üçüncü skor
    if (sim.topScorelines.length >= 3) {
      const scores = sim.topScorelines.slice(0, 3).map((s) => `${s.score} (%${s.probability})`).join(", ");
      notes.push(`🎯 Olası skorlar: ${scores}`);
    }
  }

  if (xgData.homeXgDelta > 0.3) {
    notes.push(`Ev sahibi xG verimsiz (xG: ${xgData.homeXg}, Gol: ${xgData.homeActualGoals}) — patlama potansiyeli`);
  }
  if (xgData.awayXgDelta > 0.3) {
    notes.push(`Deplasman xG verimsiz (xG: ${xgData.awayXg}, Gol: ${xgData.awayActualGoals}) — patlama potansiyeli`);
  }

  if (goalTiming.lateGoalProb > 55) {
    notes.push(`Gollerin %${goalTiming.lateGoalProb}'i 75+ dk'da — canlı bahis fırsatı`);
  }
  if (goalTiming.firstHalfGoalProb > 60) {
    notes.push(`İlk yarıda gol olasılığı %${goalTiming.firstHalfGoalProb} — IY Üst 0.5 değerlendir`);
  }

  const criticals = keyMissing.filter((p) => p.impactLevel === "critical");
  for (const p of criticals) {
    notes.push(`🚑 ${p.name} (${p.position}) eksik — ${p.reason}`);
  }

  if (analysis.similarity) {
    notes.push(`📊 Benzer maç: ${analysis.similarity.similarMatch} → ${analysis.similarity.result} (%${analysis.similarity.similarityScore} benzerlik)`);
  }

  // Motivasyon / Maç Önemi uyarıları
  if (importance && importance.motivationGap > 0) {
    if (importance.warning) {
      notes.push(importance.warning);
    }
    if (importance.homeImportance !== 1.0) {
      notes.push(`🏠 Ev: ${importance.homeContext}`);
    }
    if (importance.awayImportance !== 1.0) {
      notes.push(`✈️ Dep: ${importance.awayContext}`);
    }
  }

  // Hakem uyarısı
  if (analysis.refereeProfile) {
    const ref = analysis.refereeProfile;
    const tendencyLabel = ref.cardTendency === "strict" ? "kartçı" : ref.cardTendency === "lenient" ? "sakin" : "dengeli";
    const tempoLabel = ref.tempoImpact === "low-tempo" ? " — tempo düşürücü ⚠️" : ref.tempoImpact === "high-tempo" ? " — akıcı oyun ✅" : "";
    notes.push(`🟨 Hakem ${ref.name} maç başı ort. ${ref.avgCardsPerMatch} kart — ${tendencyLabel}${tempoLabel}`);
  }

  if (analysis.cornerData && analysis.cornerData.totalAvg > 10) {
    notes.push(`⚡ Korner beklentisi yüksek (ort. ${analysis.cornerData.totalAvg})`);
  }

  if (analysis.cardData && analysis.cardData.totalAvg > 5) {
    notes.push(`🟨 Kartlı maç beklentisi (ort. ${analysis.cardData.totalAvg})`);
  }

  return {
    xgHome: xgData.homeXg,
    xgAway: xgData.awayXg,
    lateGoalProb: goalTiming.lateGoalProb,
    firstHalfGoalProb: goalTiming.firstHalfGoalProb,
    cornerAvg: analysis.cornerData?.totalAvg ?? 8.5,
    cardAvg: analysis.cardData?.totalAvg ?? 4.0,
    keyMissingCount: keyMissing.length,
    notes,
    simTopScoreline,
    simEdgeNote,
  };
}

// ============================================
// Yardımcı Fonksiyonlar
// ============================================

function calculateConfidence(modelProb: number, impliedProb: number, extraSignal: boolean): number {
  let confidence = modelProb * 100;
  const edge = modelProb - impliedProb;
  if (edge > 0) confidence += Math.min(15, edge * 100);
  else confidence += Math.max(-10, edge * 50);
  if (extraSignal) confidence += 5;
  return Math.round(Math.max(10, Math.min(95, confidence)));
}

function getPickReasoning(type: PickType, confidence: number, prediction: PredictionResponse | null, analysis: MatchAnalysis): string {
  const level = confidence >= 70 ? "Güçlü" : confidence >= 55 ? "Orta" : "Zayıf";
  const apiAdvice = prediction?.predictions?.advice;
  const xgNote = analysis.xgDelta && analysis.xgDelta > 0.5 ? " | xG verimsizlik var" : "";
  const injuryNote = (analysis.injuryImpact.home > 5 || analysis.injuryImpact.away > 5) ? " | Sakatlık etkisi önemli" : "";

  const reasons: Record<string, string> = {
    "1": `${level} ev sahibi — form, xG ve oran analizi${injuryNote}`,
    "X": `Dengeli güçler — beraberlik olasılığı yüksek${xgNote}`,
    "2": `${level} deplasman — istatistikler destekliyor${injuryNote}`,
    "Over 2.5": `Gollü maç — hücum, H2H ve xG destekliyor${xgNote}`,
    "Under 2.5": `Golsüz maç — savunma güçlü, H2H destekliyor`,
    "BTTS Yes": `Her iki hücum güçlü — KG beklentisi${xgNote}`,
    "BTTS No": `Savunma ağırlıklı — en az bir taraf gol atamayabilir`,
    "HT BTTS Yes": `İlk yarıda her iki takım da gol bulabilir — hücum dengeleri güçlü${xgNote}`,
    "HT BTTS No": `İlk yarı gol olasılığı düşük — savunma ağırlıklı başlangıç`,
    "1/1": `${level} İY/MS — ev sahibi dominasyonu bekleniyor`,
    "1/X": `İY ev sahibi önde, MS beraberlik — tempo düşmesi bekleniyor`,
    "1/2": `İY ev önde ama deplasman geri dönüşü — riskli senaryo`,
    "X/1": `İY beraberlik, MS ev sahibi — geç gol potansiyeli`,
    "X/X": `Tam beraberlik — defansif ve dengeli maç${xgNote}`,
    "X/2": `İY beraberlik, MS deplasman — geç gol potansiyeli`,
    "2/1": `İY deplasman önde, MS ev sahibi geri dönüşü — riskli`,
    "2/X": `İY deplasman önde ama MS beraberlik — tempo düşmesi`,
    "2/2": `${level} İY/MS — deplasman dominasyonu bekleniyor`,
  };

  const base = reasons[type] || `${level} tahmin`;
  if (apiAdvice && confidence >= 60) return `${base}. API: ${apiAdvice}`;
  return base;
}

function extractOdds(oddsData: OddsResponse | null): MatchOdds | undefined {
  if (!oddsData?.bookmakers?.length) return undefined;

  const bookmaker = oddsData.bookmakers[0];
  const matchWinner = bookmaker.bets.find((b) => b.id === 1);
  const overUnder = bookmaker.bets.find((b) => b.id === 5);
  const btts = bookmaker.bets.find((b) => b.id === 8);
  const overUnder15 = bookmaker.bets.find((b) => b.id === 6);
  const overUnder35 = bookmaker.bets.find((b) => b.id === 26);
  const corners = bookmaker.bets.find((b) => b.name?.toLowerCase().includes("corner"));
  const cards = bookmaker.bets.find((b) => b.name?.toLowerCase().includes("card"));

  // İY/MS (Half Time / Full Time) — bet id=13 veya isim bazlı
  const htftBet = bookmaker.bets.find((b) => b.id === 13) ||
    bookmaker.bets.find((b) => b.name?.toLowerCase().includes("half time / full time") || b.name?.toLowerCase().includes("ht/ft"));

  // Exact Score (Correct Score) — bet id=10 veya isim bazlı fallback
  const exactScoreBet = bookmaker.bets.find((b) => b.id === 10) ||
    bookmaker.bets.find((b) => b.name?.toLowerCase().includes("exact score") || b.name?.toLowerCase().includes("correct score"));
  
  const exactScoreOdds: Record<string, number> = {};
  if (exactScoreBet) {
    for (const v of exactScoreBet.values) {
      // API-Football format: value = "1:0", "2:1", "3:3" etc.
      const score = v.value.replace(":", "-");
      const odd = parseFloat(v.odd);
      if (odd > 0) exactScoreOdds[score] = odd;
    }
  }

  // Hangi pazarlar gerçek bahisçi verisinden geliyor?
  const realMarkets = new Set<string>();

  const parseRealOdd = (bet: typeof matchWinner, valueName: string, marketKey: string): number => {
    const val = bet?.values.find((v) => v.value === valueName)?.odd;
    if (val) {
      realMarkets.add(marketKey);
      return parseFloat(val);
    }
    return 0; // Gerçek veri yok — 0 döndür, fallback kullanma
  };

  const home = parseRealOdd(matchWinner, "Home", "home");
  const draw = parseRealOdd(matchWinner, "Draw", "draw");
  const away = parseRealOdd(matchWinner, "Away", "away");
  const over25 = parseRealOdd(overUnder, "Over 2.5", "over25");
  const under25 = parseRealOdd(overUnder, "Under 2.5", "under25");
  const bttsYes = parseRealOdd(btts, "Yes", "bttsYes");
  const bttsNo = parseRealOdd(btts, "No", "bttsNo");
  const over15 = parseRealOdd(overUnder15, "Over 1.5", "over15");
  const under15 = parseRealOdd(overUnder15, "Under 1.5", "under15");
  const over35 = parseRealOdd(overUnder35, "Over 3.5", "over35");
  const under35 = parseRealOdd(overUnder35, "Under 3.5", "under35");

  // 1X2 için en az home oranı gerçek olmalı — yoksa tüm odds güvenilmez
  if (!realMarkets.has("home")) {
    console.warn(`[ODDS] Bookmaker ${bookmaker.name} has no real 1X2 odds — skipping`);
    return undefined;
  }

  return {
    home: home || 1.5,
    draw: draw || 3.5,
    away: away || 5.0,
    over25: over25 || 0,     // API'de gerçek veri yoksa 0 — pick üretme
    under25: under25 || 0,
    bttsYes: bttsYes || 0,
    bttsNo: bttsNo || 0,
    over15: over15 || 0,
    under15: under15 || 0,
    over35: over35 || 0,
    under35: under35 || 0,
    cornerOver85: corners ? parseFloat(corners.values.find((v) => v.value.includes("Over"))?.odd || "0") || undefined : undefined,
    cornerUnder85: corners ? parseFloat(corners.values.find((v) => v.value.includes("Under"))?.odd || "0") || undefined : undefined,
    cardOver35: cards ? parseFloat(cards.values.find((v) => v.value.includes("Over"))?.odd || "0") || undefined : undefined,
    cardUnder35: cards ? parseFloat(cards.values.find((v) => v.value.includes("Under"))?.odd || "0") || undefined : undefined,
    htft: (() => {
      if (!htftBet) return undefined;
      const htftOdds: Record<string, number> = {};
      // API-Football format: "Home / Home", "Home / Draw", "Draw / Away" etc.
      const htftMap: Record<string, string> = {
        "Home / Home": "1/1", "Home / Draw": "1/X", "Home / Away": "1/2",
        "Draw / Home": "X/1", "Draw / Draw": "X/X", "Draw / Away": "X/2",
        "Away / Home": "2/1", "Away / Draw": "2/X", "Away / Away": "2/2",
      };
      for (const v of htftBet.values) {
        const key = htftMap[v.value];
        if (key) {
          const odd = parseFloat(v.odd);
          if (odd > 0) {
            htftOdds[key] = odd;
            realMarkets.add(`htft_${key}`);
          }
        }
      }
      return Object.keys(htftOdds).length > 0 ? htftOdds : undefined;
    })(),
    exactScoreOdds: Object.keys(exactScoreOdds).length > 0 ? exactScoreOdds : undefined,
    bookmaker: bookmaker.name,
    realMarkets,
  };
}

function parseStrength(str: string | undefined): number {
  if (!str) return 50;
  const num = parseInt(str.replace("%", ""));
  return isNaN(num) ? 50 : num;
}

function adjustByForm(base: number, form: string): number {
  const wins = (form.match(/W/g) || []).length;
  const losses = (form.match(/L/g) || []).length;
  const bonus = (wins - losses) * 3;
  return Math.max(10, Math.min(95, base + bonus));
}

export async function analyzeMatches(fixtures: FixtureResponse[], maxConcurrent = 3): Promise<MatchPrediction[]> {
  const results: MatchPrediction[] = [];

  for (let i = 0; i < fixtures.length; i += maxConcurrent) {
    const batch = fixtures.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(batch.map((fixture) => analyzeMatch(fixture)));

    for (const result of batchResults) {
      if (result.status === "fulfilled") results.push(result.value);
      else console.error("Maç analiz hatası:", result.reason);
    }

    if (i + maxConcurrent < fixtures.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return results.sort((a, b) => {
    const aConf = Math.max(...a.picks.map((p) => p.confidence), 0);
    const bConf = Math.max(...b.picks.map((p) => p.confidence), 0);
    return bConf - aConf;
  });
}
