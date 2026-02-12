import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixturesByDate } from "@/lib/api-football";
import { analyzeMatches } from "@/lib/prediction";
import { filterSafePredictions } from "@/lib/prediction/safety";
import {
  sendThread,
  formatDailyPicksTweet,
  seedThreadBulk,
  uploadMedia,
  sendTweetWithMedia,
  generateSimulationCard,
} from "@/lib/bot";
import type { MatchPrediction } from "@/types";

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

    // --- Visual Proof: En iyi maç için simülasyon kartı ---
    let simMediaId: string | null = null;
    const bestWithSim = qualityPredictions.find(
      (p) =>
        p.analysis.simulation &&
        p.analysis.simulation.topScorelines.length >= 3 &&
        p.picks[0].confidence >= 60
    );

    if (bestWithSim) {
      try {
        const simCard = generateSimulationCard({
          homeTeam: bestWithSim.homeTeam.name,
          awayTeam: bestWithSim.awayTeam.name,
          league: bestWithSim.league.name,
          topScores: bestWithSim.analysis.simulation!.topScorelines.slice(0, 5),
          pick: bestWithSim.picks[0].type,
          odds: bestWithSim.picks[0].odds,
          confidence: bestWithSim.picks[0].confidence,
          simRuns: bestWithSim.analysis.simulation!.simRuns,
          xgHome: bestWithSim.analysis.homeXg,
          xgAway: bestWithSim.analysis.awayXg,
        });
        simMediaId = await uploadMedia(simCard);
      } catch (imgErr) {
        console.error("[TWEET] Simulation card error:", imgErr);
      }
    }

    // Tweet gönder — ilk tweet simülasyon görseli ile (varsa)
    let results: Array<{ success: boolean; tweetId?: string }>;
    if (simMediaId && tweetTexts.length > 0) {
      // İlk tweeti görselli gönder
      const firstResult = await sendTweetWithMedia(tweetTexts[0], [simMediaId]);
      const remainingTexts = tweetTexts.slice(1);

      if (firstResult.success && firstResult.tweetId && remainingTexts.length > 0) {
        const threadResults = await sendThread(remainingTexts);
        results = [
          { success: firstResult.success, tweetId: firstResult.tweetId },
          ...threadResults,
        ];
      } else {
        results = [{ success: firstResult.success, tweetId: firstResult.tweetId }];
      }
    } else {
      results = await sendThread(tweetTexts);
    }

    const successCount = results.filter((r) => r.success).length;

    // --- THE THREADER: Fixture → Tweet ID Eşleştirmesi ---
    const supabase = createAdminSupabase();
    const firstSuccessfulTweetId = results.find((r) => r.success)?.tweetId;

    // Her başarılı tweeti kaydet
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

    // Thread Seed: İlk tweet'i tahmin edilen her maçın fixture_id'sine mühürle
    // Böylece live-scores ve settle-bets bu tweet'in altına reply atabilir
    let threadSeedCount = 0;
    if (firstSuccessfulTweetId) {
      const fixtureSeeds = extractFixtureSeeds(qualityPredictions);
      if (fixtureSeeds.length > 0) {
        try {
          await seedThreadBulk(firstSuccessfulTweetId, fixtureSeeds);
          threadSeedCount = fixtureSeeds.length;
          console.log(`[TWEET] Threader: ${threadSeedCount} fixtures seeded to tweet ${firstSuccessfulTweetId}`);
        } catch (seedErr) {
          console.error("[TWEET] Thread seed error:", seedErr);
        }
      }
    }

    console.log(`[CRON] Tweet thread: ${successCount}/${tweetTexts.length} tweets sent (${skipped.length} skipped by safety)`);

    return NextResponse.json({
      success: true,
      tweeted: true,
      tweetsSent: successCount,
      totalTweets: tweetTexts.length,
      tweetIds: results.filter((r) => r.success).map((r) => r.tweetId),
      hasSimCard: !!simMediaId,
      threadSeeds: threadSeedCount,
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

// ---- Helper: Quality prediction'lardan fixture seed verisini çıkar ----
function extractFixtureSeeds(
  predictions: MatchPrediction[]
): Array<{
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  odds: number;
  confidence: number;
}> {
  return predictions
    .filter((p) => p.picks.length > 0 && p.picks[0].confidence >= 50)
    .slice(0, 10) // Sadece top 10 maçı thread'e bağla
    .map((p) => ({
      fixtureId: p.fixtureId,
      homeTeam: p.homeTeam.name,
      awayTeam: p.awayTeam.name,
      pick: p.picks[0].type,
      odds: p.picks[0].odds,
      confidence: p.picks[0].confidence,
    }));
}
