// ============================================
// Twitter Manager
// Tweet gönderme, reply yapma, maç sonucu takibi
// Outcome Listener — kendi tweetlerine sonuç yanıtı
// ============================================

import { sendTweet, sendThread } from "./twitter";
import type { TweetResult } from "./twitter";
import { createAdminSupabase } from "@/lib/supabase/admin";

// ---- Reply to own tweet ----
export async function replyToTweet(
  replyToTweetId: string,
  text: string
): Promise<TweetResult> {
  if (process.env.TWITTER_MOCK === "true") {
    console.log(`[TWITTER MOCK] Reply to ${replyToTweetId}:`, text);
    return { success: true, tweetId: `mock-reply-${Date.now()}`, mock: true };
  }

  const config = {
    apiKey: process.env.TWITTER_API_KEY || "",
    apiSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
  };

  if (!config.apiKey || !config.accessToken) {
    return { success: false, error: "Twitter API credentials not configured" };
  }

  try {
    // OAuth signature için twitter.ts'deki fonksiyonları kullan
    // Direkt fetch ile reply gönder
    const { buildAuthHeader } = await import("./twitter-auth");

    const url = "https://api.twitter.com/2/tweets";
    const authHeader = buildAuthHeader("POST", url, config);

    const body = {
      text,
      reply: { in_reply_to_tweet_id: replyToTweetId },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("[TWITTER] Reply error:", res.status, errorData);
      return { success: false, error: `Twitter API ${res.status}: ${errorData}` };
    }

    const data = await res.json();
    return { success: true, tweetId: data.data?.id };
  } catch (error) {
    console.error("[TWITTER] Reply error:", error);
    return { success: false, error: String(error) };
  }
}

// ---- Outcome Formatter ----

interface OutcomeData {
  homeTeam: string;
  awayTeam: string;
  pick: string;
  odds: number;
  confidence: number;
  result: "won" | "lost";
  actualScore: string;
  simTopScoreline?: string;
  xgHome?: number;
  xgAway?: number;
  analysisSummary?: string;
}

/**
 * Maç sonucuna göre reply tweet metni üret
 */
export function formatOutcomeReply(outcome: OutcomeData): string {
  if (outcome.result === "won") {
    const scoreMatch = outcome.simTopScoreline &&
      outcome.actualScore === outcome.simTopScoreline.split(",")[0]?.trim();

    let reply = `✅ BAŞARILI! Tahmin tuttu!\n\n`;
    reply += `⚽ ${outcome.homeTeam} ${outcome.actualScore} ${outcome.awayTeam}\n`;
    reply += `🎯 Tahmin: ${outcome.pick} @${outcome.odds.toFixed(2)} (%${outcome.confidence})\n`;

    if (scoreMatch) {
      reply += `🎲 Skor tahmini de tuttu! Simülasyon başarısı.\n`;
    }

    reply += `\n💰 Kazanan bahis! #başarılı #tahmin`;
    return reply;
  } else {
    let reply = `❌ Bu sefer olmadı.\n\n`;
    reply += `⚽ ${outcome.homeTeam} ${outcome.actualScore} ${outcome.awayTeam}\n`;
    reply += `📊 Tahmin: ${outcome.pick} @${outcome.odds.toFixed(2)} (%${outcome.confidence})\n`;

    // xG analizi varsa ekle
    if (outcome.xgHome && outcome.xgAway) {
      const totalXg = outcome.xgHome + outcome.xgAway;
      const actualGoals = outcome.actualScore.split("-").reduce((a, b) => a + parseInt(b), 0);
      if (Math.abs(totalXg - actualGoals) > 1.5) {
        reply += `📈 xG beklentisi ${totalXg.toFixed(1)} olmasına rağmen ${actualGoals} gol atıldı.\n`;
      }
    }

    reply += `\n🔧 Analiz motoru güncellendi. #analiz`;
    return reply;
  }
}

// ---- Outcome Listener ----

