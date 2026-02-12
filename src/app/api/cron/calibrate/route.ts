// ============================================
// Self-Correction Calibration Cron
// Her Pazartesi 06:00 UTC'de çalışır
// Optimizer'ı tetikleyip lambda çarpanlarını günceller
// ============================================

import { NextResponse } from "next/server";
import { runOptimization } from "@/lib/prediction/optimizer";

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
    });
  } catch (error) {
    console.error("[CALIBRATE] Hata:", error);
    return NextResponse.json({ error: "Optimization failed", details: String(error) }, { status: 500 });
  }
}
