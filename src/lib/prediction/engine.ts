// ============================================
// Prediction Engine
// Maç analizi ve tahmin üretimi
// ============================================

import type { FixtureResponse, PredictionResponse, OddsResponse, H2HResponse } from "@/types/api-football";
import type { MatchPrediction, MatchAnalysis, Pick, PickType, MatchOdds } from "@/types";
import { getPrediction, getH2H, getOdds } from "@/lib/api-football";
import { getCached, setCache } from "@/lib/cache";

const CACHE_TTL = 30 * 60; // 30 dakika

export async function analyzeMatch(fixture: FixtureResponse): Promise<MatchPrediction> {
  const fixtureId = fixture.fixture.id;
  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;

  // Cache kontrol
  const cacheKey = `prediction-${fixtureId}`;
  const cached = getCached<MatchPrediction>(cacheKey);
  if (cached) return cached;

  // Paralel veri çekimi
  const [prediction, h2h, odds] = await Promise.all([
    getPrediction(fixtureId).catch(() => null),
    getH2H(homeId, awayId, 5).catch(() => []),
    getOdds(fixtureId).catch(() => null),
  ]);

  const analysis = buildAnalysis(fixture, prediction, h2h);
  const matchOdds = extractOdds(odds);
  const picks = generatePicks(analysis, matchOdds, prediction);

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
  };

  // Cache'e kaydet
  setCache(cacheKey, result, CACHE_TTL);

  return result;
}

function buildAnalysis(
  fixture: FixtureResponse,
  prediction: PredictionResponse | null,
  h2h: H2HResponse[]
): MatchAnalysis {
  let homeForm = 50;
  let awayForm = 50;
  let homeAttack = 50;
  let awayAttack = 50;
  let homeDefense = 50;
  let awayDefense = 50;

  if (prediction) {
    const homePercent = parseInt(prediction.predictions.percent.home) || 33;
    const awayPercent = parseInt(prediction.predictions.percent.away) || 33;

    homeForm = Math.min(95, homePercent + 15);
    awayForm = Math.min(95, awayPercent + 15);

    if (prediction.teams?.home?.last_5) {
      homeAttack = parseStrength(prediction.teams.home.last_5.att);
      homeDefense = parseStrength(prediction.teams.home.last_5.def);
    }
    if (prediction.teams?.away?.last_5) {
      awayAttack = parseStrength(prediction.teams.away.last_5.att);
      awayDefense = parseStrength(prediction.teams.away.last_5.def);
    }
  }

  // H2H analizi
  let h2hAdvantage: "home" | "away" | "neutral" = "neutral";
  if (h2h.length >= 3) {
    const homeWins = h2h.filter(
      (m) => m.teams.home.id === fixture.teams.home.id && m.teams.home.winner
    ).length;
    const awayWins = h2h.filter(
      (m) => m.teams.away.id === fixture.teams.away.id && m.teams.away.winner
    ).length;
    if (homeWins > awayWins + 1) h2hAdvantage = "home";
    else if (awayWins > homeWins + 1) h2hAdvantage = "away";
  }

  const summary = prediction?.predictions.advice || "Analiz mevcut değil";

  return {
    homeForm,
    awayForm,
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    h2hAdvantage,
    homeAdvantage: 5, // Ev sahibi avantajı yüzdelik
    injuryImpact: { home: 0, away: 0 },
    summary,
  };
}

