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
  DataQualityScore,
} from "@/types";
import { getPrediction, getH2H, getOdds, getInjuries } from "@/lib/api-football";
import { getCached, setCache } from "@/lib/cache";
import { simulateMatch, getSimProbability } from "@/lib/prediction/simulator";
import { getRefereeProfile } from "@/lib/prediction/referees";
import { calculateMatchImportance, type MatchImportance } from "@/lib/prediction/importance";
import { getOptimalWeights, getCalibrationAdjustments } from "@/lib/prediction/validator";
import { analyzeForm, type FormAnalysis } from "@/lib/prediction/form-analyzer";
import { calculateEloFromMatches, eloToWinProbabilities, calculateH2HElo } from "@/lib/prediction/elo";
import { isMLModelAvailable, getMLProbability, buildFeatureVector, type MLFeatureVector } from "@/lib/prediction/ml-model";

const CACHE_TTL = 30 * 60; // 30 dakika

export async function analyzeMatch(fixture: FixtureResponse): Promise<MatchPrediction> {
  const fixtureId = fixture.fixture.id;
  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;

  // Cache kontrol (v4: comparison + form fix)
  const cacheKey = `prediction-v4-${fixtureId}`;
  const cached = getCached<MatchPrediction>(cacheKey);
  if (cached) return cached;

  // Paralel veri çekimi (tüm kaynaklardan)
  const [prediction, h2h, odds, injuries, importance] = await Promise.all([
    getPrediction(fixtureId).catch(() => { console.warn(`[FALLBACK] Fixture ${fixtureId}: Prediction API hatası — null`); return null; }),
    getH2H(homeId, awayId, 10).catch(() => { console.warn(`[FALLBACK] Fixture ${fixtureId}: H2H API hatası — boş dizi`); return []; }),
    getOdds(fixtureId).catch(() => { console.warn(`[FALLBACK] Fixture ${fixtureId}: Odds API hatası — null`); return null; }),
    getInjuries(fixtureId).catch(() => { console.warn(`[FALLBACK] Fixture ${fixtureId}: Injuries API hatası — boş dizi`); return []; }),
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
  const xgData = extractXgData(prediction);
  const similarity = findSimilarMatch(prediction, h2h);

  // Hakem profili (korner/kart analizinde de kullanılıyor, bu yüzden önce)
  const refereeProfile = getRefereeProfile(fixture.fixture.referee);

  const cornerData = extractCornerData(prediction, h2h);
  const cardData = extractCardData(prediction, h2h, refereeProfile);

  // === YENİ: Form Decay Analizi ===
  const homeFormString = prediction?.teams?.home?.last_5?.form || prediction?.teams?.home?.league?.form?.slice(-5) || "";
  const awayFormString = prediction?.teams?.away?.last_5?.form || prediction?.teams?.away?.league?.form?.slice(-5) || "";
  const homeFormAnalysis = analyzeForm(homeFormString);
  const awayFormAnalysis = analyzeForm(awayFormString);

  // === YENİ: H2H Elo Analizi ===
  const h2hElo = h2h.length >= 2 ? calculateH2HElo(
    h2h.map(m => ({
      homeGoals: m.goals?.home ?? 0,
      awayGoals: m.goals?.away ?? 0,
      wasHome: m.teams.home.id === homeId,
    }))
  ) : undefined;

  const analysis = buildAnalysis(fixture, prediction, h2h, injuryImpact, {
    goalTiming,
    cornerData,
    cardData,
    xgData,
    similarity,
    keyMissingPlayers,
    homeFormAnalysis,
    awayFormAnalysis,
    h2hElo,
  }, refereeProfile);

  const matchOdds = extractOdds(odds);

  // === H2H Oran Bazlı İY/MS Pattern ===
  analysis.h2hOddsHtFt = analyzeH2HHtFtPattern(h2h, matchOdds, homeId);

  // === Veri Kalitesi Hesaplama ===
  const dataQuality = calculateDataQuality(
    prediction, h2h, odds, injuries, refereeProfile, matchOdds,
    homeFormString, awayFormString, fixtureId
  );
  analysis.dataQuality = dataQuality;

  // Monte Carlo simülasyon (analiz + odds hazır olduktan sonra)
  // Liga bazlı ev sahibi avantajı + motivasyon çarpanı + form decay → dinamik lambda
  const simulation = simulateMatch(analysis, matchOdds, fixture.league.id, importance, homeFormAnalysis, awayFormAnalysis);
  analysis.simulation = simulation;

  // Self-calibrating ağırlıklar al (cache'li)
  const weights = await getOptimalWeights().catch(() => ({ heuristic: 0.4, sim: 0.6 }));

  // Kalibrasyon bazlı güven düzeltmeleri al
  const calibrationAdjustments = await getCalibrationAdjustments().catch(() => ({}));

  const picks = generatePicks(analysis, matchOdds, prediction, fixture, weights, dataQuality, calibrationAdjustments);

  // Derinlemesine bilgiler (insights)
  const insights = buildInsights(analysis, xgData, goalTiming, keyMissingPlayers, matchOdds, importance, homeFormAnalysis, awayFormAnalysis);

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
    dataQuality,
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
  if (!prediction?.teams) {
    console.warn("[FALLBACK] extractXgData: prediction.teams yok — varsayılan xG kullanılıyor (H: 1.2, A: 1.0)");
    return defaults;
  }

  const homeTeam = prediction.teams.home;
  const awayTeam = prediction.teams.away;

  const homeGoalsFor = parseFloat(homeTeam?.last_5?.goals?.for?.average || "1.2");
  const awayGoalsFor = parseFloat(awayTeam?.last_5?.goals?.for?.average || "1.0");

  // Hücum gücünü önce last_5'ten, yoksa comparison'dan al
  let homeAtt = parseStrength(homeTeam?.last_5?.att);
  let awayAtt = parseStrength(awayTeam?.last_5?.att);

  // Fallback: comparison.att alanı
  if (homeAtt === 50 && awayAtt === 50 && prediction.comparison) {
    const compAtt = prediction.comparison["att"] || prediction.comparison["Att"] || prediction.comparison["attack"];
    if (compAtt) {
      const cH = parseStrength(compAtt.home);
      const cA = parseStrength(compAtt.away);
      if (cH !== 50 || cA !== 50) {
        homeAtt = cH;
        awayAtt = cA;
      }
    }
  }

  // xG proxy: Dixon-Coles benzeri yaklaşım
  // Gerçek xG yoksa: gol ortalaması × (hücum gücü / lig ortalaması) × savunma zayıflığı faktörü
  // 50 = lig ortalaması referansı, 60+ hücum güçlü, 40- zayıf
  const homeAttFactor = Math.max(0.5, homeAtt / 50);  // 1.0 = ortalama, 1.4 = güçlü
  const awayAttFactor = Math.max(0.5, awayAtt / 50);
  
  // Savunma zayıflık faktörü (düşük savunma = daha fazla gol yenme)
  const awayDefWeak = Math.max(0.7, (100 - awayAtt) / 50); // Rakip savunma zayıfsa bonus
  const homeDefWeak = Math.max(0.7, (100 - homeAtt) / 50);

  const homeXg = homeGoalsFor * homeAttFactor * 0.85 + homeGoalsFor * 0.15; // %85 model, %15 raw 
  const awayXg = awayGoalsFor * awayAttFactor * 0.85 + awayGoalsFor * 0.15;

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
  if (!prediction?.teams) {
    console.warn("[FALLBACK] extractGoalTiming: prediction.teams yok — varsayılan zamanlama kullanılıyor");
    return defaultTiming;
  }

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

function extractCornerData(
  prediction: PredictionResponse | null,
  h2hMatches?: H2HResponse[]
): CornerCardData {
  if (!prediction?.teams) {
    console.warn("[FALLBACK] extractCornerData: prediction.teams yok — varsayılan korner kullanılıyor");
    return { homeAvg: 4.5, awayAvg: 4.0, totalAvg: 8.5, overProb: 50 };
  }

  const homeAtt = parseStrength(prediction.teams.home?.last_5?.att);
  const awayAtt = parseStrength(prediction.teams.away?.last_5?.att);
  const homeDef = parseStrength(prediction.teams.home?.last_5?.def);
  const awayDef = parseStrength(prediction.teams.away?.last_5?.def);

  // H2H gol ortalamasından korner tahmini (gol ↔ korner korelasyonu ~0.6)
  let h2hCornerEstimate = 0;
  if (h2hMatches && h2hMatches.length >= 2) {
    const totalGoals = h2hMatches.reduce((sum, m) => sum + (m.goals?.home ?? 0) + (m.goals?.away ?? 0), 0);
    const avgGoals = totalGoals / h2hMatches.length;
    h2hCornerEstimate = 5.0 + avgGoals * 1.3; // Her gol ~1.3 ekstra korner ilişkisi
  }

  // Form gol ortalamasından korner tahmini
  const homeGoalAvg = parseFloat(prediction.teams.home?.last_5?.goals?.for?.average || "0") || 1.2;
  const awayGoalAvg = parseFloat(prediction.teams.away?.last_5?.goals?.for?.average || "0") || 1.0;
  const formGoalTotal = homeGoalAvg + awayGoalAvg;
  const formCornerEstimate = 5.0 + formGoalTotal * 1.2;

  // Attack/defense bazlı tahmin (eski formül — fallback)
  const attDefHomeCorner = 3.0 + (homeAtt / 100) * 4 + (awayDef / 100) * 1.5;
  const attDefAwayCorner = 2.5 + (awayAtt / 100) * 4 + (homeDef / 100) * 1.5;
  const attDefTotal = attDefHomeCorner + attDefAwayCorner;

  // Üç kaynağı harmanlama: H2H > Form golleri > Att/Def sentetik
  let totalAvg: number;
  if (h2hCornerEstimate > 0) {
    totalAvg = h2hCornerEstimate * 0.35 + formCornerEstimate * 0.35 + attDefTotal * 0.30;
  } else {
    totalAvg = formCornerEstimate * 0.55 + attDefTotal * 0.45;
  }

  // Ev sahibi avantajı ile dağıt (%55 ev, %45 deplasman)
  const homeCornerAvg = totalAvg * 0.55;
  const awayCornerAvg = totalAvg * 0.45;
  const overProb = Math.min(80, Math.max(20, (totalAvg - 8.5) * 15 + 50));

  return {
    homeAvg: Math.round(homeCornerAvg * 10) / 10,
    awayAvg: Math.round(awayCornerAvg * 10) / 10,
    totalAvg: Math.round(totalAvg * 10) / 10,
    overProb: Math.round(overProb),
  };
}

function extractCardData(
  prediction: PredictionResponse | null,
  h2hMatches?: H2HResponse[],
  refereeProfile?: RefereeProfile | null
): CornerCardData {
  if (!prediction?.teams) {
    console.warn("[FALLBACK] extractCardData: prediction.teams yok — varsayılan kart kullanılıyor (2.0 + 2.0)");
    // Hakem profili varsa ondan al
    if (refereeProfile) {
      const avg = refereeProfile.avgCardsPerMatch;
      return { homeAvg: avg * 0.52, awayAvg: avg * 0.48, totalAvg: avg, overProb: avg > 4.5 ? 60 : 45 };
    }
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

  let homeAvg = homeMatches > 0 ? homeTotal / homeMatches : 2.0;
  let awayAvg = awayMatches > 0 ? awayTotal / awayMatches : 2.0;

  // Hakem profili ile ağırlıklı düzeltme
  if (refereeProfile) {
    const refAvg = refereeProfile.avgCardsPerMatch;
    const teamTotal = homeAvg + awayAvg;
    if (teamTotal > 0) {
      // Takım verisi %60 + hakem verisi %40
      const blendedTotal = teamTotal * 0.6 + refAvg * 0.4;
      const ratio = homeAvg / teamTotal;
      homeAvg = blendedTotal * ratio;
      awayAvg = blendedTotal * (1 - ratio);
    }
  }

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
// H2H Oran Bazlı İY/MS Pattern Analizi
// Geçmiş maçlardaki oran profillerinden İY/MS dağılımı çıkarır
// ============================================

function analyzeH2HHtFtPattern(
  h2h: H2HResponse[],
  currentOdds: MatchOdds | undefined,
  homeTeamId: number
): MatchAnalysis["h2hOddsHtFt"] {
  // En az 3 H2H maç gerekli
  if (h2h.length < 3) return undefined;

  // Biten maçlardan İY/MS sonuçlarını çıkar
  const htftResults: string[] = [];
  for (const match of h2h) {
    if (match.fixture.status.short !== "FT") continue;
    const ht = match.score?.halftime;
    const ft = match.score?.fulltime;
    if (ht?.home == null || ht?.away == null || ft?.home == null || ft?.away == null) continue;

    // Perspektifi normalize et: currentMatch'in ev sahibi = "home" olarak al
    const isCurrentHome = match.teams.home.id === homeTeamId;
    const htHome = isCurrentHome ? ht.home : ht.away;
    const htAway = isCurrentHome ? ht.away : ht.home;
    const ftHome = isCurrentHome ? ft.home : ft.away;
    const ftAway = isCurrentHome ? ft.away : ft.home;

    const htResult = htHome > htAway ? "1" : htHome === htAway ? "X" : "2";
    const ftResult = ftHome > ftAway ? "1" : ftHome === ftAway ? "X" : "2";
    htftResults.push(`${htResult}/${ftResult}`);
  }

  if (htftResults.length < 3) return undefined;

  // İY/MS dağılımını hesapla
  const distribution: Record<string, number> = {};
  for (const result of htftResults) {
    distribution[result] = (distribution[result] || 0) + 1;
  }
  // Yüzdeye çevir
  for (const key of Object.keys(distribution)) {
    distribution[key] = Math.round((distribution[key] / htftResults.length) * 100);
  }

  // Geri dönüş oranı: İY'de önde olup MS'de kaybeden senaryolar
  const comebackResults = ["1/2", "2/1", "1/X", "2/X"];
  const comebackCount = htftResults.filter(r => comebackResults.includes(r)).length;
  const comebackRate = Math.round((comebackCount / htftResults.length) * 100);

  // En baskın pattern
  const sortedPatterns = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const dominantPattern = sortedPatterns[0]?.[0];

  return {
    sampleSize: htftResults.length,
    distribution,
    comebackRate,
    dominantPattern,
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

  let homeAtt = parseStrength(prediction.teams?.home?.last_5?.att);
  let homeDef = parseStrength(prediction.teams?.home?.last_5?.def);
  let awayAtt = parseStrength(prediction.teams?.away?.last_5?.att);
  let awayDef = parseStrength(prediction.teams?.away?.last_5?.def);

  // Fallback: comparison verisi
  if (homeAtt === 50 && awayAtt === 50 && prediction.comparison) {
    const compAtt = prediction.comparison["att"] || prediction.comparison["Att"] || prediction.comparison["attack"];
    const compDef = prediction.comparison["def"] || prediction.comparison["Def"] || prediction.comparison["defence"];
    if (compAtt) {
      const cH = parseStrength(compAtt.home);
      const cA = parseStrength(compAtt.away);
      if (cH !== 50 || cA !== 50) { homeAtt = cH; awayAtt = cA; }
    }
    if (compDef) {
      const cH = parseStrength(compDef.home);
      const cA = parseStrength(compDef.away);
      if (cH !== 50 || cA !== 50) { homeDef = cH; awayDef = cA; }
    }
  }

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
// Veri Kalitesi Göstergesi (Data Quality Score)
// Her tahmin için veri kaynaklarının kalitesini ölç
// ============================================

function calculateDataQuality(
  prediction: PredictionResponse | null,
  h2h: H2HResponse[],
  odds: OddsResponse | null,
  injuries: InjuryResponse[],
  refereeProfile: RefereeProfile | undefined,
  matchOdds: MatchOdds | undefined,
  homeFormString: string,
  awayFormString: string,
  fixtureId: number
): DataQualityScore {
  const warnings: string[] = [];

  // 1. API Data (comparison + predictions var mı?)
  let apiData = 0;
  if (prediction) {
    apiData += 30; // Prediction verisi var
    if (prediction.comparison) {
      const comp = prediction.comparison;
      const hasAtt = !!(comp["att"] || comp["Att"] || comp["attack"]);
      const hasDef = !!(comp["def"] || comp["Def"] || comp["defence"]);
      const hasForm = !!(comp["form"] || comp["Form"]);
      if (hasAtt) apiData += 20;
      if (hasDef) apiData += 20;
      if (hasForm) apiData += 15;
      if (!hasAtt && !hasDef) warnings.push("Comparison att/def verisi eksik — varsayılan değerler kullanılıyor");
    } else {
      apiData += 5;
      warnings.push("Comparison verisi yok — tüm istatistikler form string'inden türetildi");
    }
    if (prediction.teams?.home?.last_5) apiData += 8;
    if (prediction.teams?.away?.last_5) apiData += 7;
  } else {
    warnings.push("API prediction verisi tamamen eksik — tüm değerler varsayılan");
  }

  // 2. Form Data
  let formData = 0;
  if (homeFormString && homeFormString.length >= 3) formData += 50;
  else if (homeFormString) { formData += 20; warnings.push("Ev sahibi form verisi yetersiz (< 3 maç)"); }
  else warnings.push("Ev sahibi form verisi yok");

  if (awayFormString && awayFormString.length >= 3) formData += 50;
  else if (awayFormString) { formData += 20; warnings.push("Deplasman form verisi yetersiz (< 3 maç)"); }
  else warnings.push("Deplasman form verisi yok");

  // 3. H2H Data
  let h2hData = 0;
  if (h2h.length >= 5) h2hData = 100;
  else if (h2h.length >= 3) h2hData = 70;
  else if (h2h.length >= 2) { h2hData = 40; warnings.push("H2H sadece 2 maç — güvenilirlik düşük"); }
  else if (h2h.length === 1) { h2hData = 15; warnings.push("H2H sadece 1 maç — çok yetersiz"); }
  else warnings.push("H2H verisi yok");

  // 4. Odds Data
  let oddsData = 0;
  if (matchOdds) {
    const realCount = matchOdds.realMarkets?.size ?? 0;
    if (realCount >= 5) oddsData = 100;
    else if (matchOdds.home > 1 && matchOdds.away > 1 && matchOdds.draw > 1) {
      oddsData = 60;
      if (matchOdds.over25 > 1) oddsData += 15;
      if (matchOdds.bttsYes > 1) oddsData += 15;
      if (!matchOdds.htft || Object.keys(matchOdds.htft).length === 0) {
        oddsData -= 10;
        warnings.push("İY/MS oranları eksik");
      }
    } else {
      oddsData = 20;
      warnings.push("Temel 1X2 oranları bile eksik");
    }
  } else {
    warnings.push("Bahis oranları tamamen eksik — pick üretilemez");
  }

  // 5. Injury Data 
  let injuryData = 50; // Varsayılan: "bilmiyoruz" = orta
  if (injuries && injuries.length > 0) injuryData = 100; // API sakatlık verisi var
  else if (odds) injuryData = 50; // Maç var ama sakatlık bilgisi yok — belirsiz

  // 6. Referee Data
  let refereeData = 0;
  if (refereeProfile) refereeData = 100;
  else {
    refereeData = 20; // Profil yok ama nötr kullanılıyor
    warnings.push("Hakem profili bulunamadı — nötr varsayım");
  }

  // 7. Stats Data (att/def/comparison gerçek mi?)
  let statsData = 0;
  if (prediction) {
    const homeAtt = parseStrength(prediction.teams?.home?.last_5?.att);
    const awayAtt = parseStrength(prediction.teams?.away?.last_5?.att);
    const homeDef = parseStrength(prediction.teams?.home?.last_5?.def);
    const awayDef = parseStrength(prediction.teams?.away?.last_5?.def);
    
    // Hepsi 50 ise veri yok demek
    const allDefault = homeAtt === 50 && awayAtt === 50 && homeDef === 50 && awayDef === 50;
    if (!allDefault) statsData = 80;
    else if (prediction.comparison) {
      const comp = prediction.comparison;
      const compAtt = comp["att"] || comp["Att"] || comp["attack"];
      if (compAtt && parseStrength(compAtt.home) !== 50) statsData = 60;
      else { statsData = 20; warnings.push("Tüm att/def istatistikleri varsayılan (50) — tahmin güvenilirliği düşük"); }
    } else {
      statsData = 10;
      warnings.push("Tüm att/def istatistikleri varsayılan (50) — tahmin güvenilirliği düşük");
    }
  }

  // Genel skor (ağırlıklı ortalama)
  const overall = Math.round(
    apiData * 0.25 +
    formData * 0.15 +
    h2hData * 0.10 +
    oddsData * 0.20 +
    injuryData * 0.05 +
    refereeData * 0.05 +
    statsData * 0.20
  );

  // Güven cezası: kalite düştükçe artan ceza (yumuşatılmış — aşırı ceza pick üretimini bloke ediyordu)
  let confidencePenalty = 0;
  if (overall < 25) confidencePenalty = 8;
  else if (overall < 40) confidencePenalty = 5;
  else if (overall < 55) confidencePenalty = 3;
  else if (overall < 70) confidencePenalty = 1;

  // Log warnings
  if (warnings.length > 0) {
    console.warn(`[DATA-QUALITY] Fixture ${fixtureId}: Kalite ${overall}/100, Ceza -${confidencePenalty}`, warnings);
  }

  return {
    overall,
    components: { apiData, formData, h2hData, oddsData, injuryData, refereeData, statsData },
    warnings,
    confidencePenalty,
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
  homeFormAnalysis?: FormAnalysis;
  awayFormAnalysis?: FormAnalysis;
  h2hElo?: { relativeAdvantage: number; confidence: number };
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
  let homeFormScore = 50;
  let awayFormScore = 50;

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

    // 1) comparison alanından istatistikleri al (en güvenilir kaynak)
    const comp = prediction.comparison;
    if (comp) {
      const compAtt = comp["att"] || comp["Att"] || comp["attack"];
      const compDef = comp["def"] || comp["Def"] || comp["defence"];
      const compForm = comp["form"] || comp["Form"];
      const compTotal = comp["total"] || comp["Total"];

      // comparison verisi varsa doğrudan kullan (50 bile olsa gerçek veri)
      if (compAtt) {
        homeAttack = parseStrength(compAtt.home);
        awayAttack = parseStrength(compAtt.away);
      }
      if (compDef) {
        homeDefense = parseStrength(compDef.home);
        awayDefense = parseStrength(compDef.away);
      }
      if (compForm) {
        homeFormScore = parseStrength(compForm.home);
        awayFormScore = parseStrength(compForm.away);
      }
      // comparison.total → genel güç göstergesi, form'a harmanlayalım
      if (compTotal) {
        const hTotal = parseStrength(compTotal.home);
        const aTotal = parseStrength(compTotal.away);
        if (hTotal !== 50 || aTotal !== 50) {
          homeFormScore = Math.round(homeFormScore * 0.6 + hTotal * 0.4);
          awayFormScore = Math.round(awayFormScore * 0.6 + aTotal * 0.4);
        }
      }

      console.log(`[STATS] comparison data found for fixture ${fixture.fixture.id}:`, {
        att: compAtt, def: compDef, form: compForm, total: compTotal,
        parsed: { homeAttack, awayAttack, homeDefense, awayDefense, homeFormScore, awayFormScore }
      });
    }

    // 2) last_5 verisinden üzerine override (eğer gerçek veri varsa)
    if (prediction.teams?.home?.last_5) {
      const l5Att = parseStrength(prediction.teams.home.last_5.att);
      const l5Def = parseStrength(prediction.teams.home.last_5.def);
      // Sadece gerçek veri geldiyse override et (50 = veri yok demek)
      if (l5Att !== 50) homeAttack = Math.round((homeAttack + l5Att) / 2);
      if (l5Def !== 50) homeDefense = Math.round((homeDefense + l5Def) / 2);
    }
    if (prediction.teams?.away?.last_5) {
      const l5Att = parseStrength(prediction.teams.away.last_5.att);
      const l5Def = parseStrength(prediction.teams.away.last_5.def);
      if (l5Att !== 50) awayAttack = Math.round((awayAttack + l5Att) / 2);
      if (l5Def !== 50) awayDefense = Math.round((awayDefense + l5Def) / 2);
    }

    // 3) form string'inden form ayarı (WWDLW gibi)
    if (prediction.teams?.home?.last_5?.form) {
      homeAttack = adjustByForm(homeAttack, prediction.teams.home.last_5.form);
      homeFormScore = adjustByForm(homeFormScore, prediction.teams.home.last_5.form);
    }
    if (prediction.teams?.away?.last_5?.form) {
      awayAttack = adjustByForm(awayAttack, prediction.teams.away.last_5.form);
      awayFormScore = adjustByForm(awayFormScore, prediction.teams.away.last_5.form);
    }

    // 4) Liga form string'i de ekstra kaynak olarak kullan
    if (prediction.teams?.home?.league?.form && homeFormScore === 50) {
      homeFormScore = adjustByForm(50, prediction.teams.home.league.form.slice(-5));
    }
    if (prediction.teams?.away?.league?.form && awayFormScore === 50) {
      awayFormScore = adjustByForm(50, prediction.teams.away.league.form.slice(-5));
    }

    // Hâlâ 50'de mi kaldı? Log uyarısı
    if (homeAttack === 50 && awayAttack === 50 && homeDefense === 50 && awayDefense === 50) {
      console.warn(`[STATS] ⚠️ Fixture ${fixture.fixture.id}: Tüm istatistikler varsayılan (50). API verisi eksik olabilir.`);
    }
  }

  // xG Delta etkisi — şanssız takımın hücumuna bonus
  if (advanced.xgData.homeXgDelta > 0.3) {
    homeAttack = Math.min(95, homeAttack + Math.round(advanced.xgData.homeXgDelta * 5));
  }
  if (advanced.xgData.awayXgDelta > 0.3) {
    awayAttack = Math.min(95, awayAttack + Math.round(advanced.xgData.awayXgDelta * 5));
  }

  // === YENİ: Form Decay Etkisi ===
  // Ağırlıklı form skoru (exponential decay) API form'unun üzerine yazabilir
  if (advanced.homeFormAnalysis && advanced.homeFormAnalysis.weightedForm !== 50) {
    // Ağırlıklı harmanlama: mevcut form %40 + decay form %60
    homeFormScore = Math.round(homeFormScore * 0.4 + advanced.homeFormAnalysis.weightedForm * 0.6);
  }
  if (advanced.awayFormAnalysis && advanced.awayFormAnalysis.weightedForm !== 50) {
    awayFormScore = Math.round(awayFormScore * 0.4 + advanced.awayFormAnalysis.weightedForm * 0.6);
  }

  // Streak etkisi: Momentum galibiyetlere bonusu
  if (advanced.homeFormAnalysis?.streak.type === "win" && advanced.homeFormAnalysis.streak.length >= 3) {
    homeAttack = Math.min(95, homeAttack + Math.min(8, advanced.homeFormAnalysis.streak.length * 2));
    homeWinProb = Math.min(85, homeWinProb + 3);
  }
  if (advanced.awayFormAnalysis?.streak.type === "win" && advanced.awayFormAnalysis.streak.length >= 3) {
    awayAttack = Math.min(95, awayAttack + Math.min(8, advanced.awayFormAnalysis.streak.length * 2));
    awayWinProb = Math.min(85, awayWinProb + 3);
  }
  // Mağlubiyet serisi cezası
  if (advanced.homeFormAnalysis?.streak.type === "loss" && advanced.homeFormAnalysis.streak.length >= 3) {
    homeAttack = Math.max(15, homeAttack - Math.min(10, advanced.homeFormAnalysis.streak.length * 2));
    homeWinProb = Math.max(5, homeWinProb - 4);
  }
  if (advanced.awayFormAnalysis?.streak.type === "loss" && advanced.awayFormAnalysis.streak.length >= 3) {
    awayAttack = Math.max(15, awayAttack - Math.min(10, advanced.awayFormAnalysis.streak.length * 2));
    awayWinProb = Math.max(5, awayWinProb - 4);
  }

  // === YENİ: H2H Elo Etkisi ===
  if (advanced.h2hElo && advanced.h2hElo.confidence > 0.3) {
    const eloAdv = advanced.h2hElo.relativeAdvantage;
    const eloWeight = advanced.h2hElo.confidence * 0.5; // Max %40 etki
    if (eloAdv > 30) {
      // Ev sahibi H2H'de üstün
      homeWinProb = Math.min(85, homeWinProb + Math.round(eloAdv * eloWeight * 0.03));
    } else if (eloAdv < -30) {
      // Deplasman H2H'de üstün
      awayWinProb = Math.min(85, awayWinProb + Math.round(Math.abs(eloAdv) * eloWeight * 0.03));
    }
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
    homeForm: homeFormScore !== 50 ? homeFormScore : homeWinProb,
    awayForm: awayFormScore !== 50 ? awayFormScore : awayWinProb,
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

  // Form serisi bilgisi
  if (advanced.homeFormAnalysis?.streak.type === "win" && advanced.homeFormAnalysis.streak.length >= 4) {
    parts.push(`🔥 ${fixture.teams.home.name} ${advanced.homeFormAnalysis.streak.length} maçlık galibiyet serisi`);
  }
  if (advanced.awayFormAnalysis?.streak.type === "win" && advanced.awayFormAnalysis.streak.length >= 4) {
    parts.push(`🔥 ${fixture.teams.away.name} ${advanced.awayFormAnalysis.streak.length} maçlık galibiyet serisi`);
  }
  if (advanced.homeFormAnalysis?.streak.type === "loss" && advanced.homeFormAnalysis.streak.length >= 3) {
    parts.push(`❄️ ${fixture.teams.home.name} ${advanced.homeFormAnalysis.streak.length} maçlık mağlubiyet serisi`);
  }
  if (advanced.awayFormAnalysis?.streak.type === "loss" && advanced.awayFormAnalysis.streak.length >= 3) {
    parts.push(`❄️ ${fixture.teams.away.name} ${advanced.awayFormAnalysis.streak.length} maçlık mağlubiyet serisi`);
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
  weights: { heuristic: number; sim: number } = { heuristic: 0.4, sim: 0.6 },
  dataQuality?: DataQualityScore,
  calibrationAdj?: Record<string, number>
): Pick[] {
  const picks: Pick[] = [];
  if (!odds) return picks;

  const sim = analysis.simulation;
  const refProfile = analysis.refereeProfile;
  const qualityPenalty = dataQuality?.confidencePenalty ?? 0;

  // === OLASI PROBLEM: Form skoru ≠ Kazanma olasılığı ===
  // Form skoru (0-100) nispi güç göstergesi. Olasılık için API + sim + odds harmanla.
  // API'nin prediction.percent değerleri (zaten buildAnalysis'te alındı) daha güvenilir.
  // Sim olasılıkları en güvenilir kaynak — 10K iterasyon Poisson.

  // 1) API-based probability (buildAnalysis'te homeForm/awayForm olarak gelenleri taban al)
  const apiHomeProb = analysis.homeForm / 100;
  const apiAwayProb = analysis.awayForm / 100;
  const apiDrawProb = (analysis.drawProb ?? (100 - analysis.homeForm - analysis.awayForm)) / 100;

  // 2) Sim-based probability (en güvenilir)
  const simHomeProb = sim ? sim.simHomeWinProb / 100 : apiHomeProb;
  const simAwayProb = sim ? sim.simAwayWinProb / 100 : apiAwayProb;
  const simDrawProb = sim ? sim.simDrawProb / 100 : apiDrawProb;

  // 3) Odds-implied probability (piyasa bilgisi — vig düzeltmeli)
  const rawImplied = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
  const vigFactor = rawImplied > 0 ? 1 / rawImplied : 1; // Vig kaldır
  const impliedHome = (1 / odds.home) * vigFactor;
  const impliedAway = (1 / odds.away) * vigFactor;
  const impliedDraw = (1 / odds.draw) * vigFactor;

  // 4) Hibrit olasılık: Sim (%45) + API (%20) + Odds (%25) + Elo (%10) → en dengeli tahmin
  // Elo olasılıkları hesapla (H2H Elo varsa daha güvenilir, yoksa API attack/defense'den)
  const homeEloApprox = 1500 + (analysis.homeAttack - 50) * 4 + (analysis.homeForm > 50 ? (analysis.homeForm - 50) * 2 : 0);
  const awayEloApprox = 1500 + (analysis.awayAttack - 50) * 4 + (analysis.awayForm > 50 ? (analysis.awayForm - 50) * 2 : 0);
  const eloProbs = eloToWinProbabilities(homeEloApprox, awayEloApprox);
  const eloHome = eloProbs.homeWin / 100;
  const eloAway = eloProbs.awayWin / 100;
  const eloDraw = eloProbs.draw / 100;

  const blendProb = (simP: number, apiP: number, oddsP: number, eloP: number): number => {
    return simP * 0.45 + apiP * 0.20 + oddsP * 0.25 + eloP * 0.10;
  };
  const homeProbability = blendProb(simHomeProb, apiHomeProb, impliedHome, eloHome);
  const awayProbability = blendProb(simAwayProb, apiAwayProb, impliedAway, eloAway);
  const drawProbability = blendProb(simDrawProb, apiDrawProb, impliedDraw, eloDraw);

  // === FAZ 4: ML Model Feature Vector ===
  const mlAvailable = isMLModelAvailable();
  let mlFeatures: MLFeatureVector | null = null;
  if (mlAvailable) {
    mlFeatures = buildFeatureVector({
      homeForm: analysis.homeForm,
      awayForm: analysis.awayForm,
      homeAttack: analysis.homeAttack,
      awayAttack: analysis.awayAttack,
      homeDefense: analysis.homeDefense,
      awayDefense: analysis.awayDefense,
      homeXg: analysis.homeXg,
      awayXg: analysis.awayXg,
      h2hGoalAvg: analysis.h2hGoalAvg,
      h2hHomeWinRate: analysis.h2hAdvantage === "home" ? 65 : analysis.h2hAdvantage === "away" ? 35 : 50,
      refereeProfile: analysis.refereeProfile
        ? { cardsPerMatch: analysis.refereeProfile.avgCardsPerMatch, foulsPerMatch: 25 }
        : null,
      matchImportance: null,
      eloRatings: { home: homeEloApprox, away: awayEloApprox },
      homeRecentGoalsScored: analysis.homeXg ?? 1.2,
      awayRecentGoalsScored: analysis.awayXg ?? 1.0,
      homeRecentGoalsConceded: analysis.awayXg ?? 1.0,
      awayRecentGoalsConceded: analysis.homeXg ?? 1.2,
    });
  }

  // Hibrit confidence hesaplama: self-calibrating ağırlıklar + ML blend
  const hybridConfidence = (heuristicConf: number, pickType: string): number => {
    if (!sim) return heuristicConf;
    const simProb = getSimProbability(sim, pickType);
    if (simProb === undefined) return heuristicConf;
    const simConf = Math.min(92, simProb); // simProb zaten % cinsinden

    // FAZ 4: ML modelden tahmin al
    const mlProb = mlFeatures ? getMLProbability(mlFeatures, pickType) : undefined;

    let blended: number;
    if (mlProb !== undefined) {
      // ML mevcut: heuristic %30 + sim %45 + ML %25
      const mlConf = Math.min(92, mlProb);
      blended = heuristicConf * (weights.heuristic * 0.75) + simConf * weights.sim + mlConf * (weights.heuristic * 0.25 + 0.1);
    } else {
      // ML yok: eski formül
      blended = heuristicConf * weights.heuristic + simConf * weights.sim;
    }

    // Sim ve heuristic çok farklıysa → güveni düşür (belirsizlik)
    const divergence = Math.abs(heuristicConf - simConf);
    const penalty = divergence > 20 ? Math.min(8, (divergence - 20) * 0.3) : 0;

    // Veri kalitesi cezası — düşük kaliteli veri = düşük güven
    const qPenalty = qualityPenalty;

    // Kalibrasyon düzeltmesi — geçmiş verilere göre over/under-confident düzeltme
    let calibAdj = 0;
    if (calibrationAdj) {
      // Blended confidence bandına göre düzeltme seç
      const approxConf = Math.round(blended);
      if (approxConf >= 80 && calibrationAdj["80+"]) calibAdj = calibrationAdj["80+"];
      else if (approxConf >= 70 && calibrationAdj["70-80"]) calibAdj = calibrationAdj["70-80"];
      else if (approxConf >= 60 && calibrationAdj["60-70"]) calibAdj = calibrationAdj["60-70"];
      else if (approxConf >= 50 && calibrationAdj["50-60"]) calibAdj = calibrationAdj["50-60"];
    }

    return Math.round(Math.max(10, blended - penalty - qPenalty + calibAdj));
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

  // --- Üst/Alt 2.5 --- (SIM-DRIVEN: simülasyon olasılığı birincil kaynak)
  const avgAttack = (analysis.homeAttack + analysis.awayAttack) / 2;
  const avgDefense = (analysis.homeDefense + analysis.awayDefense) / 2;
  const goalIndicator = avgAttack - avgDefense;
  const h2hGoalAvg = analysis.h2hGoalAvg ?? 0;
  const xgTotal = (analysis.homeXg ?? 1.2) + (analysis.awayXg ?? 1.0);
  const xgBonus = xgTotal > 2.6 ? 0.05 : 0;

  // Sim varsa sim'i kullan, yoksa heuristic
  if (sim && sim.simOver25Prob > 48) {
    // Sim diyor ki %48+ olasılıkla 2.5 üstü gol olacak
    const overProb = sim.simOver25Prob / 100;
    addPick("Over 2.5", overProb, 1 / odds.over25, odds.over25, h2hGoalAvg > 3.0 || xgTotal > 3.0, 48);
  } else if (goalIndicator > 5 || (goalIndicator > 0 && h2hGoalAvg > 2.5) || xgTotal > 2.8) {
    // Heuristic fallback — daha gevşek eşik
    const overProb = Math.min(0.72, (avgAttack / 100) * 0.6 + (h2hGoalAvg > 2.5 ? 0.12 : 0) + xgBonus + (xgTotal > 2.8 ? 0.08 : 0));
    addPick("Over 2.5", overProb, 1 / odds.over25, odds.over25, h2hGoalAvg > 3.0, 48);
  }

  if (sim && (100 - sim.simOver25Prob) > 48) {
    // Sim %48+ alt 2.5
    const underProb = (100 - sim.simOver25Prob) / 100;
    addPick("Under 2.5", underProb, 1 / odds.under25, odds.under25, h2hGoalAvg < 1.8 || xgTotal < 1.8, 48);
  } else if (goalIndicator < -5 || (goalIndicator < 0 && h2hGoalAvg < 2.2) || xgTotal < 1.8) {
    const underProb = Math.min(0.72, (avgDefense / 100) * 0.6 + (h2hGoalAvg < 2.0 ? 0.12 : 0) + (xgTotal < 1.8 ? 0.08 : 0));
    addPick("Under 2.5", underProb, 1 / odds.under25, odds.under25, h2hGoalAvg < 1.8, 48);
  }

  // --- Üst/Alt 1.5 ve 3.5 (sim-driven) ---
  if (sim) {
    if (sim.simOver15Prob > 82) {
      addPick("Over 1.5", sim.simOver15Prob / 100, 1 / odds.over15, odds.over15, xgTotal > 2.5, 62);
    }
    if ((100 - sim.simOver15Prob) > 45) {
      addPick("Under 1.5", (100 - sim.simOver15Prob) / 100, 1 / odds.under15, odds.under15, xgTotal < 1.5, 58);
    }
    if (sim.simOver35Prob > 50 && xgTotal > 3.0) {
      addPick("Over 3.5", sim.simOver35Prob / 100, 1 / odds.over35, odds.over35, xgTotal > 3.5, 58);
    }
    if ((100 - sim.simOver35Prob) > 65) {
      addPick("Under 3.5", (100 - sim.simOver35Prob) / 100, 1 / odds.under35, odds.under35, xgTotal < 2.5, 52);
    }
  }

  // --- KG Var --- (SIM-DRIVEN + xG-based)
  if (sim && sim.simBttsProb > 42) {
    // Sim %42+ KG
    const bttsProb = sim.simBttsProb / 100;
    addPick("BTTS Yes", bttsProb, 1 / odds.bttsYes, odds.bttsYes, xgTotal > 2.5, 48);
  } else if (analysis.homeAttack > 55 && analysis.awayAttack > 50 && xgTotal > 2.2) {
    // Heuristic fallback — daha geniş koşul
    const bttsProb = Math.min(0.72, ((analysis.homeAttack + analysis.awayAttack) / 200) * 0.80 + (xgTotal > 2.6 ? 0.05 : 0));
    addPick("BTTS Yes", bttsProb, 1 / odds.bttsYes, odds.bttsYes, false, 48);
  }

  // --- KG Yok ---
  if (sim && (100 - sim.simBttsProb) > 50) {
    const bttsNoProb = (100 - sim.simBttsProb) / 100;
    const weakAttack = analysis.homeAttack < 45 || analysis.awayAttack < 45;
    addPick("BTTS No", bttsNoProb, 1 / odds.bttsNo, odds.bttsNo, weakAttack, 50);
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

  // --- İY/MS (Half Time / Full Time) --- KORELASYONLU SİMÜLASYON + ORAN PROFİLİ
  if (sim?.simHtFtProbs) {
    const h2hPattern = analysis.h2hOddsHtFt;

    // İY/MS oranları: gerçek htft varsa kullan, yoksa sim'den türet
    const htftOdds: Record<string, number> = {};
    if (odds.htft && Object.keys(odds.htft).length > 0) {
      Object.assign(htftOdds, odds.htft);
    } else {
      // Sim olasılıklarından oran türet (%7 margin)
      for (const [key, simProb] of Object.entries(sim.simHtFtProbs)) {
        if (simProb > 3) { // Min %3 olasılık
          htftOdds[key] = Math.round((107 / simProb) * 100) / 100;
        }
      }
    }

    const htftEntries = Object.entries(sim.simHtFtProbs)
      .filter(([key]) => htftOdds[key] && htftOdds[key] > 1.0)
      .map(([key, simProb]) => {
        const entryOdds = htftOdds[key];
        const prob = simProb / 100;
        const implied = 1 / entryOdds;

        // H2H oran profilinden bonus/ceza
        let h2hBonus = 0;
        if (h2hPattern && h2hPattern.sampleSize >= 2) {
          const h2hProb = (h2hPattern.distribution[key] || 0) / 100;
          // H2H'de bu pattern sık görülüyorsa → bonus
          if (h2hProb > 0.20) h2hBonus = 0.06; // %20+ → güçlü sinyal
          else if (h2hProb > 0.12) h2hBonus = 0.03; // %12+ → orta sinyal

          // Comeback senaryoları (1/2, 2/1) için özel bonus
          const isComebackScenario = key === "1/2" || key === "2/1";
          if (isComebackScenario && h2hPattern.comebackRate > 25) {
            h2hBonus += 0.05; // Geçmişte çok geri dönüş varsa güçlü sinyal
          }
        }

        const adjustedProb = Math.min(0.95, prob + h2hBonus);
        return {
          key,
          prob: adjustedProb,
          rawProb: prob,
          odds: entryOdds,
          implied,
          ev: adjustedProb * entryOdds - 1,
          h2hBonus,
        };
      })
      .filter((e) => e.prob > 0.08) // Min %8 olasılık (9-yönlü market)
      .sort((a, b) => b.ev - a.ev);

    // En iyi 2 İY/MS pick'i üret — çelişen FT sonuçlarını filtrele
    let htftCount = 0;
    let firstHtftFtResult: string | null = null;
    for (const entry of htftEntries) {
      if (htftCount >= 2) break;
      const type = entry.key as PickType;
      const ftResult = entry.key.split("/")[1]; // "1", "X", veya "2"

      // Çelişki filtresi: İlk pick ile aynı FT sonucuna sahip olmayan
      // ama zıt yöne işaret eden pick'i reddet (örn. 1/1 ve 2/2)
      if (firstHtftFtResult && ftResult !== firstHtftFtResult) {
        // Zıt yön kontrolü: 1↔2 çelişir, X ile birlikte olabilir
        const isContradiction =
          (firstHtftFtResult === "1" && ftResult === "2") ||
          (firstHtftFtResult === "2" && ftResult === "1");
        if (isContradiction) continue;
      }

      // İY/MS özel confidence hesabı:
      // 9 kombinasyon var, uniform dağılımda her biri %11.
      // %20+ çok güçlü, %15+ güçlü, %10+ orta sinyal.
      // Confidence = prob'u [8-35] aralığından [48-90] aralığına ölçekle
      const htftBaseConf = Math.min(90, Math.max(48, 48 + (entry.prob - 0.08) * 155));
      let conf = Math.round(htftBaseConf);

      // EV bonus: pozitif EV → ekstra güven
      if (entry.ev > 0.10) conf = Math.min(92, conf + 3);

      // İY/MS için hybridConfidence KULLANMA — simProb %10-30 aralığı
      // normal pick'ler (%40-80) için tasarlanmış blend'i mahveder

      // H2H bonus varsa confidence'a da ekle
      if (entry.h2hBonus > 0) {
        conf = Math.min(92, conf + Math.round(entry.h2hBonus * 50));
      }

      if (conf >= 50 && entry.ev > -0.05) { // Min %50 güven, hafif negatif EV OK
        const htLabel = entry.key.split("/")[0] === "1" ? "Ev" : entry.key.split("/")[0] === "X" ? "Beraberlik" : "Deplasman";
        const ftLabel = entry.key.split("/")[1] === "1" ? "Ev" : entry.key.split("/")[1] === "X" ? "Beraberlik" : "Deplasman";

        // Comeback pick'leri özel etiketle
        const isComebackScenario = entry.key === "1/2" || entry.key === "2/1";
        let reasoning = `İY ${htLabel} → MS ${ftLabel} — sim. %${(entry.rawProb * 100).toFixed(1)}`;
        if (isComebackScenario && entry.h2hBonus > 0) {
          reasoning += ` | H2H geri dönüş sinyali (%${analysis.h2hOddsHtFt?.comebackRate ?? 0})`;
        } else if (entry.h2hBonus > 0) {
          reasoning += ` | H2H destekli`;
        }

        picks.push({
          type,
          confidence: conf,
          odds: entry.odds,
          reasoning,
          expectedValue: Math.round(entry.ev * 100) / 100,
          isValueBet: entry.ev > 0.05,
          simProbability: entry.rawProb * 100,
        });
        if (!firstHtftFtResult) firstHtftFtResult = ftResult;
        htftCount++;
      }
    }
  }

  // --- Double Chance (1X, X2, 12) --- BLENDED 1X2'DEN TÜRET (tutarlılık)
  // DC olasılıkları BLENDED 1X2'den türetilmeli — aksi halde X2 + "1" > 100% olabilir
  {
    const prob1x = homeProbability + drawProbability;
    const probX2 = awayProbability + drawProbability;
    const prob12 = homeProbability + awayProbability;

    // DC oranları: pazar oranlarından türet
    const dc1xOdds = 1 / (impliedHome + impliedDraw);
    const dcX2Odds = 1 / (impliedAway + impliedDraw);
    const dc12Odds = 1 / (impliedHome + impliedAway);

    // 1X: Ev sahibi kazanır veya berabere
    if (prob1x > 0.60 && dc1xOdds > 1.05) {
      addPick("1X", prob1x, impliedHome + impliedDraw, dc1xOdds,
        analysis.h2hAdvantage === "home" || analysis.homeForm > 60, 55);
    }

    // X2: Deplasman kazanır veya berabere
    if (probX2 > 0.60 && dcX2Odds > 1.05) {
      addPick("X2", probX2, impliedAway + impliedDraw, dcX2Odds,
        analysis.h2hAdvantage === "away" || analysis.awayForm > 60, 55);
    }

    // 12: Berabere bitmez
    if (prob12 > 0.72 && dc12Odds > 1.05) {
      addPick("12", prob12, impliedHome + impliedAway, dc12Odds,
        xgTotal > 2.8, 55);
    }
  }

  // --- Combo Picks --- SİMÜLASYON BAZLI
  if (sim) {
    // 1 & Ü1.5: Ev sahibi kazanır ve 2+ gol
    if (sim.simHomeAndOver15Prob > 30 && odds.home > 1.0 && odds.over15 > 1.0) {
      const comboOdds = odds.home * (1 / (sim.simOver15Prob / 100)) * (sim.simHomeAndOver15Prob / 100); // Yaklaşık
      const realComboOdds = Math.max(odds.home * 1.05, comboOdds); // En az %5 prim
      const prob = sim.simHomeAndOver15Prob / 100;
      addPick("1 & Over 1.5", prob, 1 / realComboOdds, realComboOdds,
        homeProbability > 0.50 && xgTotal > 2.3, 50);
    }

    // 2 & Ü1.5: Deplasman kazanır ve 2+ gol
    if (sim.simAwayAndOver15Prob > 25 && odds.away > 1.0 && odds.over15 > 1.0) {
      const realComboOdds = odds.away * 1.08;
      const prob = sim.simAwayAndOver15Prob / 100;
      addPick("2 & Over 1.5", prob, 1 / realComboOdds, realComboOdds,
        awayProbability > 0.45 && xgTotal > 2.3, 50);
    }
  }

  // --- Correct Score (CS) --- SİMÜLASYON BAZLI
  if (sim && sim.allScorelines.length > 0 && odds.exactScoreOdds) {
    const csEntries = sim.allScorelines
      .filter((s) => {
        const scoreOdds = odds.exactScoreOdds![s.score];
        return scoreOdds && scoreOdds > 3.0 && s.probability >= 6.0; // Min %6 olasılık, min 3.0 oran
      })
      .map((s) => {
        const scoreOdds = odds.exactScoreOdds![s.score];
        const prob = s.probability / 100;
        return {
          score: s.score,
          prob,
          odds: scoreOdds,
          ev: prob * scoreOdds - 1,
        };
      })
      .filter((e) => e.ev > -0.10) // Kabul edilebilir EV
      .sort((a, b) => b.ev - a.ev);

    // En iyi 2 skor tahmini
    let csCount = 0;
    for (const entry of csEntries) {
      if (csCount >= 2) break;
      const type = `CS ${entry.score}` as PickType;
      let conf = calculateConfidence(entry.prob, 1 / entry.odds, entry.prob > 0.10);
      conf = hybridConfidence(conf, type);

      if (conf >= 25 && entry.ev > -0.05) {
        picks.push({
          type,
          confidence: Math.max(conf, 30), // CS doğası gereği düşük conf — min 30 göster
          odds: entry.odds,
          reasoning: `En olası skor ${entry.score} — sim. %${(entry.prob * 100).toFixed(1)}`,
          expectedValue: Math.round(entry.ev * 100) / 100,
          isValueBet: entry.ev > 0.05,
          simProbability: entry.prob * 100,
        });
        csCount++;
      }
    }
  }

  // --- Korner 8.5 Üst/Alt DEVRE DIŞI ---
  // Korner verileri sentetik (gerçek istatistik yok), tahmin güvenilir değil.
  // Korner bilgisi sadece insight olarak kullanılıyor.

  // --- Kart 3.5 Üst/Alt DEVRE DIŞI ---
  // Kart verileri de sentetik — gerçek istatistik olmadan pick üretilmiyor.
  // Hakem profili yalnızca insight olarak kullanılıyor.

  // === CROSS-MARKET TUTARLILIK KONTROLÜ ===
  // 1. CS olasılık şişmesi: Tek bir skor satırı max %30 olabilir
  for (const pick of picks) {
    if (pick.type.startsWith("CS ") && pick.simProbability && pick.simProbability > 30) {
      const cappedProb = 30;
      const ratio = cappedProb / pick.simProbability;
      pick.simProbability = cappedProb;
      pick.expectedValue = Math.round(((cappedProb / 100) * pick.odds - 1) * 100) / 100;
      pick.isValueBet = pick.expectedValue > 0.05;
      pick.confidence = Math.min(pick.confidence, Math.round(pick.confidence * ratio));
      pick.reasoning = pick.reasoning.replace(/sim\. %[\d.]+/, `sim. %${cappedProb.toFixed(1)}`);
    }
  }

  // 2. BTTS No yüksek → İY/MS'de her iki takımın gol atmasını gerektiren senaryolara ceza
  const bttsNoPick = picks.find(p => p.type === "BTTS No");
  if (bttsNoPick && bttsNoPick.confidence >= 75) {
    for (const pick of picks) {
      // 1/1 (ev dominasyonu) ve 2/2 (deplasman dominasyonu): Tek takım gol atıyor, uyumlu.
      // AMA combo pick'ler (X & BTTS gibi) veya her iki takımın gol atmasını gerektiren pick'ler çelişir.
      // HT/FT pick'lerinde: X/X (0-0 olasılığı yoksa), 1/2, 2/1 gibi comeback senaryoları
      // genellikle iki takımın da gol atmasını gerektirir.
      if (pick.type === "HT BTTS Yes") {
        pick.confidence = Math.max(10, pick.confidence - 15);
      }
    }
  }

  // 3. DC tutarlılık: 1X + 2 > 100% veya X2 + 1 > 100% olmamalı
  const dcPicks = picks.filter(p => ["1X", "X2", "12"].includes(p.type));
  const resultPicks = picks.filter(p => ["1", "X", "2"].includes(p.type));
  for (const dc of dcPicks) {
    // DC pick'in zıddı olan sonuç pick'i bul
    const opposing = dc.type === "1X" ? resultPicks.find(p => p.type === "2")
      : dc.type === "X2" ? resultPicks.find(p => p.type === "1")
      : dc.type === "12" ? resultPicks.find(p => p.type === "X")
      : null;
    if (opposing) {
      // DC prob + zıt sonuç olasılığı 100%'ü geçmemeli
      const dcImpliedProb = dc.expectedValue !== undefined ? (dc.expectedValue + 1) / dc.odds : dc.confidence / 100;
      const oppImpliedProb = opposing.expectedValue !== undefined ? (opposing.expectedValue + 1) / opposing.odds : opposing.confidence / 100;
      if (dcImpliedProb + oppImpliedProb > 1.05) { // %5 tolerance
        // Fazlalığı düşük confidence olan pick'ten kes
        if (dc.confidence > opposing.confidence) {
          opposing.confidence = Math.max(10, opposing.confidence - 5);
        } else {
          dc.confidence = Math.max(10, dc.confidence - 5);
        }
      }
    }
  }

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
  importance?: MatchImportance,
  homeForm?: FormAnalysis,
  awayForm?: FormAnalysis
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

  // === YENİ: Form Decay & Streak Insights ===
  if (homeForm?.streak.type === "win" && homeForm.streak.length >= 3) {
    notes.push(`🔥 Ev sahibi ${homeForm.streak.length} maçlık galibiyet serisi — momentum yüksek`);
  }
  if (awayForm?.streak.type === "win" && awayForm.streak.length >= 3) {
    notes.push(`🔥 Deplasman ${awayForm.streak.length} maçlık galibiyet serisi — momentum yüksek`);
  }
  if (homeForm?.streak.type === "loss" && homeForm.streak.length >= 3) {
    notes.push(`❄️ Ev sahibi ${homeForm.streak.length} maçlık mağlubiyet serisi — düşüşte`);
  }
  if (awayForm?.streak.type === "loss" && awayForm.streak.length >= 3) {
    notes.push(`❄️ Deplasman ${awayForm.streak.length} maçlık mağlubiyet serisi — düşüşte`);
  }
  if (homeForm?.trend === "rising") {
    notes.push(`📈 Ev sahibi form yükselişte (ağırlıklı: %${homeForm.weightedForm})`);
  }
  if (awayForm?.trend === "rising") {
    notes.push(`📈 Deplasman form yükselişte (ağırlıklı: %${awayForm.weightedForm})`);
  }
  if (homeForm?.trend === "falling") {
    notes.push(`📉 Ev sahibi form düşüşte (ağırlıklı: %${homeForm.weightedForm})`);
  }
  if (awayForm?.trend === "falling") {
    notes.push(`📉 Deplasman form düşüşte (ağırlıklı: %${awayForm.weightedForm})`);
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

  // Logaritmik edge ağırlıklandırma — küçük edge'lerde temkinli, büyüklerde agresif
  if (edge > 0) {
    // Pozitif edge: log scale ile artan bonus (max 18)
    const edgeBonus = Math.min(18, Math.log1p(edge * 8) * 10);
    confidence += edgeBonus;

    // Kelly-inspired ek bonus: edge / odds → oransal artış (max 5)
    // Yüksek olasılıklı maçlarda edge daha değerli
    if (impliedProb > 0) {
      const kellySignal = Math.min(5, (edge / impliedProb) * 8);
      confidence += kellySignal;
    }
  } else {
    // Negatif edge: kare kök scale ile ceza (daha sert düşüş)
    const edgePenalty = Math.min(15, Math.sqrt(Math.abs(edge)) * 12);
    confidence -= edgePenalty;
  }

  if (extraSignal) confidence += 4;

  // xG veri mevcutsa küçük güven bonusu (daha güvenilir data)
  // modelProb xG tabanlıysa genelde 0.3-0.7 arasında - heuristic fallback 0.15-0.90
  if (modelProb > 0.25 && modelProb < 0.75 && edge > 0) {
    confidence += 2; // Makul aralıktaki tahminlere küçük ödül
  }

  // Over-confidence freni: %80+ confidence'larda damping
  if (confidence > 80) {
    confidence = 80 + (confidence - 80) * 0.5;
  }

  return Math.round(Math.max(10, Math.min(92, confidence)));
}

function getPickReasoning(type: PickType, confidence: number, prediction: PredictionResponse | null, analysis: MatchAnalysis): string {
  const level = confidence >= 70 ? "Güçlü" : confidence >= 55 ? "Orta" : "Zayıf";
  const xgNote = analysis.xgDelta && analysis.xgDelta > 0.5 ? " | xG verimsizlik var" : "";
  const injuryNote = (analysis.injuryImpact.home > 5 || analysis.injuryImpact.away > 5) ? " | Sakatlık etkisi önemli" : "";
  const sim = analysis.simulation;

  const reasons: Record<string, string> = {
    "1": `${level} ev sahibi — form, xG ve oran analizi${injuryNote}`,
    "X": `Dengeli güçler — beraberlik olasılığı yüksek${xgNote}`,
    "2": `${level} deplasman — istatistikler destekliyor${injuryNote}`,
    "Over 1.5": `${level} tahmin — Ü1.5 olasılığı yüksek${sim ? ` (sim %${sim.simOver15Prob.toFixed(0)})` : ""}`,
    "Under 1.5": `Az gollü maç bekleniyor — savunma baskın${sim ? ` (sim %${(100 - sim.simOver15Prob).toFixed(0)})` : ""}`,
    "Over 2.5": `Gollü maç — hücum, H2H ve xG destekliyor${xgNote}`,
    "Under 2.5": `Golsüz maç — savunma güçlü, H2H destekliyor`,
    "Over 3.5": `Çok gollü maç bekleniyor — hücumlar baskın${sim ? ` (sim %${sim.simOver35Prob.toFixed(0)})` : ""}${xgNote}`,
    "Under 3.5": `3.5 altı gol bekleniyor — savunmalar stabil`,
    "BTTS Yes": `Her iki hücum güçlü — KG beklentisi${xgNote}`,
    "BTTS No": `Savunma ağırlıklı — en az bir taraf gol atamayabilir`,
    "HT BTTS Yes": `İlk yarıda her iki takım da gol bulabilir — hücum dengeleri güçlü${xgNote}`,
    "HT BTTS No": `İlk yarı gol olasılığı düşük — savunma ağırlıklı başlangıç`,
    "1X": `Ev sahibi veya berabere — ${level} çifte şans`,
    "X2": `Deplasman veya berabere — ${level} çifte şans`,
    "12": `Beraberlik zor — ${level} çifte şans`,
    "1 & Over 1.5": `Ev sahibi kazanır + 2 gol üstü — ${level} combo`,
    "2 & Over 1.5": `Deplasman kazanır + 2 gol üstü — ${level} combo`,
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

  // API advice sadece 1X2 pick'lerinde ekle (diğer marketlerde alakasız olabiliyor)
  const apiAdvice = prediction?.predictions?.advice;
  if (apiAdvice && confidence >= 60 && (type === "1" || type === "X" || type === "2")) {
    return `${base}. API: ${apiAdvice}`;
  }
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
  const cleaned = str.replace("%", "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 50 : Math.round(num);
}

function adjustByForm(base: number, form: string): number {
  // Yüzde formatı gelirse ("67%") doğrudan parse et
  if (form.includes("%")) {
    const pct = parseFloat(form.replace("%", ""));
    if (!isNaN(pct) && pct !== 50) {
      // Yüzde ile base'i ağırlıklı harmanlama
      return Math.max(10, Math.min(95, Math.round(base * 0.5 + pct * 0.5)));
    }
    return base;
  }
  // WWDLW formatı
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
