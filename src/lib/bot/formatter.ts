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
  const evStr = pick.expectedValue > 0 ? ` EV:+${(pick.expectedValue * 100).toFixed(0)}%` : "";

  let line = `${emoji} ${home} vs ${away}\n   ➜ ${pick.type} @${pick.odds.toFixed(2)} (%${pick.confidence})${valueBadge}${evStr}`;

  // xG bilgisi varsa ekle
  if (prediction.insights && (prediction.insights.xgHome > 0 || prediction.insights.xgAway > 0)) {
    line += `\n   📈 xG: ${prediction.insights.xgHome.toFixed(1)} - ${prediction.insights.xgAway.toFixed(1)}`;
  }

  return line;
}

function formatInsightsSummary(predictions: MatchPrediction[]): string | null {
  const insightLines: string[] = [];

  for (const p of predictions) {
    if (!p.insights || p.insights.notes.length === 0) continue;

    // En önemli not
    const topNote = p.insights.notes[0];
    insightLines.push(`• ${p.homeTeam.name} vs ${p.awayTeam.name}: ${topNote}`);

    if (insightLines.length >= 5) break;
  }

  if (insightLines.length === 0) return null;

  return `🔬 Derinlemesine Analiz\n\n${insightLines.join("\n")}\n\n#analiz #xG #istatistik`;
}

// ============================================
// Senaryo Bazlı Tweet Üretimi
// ============================================

function generateMatchStories(predictions: MatchPrediction[]): string[] {
  const stories: string[] = [];

  for (const p of predictions) {
    if (stories.length >= 2) break; // Max 2 senaryo tweet'i
    if (!p.analysis || !p.picks.length || p.picks[0].confidence < 55) continue;

    const home = p.homeTeam.name;
    const away = p.awayTeam.name;
    const pick = p.picks[0];
    const analysis = p.analysis;
    const insights = p.insights;
    const sim = analysis.simulation;

    // --- Senaryo 1: Patlama Uyarısı (xG Verimsizlik) ---
    if (
      insights &&
      analysis.xgDelta &&
      analysis.xgDelta > 0.4 &&
      !stories.some((s) => s.includes("PATLAMA"))
    ) {
      const xgTeam = (analysis.homeXg ?? 0) > (analysis.awayXg ?? 0) ? home : away;
      const xgVal = Math.max(analysis.homeXg ?? 0, analysis.awayXg ?? 0).toFixed(1);
      stories.push(
        `⚠️ PATLAMA UYARISI\n\n${xgTeam} son maçlarda beklentinin altında kaldı ama xG beklentisi ${xgVal}!\nForvetlerin suskunluğu bu akşam bozulabilir.\n\n➜ ${pick.type} @${pick.odds.toFixed(2)} (%${pick.confidence})\n\n#xG #patlama #bahis`
      );
      continue;
    }

    // --- Senaryo 2: Son Dakika Canavarı ---
    if (
      analysis.goalTiming &&
      (analysis.goalTiming.home.last15 > 30 || analysis.goalTiming.away.last15 > 30) &&
      !stories.some((s) => s.includes("SON DAKİKA"))
    ) {
      const lateTeam = analysis.goalTiming.home.last15 > analysis.goalTiming.away.last15 ? home : away;
      const latePct = Math.max(analysis.goalTiming.home.last15, analysis.goalTiming.away.last15);
      stories.push(
        `⏰ SON DAKİKA CANAVARI\n\n${lateTeam} gollerinin %${Math.round(latePct)}'ını son 15 dakikada atıyor!\nCanlı bahisçiler 75'ten sonrasını beklesin.\n\n➜ ${pick.type} @${pick.odds.toFixed(2)} (%${pick.confidence})\n\n#canlıbahis #sondakika`
      );
      continue;
    }

    // --- Senaryo 3: Savunma Duvarı ---
    if (
      analysis.homeDefense > 70 &&
      analysis.awayDefense > 70 &&
      (analysis.h2hGoalAvg ?? 3) < 2.0 &&
      !stories.some((s) => s.includes("SAVUNMA"))
    ) {
      const avg = (analysis.h2hGoalAvg ?? 1.8).toFixed(1);
      stories.push(
        `🧱 SAVUNMA DUVARI\n\n${home} ve ${away} savunmaları çelik gibi — H2H ort. ${avg} gol.\nBahisçiler Üst fiyatlıyor ama tarih Alt diyor.\n\n➜ Under 2.5 @${pick.odds.toFixed(2)} (%${pick.confidence})\n\n#savunma #alt #bahis`
      );
      continue;
    }

    // --- Senaryo 4: Monte Carlo Edge ---
    if (
      sim &&
      sim.topScorelines.length > 0 &&
      insights?.simEdgeNote &&
      !stories.some((s) => s.includes("SİMÜLASYON"))
    ) {
      const topScore = sim.topScorelines[0];
      stories.push(
        `🎲 SİMÜLASYON EDGE\n\n10.000 simülasyonda bu maçın %${sim.simOver25Prob.toFixed(1)} ihtimalle 2.5 Üst olduğu hesaplandı.\n${insights.simEdgeNote}!\nEn olası skor: ${topScore.score} (%${topScore.probability})\n\n➜ ${pick.type} @${pick.odds.toFixed(2)}\n\n#montecarlo #simülasyon`
      );
      continue;
    }

    // --- Senaryo 5: Kilit Eksik Şoku ---
    if (analysis.keyMissingPlayers) {
      const criticals = analysis.keyMissingPlayers.filter((mp) => mp.impactLevel === "critical");
      if (
        criticals.length > 0 &&
        !stories.some((s) => s.includes("KİLİT EKSİK"))
      ) {
        const player = criticals[0];
        const team = player.team === "home" ? home : away;
        stories.push(
          `🚑 KİLİT EKSİK ŞOKU\n\n${team}'ın yıldızı ${player.name} (${player.position}) bu maçta yok!\nSebep: ${player.reason}\n\n➜ ${pick.type} @${pick.odds.toFixed(2)} (%${pick.confidence})\n\n#sakatlık #kadro #bahis`
        );
        continue;
      }
    }
  }

  return stories;
}

