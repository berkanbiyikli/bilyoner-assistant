import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixtureById } from "@/lib/api-football";
import {
  sendTweet,
  formatResultTweet,
  replyToTweet,
  findThreadChain,
  recordThreadReply,
  uploadMedia,
  sendTweetWithMedia,
  generateROICard,
} from "@/lib/bot";
import { generateOutcomeTweet } from "@/lib/bot/prompts";
import { createValidationRecord, saveValidationRecord, calculateValidationStats, formatValidationTweet } from "@/lib/prediction/validator";

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
    let outcomeReplies = 0;
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

      // --- THE THREADER: Her settle edilen maça thread chain reply ---
      for (const fixtureId of fixtureIds) {
        try {
          const chain = await findThreadChain(fixtureId);
          if (!chain) continue;

          const fixturePreds = pending!.filter((p) => p.fixture_id === fixtureId);
          const fixture = await getFixtureById(fixtureId);
          if (!fixture) continue;

          const status = fixture.fixture.status.short;
          if (!['FT', 'AET', 'PEN'].includes(status)) continue;

          const homeGoals = fixture.goals.home ?? 0;
          const awayGoals = fixture.goals.away ?? 0;
          const actualScore = `${homeGoals}-${awayGoals}`;

          for (const pred of fixturePreds) {
            // Sonuç reply'ı — randomize persona kullan
            const outcomeText = generateOutcomeTweet({
              homeTeam: pred.home_team,
              awayTeam: pred.away_team,
              pick: pred.pick,
              odds: pred.odds,
              confidence: pred.confidence,
              result: pred.result === "won" ? "won" : "lost",
              actualScore,
            });

            const replyResult = await replyToTweet(chain.lastTweetId, outcomeText);

            if (replyResult.success && replyResult.tweetId) {
              outcomeReplies++;
              await recordThreadReply(
                replyResult.tweetId,
                fixtureId,
                chain.lastTweetId,
                "outcome_reply",
                outcomeText
              );
            }

            // Rate limit
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (chainErr) {
          console.error(`[SETTLE] Thread chain error for fixture ${fixtureId}:`, chainErr);
        }
      }

      console.log(`[CRON] Outcome thread replies: ${outcomeReplies}`);

      // Haftalık performans raporu (Pazartesi günleri) — ROI kartı ile
      const today = new Date();
      if (today.getDay() === 1) { // Pazartesi
        try {
          const stats = await calculateValidationStats();
          if (stats.totalPredictions >= 10) {
            const statsTweet = formatValidationTweet(stats);

            // Visual Proof: ROI kartı oluştur
            let roiMediaId: string | null = null;
            try {
              const bestMarket = stats.byMarket.find((m) => m.total >= 3 && m.roi > 0);
              const roiCard = generateROICard({
                period: "Bu Hafta",
                totalPredictions: stats.totalPredictions,
                won: stats.won,
                lost: stats.lost,
                winRate: stats.winRate,
                roi: stats.roi,
                topMarket: bestMarket?.market,
                valueBetRoi: stats.valueBetStats.roi > 0 ? stats.valueBetStats.roi : undefined,
              });
              roiMediaId = await uploadMedia(roiCard);
            } catch (imgErr) {
              console.error("[SETTLE] ROI card generation error:", imgErr);
            }

            // ROI kartı ile tweet at (varsa)
            let statsResult;
            if (roiMediaId) {
              statsResult = await sendTweetWithMedia(statsTweet, [roiMediaId]);
            } else {
              statsResult = await sendTweet(statsTweet);
            }

            if (statsResult.success && statsResult.tweetId) {
              await supabase.from("tweets").insert({
                tweet_id: statsResult.tweetId,
                type: "weekly_report" as const,
                content: statsTweet,
              });
            }
          }
        } catch (statsErr) {
          console.error("[SETTLE] Validation stats tweet error:", statsErr);
        }
      }
    }

    console.log(`[CRON] Settle: ${settled} settled (${won}W/${lost}L), ${outcomeReplies} thread replies`);

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
