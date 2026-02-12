import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixturesByDate, LEAGUE_IDS } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { sendThread, formatDailyPicksTweet } from "@/lib/bot";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Günün tahminlerini çek — sadece desteklenen ligler
    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && LEAGUE_IDS.includes(f.league.id)
    );
    const predictions = await analyzeMatches(fixtures);

    // Sadece kaliteli tahminleri paylaş
    const qualityPredictions = predictions.filter(
      (p) => p.picks.length > 0 && p.picks[0].confidence >= 50
    );

    if (qualityPredictions.length === 0) {
      return NextResponse.json({ success: true, tweeted: false, reason: "No quality predictions" });
    }

    // Tweet thread oluştur — kaliteli tahminlerle
    const tweetTexts = formatDailyPicksTweet(qualityPredictions);
    if (tweetTexts.length === 0) {
      return NextResponse.json({ success: true, tweeted: false, reason: "No picks to tweet" });
    }

    // Tweet gönder
    const results = await sendThread(tweetTexts);
    const successCount = results.filter((r) => r.success).length;

    // Supabase'e kaydet
    const supabase = createAdminSupabase();
    for (const result of results) {
      if (result.success && result.tweetId) {
        await supabase.from("tweets").insert({
          tweet_id: result.tweetId,
          type: "daily_picks",
          content: tweetTexts[results.indexOf(result)] || "",
        });
      }
    }

    console.log(`[CRON] Tweet thread: ${successCount}/${tweetTexts.length} tweets sent`);

    return NextResponse.json({
      success: true,
      tweeted: true,
      tweetsSent: successCount,
      totalTweets: tweetTexts.length,
      tweetIds: results.filter((r) => r.success).map((r) => r.tweetId),
    });
  } catch (error) {
    console.error("Tweet picks cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
