// ============================================
// IY KG (İlk Yarı Karşılıklı Gol) API Route
// GET /api/ht-btts?grade=B&league=203
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { analyzeHtBtts, findBestHtBtts } from "@/lib/ht-btts";
import { getCached, setCache } from "@/lib/cache";
import type { HtBttsAnalysis } from "@/types";

export const maxDuration = 60; // Vercel timeout 60s

interface HtBttsCache {
  date: string;
  allAnalyses: HtBttsAnalysis[];
  totalMatches: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minGrade = (searchParams.get("grade") as "A+" | "A" | "B" | "C") || "B";
    const leagueFilter = searchParams.get("league");
    const dateParam = searchParams.get("date");
    const forceRefresh = searchParams.get("refresh") === "true";

    const date = dateParam || new Date().toISOString().split("T")[0];
    const cacheKey = `ht-btts:${date}`;

    // ─── Cache kontrolü (5 dk TTL) ───
    let allAnalyses: HtBttsAnalysis[] = [];
    let totalMatches = 0;

    const cached = !forceRefresh ? getCached<HtBttsCache>(cacheKey) : null;

    if (cached) {
      allAnalyses = cached.allAnalyses;
      totalMatches = cached.totalMatches;
    } else {
      // Cache yoksa: fixture'ları çek ve analiz et
      const allFixtures = await getFixturesByDate(date);

      let fixtures = allFixtures.filter(
        (f) => f.fixture.status.short === "NS"
      );

      // Liga filtresi (sadece API çağrısı öncesi)
      if (leagueFilter) {
        const leagueIds = leagueFilter.split(",").map(Number);
        fixtures = fixtures.filter((f) => leagueIds.includes(f.league.id));
      }

      if (fixtures.length === 0) {
        return NextResponse.json({
          date,
          totalMatches: 0,
          filteredCount: 0,
          minGrade,
          gradeDistribution: { "A+": 0, A: 0, B: 0, C: 0, D: 0 },
          avgHtBttsProb: 0,
          analyses: [],
          summary: "Bugün için uygun maç bulunamadı.",
        });
      }

      // Max 50 maç analiz et (API limit + hız)
      const limitedFixtures = fixtures.slice(0, 50);
      totalMatches = limitedFixtures.length;

      // Maçları analiz et (batch 5, 1.5s arası — hızlı)
      const predictions = await analyzeMatches(limitedFixtures, 5);

      // IY KG analizlerini üret
      allAnalyses = analyzeHtBtts(predictions);

      // Cache'e kaydet (5 dakika)
      if (allAnalyses.length > 0) {
        setCache(cacheKey, { date, allAnalyses, totalMatches }, 300);
      }
    }

    // ─── Filtreleme (cache'ten gelse de çalışır) ───
    const gradeOrder: Record<string, number> = { "A+": 5, A: 4, B: 3, C: 2, D: 1 };
    const minGradeValue = gradeOrder[minGrade] || 1;
    const filtered = allAnalyses.filter(
      (a) => (gradeOrder[a.grade] || 0) >= minGradeValue
    );

    // Liga filtresi (cache'ten gelen sonuçlara da uygula)
    const finalFiltered = leagueFilter
      ? filtered.filter((a) => {
          const leagueIds = leagueFilter.split(",").map(Number);
          return leagueIds.includes(a.leagueId);
        })
      : filtered;

    // Özet istatistikler
    const gradeDistribution = {
      "A+": allAnalyses.filter((a) => a.grade === "A+").length,
      A: allAnalyses.filter((a) => a.grade === "A").length,
      B: allAnalyses.filter((a) => a.grade === "B").length,
      C: allAnalyses.filter((a) => a.grade === "C").length,
      D: allAnalyses.filter((a) => a.grade === "D").length,
    };

    const avgHtBttsProb =
      finalFiltered.length > 0
        ? Math.round(
            (finalFiltered.reduce((sum, a) => sum + a.htBttsProb, 0) /
              finalFiltered.length) *
              10
          ) / 10
        : 0;

    return NextResponse.json({
      date,
      source: cached ? "cache" : "live",
      totalMatches,
      filteredCount: finalFiltered.length,
      minGrade,
      gradeDistribution,
      avgHtBttsProb,
      analyses: finalFiltered,
      allAnalyses:
        searchParams.get("all") === "true" ? allAnalyses : undefined,
      summary:
        finalFiltered.length > 0
          ? `${finalFiltered.length} maçta IY KG Var fırsatı bulundu (min. ${minGrade} grade). Ortalama IY KG olasılığı: %${avgHtBttsProb}`
          : `${minGrade} veya üzeri IY KG fırsatı bulunamadı. Toplam ${totalMatches} maç analiz edildi.`,
    });
  } catch (error) {
    console.error("HT BTTS API error:", error);
    return NextResponse.json(
      { error: "IY KG analizi sırasında hata oluştu" },
      { status: 500 }
    );
  }
}
