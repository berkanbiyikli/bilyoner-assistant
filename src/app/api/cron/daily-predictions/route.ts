import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage, LEAGUE_IDS, getLeagueById } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    // Cron güvenlik kontrolü
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    // Manuel tarih parametresi desteği: ?date=2026-03-15
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const forceRegenerate = searchParams.get("force") === "true";
    const allLeagues = searchParams.get("allLeagues") === "true";
    const batchSize = parseInt(searchParams.get("batch") || "20", 10);
    const allFixtures = await getFixturesByDate(date);

    // NS (başlamamış) maçları filtrele — allLeagues=true ise lig filtresi yok
    const nsFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && (allLeagues || LEAGUE_IDS.includes(f.league.id))
    );

    const apiUsage = getApiUsage();

    // force=true ise tüm tahminleri sil ve yeniden üret
    if (forceRegenerate) {
      await supabase
        .from("predictions")
        .delete()
        .gte("kickoff", `${date}T00:00:00.000Z`)
        .lte("kickoff", `${date}T23:59:59.999Z`);
    }
    
    // Daha önce DB'de olan fixture'ları atla — no_pick olanları yeniden analiz et
    const { data: existingPreds } = await supabase
      .from("predictions")
      .select("fixture_id, pick")
      .gte("kickoff", `${date}T00:00:00.000Z`)
      .lte("kickoff", `${date}T23:59:59.999Z`);
    
    // Herhangi bir kaydı olan fixture'ları atla (real pick veya no_pick fark etmez)
    const fixturesWithAnyRecord = new Set(
      (existingPreds || []).map((p) => p.fixture_id)
    );
    const newFixtures = nsFixtures.filter((f) => !fixturesWithAnyRecord.has(f.fixture.id));
    
    // Büyük ligleri önceliklendir: LEAGUE_IDS'deki ligler önce, priority'ye göre sırala
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

    // Batch: default 10 (Vercel 60s timeout), ?batch=N ile özelleştirilebilir
    const fixtures = sortedFixtures.slice(0, batchSize);
    console.log(`[CRON] ${date}: ${allFixtures.length} toplam, ${nsFixtures.length} NS, ${newFixtures.length} yeni, ${fixtures.length} analiz edilecek (API: ${apiUsage.used}/${apiUsage.limit})`);

    if (fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        date,
        fixturesTotal: allFixtures.length,
        nsTotal: nsFixtures.length,
        remaining: newFixtures.length,
        analyzed: 0,
        totalPicks: 0,
        saved: 0,
        apiUsage,
        message: newFixtures.length === 0 ? "Tüm maçlar zaten analiz edildi" : "No NS fixtures today",
      });
    }

    // Maçları analiz et — AI atlanır, lightweight mod (shot stats yok = hızlı)
    const predictions = await analyzeMatches(fixtures, 3, { skipAI: true, lightweight: true });
    let savedCount = 0;

    // existingPreds'ten pick bazlı set oluştur
    const existingPickKeys = new Set((existingPreds || []).map((e) => `${e.fixture_id}_${e.pick}`));

    // Toplu insert için kayıtları biriktir
    const noPickInserts: Array<Record<string, unknown>> = [];
    const pickInserts: Array<Record<string, unknown>> = [];
    const noPickDeleteIds: number[] = [];

    for (const pred of predictions) {
      if (pred.picks.length === 0) {
        const existsNoPickKey = existingPickKeys.has(`${pred.fixtureId}_no_pick`);
        if (!existsNoPickKey) {
          noPickInserts.push({
            fixture_id: pred.fixtureId,
            home_team: pred.homeTeam.name,
            away_team: pred.awayTeam.name,
            league: pred.league.name,
            league_id: pred.league.id || null,
            kickoff: pred.kickoff,
            pick: "no_pick",
            odds: 0,
            confidence: 0,
            expected_value: 0,
            is_value_bet: false,
            analysis_summary: "Yeterli veri yok veya güvenilir tahmin üretilemedi",
            analysis_data: null,
          });
        }
        continue;
      }

      // Daha önce no_pick varsa temizle (yeniden analiz başarılı oldu)
      noPickDeleteIds.push(pred.fixtureId);

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
        const key = `${pred.fixtureId}_${pick.type}`;
        if (existingPickKeys.has(key)) continue;

        pickInserts.push({
          fixture_id: pred.fixtureId,
          home_team: pred.homeTeam.name,
          away_team: pred.awayTeam.name,
          league: pred.league.name,
          league_id: pred.league.id || null,
          kickoff: pred.kickoff,
          pick: pick.type,
          odds: pick.odds,
          confidence: pick.confidence,
          expected_value: pick.expectedValue,
          is_value_bet: pick.isValueBet,
          analysis_summary: pick.reasoning || pred.analysis.summary,
          analysis_data: analysisData,
        });
      }
    }

    // Toplu DB işlemleri — tek seferde (sequential insert yerine)
    if (noPickDeleteIds.length > 0) {
      await supabase
        .from("predictions")
        .delete()
        .in("fixture_id", noPickDeleteIds)
        .eq("pick", "no_pick");
    }

    if (noPickInserts.length > 0) {
      const { error } = await supabase.from("predictions").insert(noPickInserts);
      if (error) console.error(`[CRON] no_pick batch insert error:`, error.message);
      else savedCount += noPickInserts.length;
    }

    if (pickInserts.length > 0) {
      const { error } = await supabase.from("predictions").insert(pickInserts);
      if (error) console.error(`[CRON] pick batch insert error:`, error.message);
      else savedCount += pickInserts.length;
    }

    const totalPicks = predictions.reduce((sum, p) => sum + p.picks.length, 0);
    const finalUsage = getApiUsage();
    console.log(`[CRON] ${date}: ${predictions.length} maç analiz, ${totalPicks} pick, ${savedCount} kayıt (API: ${finalUsage.used}/${finalUsage.limit})`);

    return NextResponse.json({
      success: true,
      date,
      fixturesTotal: allFixtures.length,
      nsTotal: nsFixtures.length,
      remaining: Math.max(0, newFixtures.length - fixtures.length),
      analyzed: predictions.length,
      totalPicks,
      saved: savedCount,
      apiUsage: finalUsage,
    });
  } catch (error) {
    console.error("Daily predictions cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
