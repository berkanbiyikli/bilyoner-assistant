import { NextRequest, NextResponse } from "next/server";
import { getLiveFixtures } from "@/lib/api-football";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendTweet } from "@/lib/bot";
import { getCached, setCache } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const liveMatches = await getLiveFixtures();
    const supabase = createAdminSupabase();
    let alerts = 0;

    // Tahmin edilen maçlardaki golleri takip et
    const { data: trackedPredictions } = await supabase
      .from("predictions")
      .select("*")
      .eq("result", "pending");

    if (trackedPredictions) {
      const trackedFixtureIds = new Set(trackedPredictions.map((p) => p.fixture_id));

      for (const match of liveMatches) {
        if (!trackedFixtureIds.has(match.fixture.id)) continue;

        const homeGoals = match.goals.home ?? 0;
        const awayGoals = match.goals.away ?? 0;
        const totalGoals = homeGoals + awayGoals;
        const cacheKey = `live-alert-${match.fixture.id}-${totalGoals}`;

        // Aynı gol durumu için tekrar tweet atma
        if (getCached(cacheKey)) continue;

        // Her gol olayında tweet at
        if (totalGoals > 0) {
          const pred = trackedPredictions.find((p) => p.fixture_id === match.fixture.id);
          if (pred) {
            const statusEmoji = totalGoals >= 3 ? "🔥" : "⚽";
            const tweet = `${statusEmoji} GOL! ${match.teams.home.name} ${homeGoals}-${awayGoals} ${match.teams.away.name}\n⏱️ ${match.fixture.status.elapsed}'\n\n📊 Tahminimiz: ${pred.pick} @${pred.odds}\n\n#canlı #maç`;

            const result = await sendTweet(tweet);
            if (result.success) {
              alerts++;
              setCache(cacheKey, true, 600); // 10 dakika cache

              if (result.tweetId) {
                await supabase.from("tweets").insert({
                  tweet_id: result.tweetId,
                  type: "live_alert",
                  content: tweet,
                });
              }
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      liveCount: liveMatches.length,
      alertsSent: alerts,
    });
  } catch (error) {
    console.error("Live scores cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
