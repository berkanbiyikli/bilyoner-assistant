import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixturesByDate, getApiUsage } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { filterSafePredictions } from "@/lib/prediction/safety";
import { findValueBets } from "@/lib/value-bet";
import { sendTweet } from "@/lib/bot";
import { formatValueBetAlert, formatAnalyticTweet } from "@/lib/bot/twitter-manager";

export const maxDuration = 60;

/**
 * Market Scanner Cron — her saat çalışır
 * Maç başlamadan 1-2 saat önce value bet'leri tarar
 * %15+ edge bulursa anında tweet atar
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiUsage = getApiUsage();
    const supabase = createAdminSupabase();
    const now = new Date();
    const date = now.toISOString().split("T")[0];

    // Günün NS maçlarını çek
    const allFixtures = await getFixturesByDate(date);
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );

    // 1-3 saat içinde başlayacak maçları al
    const soonFixtures = fixtures.filter((f) => {
      const kickoff = new Date(f.fixture.date);
      const hoursUntil = (kickoff.getTime() - now.getTime()) / (1000 * 60 * 60);
      return hoursUntil > 0 && hoursUntil <= 3;
    });

    const limitedFixtures = soonFixtures;

    if (soonFixtures.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        alerts: 0,
        reason: "No matches starting within 2 hours",
      });
    }

    if (limitedFixtures.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        alerts: 0,
        reason: "No matches starting within 3 hours",
        apiUsage,
      });
    }

    // Analiz et
    const predictions = await analyzeMatches(limitedFixtures);

    // Safety check
    const { safe, skipped } = filterSafePredictions(predictions);

    // Value bet'leri bul (tüm pazarlar)
    const valueBets = findValueBets(safe);

    // %15+ edge'li value bet'leri filtrele (High Edge Alert)
    const highEdgeBets = valueBets.filter((vb) => vb.edge >= 15);

    let alertsSent = 0;

    // Bugün bu fixture için daha önce alert attık mı?
    for (const vb of highEdgeBets) {
      // Daha önce bu maç için value alert attık mı kontrol et
      const { data: existingAlert } = await supabase
        .from("tweets")
        .select("id")
        .eq("type", "value_alert")
        .eq("fixture_id", vb.fixtureId)
        .maybeSingle();

      if (existingAlert) continue; // Zaten attık

      // İlgili prediction'ı bul
      const pred = safe.find((p) => p.fixtureId === vb.fixtureId);
      if (!pred) continue;

      // Edge >= 20 → Value Bet ALARM, 15-20 → Analitik tweet
      const tweetData = {
        homeTeam: vb.homeTeam,
        awayTeam: vb.awayTeam,
        league: vb.league,
        pick: `${vb.pick} (${vb.market})`,
        odds: vb.bookmakerOdds,
        confidence: vb.confidence,
        simEdge: vb.edge,
        xgHome: pred.analysis.homeXg,
        xgAway: pred.analysis.awayXg,
        simTopScoreline: pred.analysis.simulation?.topScorelines[0]?.score,
        simProbability: pred.analysis.simulation?.topScorelines[0]?.probability,
        keyInsight: pred.insights?.notes[0],
      };

      const tweetText = vb.edge >= 20
        ? formatValueBetAlert(tweetData)
        : formatAnalyticTweet(tweetData);

      const result = await sendTweet(tweetText);

      if (result.success) {
        alertsSent++;

        if (result.tweetId) {
          await supabase.from("tweets").insert({
            tweet_id: result.tweetId,
            type: "value_alert",
            content: tweetText,
            fixture_id: vb.fixtureId,
          });
        }
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 2000));

      // Max 3 alert per run
      if (alertsSent >= 3) break;
    }

    const finalUsage = getApiUsage();
    console.log(`[SCANNER] Scanned ${limitedFixtures.length} matches, ${highEdgeBets.length} high-edge, ${alertsSent} alerts sent, ${skipped.length} skipped by safety (API: ${finalUsage.used}/${finalUsage.limit})`);

    return NextResponse.json({
      success: true,
      scanned: limitedFixtures.length,
      analyzed: safe.length,
      valueBetsFound: valueBets.length,
      highEdgeBets: highEdgeBets.length,
      alertsSent,
      skippedBySafety: skipped.length,
      apiUsage: finalUsage,
    });
  } catch (error) {
    console.error("Market scanner cron error:", error);
    return NextResponse.json({ error: "Scanner cron failed" }, { status: 500 });
  }
}
