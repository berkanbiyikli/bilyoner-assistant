// ============================================
// Backtest & Validation Engine
// Tahmin doğruluk analizi ve feedback loop
// ============================================

import type { ValidationStats, ValidationRecord } from "@/types";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Settle edilen bir maçın validasyon kaydını oluştur
 * settle-bets cron'u tarafından çağrılır
 */
export function createValidationRecord(
  predictionRow: {
    fixture_id: number;
    home_team: string;
    away_team: string;
    league: string;
    kickoff: string;
    pick: string;
    confidence: number;
    odds: number;
    expected_value: number;
    is_value_bet: boolean;
    result: "won" | "lost" | "void" | "pending";
    analysis_summary: string;
  },
  actualScore: string,
  simTopScoreline?: string,
  simProbability?: number,
  edge?: number
): ValidationRecord {
  return {
    fixtureId: predictionRow.fixture_id,
    homeTeam: predictionRow.home_team,
    awayTeam: predictionRow.away_team,
    league: predictionRow.league,
    kickoff: predictionRow.kickoff,
    pick: predictionRow.pick,
    confidence: predictionRow.confidence,
    odds: predictionRow.odds,
    expectedValue: predictionRow.expected_value,
    isValueBet: predictionRow.is_value_bet,
    simProbability,
    simTopScoreline,
    actualScore,
    result: predictionRow.result,
    edgeAtOpen: edge,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validasyon kaydını Supabase'e kaydet
 */
export async function saveValidationRecord(record: ValidationRecord): Promise<void> {
  const supabase = createAdminSupabase();

  await supabase.from("validation_records").insert({
    fixture_id: record.fixtureId,
    home_team: record.homeTeam,
    away_team: record.awayTeam,
    league: record.league,
    kickoff: record.kickoff,
    pick: record.pick,
    confidence: record.confidence,
    odds: record.odds,
    expected_value: record.expectedValue,
    is_value_bet: record.isValueBet,
    sim_probability: record.simProbability ?? null,
    sim_top_scoreline: record.simTopScoreline ?? null,
    actual_score: record.actualScore ?? null,
    result: record.result as "won" | "lost" | "void" | "pending",
    edge_at_open: record.edgeAtOpen ?? null,
  });
}

/**
 * Tüm validasyon istatistiklerini hesapla
 * Dashboard ve tweet raporu için kullanılır
 */
export async function calculateValidationStats(): Promise<ValidationStats> {
  const supabase = createAdminSupabase();

  const { data: records } = await supabase
    .from("validation_records")
    .select("*")
    .in("result", ["won", "lost"])
    .order("kickoff", { ascending: false });

  const all = records || [];
  if (all.length === 0) return emptyStats();

  const won = all.filter((r) => r.result === "won").length;
  const lost = all.filter((r) => r.result === "lost").length;
  const total = won + lost;
  const winRate = total > 0 ? (won / total) * 100 : 0;

  // ROI hesabı: (toplam kazanç - toplam yatırım) / toplam yatırım * 100
  let totalStake = 0;
  let totalReturn = 0;
  for (const r of all) {
    totalStake += 1; // Her bahis 1 birim
    if (r.result === "won") totalReturn += r.odds;
  }
  const roi = totalStake > 0 ? ((totalReturn - totalStake) / totalStake) * 100 : 0;

  const avgConfidence = all.reduce((sum, r) => sum + r.confidence, 0) / total;
  const avgOdds = all.reduce((sum, r) => sum + r.odds, 0) / total;

  // Confidence band analizi
  const bands = [
    { band: "50-60", min: 50, max: 60 },
    { band: "60-70", min: 60, max: 70 },
    { band: "70-80", min: 70, max: 80 },
    { band: "80+", min: 80, max: 100 },
  ];
  const byConfidenceBand = bands.map(({ band, min, max }) => {
    const filtered = all.filter((r) => r.confidence >= min && r.confidence < (max === 100 ? 101 : max));
    const bWon = filtered.filter((r) => r.result === "won").length;
    const bTotal = filtered.length;
    let bRoi = 0;
    if (bTotal > 0) {
      const bReturn = filtered.filter((r) => r.result === "won").reduce((sum, r) => sum + r.odds, 0);
      bRoi = ((bReturn - bTotal) / bTotal) * 100;
    }
    return { band, total: bTotal, won: bWon, winRate: bTotal > 0 ? (bWon / bTotal) * 100 : 0, roi: Math.round(bRoi * 10) / 10 };
  });

  // Market type analizi
  const marketTypes = [...new Set(all.map((r) => r.pick))];
  const byMarket = marketTypes.map((market) => {
    const filtered = all.filter((r) => r.pick === market);
    const mWon = filtered.filter((r) => r.result === "won").length;
    const mTotal = filtered.length;
    let mRoi = 0;
    if (mTotal > 0) {
      const mReturn = filtered.filter((r) => r.result === "won").reduce((sum, r) => sum + r.odds, 0);
      mRoi = ((mReturn - mTotal) / mTotal) * 100;
    }
    return { market, total: mTotal, won: mWon, winRate: mTotal > 0 ? (mWon / mTotal) * 100 : 0, roi: Math.round(mRoi * 10) / 10 };
  }).sort((a, b) => b.roi - a.roi);

  // Simülasyon doğruluk analizi
  const withSim = all.filter((r) => r.sim_top_scoreline && r.actual_score);
  let scorelineHits = 0;
  let top1Hits = 0;
  for (const r of withSim) {
    if (!r.sim_top_scoreline || !r.actual_score) continue;
    // sim_top_scoreline "2-1" formatında, birden fazla skor virgülle ayrılmış olabilir
    const simScores = r.sim_top_scoreline.split(",").map((s: string) => s.trim());
    if (simScores.includes(r.actual_score)) scorelineHits++;
    if (simScores[0] === r.actual_score) top1Hits++;
  }

  const simEdgeRecords = all.filter((r) => r.edge_at_open && r.edge_at_open > 10);
  let simEdgeROI = 0;
  if (simEdgeRecords.length > 0) {
    const seReturn = simEdgeRecords.filter((r) => r.result === "won").reduce((sum, r) => sum + r.odds, 0);
    simEdgeROI = ((seReturn - simEdgeRecords.length) / simEdgeRecords.length) * 100;
  }

  const simAccuracy = {
    scorelineHitRate: withSim.length > 0 ? Math.round((scorelineHits / withSim.length) * 1000) / 10 : 0,
    top1HitRate: withSim.length > 0 ? Math.round((top1Hits / withSim.length) * 1000) / 10 : 0,
    simEdgeROI: Math.round(simEdgeROI * 10) / 10,
    avgSimConfidence: withSim.length > 0
      ? Math.round(withSim.reduce((sum, r) => sum + (r.sim_probability ?? 0), 0) / withSim.length * 10) / 10
      : 0,
  };

  // Value bet performansı
  const valueBets = all.filter((r) => r.is_value_bet);
  const vbWon = valueBets.filter((r) => r.result === "won").length;
  let vbRoi = 0;
  if (valueBets.length > 0) {
    const vbReturn = valueBets.filter((r) => r.result === "won").reduce((sum, r) => sum + r.odds, 0);
    vbRoi = ((vbReturn - valueBets.length) / valueBets.length) * 100;
  }
  const valueBetStats = {
    total: valueBets.length,
    won: vbWon,
    winRate: valueBets.length > 0 ? Math.round((vbWon / valueBets.length) * 1000) / 10 : 0,
    roi: Math.round(vbRoi * 10) / 10,
    avgEdge: valueBets.length > 0
      ? Math.round(valueBets.reduce((sum, r) => sum + (r.edge_at_open ?? 0), 0) / valueBets.length * 10) / 10
      : 0,
  };

  // Trend analizi (son 7 ve 30 gün)
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const last7 = all.filter((r) => now - new Date(r.kickoff).getTime() < 7 * day);
  const last30 = all.filter((r) => now - new Date(r.kickoff).getTime() < 30 * day);

  const trendCalc = (subset: typeof all) => {
    const w = subset.filter((r) => r.result === "won").length;
    const l = subset.filter((r) => r.result === "lost").length;
    const t = w + l;
    const ret = subset.filter((r) => r.result === "won").reduce((sum, r) => sum + r.odds, 0);
    return { won: w, lost: l, roi: t > 0 ? Math.round(((ret - t) / t) * 1000) / 10 : 0 };
  };

  return {
    totalPredictions: total,
    won,
    lost,
    winRate: Math.round(winRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    avgConfidence: Math.round(avgConfidence * 10) / 10,
    avgOdds: Math.round(avgOdds * 100) / 100,
    byConfidenceBand,
    byMarket,
    simAccuracy,
    valueBetStats,
    recentTrend: {
      last7Days: trendCalc(last7),
      last30Days: trendCalc(last30),
    },
  };
}

/**
 * Haftalık performans raporu tweet'i üret
 */
export function formatValidationTweet(stats: ValidationStats): string {
  const confBands = stats.byConfidenceBand
    .filter((b) => b.total >= 3)
    .map((b) => `   ${b.band}%: ${b.won}/${b.total} (%${b.winRate.toFixed(0)}) ROI: ${b.roi > 0 ? "+" : ""}${b.roi}%`)
    .join("\n");

  const topMarkets = stats.byMarket
    .filter((m) => m.total >= 3 && m.roi > 0)
    .slice(0, 3)
    .map((m) => `   ${m.market}: ${m.won}/${m.total} ROI: +${m.roi}%`)
    .join("\n");

  const simLine = stats.simAccuracy.scorelineHitRate > 0
    ? `\n🎲 Skor Tutma: Top5 %${stats.simAccuracy.scorelineHitRate} | Top1 %${stats.simAccuracy.top1HitRate}`
    : "";

  const trend = stats.recentTrend.last7Days;
  const trendEmoji = trend.roi >= 0 ? "📈" : "📉";

  return `📊 Haftalık Performans Raporu

✅ ${stats.won}W / ❌ ${stats.lost}L
🎯 Başarı: %${stats.winRate.toFixed(1)}
💰 ROI: ${stats.roi >= 0 ? "+" : ""}${stats.roi}%
📊 Ort. Güven: %${stats.avgConfidence.toFixed(0)} | Ort. Oran: ${stats.avgOdds}

📏 Güven Bandı Analizi:
${confBands || "   Yeterli veri yok"}

🏆 En İyi Pazarlar:
${topMarkets || "   Yeterli veri yok"}${simLine}

${trendEmoji} Son 7 Gün: ${trend.won}W/${trend.lost}L ROI: ${trend.roi >= 0 ? "+" : ""}${trend.roi}%
💎 Value Bet: ${stats.valueBetStats.won}/${stats.valueBetStats.total} ROI: ${stats.valueBetStats.roi >= 0 ? "+" : ""}${stats.valueBetStats.roi}%

#performans #backtest #bahis #roi`;
}

function emptyStats(): ValidationStats {
  return {
    totalPredictions: 0,
    won: 0,
    lost: 0,
    winRate: 0,
    roi: 0,
    avgConfidence: 0,
    avgOdds: 0,
    byConfidenceBand: [],
    byMarket: [],
    simAccuracy: { scorelineHitRate: 0, top1HitRate: 0, simEdgeROI: 0, avgSimConfidence: 0 },
    valueBetStats: { total: 0, won: 0, winRate: 0, roi: 0, avgEdge: 0 },
    recentTrend: {
      last7Days: { won: 0, lost: 0, roi: 0 },
      last30Days: { won: 0, lost: 0, roi: 0 },
    },
  };
}
