import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { filterSafePredictions } from "@/lib/prediction/safety";
import { sendThread, formatDailyPicksTweet } from "@/lib/bot";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Günün tüm maçlarını çek
    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS"
    );
    const predictions = await analyzeMatches(fixtures);

    // Safety Check: 3 aşamalı doğrulama
    const { safe, skipped, cautioned } = filterSafePredictions(predictions);

    console.log(`[TWEET] Safety: ${safe.length} safe, ${skipped.length} skipped, ${cautioned.length} cautioned`);
    for (const s of skipped) {
      console.log(`[TWEET] Skipped: ${s.prediction.homeTeam.name} vs ${s.prediction.awayTeam.name} — ${s.reason}`);
    }

    // Sadece güvenli + kaliteli tahminleri paylaş
    const qualityPredictions = safe.filter(
      (p) => p.picks.length > 0 && p.picks[0].confidence >= 50
    );

    if (qualityPredictions.length === 0) {
      return NextResponse.json({
        success: true,
        tweeted: false,
        reason: "No quality predictions after safety check",
        skippedCount: skipped.length,
      });
    }

    // Tweet thread oluştur
    const tweetTexts = formatDailyPicksTweet(qualityPredictions);
    if (tweetTexts.length === 0) {
      return NextResponse.json({ success: true, tweeted: false, reason: "No picks to tweet" });
    }

    // Tweet gönder
    const results = await sendThread(tweetTexts);
    const successCount = results.filter((r) => r.success).length;

    // Supabase'e kaydet — fixture_id eşleştirmesiyle
    const supabase = createAdminSupabase();
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.success && result.tweetId) {
        await supabase.from("tweets").insert({
          tweet_id: result.tweetId,
          type: "daily_picks",
          content: tweetTexts[i] || "",
        });
      }
    }

    console.log(`[CRON] Tweet thread: ${successCount}/${tweetTexts.length} tweets sent (${skipped.length} skipped by safety)`);

    return NextResponse.json({
      success: true,
      tweeted: true,
      tweetsSent: successCount,
      totalTweets: tweetTexts.length,
      tweetIds: results.filter((r) => r.success).map((r) => r.tweetId),
      safetyReport: {
        safe: safe.length,
        skipped: skipped.length,
        cautioned: cautioned.length,
      },
    });
  } catch (error) {
    console.error("Tweet picks cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
