// ============================================
// Self-Correction Optimizer
// Haftalık otomatik lambda kalibrasyon motoru
//
// Mantık:
// 1. Geçmiş maçları lig + pazar bazında analiz et
// 2. Simülasyon sapmasını (predicted vs actual) ölç
// 3. Lambda çarpanlarını ±%2-3 ayarla
// 4. Sonuçları DB'de sakla → simulator.ts okusun
//
// Tetikleme: Haftalık cron (calibrate cron) veya admin panelden manuel
// ============================================

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";

// ---- Types ----

export interface LeagueCalibration {
  leagueId: number;
  leagueName: string;
  homeAdvantage: number;         // Güncel çarpan (ör: 1.12)
  previousHomeAdvantage: number; // Önceki çarpan
  adjustment: number;            // Son ayarlama (ör: -0.02)
  sampleSize: number;
  metrics: {
    predictedHomeWinRate: number;
    actualHomeWinRate: number;
    predictedOverRate: number;
    actualOverRate: number;
    predictedBttsRate: number;
    actualBttsRate: number;
    avgGoalDeviation: number;    // |predicted - actual| gol farkı
  };
}

export interface MarketCalibration {
  market: string;
  totalPredictions: number;
  predictedWinRate: number;
  actualWinRate: number;
  deviation: number;             // predicted - actual (pozitif = over-confident)
  lambdaAdjustment: number;      // Önerilen lambda düzeltme
  status: "over" | "under" | "calibrated";
}

export interface OptimizationResult {
  timestamp: string;
  totalRecords: number;
  leagueCalibrations: LeagueCalibration[];
  marketCalibrations: MarketCalibration[];
  globalMetrics: {
    overallCalibrationError: number;  // MAE
    overConfidentMarkets: string[];
    underConfidentMarkets: string[];
    bestPerformingLeague: string;
    worstPerformingLeague: string;
  };
  appliedAdjustments: number;          // Kaç liga/pazar ayarlandı
}

// ---- Default Lambda Değerleri (simulator.ts ile senkron) ----

const BASE_HOME_ADVANTAGE: Record<number, { factor: number; name: string }> = {
  203: { factor: 1.12, name: "Süper Lig" },
  204: { factor: 1.10, name: "1. Lig" },
  39:  { factor: 1.04, name: "Premier League" },
  140: { factor: 1.08, name: "La Liga" },
  135: { factor: 1.09, name: "Serie A" },
  78:  { factor: 1.05, name: "Bundesliga" },
  61:  { factor: 1.06, name: "Ligue 1" },
  94:  { factor: 1.07, name: "Primeira Liga" },
  88:  { factor: 1.05, name: "Eredivisie" },
  144: { factor: 1.06, name: "Jupiler Pro League" },
  235: { factor: 1.11, name: "Rusya Premier Liga" },
  2:   { factor: 1.03, name: "Champions League" },
  3:   { factor: 1.04, name: "Europa League" },
  848: { factor: 1.04, name: "Conference League" },
};

const DEFAULT_HOME_ADVANTAGE = 1.05;
const MAX_ADJUSTMENT = 0.03;      // Tek seferde max ±%3
const MIN_SAMPLE_SIZE = 15;       // En az 15 maç gerekli
const OPTIMIZATION_CACHE_KEY = "optimizer-result";
const OPTIMIZATION_CACHE_TTL = 12 * 3600; // 12 saat
const CALIBRATED_FACTORS_KEY = "calibrated-home-factors";
const CALIBRATED_FACTORS_TTL = 7 * 24 * 3600; // 1 hafta

// ---- Ana Optimizasyon Fonksiyonu ----

/**
 * Tüm geçmiş tahminleri analiz et ve lambda çarpanlarını optimize et.
 * Haftalık çağrılır. Sonuçları hem cache'e hem DB'ye yazar.
 */
