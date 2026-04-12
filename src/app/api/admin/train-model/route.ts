// ============================================
// Manual ML Model Training API
// POST /api/admin/train-model
// Geçmiş tahminlerden ML modeli eğitir
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase, fetchAllRows } from "@/lib/supabase/admin";
import { autoTrainFromHistory, reloadModel } from "@/lib/prediction/ml-model";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const body = await req.json().catch(() => ({}));
    const adminKey = body.adminKey || "";

    // Auth kontrolü
    if (
      authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      adminKey !== process.env.ADMIN_KEY
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const minRecords = body.minRecords ?? 20; // Varsayılan minimum 20 (override edilebilir)

    console.log("[ML-TRAIN] Manuel ML eğitimi başlatılıyor...");

    const supabase = createAdminSupabase();

    // Settle edilmiş tüm tahminleri çek
    const records = await fetchAllRows(supabase, "predictions", {
      select: "confidence, odds, pick, result, expected_value, sim_probability, home_team, away_team, analysis_data, kickoff, league",
      order: { column: "kickoff", ascending: false },
      filters: [{ method: "in", args: ["result", ["won", "lost"]] }],
    });

    console.log(`[ML-TRAIN] ${records.length} settle edilmiş tahmin bulundu (minimum: ${minRecords})`);

    if (records.length < minRecords) {
      return NextResponse.json({
        success: false,
        reason: "insufficient_data",
        recordCount: records.length,
        minRequired: minRecords,
        message: `ML eğitimi için en az ${minRecords} settle edilmiş tahmin gerekiyor. Şu an ${records.length} kayıt var.`,
      });
    }

    // Won/Lost dağılımı
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wonCount = records.filter((r: any) => r.result === "won").length;
    const lostCount = records.length - wonCount;
    const winRate = Math.round((wonCount / records.length) * 1000) / 10;

    // Pick type dağılımı
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pickDistribution: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    records.forEach((r: any) => {
      pickDistribution[r.pick] = (pickDistribution[r.pick] || 0) + 1;
    });

    // analysis_data zenginliği
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withAnalysisData = records.filter((r: any) => r.analysis_data?.homeAttack != null).length;

    console.log(`[ML-TRAIN] Won: ${wonCount}, Lost: ${lostCount}, WinRate: ${winRate}%`);
    console.log(`[ML-TRAIN] analysis_data olan: ${withAnalysisData}/${records.length}`);
    console.log(`[ML-TRAIN] Pick dağılımı:`, pickDistribution);

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

    if (!model) {
      return NextResponse.json({
        success: false,
        reason: "training_failed",
        recordCount: records.length,
        message: "Model eğitimi başarısız — yeterli market verisi olmayabilir (her market için min 10 kayıt).",
        pickDistribution,
      });
    }

    // Cache'i yenile
    reloadModel();

    // Market başına metrikler
    const marketMetrics = Object.entries(model.markets).map(([market, data]) => ({
      market,
      accuracy: data.metrics.accuracy,
      logLoss: data.metrics.logLoss,
      featureCount: data.featureNames.length,
      features: data.featureNames,
    }));

    return NextResponse.json({
      success: true,
      model: {
        version: model.version,
        trainedAt: model.trainedAt,
        marketCount: Object.keys(model.markets).length,
      },
      training: {
        totalRecords: records.length,
        wonCount,
        lostCount,
        winRate,
        withAnalysisData,
        pickDistribution,
      },
      markets: marketMetrics,
    });
  } catch (error) {
    console.error("[ML-TRAIN] Hata:", error);
    return NextResponse.json(
      { error: "ML eğitimi sırasında hata oluştu", details: String(error) },
      { status: 500 }
    );
  }
}

// GET: ML model durumunu kontrol et
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const { searchParams } = new URL(req.url);
  const adminKey = searchParams.get("adminKey") || "";

  if (
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    adminKey !== process.env.ADMIN_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminSupabase();

    // Mevcut model
    const { data: modelData } = await supabase
      .from("ml_models")
      .select("version, trained_at, market_count, record_count")
      .eq("id", "current")
      .single();

    // Settle edilmiş tahmin sayısı
    const { count: settledCount } = await supabase
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .in("result", ["won", "lost"]);

    // Toplam tahmin sayısı
    const { count: totalCount } = await supabase
      .from("predictions")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      model: modelData || null,
      predictions: {
        total: totalCount || 0,
        settled: settledCount || 0,
        pending: (totalCount || 0) - (settledCount || 0),
      },
      canTrain: (settledCount || 0) >= 20,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Durum kontrolü başarısız", details: String(error) },
      { status: 500 }
    );
  }
}
