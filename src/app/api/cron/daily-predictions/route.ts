import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage, LEAGUE_IDS, getLeagueById } from "@/lib/api-football";
import { analyzeMatch } from "@/lib/prediction/engine";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getOptimalWeights, getCalibrationAdjustments, getMarketDeviations } from "@/lib/prediction/validator";
import { isMLModelAvailable } from "@/lib/prediction/ml-model";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const TIME_LIMIT = 50_000; // 50 saniye — 10s margin bırak
  
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const forceRegenerate = searchParams.get("force") === "true";
    const allLeagues = searchParams.get("allLeagues") === "true";

    // Tüm başlangıç verilerini PARALEL çek — sıralı beklemeden
    const [allFixtures, existingPredsResult, optimalWeights, calibrationAdjustments, marketDeviations, mlAvailable] = await Promise.all([
      getFixturesByDate(date),
      forceRegenerate
        ? supabase.from("predictions").delete()
            .gte("kickoff", `${date}T00:00:00.000Z`)
            .lte("kickoff", `${date}T23:59:59.999Z`)
            .then(() => supabase.from("predictions").select("fixture_id, pick")
              .gte("kickoff", `${date}T00:00:00.000Z`)
              .lte("kickoff", `${date}T23:59:59.999Z`))
        : supabase.from("predictions").select("fixture_id, pick")
            .gte("kickoff", `${date}T00:00:00.000Z`)
            .lte("kickoff", `${date}T23:59:59.999Z`),
      // Pre-warm shared resources — paralel Supabase çağrıları, sonuçlar tüm fixture'lara dağıtılacak
      getOptimalWeights().catch(() => ({ heuristic: 0.4, sim: 0.6 })),
      getCalibrationAdjustments().catch(() => ({} as Record<string, number>)),
      getMarketDeviations().catch(() => ({} as Record<string, number>)),
      isMLModelAvailable().catch(() => false),
    ]);

    const existingPreds = existingPredsResult.data;

    const nsFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && (allLeagues || LEAGUE_IDS.includes(f.league.id))
    );

    const apiUsage = getApiUsage();
    
    const fixturesWithAnyRecord = new Set(
      (existingPreds || []).map((p) => p.fixture_id)
    );
    const newFixtures = nsFixtures.filter((f) => !fixturesWithAnyRecord.has(f.fixture.id));
    
    const sortedFixtures = [...newFixtures].sort((a, b) => {
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
    });

    console.log(`[CRON] ${date}: ${allFixtures.length} toplam, ${nsFixtures.length} NS, ${newFixtures.length} yeni (API: ${apiUsage.used}/${apiUsage.limit})`);

    if (sortedFixtures.length === 0) {
      return NextResponse.json({
        success: true, date,
        fixturesTotal: allFixtures.length, nsTotal: nsFixtures.length,
        remaining: 0, analyzed: 0, totalPicks: 0, saved: 0,
        apiUsage,
        message: "Tüm maçlar zaten analiz edildi",
      });
    }

    const existingPickKeys = new Set((existingPreds || []).map((e) => `${e.fixture_id}_${e.pick}`));
    let savedCount = 0;
    let analyzedCount = 0;
    const noPickInserts: Array<Record<string, unknown>> = [];
    const pickInserts: Array<Record<string, unknown>> = [];
    const noPickDeleteIds: number[] = [];
    // Pick'leri yazdığımız fixture'lar — eski kayıtlar silinecek (idempotency).
    // Aynı (fixture_id, pick) için aynı türde duplicate olmasını önler.
    const fixturesToReplace = new Set<number>();

    console.log(`[CRON] Init tamamlandı (${Math.round((Date.now() - startTime) / 1000)}s)`);

    // Seri olarak maç analiz et, zaman limitine yaklaşınca dur
    for (const fixture of sortedFixtures) {
      const elapsed = Date.now() - startTime;
      if (elapsed > TIME_LIMIT) {
        console.log(`[CRON] Zaman limiti (${Math.round(elapsed / 1000)}s), durduruluyor. ${analyzedCount} maç analiz edildi.`);
        break;
      }

      try {
        const pred = await analyzeMatch(fixture, {
          skipAI: true,
          lightweight: true,
          weights: optimalWeights,
          calibrationAdjustments,
          marketDeviations,
          mlAvailable,
        });
        analyzedCount++;

        if (pred.picks.length === 0) {
          if (!existingPickKeys.has(`${pred.fixtureId}_no_pick`)) {
            noPickInserts.push({
              fixture_id: pred.fixtureId,
              home_team: pred.homeTeam.name,
              away_team: pred.awayTeam.name,
              league: pred.league.name,
              league_id: pred.league.id || null,
              kickoff: pred.kickoff,
              pick: "no_pick", odds: 0, confidence: 0,
              expected_value: 0, is_value_bet: false,
              analysis_summary: "Yeterli veri yok veya güvenilir tahmin üretilemedi",
              analysis_data: null,
            });
          }
          continue;
        }

        noPickDeleteIds.push(pred.fixtureId);
        // Bu fixture için pick yazıyoruz → eski tüm kayıtları sileceğiz (duplicate önleme)
        fixturesToReplace.add(pred.fixtureId);

        const oddsForJson = pred.odds ? {
          ...pred.odds,
          realMarkets: pred.odds.realMarkets ? Array.from(pred.odds.realMarkets) : [],
        } : undefined;
        const analysisData = {
          analysis: pred.analysis,
          insights: pred.insights,
          odds: oddsForJson,
          aiAnalysis: pred.aiAnalysis || null,
        };

        for (const pick of pred.picks) {
          // Aynı analiz turunda bir pick türünden sadece bir tane (defansif)
          const key = `${pred.fixtureId}_${pick.type}`;
          if (existingPickKeys.has(key)) continue;
          existingPickKeys.add(key);
          pickInserts.push({
            fixture_id: pred.fixtureId,
            home_team: pred.homeTeam.name,
            away_team: pred.awayTeam.name,
            league: pred.league.name,
            league_id: pred.league.id || null,
            kickoff: pred.kickoff,
            pick: pick.type, odds: pick.odds,
            confidence: pick.confidence,
            expected_value: pick.expectedValue,
            is_value_bet: pick.isValueBet,
            analysis_summary: pick.reasoning || pred.analysis.summary,
            analysis_data: analysisData,
          });
        }
      } catch (err) {
        console.error(`[CRON] Fixture ${fixture.fixture.id} analiz hatası:`, err);
      }
    }

    // Toplu DB işlemleri
    if (noPickDeleteIds.length > 0) {
      await supabase.from("predictions").delete()
        .in("fixture_id", noPickDeleteIds).eq("pick", "no_pick");
    }
    // Idempotency: pick yazacağımız fixture'lar için TÜM eski pick kayıtlarını sil.
    // Böylece concurrent cron çalışmalarında oluşmuş duplicate'ler temizlenir,
    // her fixture için kanonik (tek tur) pick seti DB'ye gider.
    if (fixturesToReplace.size > 0) {
      const replaceIds = Array.from(fixturesToReplace);
      await supabase.from("predictions").delete()
        .in("fixture_id", replaceIds).neq("pick", "no_pick");
    }
    if (noPickInserts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("predictions").insert(noPickInserts as any);
      if (error) console.error(`[CRON] no_pick insert error:`, error.message);
      else savedCount += noPickInserts.length;
    }
    if (pickInserts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("predictions").insert(pickInserts as any);
      if (error) console.error(`[CRON] pick insert error:`, error.message);
      else savedCount += pickInserts.length;
    }

    const totalPicks = pickInserts.length + noPickInserts.length;
    const finalUsage = getApiUsage();
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`[CRON] ${date}: ${analyzedCount} maç, ${totalPicks} pick, ${savedCount} kayıt, ${totalTime}s (API: ${finalUsage.used}/${finalUsage.limit})`);

    return NextResponse.json({
      success: true, date,
      fixturesTotal: allFixtures.length,
      nsTotal: nsFixtures.length,
      remaining: Math.max(0, sortedFixtures.length - analyzedCount),
      analyzed: analyzedCount,
      totalPicks, saved: savedCount,
      elapsed: totalTime,
      apiUsage: finalUsage,
    });
  } catch (error) {
    console.error("Daily predictions cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