function generatePicks(
  analysis: MatchAnalysis,
  odds: MatchOdds | undefined,
  prediction: PredictionResponse | null
): Pick[] {
  const picks: Pick[] = [];

  if (!odds) return picks;

  // 1X2 tahminleri
  const homeProbability = analysis.homeForm / 100;
  const awayProbability = analysis.awayForm / 100;
  const drawProbability = 1 - homeProbability - awayProbability;

  // Ev sahibi
  if (homeProbability > 0.4) {
    picks.push(createPick("1", homeProbability * 100, odds.home, homeProbability));
  }

  // Berabere
  if (drawProbability > 0.25) {
    picks.push(createPick("X", drawProbability * 100, odds.draw, drawProbability));
  }

  // Deplasman
  if (awayProbability > 0.4) {
    picks.push(createPick("2", awayProbability * 100, odds.away, awayProbability));
  }

  // Üst/Alt gol
  const avgAttack = (analysis.homeAttack + analysis.awayAttack) / 2;
  const avgDefense = (analysis.homeDefense + analysis.awayDefense) / 2;

  if (avgAttack > 55 && avgDefense < 55) {
    picks.push(createPick("Over 2.5", Math.min(80, avgAttack), odds.over25, avgAttack / 100));
  } else if (avgDefense > 55 && avgAttack < 50) {
    picks.push(createPick("Under 2.5", Math.min(80, avgDefense), odds.under25, avgDefense / 100));
  }

  // KG Var/Yok
  if (avgAttack > 60) {
    picks.push(createPick("BTTS Yes", Math.min(75, avgAttack - 5), odds.bttsYes, (avgAttack - 5) / 100));
  }

  return picks;
}

function createPick(type: PickType, confidence: number, odds: number, probability: number): Pick {
  const expectedValue = probability * odds - 1;
  return {
    type,
    confidence: Math.round(confidence),
    odds,
    reasoning: getPickReasoning(type, confidence),
    expectedValue: Math.round(expectedValue * 100) / 100,
    isValueBet: expectedValue > 0.05,
  };
}

function getPickReasoning(type: PickType, confidence: number): string {
  const level = confidence >= 70 ? "Güçlü" : confidence >= 55 ? "Orta" : "Zayıf";
  const reasons: Record<string, string> = {
    "1": `${level} ev sahibi avantajı ve form üstünlüğü`,
    "X": `Her iki takım da dengeli, beraberlik olası`,
    "2": `${level} deplasman üstünlüğü`,
    "Over 2.5": `Yüksek gol beklentisi — hücum odaklı takımlar`,
    "Under 2.5": `Düşük gol beklentisi — savunma ağırlıklı maç`,
    "BTTS Yes": `Her iki takımın da gol atma potansiyeli yüksek`,
    "BTTS No": `En az bir takımın gol atma olasılığı düşük`,
  };
  return reasons[type] || `${level} tahmin`;
}

function extractOdds(oddsData: OddsResponse | null): MatchOdds | undefined {
  if (!oddsData?.bookmakers?.length) return undefined;

  const bookmaker = oddsData.bookmakers[0];
  const matchWinner = bookmaker.bets.find((b) => b.id === 1);
  const overUnder = bookmaker.bets.find((b) => b.id === 5);
  const btts = bookmaker.bets.find((b) => b.id === 8);

  return {
    home: parseFloat(matchWinner?.values.find((v) => v.value === "Home")?.odd || "1.5"),
    draw: parseFloat(matchWinner?.values.find((v) => v.value === "Draw")?.odd || "3.5"),
    away: parseFloat(matchWinner?.values.find((v) => v.value === "Away")?.odd || "5.0"),
    over25: parseFloat(overUnder?.values.find((v) => v.value === "Over 2.5")?.odd || "1.8"),
    under25: parseFloat(overUnder?.values.find((v) => v.value === "Under 2.5")?.odd || "2.0"),
    bttsYes: parseFloat(btts?.values.find((v) => v.value === "Yes")?.odd || "1.7"),
    bttsNo: parseFloat(btts?.values.find((v) => v.value === "No")?.odd || "2.1"),
    bookmaker: bookmaker.name,
  };
}

function parseStrength(str: string | undefined): number {
  if (!str) return 50;
  const num = parseInt(str.replace("%", ""));
  return isNaN(num) ? 50 : num;
}

export async function analyzeMatches(fixtures: FixtureResponse[], maxConcurrent = 3): Promise<MatchPrediction[]> {
  const results: MatchPrediction[] = [];
  
  // Batch halinde paralel işlem (API rate limit: 10/min)
  for (let i = 0; i < fixtures.length; i += maxConcurrent) {
    const batch = fixtures.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map((fixture) => analyzeMatch(fixture))
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error("Maç analiz hatası:", result.reason);
      }
    }

    // Batch arası bekleme (rate limit)
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
