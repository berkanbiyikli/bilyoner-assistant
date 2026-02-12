import { NextRequest, NextResponse } from "next/server";
import { getLiveFixtures } from "@/lib/api-football";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  replyToTweet,
  getTrackedFixtures,
  recordThreadReply,
  getLiveAlertCount,
  hasRecentReply,
  generateLiveUpdateTweet,
  getRemainingBudget,
} from "@/lib/bot";
import { getCached, setCache } from "@/lib/cache";

// Canlı alert'leri sadece yüksek güvenli / tweet edilmiş maçlara sınırla
// Rate limit: max 4 live_alert/saat (Twitter Free tier koruması)
const MAX_LIVE_ALERTS_PER_HOUR = 4;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const liveMatches = await getLiveFixtures();
    const supabase = createAdminSupabase();
    let alerts = 0;
    let skippedRateLimit = 0;
    let skippedNotTracked = 0;

    // Rate limit kontrolü — saatlik bütçe
    const alertsThisHour = await getLiveAlertCount(1);
    const { canTweet, remaining } = getRemainingBudget("live_alert", alertsThisHour);

    if (!canTweet) {
      return NextResponse.json({
        success: true,
        liveCount: liveMatches.length,
        alertsSent: 0,
        reason: "Rate limit reached for live alerts this hour",
      });
    }

    // THE THREADER: Sadece tweet edilmiş (tracked) maçlara reply at
    const trackedFixtures = await getTrackedFixtures();

    for (const match of liveMatches) {
      // Bütçe bitti mi?
      if (alerts >= remaining) {
        skippedRateLimit++;
        continue;
      }

      const fixtureId = match.fixture.id;
      const chain = trackedFixtures.get(fixtureId);

      // Sadece tahmin edilmiş ve tweet atılmış maçlara reply at
      if (!chain) {
        skippedNotTracked++;
        continue;
      }

      const homeGoals = match.goals.home ?? 0;
      const awayGoals = match.goals.away ?? 0;
      const totalGoals = homeGoals + awayGoals;
      const elapsed = match.fixture.status.elapsed ?? 0;
      const currentScore = `${homeGoals}-${awayGoals}`;

      // ---- Olay Tespiti ----

      // 1. Gol olayı — her gol durumunda (cache ile tekrar engelle)
      const goalKey = `goal-${fixtureId}-${totalGoals}`;
      if (totalGoals > 0 && !getCached(`live-${goalKey}`)) {
        // Bu gol için daha önce reply atılmış mı?
        const alreadyReplied = await hasRecentReply(fixtureId, goalKey);
        if (!alreadyReplied) {
          const goalText = generateLiveUpdateTweet({
            homeTeam: chain.homeTeam,
            awayTeam: chain.awayTeam,
            minute: elapsed,
            currentScore,
            eventType: "goal",
            eventDescription: `Skor güncellendi! Tahminimiz: ${chain.pick}`,
            originalPick: chain.pick,
            impactAnalysis: analyzeGoalImpact(chain.pick, homeGoals, awayGoals, elapsed),
          });

          const replyResult = await replyToTweet(chain.lastTweetId, goalText);

          if (replyResult.success && replyResult.tweetId) {
            alerts++;
            setCache(`live-${goalKey}`, true, 1200); // 20 dakika cache

            await recordThreadReply(
              replyResult.tweetId,
              fixtureId,
              chain.lastTweetId,
              "live_alert",
              goalText
            );
          }
        }
      }

      // 2. Kırmızı kart olayı — fixture events'ten kontrol
      if (match.events) {
        const redCards = match.events.filter(
          (e) => e.type === "Card" && e.detail === "Red Card"
        );

        for (const rc of redCards) {
          const rcKey = `redcard-${fixtureId}-${rc.time?.elapsed ?? 0}-${rc.player?.name ?? "unknown"}`;
          if (getCached(`live-${rcKey}`)) continue;

          const alreadyReplied = await hasRecentReply(fixtureId, rcKey);
          if (alreadyReplied) continue;

          const rcTeam = rc.team?.name ?? "Bilinmeyen";
          const rcPlayer = rc.player?.name ?? "Bilinmeyen";

          const rcText = generateLiveUpdateTweet({
            homeTeam: chain.homeTeam,
            awayTeam: chain.awayTeam,
            minute: rc.time?.elapsed ?? elapsed,
            currentScore,
            eventType: "red_card",
            eventDescription: `${rcTeam} - ${rcPlayer} kırmızı kart gördü!`,
            impactAnalysis: `10 kişi kalan ${rcTeam} için zor dakikalar. Maç dengeleri değişebilir.`,
          });

          const rcResult = await replyToTweet(chain.lastTweetId, rcText);

          if (rcResult.success && rcResult.tweetId) {
            alerts++;
            setCache(`live-${rcKey}`, true, 3600);

            await recordThreadReply(
              rcResult.tweetId,
              fixtureId,
              chain.lastTweetId,
              "live_alert",
              rcText
            );
          }

          // Kart başına rate limit bekle
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // Rate limit arası bekleme
      if (alerts > 0) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    return NextResponse.json({
      success: true,
      liveCount: liveMatches.length,
      trackedCount: trackedFixtures.size,
      alertsSent: alerts,
      skippedRateLimit,
      skippedNotTracked,
      budgetRemaining: remaining - alerts,
    });
  } catch (error) {
    console.error("Live scores cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}

// ---- Helper: Gol etkisi analizi ----
function analyzeGoalImpact(
  pick: string,
  homeGoals: number,
  awayGoals: number,
  elapsed: number
): string {
  const totalGoals = homeGoals + awayGoals;
  const parts: string[] = [];

  // Tahmin hangi yönde?
  if (pick === "Over 2.5") {
    if (totalGoals >= 3) parts.push("✅ Over 2.5 tuttu!");
    else parts.push(`Over 2.5 için ${3 - totalGoals} gol daha gerekli (${elapsed}')`);
  } else if (pick === "Under 2.5") {
    if (totalGoals >= 3) parts.push("❌ Under 2.5 artık zor");
    else parts.push(`Under 2.5 hâlâ geçerli (${totalGoals} gol, ${elapsed}')`);
  } else if (pick === "1") {
    if (homeGoals > awayGoals) parts.push("✅ Ev sahibi önde — tahmin doğru yolda");
    else if (homeGoals < awayGoals) parts.push("⚠️ Deplasman öne geçti — tahmin baskı altında");
    else parts.push("⏸️ Berabere — ev sahibinden gol bekleniyor");
  } else if (pick === "2") {
    if (awayGoals > homeGoals) parts.push("✅ Deplasman önde — tahmin doğru yolda");
    else if (awayGoals < homeGoals) parts.push("⚠️ Ev sahibi öne geçti — tahmin baskı altında");
    else parts.push("⏸️ Berabere — deplasmanın vuruşu bekleniyor");
  } else if (pick === "BTTS Yes") {
    if (homeGoals > 0 && awayGoals > 0) parts.push("✅ KG Var tuttu! İki takım da golünü attı");
    else if (homeGoals > 0 || awayGoals > 0) parts.push(`KG Var için ${homeGoals === 0 ? "ev sahibinden" : "depalasmandan"} gol bekleniyor`);
  }

  if (elapsed >= 75) parts.push("⏰ Son dakikalar!");

  return parts.join(" | ") || `Skor: ${homeGoals}-${awayGoals} (${elapsed}')`;
}
