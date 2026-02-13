// ============================================
// Tweet Formatter
// Tahminleri tweet formatına çevirir
// ============================================

import type { MatchPrediction, CrazyPickResult } from "@/types";

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

// Pick type → MatchOdds market key eşleştirmesi
const PICK_TO_MARKET: Record<string, string> = {
  "1": "home", "X": "draw", "2": "away",
  "1X": "home", "X2": "away", "12": "home",
  "Over 2.5": "over25", "Under 2.5": "under25",
  "Over 1.5": "over15", "Under 1.5": "under15",
  "Over 3.5": "over35", "Under 3.5": "under35",
  "BTTS Yes": "bttsYes", "BTTS No": "bttsNo",
  "1/1": "htft_1/1", "1/X": "htft_1/X", "1/2": "htft_1/2",
  "X/1": "htft_X/1", "X/X": "htft_X/X", "X/2": "htft_X/2",
  "2/1": "htft_2/1", "2/X": "htft_2/X", "2/2": "htft_2/2",
};

/** Bir pick'in oranı gerçek bahisçi verisinden mi geliyor? */
function isRealOdds(prediction: MatchPrediction, pickType: string): boolean {
  if (!prediction.odds?.realMarkets) return false;
  const market = PICK_TO_MARKET[pickType];
  if (!market) return false;
  return prediction.odds.realMarkets.has(market);
}

function formatPickLine(prediction: MatchPrediction): string {
  const pick = prediction.picks[0];
  if (!pick) return "";

  const emoji = confidenceEmoji(pick.confidence);
  const home = prediction.homeTeam.name;
  const away = prediction.awayTeam.name;
  const valueBadge = pick.isValueBet ? " 💎" : "";
  const evStr = pick.expectedValue > 0 ? ` EV:+${(pick.expectedValue * 100).toFixed(0)}%` : "";

  // Sadece gerçek odds varsa oran göster
  const oddsStr = isRealOdds(prediction, pick.type)
    ? ` @${pick.odds.toFixed(2)}`
    : "";

  let line = `${emoji} ${home} vs ${away}\n   ➜ ${pick.type}${oddsStr} (%${pick.confidence})${valueBadge}${evStr}`;

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

    // Oran sadece gerçekse göster
    const oddsTag = isRealOdds(p, pick.type) ? ` @${pick.odds.toFixed(2)}` : "";

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
        `⚠️ PATLAMA UYARISI\n\n${xgTeam} son maçlarda beklentinin altında kaldı ama xG beklentisi ${xgVal}!\nForvetlerin suskunluğu bu akşam bozulabilir.\n\n➜ ${pick.type}${oddsTag} (%${pick.confidence})\n\n#xG #patlama #bahis`
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
        `⏰ SON DAKİKA CANAVARI\n\n${lateTeam} gollerinin %${Math.round(latePct)}'ını son 15 dakikada atıyor!\nCanlı bahisçiler 75'ten sonrasını beklesin.\n\n➜ ${pick.type}${oddsTag} (%${pick.confidence})\n\n#canlıbahis #sondakika`
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
      const underOddsTag = isRealOdds(p, "Under 2.5") ? ` @${pick.odds.toFixed(2)}` : "";
      stories.push(
        `🧱 SAVUNMA DUVARI\n\n${home} ve ${away} savunmaları çelik gibi — H2H ort. ${avg} gol.\nBahisçiler Üst fiyatlıyor ama tarih Alt diyor.\n\n➜ Under 2.5${underOddsTag} (%${pick.confidence})\n\n#savunma #alt #bahis`
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
      const scoreList = sim.topScorelines
        .slice(0, 5)
        .map((s, i) => `${i + 1}. ${s.score} (%${s.probability})`)
        .join("\n");
      stories.push(
        `🎲 SİMÜLASYON EDGE\n\n10.000 simülasyonda:\n${scoreList}\n\n${insights.simEdgeNote}!\n\n➜ ${pick.type}${oddsTag}\n\n#montecarlo #simülasyon`
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
          `🚑 KİLİT EKSİK ŞOKU\n\n${team}'ın yıldızı ${player.name} (${player.position}) bu maçta yok!\nSebep: ${player.reason}\n\n➜ ${pick.type}${oddsTag} (%${pick.confidence})\n\n#sakatlık #kadro #bahis`
        );
        continue;
      }
    }
  }

  return stories;
}

/**
 * Simülasyon skor tahminleri tweet'i
 * En yüksek confidence maçların top 5 skor dağılımını gösterir
 */
