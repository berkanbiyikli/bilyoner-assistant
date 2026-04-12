// ============================================
// Self-Correction Calibration Cron
// Her Pazartesi 06:00 UTC'de çalışır
// Optimizer'ı tetikleyip lambda çarpanlarını günceller
// ============================================

import { NextResponse } from "next/server";
import { runOptimization } from "@/lib/prediction/optimizer";
import { autoTrainFromHistory } from "@/lib/prediction/ml-model";
import { createAdminSupabase, fetchAllRows } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  // Cron secret kontrolü
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[CALIBRATE] Self-correction optimization başlatılıyor...");

    const result = await runOptimization();

    console.log(`[CALIBRATE] Tamamlandı: ${result.totalRecords} kayıt analiz edildi, ${result.appliedAdjustments} ayarlama uygulandı`);

    // === ML Model Otomatik Eğitim ===
    let mlTrainResult = "skipped";
    try {
      const supabase = createAdminSupabase();
      const records = await fetchAllRows(supabase, "predictions", {
        order: { column: "kickoff", ascending: false },
        filters: [{ method: "in", args: ["result", ["won", "lost"]] }],
      });

      if (records.length >= 20) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trainingData = records.map((r: any) => ({
          confidence: r.confidence,
          odds: r.odds,
          pick: r.pick,
          result: r.result as "won" | "lost",
          expected_value: r.expected_value || 0,
          sim_probability: r.sim_probability || null,
          home_team: r.home_team,
          away_team: r.away_team,
          analysis_data: r.analysis_data || null,
        }));

        const model = await autoTrainFromHistory(trainingData);
        mlTrainResult = model ? `trained (${Object.keys(model.markets).length} markets)` : "insufficient data";
      } else {
        mlTrainResult = `insufficient data (${records.length} records)`;
      }
      console.log(`[CALIBRATE] ML model: ${mlTrainResult}`);
    } catch (mlError) {
      console.error("[CALIBRATE] ML eğitim hatası:", mlError);
      mlTrainResult = "error";
    }

    // Önemli ayarlamaları logla
    for (const lc of result.leagueCalibrations) {
      if (lc.adjustment !== 0) {
        console.log(`[CALIBRATE] ${lc.leagueName}: ${lc.previousHomeAdvantage} → ${lc.homeAdvantage} (${lc.adjustment > 0 ? "+" : ""}${lc.adjustment})`);
      }
    }

    for (const mc of result.marketCalibrations) {
      if (mc.status !== "calibrated") {
        console.log(`[CALIBRATE] ${mc.market}: predicted ${mc.predictedWinRate}% vs actual ${mc.actualWinRate}% (${mc.status})`);
      }
    }

    return NextResponse.json({
      success: true,
      totalRecords: result.totalRecords,
      appliedAdjustments: result.appliedAdjustments,
      leagueAdjustments: result.leagueCalibrations
        .filter((l) => l.adjustment !== 0)
        .map((l) => ({
          league: l.leagueName,
          from: l.previousHomeAdvantage,
          to: l.homeAdvantage,
          adjustment: l.adjustment,
        })),
      marketStatus: result.marketCalibrations
        .filter((m) => m.status !== "calibrated")
        .map((m) => ({
          market: m.market,
          status: m.status,
          deviation: m.deviation,
        })),
      globalMetrics: result.globalMetrics,
      mlModel: mlTrainResult,
    });
  } catch (error) {
    console.error("[CALIBRATE] Hata:", error);
    return NextResponse.json({ error: "Optimization failed", details: String(error) }, { status: 500 });
  }
}
