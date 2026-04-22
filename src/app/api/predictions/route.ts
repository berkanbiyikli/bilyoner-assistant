import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage, LEAGUE_IDS, getLeagueById, getLeagueByName } from "@/lib/api-football";
import { getSimProbability, simulateMatch } from "@/lib/prediction/simulator";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCached, setCache } from "@/lib/cache";
import { getMarketDeviations } from "@/lib/prediction/validator";
import type { FixtureResponse } from "@/types/api-football";
import type { MatchAnalysis, MatchInsights, MatchOdds, AIAnalysis } from "@/types";

export const maxDuration = 30; // DB-only okuma, canlı analiz yok

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
      const cached = getCached<{ predictions: unknown[]; marketDeviations?: Record<string, number> }>(cacheKey);
      if (cached) {
        return NextResponse.json({
          dates,
          source: "cache",
          analyzed: cached.predictions.length,
          predictions: cached.predictions,
          marketDeviations: cached.marketDeviations ?? {},
        });
      }
    }

    // Market sapmaları — UI calibration warning badge için (cache'li)
    const marketDeviations = await getMarketDeviations().catch(() => ({} as Record<string, number>));

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

      // 3) DB tahminlerini fixture bazlı grupla ve zenginleştir
      // DEDUP: Aynı (fixture_id, pick) için en yüksek confidence olanı tut.
      // Geçmişte concurrent cron çalışmaları yüzünden duplicate kayıtlar var.
      const fixtureGrouped = new Map<number, typeof dbPredictions>();
      const seenKeys = new Map<string, number>(); // key -> kept confidence
      for (const dbPred of (dbPredictions || [])) {
        const dedupKey = `${dbPred.fixture_id}_${dbPred.pick}`;
        const existingConf = seenKeys.get(dedupKey);
        if (existingConf !== undefined && existingConf >= (dbPred.confidence ?? 0)) {
          continue; // Bu kayıt daha düşük confidence — atla
        }
        seenKeys.set(dedupKey, dbPred.confidence ?? 0);
        const group = fixtureGrouped.get(dbPred.fixture_id) || [];
        // Önceki kaydı (varsa) kaldır, yenisini ekle
        const filtered = group.filter((g) => g.pick !== dbPred.pick);
        filtered.push(dbPred);
        fixtureGrouped.set(dbPred.fixture_id, filtered);
      }

      // NOT: Kullanıcı isteğinde canlı analiz YAPILMAZ — 504 timeout'a neden olur.
      // Cron DB'yi doldurur, kullanıcı sadece DB'den okur.
      const dbAnalysisResults = new Map<number, Awaited<ReturnType<typeof import("@/lib/prediction").analyzeMatch>>>();

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
        let aiAnalysis: AIAnalysis | undefined = liveAnalysis?.aiAnalysis;

        // DB'de saklı analysis_data varsa onu kullan
        const storedData = firstPred.analysis_data as { analysis?: MatchAnalysis; insights?: MatchInsights; odds?: MatchOdds; aiAnalysis?: AIAnalysis } | null;
        if (!analysis && storedData?.analysis) {
          analysis = storedData.analysis;
          insights = storedData.insights;
          if (!aiAnalysis && storedData.aiAnalysis) aiAnalysis = storedData.aiAnalysis;
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
          aiAnalysis,
          isLive: fixture ? fixture.fixture.status.short !== "NS" && fixture.fixture.status.short !== "FT" : false,
        };
      }).filter(Boolean);

      allDbEnriched.push(...dbEnriched);

      // NOT: Kullanıcı isteğinde canlı analiz YAPILMAZ — 504 timeout'a neden olur.
      // DB'deki tahminler daily-predictions cron tarafından doldurulur.
      // DB boşsa redirect veya "hazırlanıyor" mesajı döner (aşağıda).
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

        // Tahminleri grupla (DEDUP — aynı pick türünden en yüksek confidence olanı tut)
        const latestGrouped = new Map<number, typeof finalPreds>();
        const seenLatestKeys = new Map<string, number>();
        for (const p of finalPreds) {
          const dedupKey = `${p.fixture_id}_${p.pick}`;
          const existingConf = seenLatestKeys.get(dedupKey);
          if (existingConf !== undefined && existingConf >= (p.confidence ?? 0)) continue;
          seenLatestKeys.set(dedupKey, p.confidence ?? 0);
          const group = latestGrouped.get(p.fixture_id) || [];
          const filtered = group.filter((g) => g.pick !== p.pick);
          filtered.push(p);
          latestGrouped.set(p.fixture_id, filtered);
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
          const storedData = firstPred.analysis_data as { analysis?: MatchAnalysis; insights?: MatchInsights; odds?: MatchOdds; aiAnalysis?: AIAnalysis } | null;
          let analysis: MatchAnalysis;
          let insights: MatchInsights | undefined;
          let aiAnalysis: AIAnalysis | undefined;

          if (storedData?.analysis) {
            analysis = storedData.analysis;
            insights = storedData.insights;
            aiAnalysis = storedData.aiAnalysis;
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
            aiAnalysis,
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
          marketDeviations,
        });
      }
    }

    // Cache'e kaydet
    if (allPredictions.length > 0) {
      setCache(cacheKey, { predictions: allPredictions, marketDeviations }, 300);
    }

    return NextResponse.json({
      dates,
      source: allDbEnriched.length > 0 && allLiveAnalyzed.length > 0 ? "hybrid" : allDbEnriched.length > 0 ? "database" : "live",
      total: totalFixtures,
      fromDb: allDbEnriched.length,
      fromLive: allLiveAnalyzed.length,
      analyzed: allPredictions.length,
      predictions: allPredictions,
      marketDeviations,
    });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json(
      { error: "Tahminler yüklenirken hata oluştu" },
      { status: 500 }
    );
  }
}
