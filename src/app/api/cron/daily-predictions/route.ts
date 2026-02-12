import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate, LEAGUE_IDS } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    // Cron güvenlik kontrolü
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);
    // Sadece desteklenen liglerdeki maçları analiz et
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && LEAGUE_IDS.includes(f.league.id)
    );

    // Maçları analiz et
    const predictions = await analyzeMatches(fixtures);

    // Supabase'e kaydet
    const supabase = createAdminSupabase();
    let savedCount = 0;

    for (const pred of predictions) {
      if (pred.picks.length === 0) continue;
      const bestPick = pred.picks[0];

      const { error } = await supabase.from("predictions").insert({
        fixture_id: pred.fixtureId,
        home_team: pred.homeTeam.name,
        away_team: pred.awayTeam.name,
        league: pred.league.name,
        kickoff: pred.kickoff,
        pick: bestPick.type,
        odds: bestPick.odds,
        confidence: bestPick.confidence,
        expected_value: bestPick.expectedValue,
        is_value_bet: bestPick.isValueBet,
        analysis_summary: pred.analysis.summary,
      });

      if (!error) savedCount++;
      else console.error(`[CRON] Prediction save error (${pred.fixtureId}):`, error.message);
    }

    console.log(`[CRON] ${date}: ${predictions.length} maç analiz, ${savedCount} tahmin kaydedildi`);

    return NextResponse.json({
      success: true,
      date,
      fixturesTotal: allFixtures.length,
      analyzed: predictions.length,
      saved: savedCount,
    });
  } catch (error) {
    console.error("Daily predictions cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
