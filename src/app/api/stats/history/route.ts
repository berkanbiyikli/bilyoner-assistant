// ============================================
// Prediction History API
// GET /api/stats/history
// Geçmiş tahminleri filtreli ve sayfalı döndürür
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminSupabase();
    const { searchParams } = new URL(req.url);

    // Filtreler
    const filter = searchParams.get("filter") || "all"; // all | won | lost | pending
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const sortBy = searchParams.get("sort") || "kickoff"; // kickoff | odds | confidence
    const sortDir = searchParams.get("dir") || "desc"; // asc | desc
    const pickType = searchParams.get("pick") || ""; // 1, X, 2, Over 2.5, etc.
    const league = searchParams.get("league") || "";

    // Toplam istatistikler (filtresiz)
    const { data: allPredictions, error: allError } = await supabase
      .from("predictions")
      .select("*")
      .order("kickoff", { ascending: false });

    if (allError) throw allError;

    const all = allPredictions || [];
    const settled = all.filter((p) => p.result !== "pending");
    const won = settled.filter((p) => p.result === "won");
    const lost = settled.filter((p) => p.result === "lost");
    const pending = all.filter((p) => p.result === "pending");

    // En yüksek oranlı kazanan tahmin
    const highestOddsWon = won.length > 0
      ? won.reduce((best, p) => (p.odds > best.odds ? p : best), won[0])
      : null;

    // En yüksek güven tutma oranı
    const highConfPreds = settled.filter((p) => p.confidence >= 70);
    const highConfWon = highConfPreds.filter((p) => p.result === "won");
    const highConfHitRate = highConfPreds.length > 0
      ? (highConfWon.length / highConfPreds.length) * 100
      : 0;

    // Seri hesaplama (son kazanma/kaybetme serisi)
    let currentStreak = 0;
    let streakType: "won" | "lost" | "none" = "none";
    const sortedSettled = [...settled].sort((a, b) =>
      new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()
    );
    if (sortedSettled.length > 0) {
      streakType = sortedSettled[0].result as "won" | "lost";
      for (const p of sortedSettled) {
        if (p.result === streakType) currentStreak++;
        else break;
      }
    }

    // Ortalamalar
    const avgOdds = settled.length > 0
      ? settled.reduce((s, p) => s + p.odds, 0) / settled.length
      : 0;
    const avgWonOdds = won.length > 0
      ? won.reduce((s, p) => s + p.odds, 0) / won.length
      : 0;
    const avgConfidence = all.length > 0
      ? all.reduce((s, p) => s + p.confidence, 0) / all.length
      : 0;

    // ROI
    const totalReturn = won.reduce((s, p) => s + p.odds, 0);
    const roi = settled.length > 0
      ? ((totalReturn - settled.length) / settled.length) * 100
      : 0;

    // Lig listesi (filtreleme için)
    const uniqueLeagues = [...new Set(all.map((p) => p.league))].sort();

    // Pick tipleri (filtreleme için)
    const uniquePicks = [...new Set(all.map((p) => p.pick))].sort();

    // Filtrelenmiş sorgu
    let filtered = [...all];

    if (filter === "won") filtered = filtered.filter((p) => p.result === "won");
    else if (filter === "lost") filtered = filtered.filter((p) => p.result === "lost");
    else if (filter === "pending") filtered = filtered.filter((p) => p.result === "pending");

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.home_team.toLowerCase().includes(q) ||
          p.away_team.toLowerCase().includes(q) ||
          p.league.toLowerCase().includes(q)
      );
    }

    if (pickType) {
      filtered = filtered.filter((p) => p.pick === pickType);
    }

    if (league) {
      filtered = filtered.filter((p) => p.league === league);
    }

    // Sıralama
    const ascending = sortDir === "asc";
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "odds") cmp = a.odds - b.odds;
      else if (sortBy === "confidence") cmp = a.confidence - b.confidence;
      else cmp = new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
      return ascending ? cmp : -cmp;
    });

    // Sayfalama
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / limit);
    const paged = filtered.slice((page - 1) * limit, page * limit);

    // Her tahmin için response formatı
    const predictions = paged.map((p) => ({
      id: p.id,
      fixtureId: p.fixture_id,
      homeTeam: p.home_team,
      awayTeam: p.away_team,
      league: p.league,
      kickoff: p.kickoff,
      pick: p.pick,
      odds: Number(p.odds),
      confidence: p.confidence,
      expectedValue: Number(p.expected_value),
      isValueBet: p.is_value_bet,
      result: p.result,
      analysisSummary: p.analysis_summary,
      createdAt: p.created_at,
    }));

    return NextResponse.json({
      // KPI'lar
      kpis: {
        total: all.length,
        won: won.length,
        lost: lost.length,
        pending: pending.length,
        hitRate: settled.length > 0 ? Math.round((won.length / settled.length) * 1000) / 10 : 0,
        avgOdds: Math.round(avgOdds * 100) / 100,
        avgWonOdds: Math.round(avgWonOdds * 100) / 100,
        avgConfidence: Math.round(avgConfidence),
        roi: Math.round(roi * 10) / 10,
        highConfHitRate: Math.round(highConfHitRate * 10) / 10,
        streak: { count: currentStreak, type: streakType },
        highestOddsWon: highestOddsWon
          ? {
              homeTeam: highestOddsWon.home_team,
              awayTeam: highestOddsWon.away_team,
              pick: highestOddsWon.pick,
              odds: Number(highestOddsWon.odds),
              kickoff: highestOddsWon.kickoff,
            }
          : null,
      },

      // Filtre seçenekleri
      filters: {
        leagues: uniqueLeagues,
        picks: uniquePicks,
      },

      // Tahminler
      predictions,

      // Sayfalama bilgisi
      pagination: {
        page,
        limit,
        totalFiltered,
        totalPages,
      },
    });
  } catch (error) {
    console.error("History API error:", error);
    return NextResponse.json(
      { error: "Geçmiş tahminler yüklenemedi" },
      { status: 500 }
    );
  }
}
