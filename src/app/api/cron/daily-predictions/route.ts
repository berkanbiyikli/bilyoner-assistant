import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, getApiUsage } from "@/lib/api-football";
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

    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);

    // NS (başlamamış) maçları filtrele
    const nsFixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    const apiUsage = getApiUsage();
    const fixtures = nsFixtures;
    console.log(`[CRON] ${date}: ${allFixtures.length} toplam, ${fixtures.length} NS maç analiz edilecek (API: ${apiUsage.used}/${apiUsage.limit})`);

    if (fixtures.length === 0) {
      return NextResponse.json({
        success: true,
        date,
        fixturesTotal: allFixtures.length,
        analyzed: 0,
        totalPicks: 0,
        saved: 0,
        apiUsage,
        message: "No NS fixtures today",
      });
    }

    // Maçları analiz et
    const predictions = await analyzeMatches(fixtures);

    // Supabase'e kaydet — her maçın TÜM pick'lerini kaydet
    const supabase = createAdminSupabase();
    let savedCount = 0;

    for (const pred of predictions) {
      if (pred.picks.length === 0) continue;

      // Aynı fixture+pick zaten var mı kontrol et (duplicate önleme)
      const { data: existing } = await supabase
        .from("predictions")
        .select("fixture_id, pick")
        .eq("fixture_id", pred.fixtureId);
      
      const existingPicks = new Set((existing || []).map((e) => `${e.fixture_id}_${e.pick}`));

      // Maç başına tüm pick'leri kaydet (her pick ayrı satır)
      for (const pick of pred.picks) {
        const key = `${pred.fixtureId}_${pick.type}`;
        if (existingPicks.has(key)) continue; // zaten var

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
