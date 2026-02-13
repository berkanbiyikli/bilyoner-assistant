import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage } from "@/lib/api-football";
import { LEAGUE_IDS } from "@/lib/api-football/leagues";
import { analyzeMatches } from "@/lib/prediction";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";
import type { FixtureResponse } from "@/types/api-football";

export const maxDuration = 60; // Vercel timeout 60s

/**
 * /api/predictions?date=2026-02-13          → tek gün
 * /api/predictions?dates=2026-02-13,2026-02-14,2026-02-15  → çoklu gün
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // Çoklu tarih desteği: dates=2026-02-13,2026-02-14 veya date=2026-02-13
    const datesParam = searchParams.get("dates");
    const singleDate = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const dates = datesParam
      ? datesParam.split(",").map((d) => d.trim()).filter(Boolean)
      : [singleDate];

    // Cache key tüm tarihleri kapsar
    const cacheKey = `predictions:${dates.join(",")}`;
    if (!forceRefresh) {
      const cached = getCached<{ predictions: unknown[] }>(cacheKey);
      if (cached) {
        return NextResponse.json({
          dates,
          source: "cache",
          analyzed: cached.predictions.length,
          predictions: cached.predictions,
        });
      }
    }

    const supabase = createAdminSupabase();
    let allDbEnriched: unknown[] = [];
    let allLiveAnalyzed: unknown[] = [];
    let totalFixtures = 0;

    for (const date of dates) {
      // 1) Günün maçlarını API'den çek
      let allFixtures: FixtureResponse[] = [];
      try {
        allFixtures = await getFixturesByDate(date);
      } catch (err) {
        console.error(`[PREDICTIONS] getFixturesByDate(${date}) error:`, err);
      }
      totalFixtures += allFixtures.length;

      // 2) DB'deki kayıtlı tahminleri çek
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;
      const { data: dbPredictions } = await supabase
        .from("predictions")
        .select("*")
        .gte("kickoff", dayStart)
        .lte("kickoff", dayEnd)
        .order("confidence", { ascending: false });

      const dbFixtureIds = new Set((dbPredictions || []).map((p) => p.fixture_id));

      // 3) DB tahminlerini fixture bazlı grupla ve zenginleştir
      const fixtureGrouped = new Map<number, typeof dbPredictions>();
      for (const dbPred of (dbPredictions || [])) {
        const group = fixtureGrouped.get(dbPred.fixture_id) || [];
        group.push(dbPred);
        fixtureGrouped.set(dbPred.fixture_id, group);
      }

      const dbEnriched = Array.from(fixtureGrouped.entries()).map(([fixtureId, preds]) => {
        const fixture = allFixtures.find((f) => f.fixture.id === fixtureId);
        if (!preds) return null;

        // Fixture API'den gelmemiş olabilir — fallback
        const sortedPreds = preds.sort((a, b) => b.confidence - a.confidence);
        const firstPred = sortedPreds[0];

        return {
          fixtureId,
          fixture: fixture ?? null,
          league: fixture?.league ?? { id: 0, name: firstPred.league, country: "", logo: "", flag: "", season: 0, round: "" },
          homeTeam: fixture?.teams.home ?? { id: 0, name: firstPred.home_team, logo: "", winner: null },
          awayTeam: fixture?.teams.away ?? { id: 0, name: firstPred.away_team, logo: "", winner: null },
          kickoff: firstPred.kickoff,
          picks: sortedPreds.map((p) => ({
            type: p.pick,
            confidence: p.confidence,
            odds: p.odds,
            reasoning: p.analysis_summary || "",
            expectedValue: p.expected_value,
            isValueBet: p.is_value_bet,
          })),
          analysis: {
            summary: firstPred.analysis_summary || "",
            homeAttack: 50,
            homeDefense: 50,
            awayAttack: 50,
            awayDefense: 50,
            homeForm: 50,
            awayForm: 50,
          },
          odds: undefined,
          isLive: fixture ? fixture.fixture.status.short !== "NS" && fixture.fixture.status.short !== "FT" : false,
        };
      }).filter(Boolean);

      allDbEnriched.push(...dbEnriched);

      // 4) DB'de OLMAYAN desteklenen lig NS maçları canlı analiz et (max 5 maç)
      const apiUsage = getApiUsage();
      const canAnalyze = apiUsage.remaining >= 20; // en az 5 maç × 4 istek

      const unseenFixtures = canAnalyze
        ? allFixtures.filter(
            (f) => f.fixture.status.short === "NS" &&
                   !dbFixtureIds.has(f.fixture.id) &&
                   LEAGUE_IDS.includes(f.league.id)
          ).slice(0, 5)
        : [];

      if (unseenFixtures.length > 0) {
        try {
          const liveResults = await analyzeMatches(unseenFixtures, 2);
          allLiveAnalyzed.push(...liveResults);
        } catch (err) {
          console.error(`[PREDICTIONS] Live analysis error for ${date}:`, err);
        }
      }
    }

    const allPredictions = [...allDbEnriched, ...allLiveAnalyzed];

    // Cache'e kaydet
    if (allPredictions.length > 0) {
      setCache(cacheKey, { predictions: allPredictions }, 300);
    }

    return NextResponse.json({
      dates,
      source: allDbEnriched.length > 0 && allLiveAnalyzed.length > 0 ? "hybrid" : allDbEnriched.length > 0 ? "database" : "live",
      total: totalFixtures,
      fromDb: allDbEnriched.length,
      fromLive: allLiveAnalyzed.length,
      analyzed: allPredictions.length,
      predictions: allPredictions,
    });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json(
      { error: "Tahminler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
