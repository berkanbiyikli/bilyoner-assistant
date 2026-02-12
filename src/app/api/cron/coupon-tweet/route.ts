import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { buildCoupon } from "@/lib/coupon";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendTweet, formatCouponTweet } from "@/lib/bot";
import type { CouponCategory } from "@/types";

const COUPON_CATEGORIES: CouponCategory[] = ["safe", "balanced", "risky"];

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);
    const fixtures = allFixtures.filter((f) => f.fixture.status.short === "NS");

    if (fixtures.length === 0) {
      return NextResponse.json({ success: true, reason: "No upcoming fixtures" });
    }

    const predictions = await analyzeMatches(fixtures);

    if (predictions.length < 3) {
      return NextResponse.json({ success: true, reason: "Not enough predictions" });
    }

    const supabase = createAdminSupabase();
    const results: Array<{ category: string; tweeted: boolean; saved: boolean }> = [];

    for (const category of COUPON_CATEGORIES) {
      const stake = category === "safe" ? 100 : category === "balanced" ? 50 : 25;
      const coupon = buildCoupon(predictions, { category, stake });

      if (coupon.items.length < 2) {
        results.push({ category, tweeted: false, saved: false });
        continue;
      }

      // Kupon tweet'i - her kategori için ayrı tweet
      const couponPredictions = predictions.filter((p) =>
        coupon.items.some((item) => item.fixtureId === p.fixtureId)
      );
      const tweetText = formatCouponTweet(couponPredictions, category, coupon.totalOdds, stake);
      const tweetResult = await sendTweet(tweetText);

      let saved = false;
      if (tweetResult.success && tweetResult.tweetId) {
        const { error: tweetDbErr } = await supabase.from("tweets").insert({
          tweet_id: tweetResult.tweetId,
          type: "coupon",
          content: tweetText,
        });
        saved = !tweetDbErr;
      }

      results.push({
        category,
        tweeted: tweetResult.success,
        saved,
      });

      // Tweet arası bekleme
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`[CRON] Coupon tweet: ${results.filter((r) => r.tweeted).length}/${COUPON_CATEGORIES.length} sent`);

    return NextResponse.json({
      success: true,
      date,
      coupons: results,
    });
  } catch (error) {
    console.error("Coupon tweet cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
