import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage, LEAGUE_IDS, getLeagueById } from "@/lib/api-football";
import { analyzeMatch, analyzeMatches } from "@/lib/prediction";
import { getSimProbability } from "@/lib/prediction/simulator";
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
        .neq("pick", "no_pick")
        .order("confidence", { ascending: false });

      const dbFixtureIds = new Set((dbPredictions || []).map((p) => p.fixture_id));

      // 3) DB tahminlerini fixture bazlı grupla ve zenginleştir
      const fixtureGrouped = new Map<number, typeof dbPredictions>();
      for (const dbPred of (dbPredictions || [])) {
        const group = fixtureGrouped.get(dbPred.fixture_id) || [];
        group.push(dbPred);
        fixtureGrouped.set(dbPred.fixture_id, group);
      }

      // DB tahminlerini fixture ile eşleştir + varsa canlı analiz çalıştır
      const dbFixturesForAnalysis: FixtureResponse[] = [];
      const dbFixtureMap = new Map<number, typeof dbPredictions>();

      for (const [fixtureId, preds] of fixtureGrouped.entries()) {
        const fixture = allFixtures.find((f) => f.fixture.id === fixtureId);
        if (fixture) {
          dbFixturesForAnalysis.push(fixture);
        }
        dbFixtureMap.set(fixtureId, preds);
      }

      // Fixture'ı olan DB maçları için paralel analiz çalıştır (istatistik verisi için)
      const dbAnalysisResults = new Map<number, Awaited<ReturnType<typeof analyzeMatch>>>();
      if (dbFixturesForAnalysis.length > 0) {
        const analysisPromises = dbFixturesForAnalysis.map(async (fixture) => {
          try {
            const result = await analyzeMatch(fixture);
            dbAnalysisResults.set(fixture.fixture.id, result);
          } catch (err) {
            console.warn(`[PREDICTIONS] DB fixture analiz hatası (${fixture.fixture.id}):`, err);
          }
        });
        // Max 5 paralel
        for (let i = 0; i < analysisPromises.length; i += 5) {
          await Promise.allSettled(analysisPromises.slice(i, i + 5));
        }
      }

      const dbEnriched = Array.from(fixtureGrouped.entries()).map(([fixtureId, preds]) => {
        const fixture = allFixtures.find((f) => f.fixture.id === fixtureId);
        if (!preds) return null;

        const sortedPreds = preds.sort((a, b) => b.confidence - a.confidence);
        const firstPred = sortedPreds[0];

        // Canlı analiz sonucu varsa onu kullan, yoksa fallback
        const liveAnalysis = dbAnalysisResults.get(fixtureId);

        return {
          fixtureId,
          fixture: fixture ?? null,
          league: fixture?.league ?? { id: 0, name: firstPred.league, country: "", logo: "", flag: "", season: 0, round: "" },
          homeTeam: fixture?.teams.home ?? { id: 0, name: firstPred.home_team, logo: "", winner: null },
          awayTeam: fixture?.teams.away ?? { id: 0, name: firstPred.away_team, logo: "", winner: null },
          kickoff: firstPred.kickoff,
          picks: sortedPreds.map((p) => {
            // Sim olasılığı: canlı analiz varsa simülasyondan hesapla
            const simProb = liveAnalysis?.analysis?.simulation
              ? getSimProbability(liveAnalysis.analysis.simulation, p.pick)
              : undefined;
            return {
              type: p.pick,
              confidence: p.confidence,
              odds: p.odds,
              reasoning: p.analysis_summary || "",
              expectedValue: p.expected_value,
              isValueBet: p.is_value_bet,
              simProbability: simProb,
            };
          }),
          analysis: liveAnalysis?.analysis ?? {
            summary: firstPred.analysis_summary || "",
            homeAttack: 50,
            homeDefense: 50,
            awayAttack: 50,
            awayDefense: 50,
            homeForm: 50,
            awayForm: 50,
          },
          insights: liveAnalysis?.insights,
          odds: liveAnalysis?.odds,
          isLive: fixture ? fixture.fixture.status.short !== "NS" && fixture.fixture.status.short !== "FT" : false,
        };
      }).filter(Boolean);

      allDbEnriched.push(...dbEnriched);

      // 4) DB'de OLMAYAN NS maçları canlı analiz et — büyük ligler öncelikli
      const unseenFixtures = allFixtures.filter(
        (f) => f.fixture.status.short === "NS" && !dbFixtureIds.has(f.fixture.id)
      ).sort((a, b) => {
        const aInLeagues = LEAGUE_IDS.includes(a.league.id);
        const bInLeagues = LEAGUE_IDS.includes(b.league.id);
        if (aInLeagues && !bInLeagues) return -1;
        if (!aInLeagues && bInLeagues) return 1;
        if (aInLeagues && bInLeagues) {
          const aPriority = getLeagueById(a.league.id)?.priority ?? 99;
          const bPriority = getLeagueById(b.league.id)?.priority ?? 99;
          return aPriority - bPriority;
        }
        return 0;
      }).slice(0, 15);

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

    // Eğer hiç tahmin yoksa ve API limiti dolmuşsa, en son tahminleri göster
    if (allPredictions.length === 0) {
      const { data: latestPreds } = await supabase
        .from("predictions")
        .select("*")
        .neq("pick", "no_pick")
        .order("kickoff", { ascending: false })
        .limit(100);

      if (latestPreds && latestPreds.length > 0) {
        // Son tahminleri grupla
        const latestGrouped = new Map<number, typeof latestPreds>();
        for (const p of latestPreds) {
          const group = latestGrouped.get(p.fixture_id) || [];
          group.push(p);
          latestGrouped.set(p.fixture_id, group);
        }

        const fallbackPredictions = Array.from(latestGrouped.entries()).map(([fixtureId, preds]) => {
          const sortedPreds = preds!.sort((a, b) => b.confidence - a.confidence);
          const firstPred = sortedPreds[0];
          return {
            fixtureId,
            fixture: null,
            league: { id: 0, name: firstPred.league, country: "", logo: "", flag: "", season: 0, round: "" },
            homeTeam: { id: 0, name: firstPred.home_team, logo: "", winner: null },
            awayTeam: { id: 0, name: firstPred.away_team, logo: "", winner: null },
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
              homeAttack: 50, homeDefense: 50,
              awayAttack: 50, awayDefense: 50,
              homeForm: 50, awayForm: 50,
            },
            odds: undefined,
            isLive: false,
          };
        });

        return NextResponse.json({
          dates,
          source: "fallback",
          message: "Seçilen tarih için tahmin bulunamadı. Son tahminler gösteriliyor.",
          total: 0,
          fromDb: 0,
          fromLive: 0,
          analyzed: fallbackPredictions.length,
          predictions: fallbackPredictions,
        });
      }
    }

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