export async function runOptimization(): Promise<OptimizationResult> {
  const supabase = createAdminSupabase();

  // 1. Tüm settle edilmiş kayıtları çek
  const { data: records } = await supabase
    .from("validation_records")
    .select("*")
    .in("result", ["won", "lost"])
    .order("kickoff", { ascending: false });

  let all = records || [];

  // Fallback: validation_records boşsa predictions'tan oku
  if (all.length === 0) {
    const { data: predictions } = await supabase
      .from("predictions")
      .select("*")
      .in("result", ["won", "lost"])
      .order("kickoff", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    all = (predictions || []).map((p: any) => ({
      id: p.id,
      fixture_id: p.fixture_id,
      home_team: p.home_team,
      away_team: p.away_team,
      league: p.league,
      kickoff: p.kickoff,
      pick: p.pick,
      confidence: p.confidence,
      odds: p.odds,
      expected_value: p.expected_value,
      is_value_bet: p.is_value_bet,
      result: p.result,
      actual_score: p.actual_score ?? null,
      sim_probability: p.sim_probability ?? null,
      sim_top_scoreline: p.sim_top_scoreline ?? null,
      edge_at_open: p.edge_at_open ?? null,
      analysis_summary: p.analysis_summary ?? "",
      created_at: p.created_at,
    })) as unknown as typeof all;
  }

  if (all.length < MIN_SAMPLE_SIZE) {
    return {
      timestamp: new Date().toISOString(),
      totalRecords: all.length,
      leagueCalibrations: [],
      marketCalibrations: [],
      globalMetrics: {
        overallCalibrationError: 0,
        overConfidentMarkets: [],
        underConfidentMarkets: [],
        bestPerformingLeague: "N/A",
        worstPerformingLeague: "N/A",
      },
      appliedAdjustments: 0,
    };
  }

  // 2. Liga bazlı analiz
  const leagueCalibrations = analyzeLeagues(all);

  // 3. Pazar bazlı analiz
  const marketCalibrations = analyzeMarkets(all);

  // 4. Global metrikler
  const globalMetrics = calculateGlobalMetrics(leagueCalibrations, marketCalibrations);

  // 5. Kalibre edilmiş faktörleri cache'e yaz (simulator.ts okuyacak)
  const calibratedFactors: Record<number, number> = {};
  let appliedAdjustments = 0;

  for (const lc of leagueCalibrations) {
    if (lc.adjustment !== 0) {
      calibratedFactors[lc.leagueId] = lc.homeAdvantage;
      appliedAdjustments++;
    }
  }

  if (Object.keys(calibratedFactors).length > 0) {
    setCache(CALIBRATED_FACTORS_KEY, calibratedFactors, CALIBRATED_FACTORS_TTL);

    // DB'ye de kaydet (kalıcı)
    await saveCalibrationToDB(calibratedFactors, leagueCalibrations, marketCalibrations);
  }

  const result: OptimizationResult = {
    timestamp: new Date().toISOString(),
    totalRecords: all.length,
    leagueCalibrations,
    marketCalibrations,
    globalMetrics,
    appliedAdjustments,
  };

  setCache(OPTIMIZATION_CACHE_KEY, result, OPTIMIZATION_CACHE_TTL);
  return result;
}

// ---- Liga Bazlı Analiz ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function analyzeLeagues(records: any[]): LeagueCalibration[] {
  // Lig adına göre grupla
  const leagueGroups = new Map<string, typeof records>();

  for (const r of records) {
    const league = r.league || "Unknown";
    if (!leagueGroups.has(league)) leagueGroups.set(league, []);
    leagueGroups.get(league)!.push(r);
  }

  const calibrations: LeagueCalibration[] = [];

  for (const [leagueName, group] of leagueGroups) {
    if (group.length < MIN_SAMPLE_SIZE) continue;

    // Liga ID'sini bul (isim eşleşmesi)
    const leagueId = findLeagueId(leagueName);
    const baseAdvantage = BASE_HOME_ADVANTAGE[leagueId]?.factor ?? DEFAULT_HOME_ADVANTAGE;

    // Ev sahibi tahminleri
    const homeWinPicks = group.filter((r: { pick: string }) => r.pick === "1");
    const awayWinPicks = group.filter((r: { pick: string }) => r.pick === "2");
    const overPicks = group.filter((r: { pick: string }) => r.pick.includes("Over"));
    const bttsYesPicks = group.filter((r: { pick: string }) => r.pick === "BTTS Yes");

    // Predicted vs Actual oranları
    const predictedHomeWinRate = homeWinPicks.length > 0
      ? homeWinPicks.reduce((s: number, r: { confidence: number }) => s + r.confidence, 0) / homeWinPicks.length
      : 50;
    const actualHomeWinRate = homeWinPicks.length > 0
      ? (homeWinPicks.filter((r: { result: string }) => r.result === "won").length / homeWinPicks.length) * 100
      : 50;

    const predictedOverRate = overPicks.length > 0
      ? overPicks.reduce((s: number, r: { confidence: number }) => s + r.confidence, 0) / overPicks.length
      : 50;
    const actualOverRate = overPicks.length > 0
      ? (overPicks.filter((r: { result: string }) => r.result === "won").length / overPicks.length) * 100
      : 50;

    const predictedBttsRate = bttsYesPicks.length > 0
      ? bttsYesPicks.reduce((s: number, r: { confidence: number }) => s + r.confidence, 0) / bttsYesPicks.length
      : 50;
    const actualBttsRate = bttsYesPicks.length > 0
      ? (bttsYesPicks.filter((r: { result: string }) => r.result === "won").length / bttsYesPicks.length) * 100
      : 50;

    // Skor sapması hesapla
    let avgGoalDeviation = 0;
    const scoredRecords = group.filter((r: { actual_score: string | null }) => r.actual_score);
    if (scoredRecords.length > 0) {
      let totalDev = 0;
      for (const r of scoredRecords) {
        const [homeGoals, awayGoals] = (r.actual_score as string).split("-").map(Number);
        const actualTotal = (homeGoals || 0) + (awayGoals || 0);
        // Üst bahisleri için sapma kontrol
        const expectedTotal = r.pick.includes("Over") ? 3.0 : r.pick.includes("Under") ? 2.0 : 2.5;
        totalDev += Math.abs(actualTotal - expectedTotal);
      }
      avgGoalDeviation = totalDev / scoredRecords.length;
    }

    // Lambda ayarlama hesabı
    // Mantık:
    // - Ev sahibi tahminleri sürekli KAYIP → homeAdvantage çok yüksek → düşür
    // - Ev sahibi tahminleri sürekli KAZANIYOR → homeAdvantage çok düşük → artır  
    // - Üst tahminleri sürekli KAYIP → lambda çok yüksek → düşür
    let adjustment = 0;

    // Ev sahibi sapması
    const homeDeviation = predictedHomeWinRate - actualHomeWinRate;
    if (Math.abs(homeDeviation) > 5 && homeWinPicks.length >= 5) {
      // Over-confident → düşür, Under-confident → artır
      adjustment -= (homeDeviation / 100) * 0.04; // %5 sapma = 0.002 ayarlama
    }

    // Üst/Alt sapması
    const overDeviation = predictedOverRate - actualOverRate;
    if (Math.abs(overDeviation) > 5 && overPicks.length >= 5) {
      adjustment -= (overDeviation / 100) * 0.03;
    }

    // Away sapması (ters yönde etki)
    const awayDeviation = awayWinPicks.length >= 5
      ? (awayWinPicks.reduce((s: number, r: { confidence: number }) => s + r.confidence, 0) / awayWinPicks.length) -
        ((awayWinPicks.filter((r: { result: string }) => r.result === "won").length / awayWinPicks.length) * 100)
      : 0;
    if (Math.abs(awayDeviation) > 5 && awayWinPicks.length >= 5) {
      // Deplasman over-confident → ev avantajı aslında daha yüksek
      adjustment += (awayDeviation / 100) * 0.02;
    }

    // Sınırla: max ±3%
    adjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, adjustment));

    // Küçük sapmaları yok say (noise filter)
    if (Math.abs(adjustment) < 0.005) adjustment = 0;

    // Yeni çarpan
    const newAdvantage = Math.round((baseAdvantage + adjustment) * 1000) / 1000;
    // Mantıklı aralığı sınırla (0.95 – 1.20)
    const clampedAdvantage = Math.max(0.95, Math.min(1.20, newAdvantage));

    calibrations.push({
      leagueId,
      leagueName,
      homeAdvantage: clampedAdvantage,
      previousHomeAdvantage: baseAdvantage,
      adjustment: Math.round((clampedAdvantage - baseAdvantage) * 1000) / 1000,
      sampleSize: group.length,
      metrics: {
        predictedHomeWinRate: round1(predictedHomeWinRate),
        actualHomeWinRate: round1(actualHomeWinRate),
        predictedOverRate: round1(predictedOverRate),
        actualOverRate: round1(actualOverRate),
        predictedBttsRate: round1(predictedBttsRate),
        actualBttsRate: round1(actualBttsRate),
        avgGoalDeviation: round1(avgGoalDeviation),
      },
    });
  }

  return calibrations.sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));
}

