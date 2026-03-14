import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage, LEAGUE_IDS, getLeagueById, getLeagueByName } from "@/lib/api-football";
import { analyzeMatch, analyzeMatches } from "@/lib/prediction";
import { getSimProbability, simulateMatch } from "@/lib/prediction/simulator";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";
import type { FixtureResponse } from "@/types/api-football";
import type { MatchAnalysis, MatchInsights, MatchOdds } from "@/types";

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
        allFixtures = await getFixturesByDate(date, forceRefresh);
      } catch (err) {
        console.error(`[PREDICTIONS] getFixturesByDate(${date}) error:`, err);
      }
      // Sadece desteklenen liglerdeki maçları al (1800+ fixture yerine ~200)
      allFixtures = allFixtures.filter((f) => LEAGUE_IDS.includes(f.league.id));
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

      // Fixture'ı olan DB maçları için paralel analiz çalıştır — SADECE analysis_data olmayan eski kayıtlar için
      // analysis_data olan kayıtlar zaten zengin veri içeriyor, API call gereksiz
      const dbAnalysisResults = new Map<number, Awaited<ReturnType<typeof analyzeMatch>>>();
      const fixturesNeedingAnalysis = dbFixturesForAnalysis.filter((f) => {
        if (f.fixture.status.short !== "NS") return false;
        const preds = fixtureGrouped.get(f.fixture.id);
        const hasStoredData = preds?.[0]?.analysis_data != null;
        return !hasStoredData; // Sadece analysis_data OLMAYAN maçlar
      }).sort((a, b) => {
        const aPri = getLeagueById(a.league.id)?.priority ?? 99;
        const bPri = getLeagueById(b.league.id)?.priority ?? 99;
        return aPri - bPri;
      }).slice(0, 5); // Max 5 — timeout riski azaltmak için

      if (fixturesNeedingAnalysis.length > 0) {
        const analysisPromises = fixturesNeedingAnalysis.map(async (fixture) => {
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

        // League bilgisi: fixture varsa onu kullan, yoksa LEAGUES config'den bul
        let leagueObj;
        if (fixture) {
          leagueObj = fixture.league;
        } else {
          const leagueId = firstPred.league_id as number | undefined;
          const config = leagueId ? getLeagueById(leagueId) : getLeagueByName(firstPred.league);
          leagueObj = config
            ? { id: config.id, name: config.name, country: config.country, logo: "", flag: config.flag, season: 0, round: "" }
            : { id: 0, name: firstPred.league, country: "", logo: "", flag: "", season: 0, round: "" };
        }

        // Canlı analiz sonucu varsa onu kullan
        const liveAnalysis = dbAnalysisResults.get(fixtureId);

        // Öncelik: 1) Canlı analiz 2) DB'deki analysis_data 3) Lightweight stub
        let analysis: MatchAnalysis | undefined = liveAnalysis?.analysis;
        let insights = liveAnalysis?.insights;
        let odds = liveAnalysis?.odds;

        // DB'de saklı analysis_data varsa onu kullan
        const storedData = firstPred.analysis_data as { analysis?: MatchAnalysis; insights?: MatchInsights; odds?: MatchOdds } | null;
        if (!analysis && storedData?.analysis) {
          analysis = storedData.analysis;
          insights = storedData.insights;
          // Odds: realMarkets Array → Set dönüşümü
          if (storedData.odds) {
            odds = {
              ...storedData.odds,
              realMarkets: new Set(storedData.odds.realMarkets as unknown as string[]),
            };
          }
        }

        // Son çare: Lightweight stub + simulation
        if (!analysis) {
          const leagueId = fixture?.league.id ?? 0;
          const stubAnalysis: MatchAnalysis = {
            summary: firstPred.analysis_summary || "",
            homeAttack: 50,
            homeDefense: 50,
            awayAttack: 50,
            awayDefense: 50,
            homeForm: 50,
            awayForm: 50,
            h2hAdvantage: "neutral" as const,
            homeAdvantage: 1.0,
            injuryImpact: { home: 0, away: 0 },
          };
          try {
            stubAnalysis.simulation = simulateMatch(stubAnalysis, undefined, leagueId);
          } catch { /* ignore */ }
          analysis = stubAnalysis;
        }

        const sim = analysis.simulation;

        return {
          fixtureId,
          fixture: fixture ?? null,
          league: leagueObj,
          homeTeam: fixture?.teams.home ?? { id: 0, name: firstPred.home_team, logo: "", winner: null },
          awayTeam: fixture?.teams.away ?? { id: 0, name: firstPred.away_team, logo: "", winner: null },
          kickoff: firstPred.kickoff,
          picks: sortedPreds.map((p) => {
            const simProb = sim ? getSimProbability(sim, p.pick) : undefined;
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
          analysis,
          insights,
          odds,
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
      }).slice(0, 25);

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

    // Post-process: odds eksik olan tahminler için simülasyon/pick'lerden türet
    for (const pred of allPredictions as Array<Record<string, unknown>>) {
      if (!pred.odds && pred.analysis) {
        const a = pred.analysis as { simulation?: { simHomeWinProb: number; simDrawProb: number; simAwayWinProb: number; simOver25Prob: number; simBttsProb: number; simOver15Prob: number; simOver35Prob: number } };
        const sim = a.simulation;
        if (sim) {
          // Simülasyon olasılıklarından %5 margin ile oran türet
          const margin = 1.05;
          const probToOdds = (prob: number) => prob > 0 ? Math.round(margin * 100 / prob * 100) / 100 : 0;
          pred.odds = {
            home: probToOdds(sim.simHomeWinProb),
            draw: probToOdds(sim.simDrawProb),
            away: probToOdds(sim.simAwayWinProb),
            over25: probToOdds(sim.simOver25Prob),
            under25: probToOdds(100 - sim.simOver25Prob),
            bttsYes: probToOdds(sim.simBttsProb),
            bttsNo: probToOdds(100 - sim.simBttsProb),
            over15: probToOdds(sim.simOver15Prob),
            under15: probToOdds(100 - sim.simOver15Prob),
            over35: probToOdds(sim.simOver35Prob),
            under35: probToOdds(100 - sim.simOver35Prob),
            bookmaker: "sim-derived",
            realMarkets: [],
          };
        }
      }
    }

    // Eğer hiç tahmin yoksa, en yakın gelecek tahminleri göster
    if (allPredictions.length === 0) {
      const now = new Date().toISOString();
      const { data: latestPreds } = await supabase
        .from("predictions")
        .select("*")
        .neq("pick", "no_pick")
        .gte("kickoff", now)
        .order("kickoff", { ascending: true })
        .limit(100);

      // Gelecekte yoksa geçmişe bak
      const finalPreds = (latestPreds && latestPreds.length > 0) ? latestPreds : (await supabase
        .from("predictions")
        .select("*")
        .neq("pick", "no_pick")
        .order("kickoff", { ascending: false })
        .limit(100)).data;

      if (finalPreds && finalPreds.length > 0) {
        // Tahminlerin ait olduğu tarihleri bul
        const predDates = [...new Set(finalPreds.map(p => p.kickoff.split("T")[0]))].sort();

        // Tahminleri grupla
        const latestGrouped = new Map<number, typeof finalPreds>();
        for (const p of finalPreds) {
          const group = latestGrouped.get(p.fixture_id) || [];
          group.push(p);
          latestGrouped.set(p.fixture_id, group);
        }

        const fallbackPredictions = Array.from(latestGrouped.entries()).map(([fixtureId, preds]) => {
          const sortedPreds = preds!.sort((a, b) => b.confidence - a.confidence);
          const firstPred = sortedPreds[0];

          // League bilgisi: LEAGUES config'den bul
          const leagueId = firstPred.league_id as number | undefined;
          const config = leagueId ? getLeagueById(leagueId) : getLeagueByName(firstPred.league);
          const leagueObj = config
            ? { id: config.id, name: config.name, country: config.country, logo: "", flag: config.flag, season: 0, round: "" }
            : { id: 0, name: firstPred.league, country: "", logo: "", flag: "", season: 0, round: "" };

          // DB'de saklı analysis_data varsa onu kullan
          const storedData = firstPred.analysis_data as { analysis?: MatchAnalysis; insights?: MatchInsights; odds?: MatchOdds } | null;
          let analysis: MatchAnalysis;
          let insights: MatchInsights | undefined;

          if (storedData?.analysis) {
            analysis = storedData.analysis;
            insights = storedData.insights;
          } else {
            analysis = {
              summary: firstPred.analysis_summary || "",
              homeAttack: 50, homeDefense: 50,
              awayAttack: 50, awayDefense: 50,
              homeForm: 50, awayForm: 50,
              h2hAdvantage: "neutral" as const,
              homeAdvantage: 1.0,
              injuryImpact: { home: 0, away: 0 },
            };
            try {
              analysis.simulation = simulateMatch(analysis);
            } catch { /* ignore */ }
          }

          const sim = analysis.simulation;

          return {
            fixtureId,
            fixture: null,
            league: leagueObj,
            homeTeam: { id: 0, name: firstPred.home_team, logo: "", winner: null },
            awayTeam: { id: 0, name: firstPred.away_team, logo: "", winner: null },
            kickoff: firstPred.kickoff,
            picks: sortedPreds.map((p) => {
              const simProb = sim ? getSimProbability(sim, p.pick) : undefined;
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
            analysis,
            insights,
            odds: undefined,
            isLive: false,
          };
        });

        return NextResponse.json({
          dates: predDates,
          source: "redirect",
          redirectDates: predDates,
          message: `${dates.join(", ")} tarihinde tahmin bulunamadı. ${predDates.join(", ")} tahminleri gösteriliyor.`,
          total: totalFixtures,
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
