// ============================================
// Tweet Formatter
// Tahminleri tweet formatına çevirir
// ============================================

import type { MatchPrediction } from "@/types";

const CONFIDENCE_EMOJI: Record<string, string> = {
  high: "🟢",
  medium: "🟡",
  low: "🔴",
};

function confidenceEmoji(confidence: number): string {
  if (confidence >= 70) return CONFIDENCE_EMOJI.high;
  if (confidence >= 55) return CONFIDENCE_EMOJI.medium;
  return CONFIDENCE_EMOJI.low;
}

function formatPickLine(prediction: MatchPrediction): string {
  const pick = prediction.picks[0];
  if (!pick) return "";

  const emoji = confidenceEmoji(pick.confidence);
  const home = prediction.homeTeam.name;
  const away = prediction.awayTeam.name;
  const valueBadge = pick.isValueBet ? " 💎" : "";

  return `${emoji} ${home} vs ${away}\n   ➜ ${pick.type} @${pick.odds.toFixed(2)} (%${pick.confidence})${valueBadge}`;
}

export function formatDailyPicksTweet(predictions: MatchPrediction[]): string[] {
  const tweets: string[] = [];
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()}`;

  // Ana tweet
  const topPicks = predictions
    .filter((p) => p.picks.length > 0)
    .sort((a, b) => b.picks[0].confidence - a.picks[0].confidence)
    .slice(0, 10);

  if (topPicks.length === 0) return [];

  // İlk tweet: Başlık + en iyi 5
  const header = `⚽ Günün Tahminleri | ${dateStr}\n🤖 AI Destekli Analiz\n\n`;
  const firstBatch = topPicks.slice(0, 5);
  const firstLines = firstBatch.map(formatPickLine).join("\n\n");

  tweets.push(`${header}${firstLines}\n\n#bahis #tahmin #futbol`);

  // İkinci tweet: 6-10 arası
  if (topPicks.length > 5) {
    const secondBatch = topPicks.slice(5, 10);
    const secondLines = secondBatch.map(formatPickLine).join("\n\n");
    tweets.push(`📊 Günün Tahminleri (devam)\n\n${secondLines}\n\n#iddaa #maç`);
  }

  // Value bet'ler
  const valueBets = predictions
    .filter((p) => p.picks.some((pk) => pk.isValueBet))
    .slice(0, 5);

  if (valueBets.length > 0) {
    const valueLines = valueBets.map((p) => {
      const vp = p.picks.find((pk) => pk.isValueBet)!;
      return `💎 ${p.homeTeam.name} vs ${p.awayTeam.name}\n   ➜ ${vp.type} @${vp.odds.toFixed(2)} (EV: +${(vp.expectedValue * 100).toFixed(0)}%)`;
    }).join("\n\n");

    tweets.push(`💎 Value Bet'ler\nPiyasa oranlarının üzerinde değer:\n\n${valueLines}\n\n#valuebet #bahis`);
  }

  return tweets;
}

export function formatCouponTweet(
  predictions: MatchPrediction[],
  category: string,
  totalOdds: number,
  stake: number
): string {
  const categoryEmoji: Record<string, string> = {
    safe: "🛡️ Güvenli",
    balanced: "⚖️ Dengeli",
    risky: "🔥 Riskli",
    value: "💎 Value",
  };

  const label = categoryEmoji[category] || `📋 ${category}`;
  const items = predictions
    .filter((p) => p.picks.length > 0)
    .slice(0, 6)
    .map((p) => {
      const pick = p.picks[0];
      return `⚽ ${p.homeTeam.name} vs ${p.awayTeam.name} → ${pick.type} @${pick.odds.toFixed(2)}`;
    })
    .join("\n");

  return `${label} Kupon\n\n${items}\n\nToplam Oran: ${totalOdds.toFixed(2)}\nYatırım: ${stake}₺\nPotansiyel: ${(totalOdds * stake).toFixed(0)}₺\n\n#kupon #iddaa #bahis`;
}

export function formatResultTweet(
  won: number,
  lost: number,
  total: number,
  roi: number
): string {
  const rate = total > 0 ? ((won / total) * 100).toFixed(1) : "0";
  const emoji = parseFloat(rate) >= 60 ? "🎯" : parseFloat(rate) >= 40 ? "📊" : "📉";

  return `${emoji} Günün Sonuçları\n\n✅ Kazanan: ${won}\n❌ Kaybeden: ${lost}\n📊 Başarı: %${rate}\n💰 ROI: ${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%\n\n#bahis #sonuçlar`;
}