// ---- Pazar Bazlı Analiz ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function analyzeMarkets(records: any[]): MarketCalibration[] {
  const marketGroups = new Map<string, typeof records>();

  for (const r of records) {
    const market = r.pick || "Unknown";
    if (!marketGroups.has(market)) marketGroups.set(market, []);
    marketGroups.get(market)!.push(r);
  }

  const calibrations: MarketCalibration[] = [];

  for (const [market, group] of marketGroups) {
    if (group.length < 5) continue;

    const predicted = group.reduce((s: number, r: { confidence: number }) => s + r.confidence, 0) / group.length;
    const actual = (group.filter((r: { result: string }) => r.result === "won").length / group.length) * 100;
    const deviation = round1(predicted - actual);

    let status: "over" | "under" | "calibrated" = "calibrated";
    let lambdaAdj = 0;

    if (deviation > 5) {
      status = "over";
      // Over-confident: gol beklentisi yüksek → lambda düşür
      if (market.includes("Over")) lambdaAdj = -0.02 * (deviation / 10);
      // Ev sahibi beklentisi yüksek → homeAdvantage düşür
      else if (market === "1") lambdaAdj = -0.015 * (deviation / 10);
      else lambdaAdj = -0.01 * (deviation / 10);
    } else if (deviation < -5) {
      status = "under";
      if (market.includes("Over")) lambdaAdj = 0.02 * (Math.abs(deviation) / 10);
      else if (market === "1") lambdaAdj = 0.015 * (Math.abs(deviation) / 10);
      else lambdaAdj = 0.01 * (Math.abs(deviation) / 10);
    }

    calibrations.push({
      market,
      totalPredictions: group.length,
      predictedWinRate: round1(predicted),
      actualWinRate: round1(actual),
      deviation,
      lambdaAdjustment: Math.round(lambdaAdj * 1000) / 1000,
      status,
    });
  }

  return calibrations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

