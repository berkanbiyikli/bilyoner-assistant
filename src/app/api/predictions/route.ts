import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const forceRefresh = searchParams.get("refresh") === "true";

    // 1) Önce cache'e bak (5 dk TTL)
    const cacheKey = `predictions:${date}`;
    if (!forceRefresh) {
      const cached = getCached<{ predictions: unknown[] }>(cacheKey);
      if (cached) {
        return NextResponse.json({
          date,
          source: "cache",
          analyzed: cached.predictions.length,
          predictions: cached.predictions,
        });
      }
    }

    // 2) Günün maçlarını API'den çek
    const allFixtures = await getFixturesByDate(date);

    // 3) DB'deki kayıtlı tahminleri çek (cron kaydetmiş olabilir)
    const supabase = createAdminSupabase();
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const { data: dbPredictions } = await supabase
      .from("predictions")
      .select("*")
      .gte("kickoff", dayStart)
      .lte("kickoff", dayEnd)
      .order("confidence", { ascending: false });

    // DB'deki fixture ID'leri (bunları canlı analizden hariç tutacağız)
    const dbFixtureIds = new Set((dbPredictions || []).map((p) => p.fixture_id));

    // 4) DB'deki tahminleri fixture bazlı grupla ve zenginleştir
    const fixtureGrouped = new Map<number, typeof dbPredictions>();
    for (const dbPred of (dbPredictions || [])) {
      const group = fixtureGrouped.get(dbPred.fixture_id) || [];
      group.push(dbPred);
      fixtureGrouped.set(dbPred.fixture_id, group);
    }

    const dbEnriched = Array.from(fixtureGrouped.entries()).map(([fixtureId, preds]) => {
      const fixture = allFixtures.find((f) => f.fixture.id === fixtureId);
      if (!fixture || !preds) return null;

      // Tüm pick'leri confidence'a göre sırala
      const sortedPreds = preds.sort((a, b) => b.confidence - a.confidence);

      return {
        fixtureId,
        fixture,
        league: fixture.league,
        homeTeam: fixture.teams.home,
        awayTeam: fixture.teams.away,
        kickoff: sortedPreds[0].kickoff,
        picks: sortedPreds.map((p) => ({
          type: p.pick,
          confidence: p.confidence,
          odds: p.odds,
          reasoning: p.analysis_summary || "",
          expectedValue: p.expected_value,
          isValueBet: p.is_value_bet,
        })),
        analysis: {
          summary: sortedPreds[0].analysis_summary || "",
          homeAttack: 50,
          homeDefense: 50,
          awayAttack: 50,
          awayDefense: 50,
          homeForm: 50,
          awayForm: 50,
        },
        odds: undefined,
        isLive: fixture.fixture.status.short !== "NS" && fixture.fixture.status.short !== "FT",
      };
    }).filter(Boolean);

    // 5) DB'de OLMAYAN NS maçları canlı analiz et
    const unseenFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && !dbFixtureIds.has(f.fixture.id)
    );

    let liveAnalyzed: unknown[] = [];
    if (unseenFixtures.length > 0) {
      liveAnalyzed = await analyzeMatches(unseenFixtures);
    }

    // 6) DB + canlı analiz sonuçlarını birleştir
    const allPredictions = [...dbEnriched, ...liveAnalyzed];

    // Cache'e kaydet
    if (allPredictions.length > 0) {
      setCache(cacheKey, { predictions: allPredictions }, 300);
    }

    return NextResponse.json({
      date,
      source: dbEnriched.length > 0 && liveAnalyzed.length > 0 ? "hybrid" : dbEnriched.length > 0 ? "database" : "live",
      total: allFixtures.length,
      fromDb: dbEnriched.length,
      fromLive: liveAnalyzed.length,
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
