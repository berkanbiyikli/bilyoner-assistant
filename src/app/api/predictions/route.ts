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

    // 2) DB'de bu tarihin tahminleri var mı? (cron kaydetmiş olabilir)
    const supabase = createAdminSupabase();
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const { data: dbPredictions } = await supabase
      .from("predictions")
      .select("*")
      .gte("kickoff", dayStart)
      .lte("kickoff", dayEnd)
      .order("confidence", { ascending: false });

    // 3) Günün maçlarını API'den çek (hem NS hem canlı hem bitmiş — tüm maçlar)
    const allFixtures = await getFixturesByDate(date);

    // DB'de bu tarih için yeterince tahmin varsa, fixture verileriyle birleştir
    if (dbPredictions && dbPredictions.length > 0) {
      const enriched = dbPredictions.map((dbPred) => {
        // Fixture verisini eşleştir
        const fixture = allFixtures.find((f) => f.fixture.id === dbPred.fixture_id);
        if (!fixture) return null;

        return {
          fixtureId: dbPred.fixture_id,
          fixture,
          league: fixture.league,
          homeTeam: fixture.teams.home,
          awayTeam: fixture.teams.away,
          kickoff: dbPred.kickoff,
          picks: [
            {
              type: dbPred.pick,
              confidence: dbPred.confidence,
              odds: dbPred.odds,
              reasoning: dbPred.analysis_summary || "",
              expectedValue: dbPred.expected_value,
              isValueBet: dbPred.is_value_bet,
            },
          ],
          analysis: {
            summary: dbPred.analysis_summary || "",
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

      if (enriched.length > 0) {
        setCache(cacheKey, { predictions: enriched }, 300);
        return NextResponse.json({
          date,
          source: "database",
          total: allFixtures.length,
          analyzed: enriched.length,
          predictions: enriched,
        });
      }
    }

    // 4) DB'de yoksa → canlı analiz yap (sadece NS maçları)
    const upcomingFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    const predictions = await analyzeMatches(upcomingFixtures);

    // Canlı analiz sonuçlarını cache'e kaydet
    if (predictions.length > 0) {
      setCache(cacheKey, { predictions }, 300);
    }

    return NextResponse.json({
      date,
      source: "live",
      total: allFixtures.length,
      analyzed: predictions.length,
      predictions,
    });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json(
      { error: "Tahminler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