// ---- Global Metrikler ----

function calculateGlobalMetrics(
  leagueCalibrations: LeagueCalibration[],
  marketCalibrations: MarketCalibration[]
) {
  const overConfident = marketCalibrations
    .filter((m) => m.status === "over")
    .map((m) => `${m.market} (${m.deviation > 0 ? "+" : ""}${m.deviation}%)`);

  const underConfident = marketCalibrations
    .filter((m) => m.status === "under")
    .map((m) => `${m.market} (${m.deviation}%)`);

  const totalError = marketCalibrations.reduce((s, m) => s + Math.abs(m.deviation), 0);
  const overallCalibrationError = marketCalibrations.length > 0
    ? round1(totalError / marketCalibrations.length)
    : 0;

  // En iyi/kötü lig (adjustment'a göre)
  const sorted = [...leagueCalibrations].sort((a, b) => a.adjustment - b.adjustment);
  const best = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const worst = sorted.length > 0 ? sorted[0] : null;

  return {
    overallCalibrationError,
    overConfidentMarkets: overConfident,
    underConfidentMarkets: underConfident,
    bestPerformingLeague: best ? `${best.leagueName} (adj: ${best.adjustment > 0 ? "+" : ""}${best.adjustment})` : "N/A",
    worstPerformingLeague: worst ? `${worst.leagueName} (adj: ${worst.adjustment > 0 ? "+" : ""}${worst.adjustment})` : "N/A",
  };
}

