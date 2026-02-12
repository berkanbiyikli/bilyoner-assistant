import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixtureById } from "@/lib/api-football";
import { sendTweet, formatResultTweet } from "@/lib/bot";
import { createValidationRecord, saveValidationRecord, calculateValidationStats, formatValidationTweet } from "@/lib/prediction/validator";
import { processOutcomes } from "@/lib/bot/twitter-manager";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabase();

    // Bekleyen tahminleri çek
    const { data: pending } = await supabase
      .from("predictions")
      .select("*")
      .eq("result", "pending")
      .lte("kickoff", new Date().toISOString());

    if (!pending || pending.length === 0) {
      return NextResponse.json({ success: true, settled: 0, message: "No pending predictions" });
    }

    let won = 0;
    let lost = 0;
    let settled = 0;

    // Benzersiz fixture ID'leri
    const fixtureIds = [...new Set(pending.map((p) => p.fixture_id))];

    for (const fixtureId of fixtureIds) {
      try {
        const fixture = await getFixtureById(fixtureId);
        if (!fixture) continue;

        const status = fixture.fixture.status.short;
        // Sadece biten maçları işle (FT=Full Time, AET=After Extra Time, PEN=Penalties)
        if (!['FT', 'AET', 'PEN'].includes(status)) continue;

        const homeGoals = fixture.goals.home ?? 0;
        const awayGoals = fixture.goals.away ?? 0;
        const totalGoals = homeGoals + awayGoals;
        const actualScore = `${homeGoals}-${awayGoals}`;

        // Bu fixture'ın tahminlerini bul
        const fixturePreds = pending.filter((p) => p.fixture_id === fixtureId);

        for (const pred of fixturePreds) {
          let result: "won" | "lost" = "lost";

          switch (pred.pick) {
            case "1": result = homeGoals > awayGoals ? "won" : "lost"; break;
            case "X": result = homeGoals === awayGoals ? "won" : "lost"; break;
            case "2": result = awayGoals > homeGoals ? "won" : "lost"; break;
            case "1X": result = homeGoals >= awayGoals ? "won" : "lost"; break;
            case "X2": result = awayGoals >= homeGoals ? "won" : "lost"; break;
            case "12": result = homeGoals !== awayGoals ? "won" : "lost"; break;
            case "Over 2.5": result = totalGoals > 2.5 ? "won" : "lost"; break;
            case "Under 2.5": result = totalGoals < 2.5 ? "won" : "lost"; break;
            case "Over 1.5": result = totalGoals > 1.5 ? "won" : "lost"; break;
            case "Under 1.5": result = totalGoals < 1.5 ? "won" : "lost"; break;
            case "Over 3.5": result = totalGoals > 3.5 ? "won" : "lost"; break;
            case "Under 3.5": result = totalGoals < 3.5 ? "won" : "lost"; break;
            case "BTTS Yes": result = homeGoals > 0 && awayGoals > 0 ? "won" : "lost"; break;
            case "BTTS No": result = homeGoals === 0 || awayGoals === 0 ? "won" : "lost"; break;
          }

          await supabase
            .from("predictions")
            .update({ result })
            .eq("id", pred.id);

          // Validasyon kaydı oluştur ve kaydet
          try {
            const vRecord = createValidationRecord(
              { ...pred, result },
              actualScore,
              undefined, // simTopScoreline — analysis_summary'den parse edilebilir
              undefined, // simProbability
              pred.expected_value > 0 ? pred.expected_value * 100 : undefined // edge %
            );
            await saveValidationRecord(vRecord);
          } catch (valErr) {
            console.error(`[SETTLE] Validation record error for ${pred.id}:`, valErr);
          }

          if (result === "won") won++;
          else lost++;
          settled++;
        }

        // Rate limit
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[SETTLE] Fixture ${fixtureId} error:`, err);
      }
    }

    // Sonuç tweet'i (günde 1 kez)
    if (settled > 0) {
      const total = won + lost;
      const roi = total > 0 ? ((won / total) * 100 - 50) : 0;
      const tweet = formatResultTweet(won, lost, total, roi);
      const tweetResult = await sendTweet(tweet);

      if (tweetResult.success && tweetResult.tweetId) {
        await supabase.from("tweets").insert({
          tweet_id: tweetResult.tweetId,
          type: "result",
          content: tweet,
        });
      }

      // Haftalık performans raporu (Pazartesi günleri)
      const today = new Date();
      if (today.getDay() === 1) { // Pazartesi
        try {
          const stats = await calculateValidationStats();
          if (stats.totalPredictions >= 10) {
            const statsTweet = formatValidationTweet(stats);
            const statsResult = await sendTweet(statsTweet);
            if (statsResult.success && statsResult.tweetId) {
              await supabase.from("tweets").insert({
                tweet_id: statsResult.tweetId,
                type: "result",
                content: statsTweet,
              });
            }
          }
        } catch (statsErr) {
          console.error("[SETTLE] Validation stats tweet error:", statsErr);
        }
      }
    }

    console.log(`[CRON] Settle: ${settled} settled (${won}W/${lost}L)`);

    // Outcome Listener: Biten maçların tweetlerine sonuç yanıtı gönder
    let outcomeReplies = 0;
    if (settled > 0) {
      try {
        const outcomeResult = await processOutcomes();
        outcomeReplies = outcomeResult.repliesSent;
        console.log(`[CRON] Outcome replies: ${outcomeResult.repliesSent} sent, ${outcomeResult.errors} errors`);
      } catch (outcomeErr) {
        console.error("[CRON] Outcome processing error:", outcomeErr);
      }
    }

    return NextResponse.json({
      success: true,
      settled,
      won,
      lost,
      outcomeReplies,
    });
  } catch (error) {
    console.error("Settle bets cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
