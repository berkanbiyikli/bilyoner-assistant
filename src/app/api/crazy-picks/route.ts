// ============================================
// Crazy Picks API Route
// GET /api/crazy-picks
// Bugünün maçlarından Black Swan tahminleri
// ============================================

import { NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { findCrazyPicks, summarizeCrazyPicks } from "@/lib/crazy-pick";
import { getCached, setCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Cache kontrol (10 dakika)
    const cached = getCached("crazy-picks");
    if (cached) return NextResponse.json(cached);

    // Bugünün maçlarını çek
    const today = new Date().toISOString().split("T")[0];
    const fixtures = await getFixturesByDate(today);

    if (!fixtures.length) {
      return NextResponse.json({
        results: [],
        summary: summarizeCrazyPicks([]),
        message: "Bugün maç yok",
      });
    }

    // Tüm maçları analiz et (simülasyon + odds)
    const predictions = await analyzeMatches(fixtures);

    // Crazy Pick'leri bul
    const results = findCrazyPicks(predictions);
    const summary = summarizeCrazyPicks(results);

    const response = {
      results,
      summary,
      date: today,
      totalFixtures: fixtures.length,
      analyzedFixtures: predictions.length,
    };

    // 10 dakika cache
    setCache("crazy-picks", response, 600);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Crazy picks error:", error);
    return NextResponse.json(
      { error: "Crazy pick analizi başarısız", results: [], summary: summarizeCrazyPicks([]) },
      { status: 500 }
    );
  }
}