/**
 * Biten maçların tweetlerine sonuç yanıtı gönder
 * settle-bets cron'undan sonra çağrılır
 */
export async function processOutcomes(): Promise<{
  repliesSent: number;
  errors: number;
}> {
  const supabase = createAdminSupabase();
  let repliesSent = 0;
  let errors = 0;

  // 1. Son 24 saatte settle edilmiş tahminleri bul
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: settledPredictions } = await supabase
    .from("predictions")
    .select("*")
    .in("result", ["won", "lost"])
    .gte("kickoff", oneDayAgo);

  if (!settledPredictions || settledPredictions.length === 0) {
    return { repliesSent: 0, errors: 0 };
  }

  // 2. Bu maçlarla eşleşen tweetleri bul (daily_picks tweetleri)
  const { data: tweets } = await supabase
    .from("tweets")
    .select("*")
    .eq("type", "daily_picks")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false });

  if (!tweets || tweets.length === 0) {
    return { repliesSent: 0, errors: 0 };
  }

  // 3. Her settled tahmin için, ilgili tweete reply gönder (ilk thread tweet'ine)
  // Ama aynı maça iki kez reply atma
  const repliedFixtures = new Set<number>();

  // Reply edilmiş fixture'ları kontrol et (tekrar atma)
  const { data: existingReplies } = await supabase
    .from("tweets")
    .select("content")
    .eq("type", "outcome_reply")
    .gte("created_at", oneDayAgo);

  const repliedContent = new Set(existingReplies?.map((r) => r.content) || []);

  for (const pred of settledPredictions) {
    if (repliedFixtures.has(pred.fixture_id)) continue;

    // Bu maçı içeren tweet var mı?
    const matchTweet = tweets.find((t) =>
      t.content.includes(pred.home_team) || t.content.includes(pred.away_team)
    );

    if (!matchTweet) continue;

    const outcome: OutcomeData = {
      homeTeam: pred.home_team,
      awayTeam: pred.away_team,
      pick: pred.pick,
      odds: pred.odds,
      confidence: pred.confidence,
      result: pred.result as "won" | "lost",
      actualScore: "", // settle-bets'ten gelecek
    };

    // Validation records'dan actual score'u al
    const { data: valRecord } = await supabase
      .from("validation_records")
      .select("actual_score, sim_top_scoreline")
      .eq("fixture_id", pred.fixture_id)
      .single();

    if (valRecord?.actual_score) {
      outcome.actualScore = valRecord.actual_score;
      outcome.simTopScoreline = valRecord.sim_top_scoreline ?? undefined;
    } else {
      // Score bilinmiyorsa skip
      continue;
    }

    const replyText = formatOutcomeReply(outcome);

    // Tekrar kontrol
    if (repliedContent.has(replyText)) continue;

    const result = await replyToTweet(matchTweet.tweet_id, replyText);

    if (result.success) {
      repliesSent++;
      repliedFixtures.add(pred.fixture_id);

      // Reply'ı kaydet
      if (result.tweetId) {
        await supabase.from("tweets").insert({
          tweet_id: result.tweetId,
          type: "outcome_reply",
          content: replyText,
        });
      }
    } else {
      errors++;
      console.error(`[OUTCOME] Reply failed for ${pred.home_team} vs ${pred.away_team}:`, result.error);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { repliesSent, errors };
}

// ---- Analitik Tweet Üreticisi ----

export interface AnalyticTweetData {
  homeTeam: string;
  awayTeam: string;
  league: string;
  pick: string;
  odds: number;
  confidence: number;
  simEdge?: number; // Monte Carlo vs piyasa farkı %
  xgHome?: number;
  xgAway?: number;
  simTopScoreline?: string;
  simProbability?: number;
  keyInsight?: string;
}

/**
 * Analitik derinlikli tweet formatı
 * Persona: Veri bilimci, şeffaf, istatistik odaklı
 */
export function formatAnalyticTweet(data: AnalyticTweetData): string {
  const lines: string[] = [];

  lines.push(`📊 VERİ ANALİZİ | ${data.league}`);
  lines.push(``);
  lines.push(`⚽ ${data.homeTeam} vs ${data.awayTeam}`);

  // xG insight
  if (data.xgHome && data.xgAway) {
    lines.push(`📈 xG: ${data.xgHome.toFixed(1)} - ${data.xgAway.toFixed(1)}`);
  }

  // Monte Carlo edge
  if (data.simEdge && data.simEdge > 10) {
    lines.push(`🎲 Monte Carlo simülasyonumuz bu olasılığı piyasanın %${data.simEdge.toFixed(0)} üzerinde buldu`);
  }

  // Skor tahmini
  if (data.simTopScoreline && data.simProbability) {
    lines.push(`🎯 En olası skor: ${data.simTopScoreline} (%${data.simProbability})`);
  }

  // Key insight
  if (data.keyInsight) {
    lines.push(`\n💡 ${data.keyInsight}`);
  }

  lines.push(``);
  lines.push(`➜ ${data.pick} @${data.odds.toFixed(2)} (Güven: %${data.confidence})`);
  lines.push(``);
  lines.push(`#verianalizi #montecarlo #bahis`);

  return lines.join("\n");
}

/**
 * Value Bet Alert tweet'i — %15+ edge yakalandığında
 */
export function formatValueBetAlert(data: AnalyticTweetData): string {
  const edge = data.simEdge ?? 15;

  return `🚨 VALUE BET ALARMI

⚽ ${data.homeTeam} vs ${data.awayTeam}
📊 ${data.league}

Simülasyon vs Piyasa farkı: %${edge.toFixed(0)} EDGE!
${data.xgHome && data.xgAway ? `📈 xG: ${data.xgHome.toFixed(1)} - ${data.xgAway.toFixed(1)}` : ""}
${data.simTopScoreline ? `🎯 Skor: ${data.simTopScoreline} (%${data.simProbability ?? 0})` : ""}

➜ ${data.pick} @${data.odds.toFixed(2)} (%${data.confidence})

⚠️ Kaçırılmaması gereken fırsat!
#valuebet #edge #bahis`;
}

/**
 * Haftalık performans raporu tweet'i (gelişmiş versiyon)
 */
export function formatWeeklyReport(stats: {
  totalPredictions: number;
  won: number;
  lost: number;
  winRate: number;
  roi: number;
  bestMarket?: { market: string; winRate: number; roi: number };
  valueBetWinRate?: number;
  valueBetRoi?: number;
  scorelineHitRate?: number;
  dashboardUrl?: string;
}): string {
  const emoji = stats.roi >= 0 ? "🚀" : "📊";

  let tweet = `${emoji} HAFTALIK PERFORMANS RAPORU

📋 ${stats.totalPredictions} tahmin:
✅ ${stats.won} başarılı | ❌ ${stats.lost} başarısız
🎯 Başarı: %${stats.winRate.toFixed(1)}
💰 ROI: ${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`;

  if (stats.bestMarket) {
    tweet += `\n\n🏆 En iyi pazar: ${stats.bestMarket.market}
   %${stats.bestMarket.winRate.toFixed(0)} başarı, ROI: +${stats.bestMarket.roi.toFixed(0)}%`;
  }

  if (stats.valueBetWinRate && stats.valueBetRoi) {
    tweet += `\n\n💎 Value Bet: %${stats.valueBetWinRate.toFixed(0)} başarı, ROI: ${stats.valueBetRoi >= 0 ? "+" : ""}${stats.valueBetRoi.toFixed(0)}%`;
  }

  if (stats.scorelineHitRate && stats.scorelineHitRate > 0) {
    tweet += `\n🎲 Skor tutma: %${stats.scorelineHitRate.toFixed(1)}`;
  }

  if (stats.dashboardUrl) {
    tweet += `\n\n📊 Şeffaf sonuçlar: ${stats.dashboardUrl}`;
  }

  tweet += `\n\n#performans #şeffaflık #bahis`;
  return tweet;
}