export function formatDailyPicksTweet(predictions: MatchPrediction[]): string[] {
  const tweets: string[] = [];
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()}`;

  // Sadece kaliteli tahminleri al (confidence >= 50)
  const topPicks = predictions
    .filter((p) => p.picks.length > 0 && p.picks[0].confidence >= 50)
    .sort((a, b) => {
      // Önce EV pozitif olanlar, sonra confidence'a göre
      const aEv = a.picks[0].expectedValue > 0 ? 1 : 0;
      const bEv = b.picks[0].expectedValue > 0 ? 1 : 0;
      if (bEv !== aEv) return bEv - aEv;
      return b.picks[0].confidence - a.picks[0].confidence;
    })
    .slice(0, 10);

  if (topPicks.length === 0) return [];

  // İlk tweet: Başlık + en iyi 5
  const header = `⚽ Günün Tahminleri | ${dateStr}\n🤖 AI + İstatistik Analizi\n\n`;
  const firstBatch = topPicks.slice(0, 5);
  const firstLines = firstBatch.map(formatPickLine).join("\n\n");

  tweets.push(`${header}${firstLines}\n\n#bahis #tahmin #futbol`);

  // İkinci tweet: 6-10 arası (varsa)
  if (topPicks.length > 5) {
    const secondBatch = topPicks.slice(5, 10);
    const secondLines = secondBatch.map(formatPickLine).join("\n\n");
    tweets.push(`📊 Günün Tahminleri (devam)\n\n${secondLines}\n\n#iddaa #maç`);
  }

  // Value bet'ler — sadece gerçekten edge'i olanlar
  const valueBets = predictions
    .filter((p) => p.picks.some((pk) => pk.isValueBet && pk.expectedValue > 0.05 && pk.confidence >= 55))
    .slice(0, 5);

  if (valueBets.length > 0) {
    const valueLines = valueBets.map((p) => {
      const vp = p.picks.find((pk) => pk.isValueBet)!;
      return `💎 ${p.homeTeam.name} vs ${p.awayTeam.name}\n   ➜ ${vp.type} @${vp.odds.toFixed(2)} (EV: +${(vp.expectedValue * 100).toFixed(0)}% | %${vp.confidence})`;
    }).join("\n\n");

    tweets.push(`💎 Value Bet'ler\nOran analizi ile tespit edilen değerli bahisler:\n\n${valueLines}\n\n#valuebet #bahis`);
  }

  // Insights tweet — xG, sakatlık, gol zamanlaması, benzerlik
  const insightsTweet = formatInsightsSummary(predictions);
  if (insightsTweet) {
    tweets.push(insightsTweet);
  }

  // Korner/Kart pick'leri varsa ayrı bir tweet
  const specialPicks = predictions.filter((p) =>
    p.picks.some((pk) => ["Over 8.5 Corners", "Under 8.5 Corners", "Over 3.5 Cards", "Under 3.5 Cards"].includes(pk.type) && pk.confidence >= 55)
  ).slice(0, 5);

  if (specialPicks.length > 0) {
    const specialLines = specialPicks.map((p) => {
      const sp = p.picks.find((pk) => ["Over 8.5 Corners", "Under 8.5 Corners", "Over 3.5 Cards", "Under 3.5 Cards"].includes(pk.type))!;
      const icon = sp.type.includes("Corner") ? "🚩" : "🟨";
      return `${icon} ${p.homeTeam.name} vs ${p.awayTeam.name}\n   ➜ ${sp.type} @${sp.odds.toFixed(2)} (%${sp.confidence})`;
    }).join("\n\n");

    tweets.push(`🚩🟨 Korner & Kart Tahminleri\n\n${specialLines}\n\n#korner #kart #bahis`);
  }

  // Senaryo bazlı hikaye tweetleri (max 2)
  const storyTweets = generateMatchStories(predictions);
  for (const story of storyTweets) {
    tweets.push(story);
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

  // Her maç için EN İYİ pick'i seç (en yüksek confidence)
  const items = predictions
    .filter((p) => p.picks.length > 0)
    .slice(0, 6)
    .map((p) => {
      const pick = p.picks[0]; // Zaten confidence'a göre sıralı
      const confEmoji = confidenceEmoji(pick.confidence);
      return `${confEmoji} ${p.homeTeam.name} vs ${p.awayTeam.name} → ${pick.type} @${pick.odds.toFixed(2)} (%${pick.confidence})`;
    })
    .join("\n");

  const avgConf = predictions
    .filter((p) => p.picks.length > 0)
    .slice(0, 6)
    .reduce((sum, p) => sum + p.picks[0].confidence, 0) / Math.min(6, predictions.filter((p) => p.picks.length > 0).length);

  return `${label} Kupon 📋\n\n${items}\n\nToplam Oran: ${totalOdds.toFixed(2)}\nOrt. Güven: %${avgConf.toFixed(0)}\nYatırım: ${stake}₺ → Potansiyel: ${(totalOdds * stake).toFixed(0)}₺\n\n#kupon #iddaa #bahis`;
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
