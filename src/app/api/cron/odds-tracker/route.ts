import { NextRequest, NextResponse } from "next/server";
import { captureOddsSnapshot } from "@/lib/odds";
import { analyzeOddsMovements } from "@/lib/ai/gemini";

export const maxDuration = 60;

/**
 * Odds Tracker Cron — her 2 saatte çalışır
 * 1. Günün maçlarının oranlarını snapshot olarak kaydet
 * 2. Açılış oranlarıyla karşılaştır, hareketleri tespit et
 * 3. Anlamlı hareketleri Gemini ile analiz et
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Oran snapshot'larını yakala
    const { captured, updated, movements } = await captureOddsSnapshot();

    // 2. Anlamlı hareketleri Gemini ile analiz et
    const significantMovements = movements.filter(m => Math.abs(m.change) > 3);
    let aiAnalysis = null;

    if (significantMovements.length > 0) {
      aiAnalysis = await analyzeOddsMovements(significantMovements);
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      captured,
      updated,
      totalMovements: movements.length,
      significantMovements: significantMovements.length,
      steams: movements.filter(m => m.change < -8).length,
      aiAnalysis: aiAnalysis ? {
        summary: aiAnalysis.summary,
        keyCount: aiAnalysis.keyMovements.length,
        sentiment: aiAnalysis.marketSentiment,
      } : null,
    });
  } catch (error) {
    console.error("[CRON] Odds tracker error:", error);
    return NextResponse.json(
      { error: "Oran takibi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