// ---- DB Kayıt ----

async function saveCalibrationToDB(
  factors: Record<number, number>,
  leagueCals: LeagueCalibration[],
  marketCals: MarketCalibration[]
): Promise<void> {
  const supabase = createAdminSupabase();

  // calibration_logs tablosu yoksa predictions'a summary olarak kaydet
  // İlk iterasyon: tweets tablosu üzerinden "analytic" tip ile log bırak
  const logContent = [
    `[OPTIMIZER] ${new Date().toISOString()}`,
    `Ligler: ${leagueCals.map(l => `${l.leagueName}(${l.adjustment > 0 ? "+" : ""}${l.adjustment})`).join(", ")}`,
    `Pazarlar: ${marketCals.filter(m => m.status !== "calibrated").map(m => `${m.market}:${m.status}`).join(", ")}`,
    `Faktörler: ${JSON.stringify(factors)}`,
  ].join("\n");

  await supabase.from("tweets").insert({
    tweet_id: `optimizer-${Date.now()}`,
    type: "analytic" as const,
    content: logContent.slice(0, 500),
    fixture_id: null,
    reply_to_tweet_id: null,
  });
}

// ---- Simulator.ts İçin: Kalibre Edilmiş Faktörleri Al ----

/**
 * Simulator'ın çağıracağı fonksiyon.
 * Cache'ten optimize edilmiş home advantage çarpanını alır.
 * Cache yoksa base değeri döner.
 */
export function getCalibratedHomeAdvantage(leagueId?: number): number {
  if (!leagueId) return DEFAULT_HOME_ADVANTAGE;

  // Önce cache'ten kalibre edilmiş değeri kontrol et
  const calibrated = getCached<Record<number, number>>(CALIBRATED_FACTORS_KEY);
  if (calibrated && calibrated[leagueId] !== undefined) {
    return calibrated[leagueId];
  }

  // Yoksa base değeri döndür
  return BASE_HOME_ADVANTAGE[leagueId]?.factor ?? DEFAULT_HOME_ADVANTAGE;
}

/**
 * Son optimization sonucunu getir (dashboard için)
 */
export function getLastOptimizationResult(): OptimizationResult | null {
  return getCached<OptimizationResult>(OPTIMIZATION_CACHE_KEY);
}

// ---- Yardımcılar ----

function findLeagueId(leagueName: string): number {
  const nameMap: Record<string, number> = {
    "Süper Lig": 203, "Super Lig": 203,
    "1. Lig": 204,
    "Premier League": 39,
    "La Liga": 140,
    "Serie A": 135,
    "Bundesliga": 78,
    "Ligue 1": 61,
    "Primeira Liga": 94,
    "Eredivisie": 88,
    "Jupiler Pro League": 144,
    "Premier Liga": 235, "Russian Premier League": 235,
    "Champions League": 2, "UEFA Champions League": 2,
    "Europa League": 3, "UEFA Europa League": 3,
    "Conference League": 848, "UEFA Europa Conference League": 848,
  };

  // Tam eşleşme
  if (nameMap[leagueName]) return nameMap[leagueName];

  // Partial eşleşme
  const lower = leagueName.toLowerCase();
  for (const [key, id] of Object.entries(nameMap)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return id;
    }
  }

  return 0; // Bilinmeyen lig
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
