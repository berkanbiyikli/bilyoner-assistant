import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFixtureById, getFixtureStatistics, getFixtureEvents } from "@/lib/api-football";
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

        // Korner/kart/HT verileri için fixture istatistikleri çek (lazy, bir kez)
        let fixtureStats: Awaited<ReturnType<typeof getFixtureStatistics>> | null = null;
        let statsAvailable = false; // İstatistik verisi gerçekten var mı?

        const getStats = async () => {
          if (!fixtureStats) {
            try {
              fixtureStats = await getFixtureStatistics(fixtureId);
              // İstatistik verisi var mı kontrol et — en az 1 takım ve 1 istatistik olmalı
              statsAvailable = (fixtureStats?.length ?? 0) > 0 &&
                fixtureStats!.some((t) => t.statistics && t.statistics.length > 0);
              if (!statsAvailable) {
                console.warn(`[SETTLE] No stats available for fixture ${fixtureId} — will skip stats-dependent picks`);
              }
            } catch (err) {
              console.error(`[SETTLE] Stats fetch failed for fixture ${fixtureId}:`, err);
              fixtureStats = [];
              statsAvailable = false;
            }
          }
          return fixtureStats;
        };

        const getStatValue = async (type: string): Promise<number | null> => {
          const stats = await getStats();
          if (!statsAvailable) return null; // Veri yok → null döndür (pending kalacak)
          let total = 0;
          for (const team of stats) {
            const stat = team.statistics?.find((s: { type: string }) => s.type === type);
            if (stat?.value != null) total += Number(stat.value) || 0;
          }
          return total;
        };

        // İlk yarı gol bilgisi (fixture events'tan)
        let firstHalfGoals: number | null = null;
        let htGoalsChecked = false;
        const getFirstHalfGoals = async (): Promise<number | null> => {
          if (htGoalsChecked) return firstHalfGoals;
          htGoalsChecked = true;
          try {
            const events = await getFixtureEvents(fixtureId);
            if (!events || events.length === 0) {
              console.warn(`[SETTLE] No events for fixture ${fixtureId} — HT goals unknown`);
              return null;
            }
            firstHalfGoals = events.filter(
              (e) => e.type === "Goal" && (e.time?.elapsed ?? 99) <= 45
            ).length;
          } catch {
            console.error(`[SETTLE] Events fetch failed for fixture ${fixtureId}`);
            firstHalfGoals = null;
          }
          return firstHalfGoals;
        };

        for (const pred of fixturePreds) {
          let result: "won" | "lost" | null = "lost"; // null = skip (keep pending)

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
            // Kombine pick'ler
            case "1 & Over 1.5": result = homeGoals > awayGoals && totalGoals > 1.5 ? "won" : "lost"; break;
            case "2 & Over 1.5": result = awayGoals > homeGoals && totalGoals > 1.5 ? "won" : "lost"; break;
            // İlk yarı
            case "HT Over 0.5": {
              const htGoals = await getFirstHalfGoals();
              if (htGoals === null) { result = null; break; }
              result = htGoals > 0 ? "won" : "lost";
              break;
            }
            case "HT Under 0.5": {
              const htGoals = await getFirstHalfGoals();
              if (htGoals === null) { result = null; break; }
              result = htGoals === 0 ? "won" : "lost";
              break;
            }
            // Korner
            case "Over 8.5 Corners": {
              const corners = await getStatValue("Corner Kicks");
              if (corners === null) { result = null; break; } // Veri yok → pending kal
              result = corners > 8.5 ? "won" : "lost";
              break;
            }
            case "Under 8.5 Corners": {
              const corners = await getStatValue("Corner Kicks");
              if (corners === null) { result = null; break; }
              result = corners < 8.5 ? "won" : "lost";
              break;
            }
            case "Over 9.5 Corners": {
              const corners = await getStatValue("Corner Kicks");
              if (corners === null) { result = null; break; }
              result = corners > 9.5 ? "won" : "lost";
              break;
            }
            case "Under 9.5 Corners": {
              const corners = await getStatValue("Corner Kicks");
              if (corners === null) { result = null; break; }
              result = corners < 9.5 ? "won" : "lost";
              break;
            }
            case "Over 10.5 Corners": {
              const corners = await getStatValue("Corner Kicks");
              if (corners === null) { result = null; break; }
              result = corners > 10.5 ? "won" : "lost";
              break;
            }
            case "Under 10.5 Corners": {
              const corners = await getStatValue("Corner Kicks");
              if (corners === null) { result = null; break; }
              result = corners < 10.5 ? "won" : "lost";
              break;
            }
            // Kart
            case "Over 3.5 Cards": {
              const yellowCards = await getStatValue("Yellow Cards");
              const redCards = await getStatValue("Red Cards");
              if (yellowCards === null || redCards === null) { result = null; break; }
              result = (yellowCards + redCards) > 3.5 ? "won" : "lost";
              break;
            }
            case "Under 3.5 Cards": {
              const yellowCards = await getStatValue("Yellow Cards");
              const redCards = await getStatValue("Red Cards");
              if (yellowCards === null || redCards === null) { result = null; break; }
              result = (yellowCards + redCards) < 3.5 ? "won" : "lost";
              break;
            }
            case "Over 4.5 Cards": {
              const yellowCards = await getStatValue("Yellow Cards");
              const redCards = await getStatValue("Red Cards");
              if (yellowCards === null || redCards === null) { result = null; break; }
              result = (yellowCards + redCards) > 4.5 ? "won" : "lost";
              break;
            }
            case "Under 4.5 Cards": {
              const yellowCards = await getStatValue("Yellow Cards");
              const redCards = await getStatValue("Red Cards");
              if (yellowCards === null || redCards === null) { result = null; break; }
              result = (yellowCards + redCards) < 4.5 ? "won" : "lost";
              break;
            }
            default: {
              // Exact Score: "CS 2-1" gibi
              if (pred.pick.startsWith("CS ")) {
                const predictedScore = pred.pick.replace("CS ", "");
                result = actualScore === predictedScore ? "won" : "lost";
              } else {
                console.warn(`[SETTLE] Unknown pick type: ${pred.pick} — defaulting to lost`);
              }
              break;
            }
          }

          // result === null → veri eksik, pending bırak
          if (result === null) {
            console.log(`[SETTLE] Skipping ${pred.pick} for fixture ${fixtureId} — stats not available yet`);
            continue;
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

    // Sonuç tweet'i (günde 1 kez) — duplicate check
    let outcomeReplies = 0;
    if (settled > 0) {
      // Bugün zaten result tweet atılmış mı?
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: existingResultTweets } = await supabase
        .from("tweets")
        .select("id")
        .eq("type", "result")
        .gte("created_at", todayStart.toISOString())
        .limit(1);

      if (!existingResultTweets || existingResultTweets.length === 0) {
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
      } else {
        console.log("[SETTLE] Result tweet already sent today — skipping");
      }

      // --- THE THREADER: Her settle edilen maça thread chain reply ---
      // Daha önce outcome reply atılmış fixture'ları takip et
      const { data: existingOutcomeReplies } = await supabase
        .from("tweets")
        .select("fixture_id")
        .eq("type", "outcome_reply")
        .gte("created_at", todayStart.toISOString());

      const alreadyRepliedFixtures = new Set<number>(
        existingOutcomeReplies?.map((r) => r.fixture_id as number).filter(Boolean) || []
      );

      for (const fixtureId of fixtureIds) {
        // Bu fixture'a zaten outcome reply atılmışsa atla
        if (alreadyRepliedFixtures.has(fixtureId)) {
          console.log(`[SETTLE] Outcome reply already sent for fixture ${fixtureId} — skipping`);
          continue;
        }

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
