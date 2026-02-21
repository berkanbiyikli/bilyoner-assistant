import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage, LEAGUE_IDS, getLeagueById } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    // Cron güvenlik kontrolü
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabase();
    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);

    // NS (başlamamış) maçları filtrele — batch analiz (Vercel 60s timeout)
    const nsFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    const apiUsage = getApiUsage();
    
    // Daha önce DB'de olan fixture'ları atla
    const { data: existingPreds } = await supabase
      .from("predictions")
      .select("fixture_id, pick")
      .gte("kickoff", `${date}T00:00:00.000Z`)
      .lte("kickoff", `${date}T23:59:59.999Z`);
    
    const existingFixtureIds = new Set((existingPreds || []).map((p) => p.fixture_id));
    const newFixtures = nsFixtures.filter((f) => !existingFixtureIds.has(f.fixture.id));
    
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

    // Batch: max 15 maç per cron run (15 × 4 = 60 API call, ~45s)
    const fixtures = sortedFixtures.slice(0, 15);
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

    // Maçları analiz et
    const predictions = await analyzeMatches(fixtures);
    let savedCount = 0;

    // existingPreds'ten pick bazlı set oluştur
    const existingPickKeys = new Set((existingPreds || []).map((e) => `${e.fixture_id}_${e.pick}`));

    for (const pred of predictions) {
      if (pred.picks.length === 0) {
        // Pick üretilmeyen maçı da işaretle ki tekrar analiz edilmesin
        const markerKey = `${pred.fixtureId}_no_pick`;
        if (!existingPickKeys.has(markerKey)) {
          await supabase.from("predictions").insert({
            fixture_id: pred.fixtureId,
            home_team: pred.homeTeam.name,
            away_team: pred.awayTeam.name,
            league: pred.league.name,
            kickoff: pred.kickoff,
            pick: "no_pick",
            odds: 0,
            confidence: 0,
            expected_value: 0,
            is_value_bet: false,
            analysis_summary: "Analiz sonucu pick üretilmedi",
          });
        }
        continue;
      }

      for (const pick of pred.picks) {
        const key = `${pred.fixtureId}_${pick.type}`;
        if (existingPickKeys.has(key)) continue;

        const { error } = await supabase.from("predictions").insert({
          fixture_id: pred.fixtureId,
          home_team: pred.homeTeam.name,
          away_team: pred.awayTeam.name,
          league: pred.league.name,
          kickoff: pred.kickoff,
          pick: pick.type,
          odds: pick.odds,
          confidence: pick.confidence,
          expected_value: pick.expectedValue,
          is_value_bet: pick.isValueBet,
          analysis_summary: pick.reasoning || pred.analysis.summary,
        });

        if (!error) savedCount++;
        else console.error(`[CRON] Prediction save error (${pred.fixtureId}/${pick.type}):`, error.message);
      }
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
