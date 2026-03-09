import { NextRequest, NextResponse } from "next/server";
import { captureOddsSnapshot } from "@/lib/odds";

export const maxDuration = 60;

/**
 * Odds Tracker — oran snapshot'ı yakala (Manuel veya cron)
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { captured, updated, movements } = await captureOddsSnapshot();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      captured,
      updated,
      totalMovements: movements.length,
      significantMovements: movements.filter(m => Math.abs(m.change) > 3).length,
    });
  } catch (error) {
    console.error("[CRON] Odds tracker error:", error);
    return NextResponse.json(
      { error: "Oran takibi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