function formatScorelineTweet(predictions: MatchPrediction[]): string | null {
  const withSim = predictions
    .filter((p) => p.analysis.simulation && p.analysis.simulation.topScorelines.length >= 3 && p.picks.length > 0 && p.picks[0].confidence >= 55)
    .sort((a, b) => b.picks[0].confidence - a.picks[0].confidence)
    .slice(0, 3);

  if (withSim.length === 0) return null;

  const lines = withSim.map((p) => {
    const sim = p.analysis.simulation!;
    const scores = sim.topScorelines
      .slice(0, 5)
      .map((s) => `   ${s.score} (%${s.probability})`)
      .join("\n");
    return `⚽ ${p.homeTeam.name} vs ${p.awayTeam.name}\n${scores}`;
  }).join("\n\n");

  return `🎲 Skor Tahmini (10K Simülasyon)\n\n${lines}\n\n#skortahmini #montecarlo #bahis`;
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
      const oddsStr = isRealOdds(p, vp.type) ? ` @${vp.odds.toFixed(2)}` : "";
      return `💎 ${p.homeTeam.name} vs ${p.awayTeam.name}\n   ➨ ${vp.type}${oddsStr} (EV: +${(vp.expectedValue * 100).toFixed(0)}% | %${vp.confidence})`;
    }).join("\n\n");

    tweets.push(`💎 Value Bet'ler\nOran analizi ile tespit edilen değerli bahisler:\n\n${valueLines}\n\n#valuebet #bahis`);
  }

  // Insights tweet — xG, sakatlık, gol zamanlaması, benzerlik
  const insightsTweet = formatInsightsSummary(predictions);
  if (insightsTweet) {
    tweets.push(insightsTweet);
  }

  // Korner/Kart tweet'leri devre dışı — sentetik veri güvenilir değil

  // Senaryo bazlı hikaye tweetleri (max 2)
  const storyTweets = generateMatchStories(predictions);
  for (const story of storyTweets) {
    tweets.push(story);
  }

  // Simülasyon skor tahmini tweet'i
  const scorelineTweet = formatScorelineTweet(predictions);
  if (scorelineTweet) {
    tweets.push(scorelineTweet);
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
      const oddsStr = isRealOdds(p, pick.type) ? ` @${pick.odds.toFixed(2)}` : "";
      return `${confEmoji} ${p.homeTeam.name} vs ${p.awayTeam.name} → ${pick.type}${oddsStr} (%${pick.confidence})`;
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

// ============================================
// Crazy Pick (Black Swan) Tweet Formatı
// ============================================

function volatilityEmoji(score: number): string {
  if (score >= 70) return "🔥🔥🔥";
  if (score >= 50) return "🔥🔥";
  return "🔥";
}

/**
 * Crazy Pick tweet'ı oluştur
 * Tek bir maç için 3-5 skor varyasyonu gösteren tweet
 */
export function formatCrazyPickTweet(results: CrazyPickResult[]): string[] {
  const tweets: string[] = [];

  // Max 2 maç için crazy pick tweet'i
  const topResults = results.slice(0, 2);

  for (const result of topResults) {
    const { match, picks, stake } = result;
    const volEmoji = volatilityEmoji(match.volatilityScore);

    const pickLines = picks.slice(0, 4).map((p) => {
      return `🎯 ${p.score} @${p.bookmakerOdds.toFixed(0)} (Sim: %${p.simProbability} vs Piyasa: %${p.impliedProbability} → Edge: +${p.edge}%)`;
    }).join("\n");

    // En yüksek potansiyel kazanç
    const maxPotential = Math.max(...picks.map((p) => p.bookmakerOdds * stake));

    // Chaos faktörleri (max 2)
    const factors = match.chaosFactors.slice(0, 2).join(" | ");

    const tweet = `🎲 BLACK SWAN — Sürpriz Skor

⚽ ${match.homeTeam} vs ${match.awayTeam}
Volatilite: ${volEmoji} (${match.volatilityScore}/100)
${factors ? `💡 ${factors}\n` : ""}\n${pickLines}

💰 Stake: ${stake}₺ per skor
🌟 Max kazanç: ${maxPotential.toFixed(0)}₺
⚠️ Düşük kasa yönetimi — yüksek risk

#blackswan #crazypick #exactscore`;

    tweets.push(tweet);
  }

  // Özet tweet (tüm crazy pick'ler)
  if (results.length > 0) {
    const totalPicks = results.reduce((sum, r) => sum + r.picks.length, 0);
    const totalStake = totalPicks * results[0].stake;
    const avgVol = Math.round(results.reduce((sum, r) => sum + r.match.volatilityScore, 0) / results.length);
    const maxOdds = Math.max(...results.flatMap((r) => r.picks.map((p) => p.bookmakerOdds)));

    const summary = `🎲 Black Swan Özet\n\n📈 ${results.length} maç, ${totalPicks} skor tahmini\n🔥 Ort. volatilite: ${avgVol}/100\n💰 Toplam yatırım: ${totalStake}₺\n🌟 En yüksek oran: @${maxOdds.toFixed(0)}\n⚠️ Bu tahminler yüksek risklidir!\n\n#blackswan #sistem`;

    tweets.push(summary);
  }

  return tweets;
}
