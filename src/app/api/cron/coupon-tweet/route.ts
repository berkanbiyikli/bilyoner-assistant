import { NextRequest, NextResponse } from "next/server";
import { getFixturesByDate } from "@/lib/api-football";
import { LEAGUE_IDS } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { buildCoupon } from "@/lib/coupon";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendTweet, formatCouponTweet } from "@/lib/bot";
import type { CouponCategory } from "@/types";

const COUPON_CATEGORIES: CouponCategory[] = ["safe", "balanced", "risky"];

// Minimum kalite eşikleri — bu şartları sağlamayan kupon paylaşılmaz
const MIN_ITEMS_PER_CATEGORY: Record<CouponCategory, number> = {
  safe: 2,
  balanced: 3,
  risky: 3,
  value: 2,
  custom: 1,
  crazy: 2,
};

const MIN_AVG_CONFIDENCE: Record<CouponCategory, number> = {
  safe: 65,
  balanced: 55,
  risky: 50,
  value: 50,
  custom: 30,
  crazy: 0,
};

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const date = new Date().toISOString().split("T")[0];
    const allFixtures = await getFixturesByDate(date);

    // SADECE desteklenen liglerdeki, henüz başlamamış maçları al
    const fixtures = allFixtures.filter(
      (f) => f.fixture.status.short === "NS" && LEAGUE_IDS.includes(f.league.id)
    );

    if (fixtures.length === 0) {
      return NextResponse.json({ success: true, reason: "No upcoming fixtures in supported leagues" });
    }

    const predictions = await analyzeMatches(fixtures);

    // Sadece en az 1 güvenilir pick'i olan tahminleri kullan
    const qualityPredictions = predictions.filter(
      (p) => p.picks.length > 0 && p.picks[0].confidence >= 50
    );

    if (qualityPredictions.length < 3) {
      return NextResponse.json({ success: true, reason: "Not enough quality predictions" });
    }

    const supabase = createAdminSupabase();
    const results: Array<{ category: string; tweeted: boolean; saved: boolean; reason?: string }> = [];

    for (const category of COUPON_CATEGORIES) {
      const stake = category === "safe" ? 100 : category === "balanced" ? 50 : 25;
      const coupon = buildCoupon(qualityPredictions, { category, stake });

      const minItems = MIN_ITEMS_PER_CATEGORY[category];
      const minAvgConf = MIN_AVG_CONFIDENCE[category];

      // Kalite kontrolü — yeterli maç yoksa veya güven düşükse paylaşma
      if (coupon.items.length < minItems) {
        results.push({ category, tweeted: false, saved: false, reason: `Not enough items (${coupon.items.length}/${minItems})` });
        continue;
      }

      const avgConfidence = coupon.items.reduce((sum, i) => sum + i.confidence, 0) / coupon.items.length;
      if (avgConfidence < minAvgConf) {
        results.push({ category, tweeted: false, saved: false, reason: `Low avg confidence (${avgConfidence.toFixed(0)}/${minAvgConf})` });
        continue;
      }

      // Kupon tweet'i - her kategori için ayrı tweet
      const couponPredictions = qualityPredictions.filter((p) =>
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
      fixturesAnalyzed: fixtures.length,
      qualityPredictions: qualityPredictions.length,
      coupons: results,
    });
  } catch (error) {
    console.error("Coupon tweet cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
