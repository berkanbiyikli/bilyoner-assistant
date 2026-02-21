// ============================================
// IY KG (İlk Yarı Karşılıklı Gol) API Route
// GET /api/ht-btts?grade=B&league=203
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { analyzeHtBtts, findBestHtBtts } from "@/lib/ht-btts";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minGrade = (searchParams.get("grade") as "A+" | "A" | "B" | "C") || "B";
    const leagueFilter = searchParams.get("league");
    const dateParam = searchParams.get("date");

    const date = dateParam || new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);

    // Sadece başlamamış maçları filtrele
    let fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    // Liga filtresi
    if (leagueFilter) {
      const leagueIds = leagueFilter.split(",").map(Number);
      fixtures = fixtures.filter((f) => leagueIds.includes(f.league.id));
    }

    if (fixtures.length === 0) {
      return NextResponse.json({
        count: 0,
        analyses: [],
        summary: "Bugün için uygun maç bulunamadı.",
      });
    }

    // Maçları analiz et
    const predictions = await analyzeMatches(fixtures);

    // IY KG analizlerini üret
    const allAnalyses = analyzeHtBtts(predictions);
    const filtered = findBestHtBtts(predictions, minGrade);

    // Özet istatistikler
    const gradeDistribution = {
      "A+": allAnalyses.filter((a) => a.grade === "A+").length,
      "A": allAnalyses.filter((a) => a.grade === "A").length,
      "B": allAnalyses.filter((a) => a.grade === "B").length,
      "C": allAnalyses.filter((a) => a.grade === "C").length,
      "D": allAnalyses.filter((a) => a.grade === "D").length,
    };

    const avgHtBttsProb = filtered.length > 0
      ? Math.round(filtered.reduce((sum, a) => sum + a.htBttsProb, 0) / filtered.length * 10) / 10
      : 0;

    return NextResponse.json({
      date,
      totalMatches: allAnalyses.length,
      filteredCount: filtered.length,
      minGrade,
      gradeDistribution,
      avgHtBttsProb,
      analyses: filtered,
      allAnalyses: searchParams.get("all") === "true" ? allAnalyses : undefined,
      summary: filtered.length > 0
        ? `${filtered.length} maçta IY KG Var fırsatı bulundu (min. ${minGrade} grade). Ortalama IY KG olasılığı: %${avgHtBttsProb}`
        : `${minGrade} veya üzeri IY KG fırsatı bulunamadı. Toplam ${allAnalyses.length} maç analiz edildi.`,
    });
  } catch (error) {
    console.error("HT BTTS API error:", error);
    return NextResponse.json(
      { error: "IY KG analizi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
