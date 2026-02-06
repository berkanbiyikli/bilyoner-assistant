/**
 * Surprise Tweet Formatters
 * Sürpriz radarı ve viral Twitter içerikleri için tweet şablonları
 * 
 * Seri konseptleri:
 * - Kasa Kapatan Sürprizler
 * - AI vs İnsan
 * - Gece Yarısı Operasyonu
 * - Tuzak Alarm (Red List)
 * - Sinyal Yakalandı (Odds Anomaly)
 * - Skor Avcısı
 */

import { SITE_URL, withSiteLink, shortTeamName } from './helpers';
import type { SurpriseMatch, SurpriseRadarSummary, SeriesContent } from '../../../surprise/types';

// ============ TYPES ============

export interface SurpriseAlertData {
  match: SurpriseMatch;
  seriesTag?: string;
}

export interface DailySurpriseData {
  summary: SurpriseRadarSummary;
  date: string;
}

// ============ TWEET FORMATTERS ============

/**
 * 🚨 Hata Yakalandı! — Odds anomaly tweet
 * "X maçında favori takımın oranı 1.50'den 1.90'a çıktı. 
 *  Algoritma tersini söylüyor: MS 2 (Oran: 4.50)"
 */
export function formatOddsAnomalyTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  const movements = match.oddsMovements;
  
  let anomalyLine = '';
  if (movements.length > 0) {
    const m = movements[0];
    anomalyLine = m.signal;
  }
  
  const lines = [
    `🚨 SİNYAL YAKALANDI!\n`,
    `⚽ ${home} vs ${away}`,
    `📍 ${match.leagueName}`,
    ``,
    anomalyLine ? `📡 ${anomalyLine}\n` : '',
    `🎯 AI Tahmin: ${match.surprisePick.pick}`,
    `💎 Oran: ${match.surprisePick.odds.toFixed(2)}`,
    `📊 Sürpriz Skoru: ${match.surpriseScore}/100`,
    ``,
    `${match.dataPoints.slice(0, 2).join('\n')}`,
    ``,
    `"Nedenini sadece algoritma biliyor." 🧠`,
  ];

  return withSiteLink(lines.filter(l => l !== undefined).join('\n'));
}

/**
 * ⚡ Ters Köşe — Anti-public tweet
 * "Bugün herkes Real Madrid diyor, ama veriler son 10 maçın 
 *  8'inde bu senaryonun patladığını gösteriyor."
 */
export function formatAntiPublicTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  const ap = match.antiPublicSignal;
  
  if (!ap) return formatGenericSurpriseTweet(data);
  
  const publicTeam = ap.publicSide === 'home' ? home : ap.publicSide === 'away' ? away : 'Beraberlik';
  const aiTeam = ap.modelSide === 'home' ? home : ap.modelSide === 'away' ? away : 'Beraberlik';
  
  const lines = [
    `⚡ AI vs İNSAN\n`,
    `⚽ ${home} vs ${away}`,
    ``,
    `👥 Herkes: "${publicTeam}" (%${ap.publicConfidence})`,
    `🧠 AI Model: "${aiTeam}" (%${ap.modelConfidence})`,
    ``,
    `📊 Edge: +%${ap.contraryEdge}`,
    `🎯 Tahmin: ${match.surprisePick.pick} (${match.surprisePick.odds.toFixed(2)})`,
    ``,
    `Son 10 benzer senaryonun çoğu herkesin tersine döndü.\n`,
    `Matematik asla yalan söylemez. 📐`,
  ];

  return withSiteLink(lines.join('\n'));
}

/**
 * 💰 Kasa Kapatan Sürpriz — High odds + strong data
 * Haftada 1x, oran ≥ 5.00
 */
export function formatKasaKapatanTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  
  const lines = [
    `💰 KASA KAPATAN SÜRPRİZ\n`,
    `⚽ ${home} vs ${away}`,
    `📍 ${match.leagueName}`,
    ``,
    `🎯 Tahmin: ${match.surprisePick.pick}`,
    `💎 Oran: ${match.surprisePick.odds.toFixed(2)}`,
    `📊 AI Güven: %${match.modelConfidence}`,
    `⚡ Sürpriz Skoru: ${match.surpriseScore}/100`,
    ``,
    ...match.dataPoints.slice(0, 3).map(dp => `📌 ${dp}`),
    ``,
    `⚠️ Yüksek risk, düşük stake. Kasanın %2'si.\n`,
    `Bu maçı kaçırma. 🎰`,
  ];

  return withSiteLink(lines.join('\n'));
}

/**
 * 🎯 Skor Avcısı — Exact score prediction
 */
export function formatScoreHunterTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  const scores = match.scorePredictions;
  
  const topScores = scores.poissonScores.length > 0 
    ? scores.poissonScores 
    : scores.monteCarloScores;
  
  const lines = [
    `🎯 SKOR AVCISI\n`,
    `⚽ ${home} vs ${away}`,
    ``,
    `📊 Poisson Modeli En Olası 3 Skor:`,
    ...topScores.slice(0, 3).map((s, i) => 
      `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${s.score} — ${s.percentDisplay} (${s.odds.toFixed(1)}x)`
    ),
    ``,
  ];
  
  if (scores.surpriseScore) {
    lines.push(
      `⚡ Sürpriz Skor: ${scores.surpriseScore.score} (${scores.surpriseScore.odds.toFixed(1)}x)`,
      '',
    );
  }
  
  lines.push(
    `💡 Consensus: ${scores.consensusScore.score}`,
    '',
    `"Matematik asla yalan söylemez." 📐`,
  );

  return withSiteLink(lines.join('\n'));
}

/**
 * 🪤 Tuzak Alarm — Red List
 * "Herkes bu maça 2.5 Üst diyor ama sistem TUZAK diyor"
 */
export function formatTrapAlertTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  
  const lines = [
    `🪤 TUZAK ALARM ⛔\n`,
    `⚽ ${home} vs ${away}`,
    `📍 ${match.leagueName}`,
    ``,
    `❌ SİSTEM "TUZAK" DİYOR!\n`,
    `⚠️ Kaos Endeksi: %${(match.chaosIndex * 100).toFixed(0)}`,
    `⚠️ Model-API Sapma: %${match.apiDeviation.toFixed(0)}`,
  ];
  
  if (match.antiPublicSignal) {
    lines.push(
      `⚠️ ${match.antiPublicSignal.reason}`,
    );
  }
  
  lines.push(
    '',
    `Bu maçtan uzak dur. Kasa koruma modu. 🛡️\n`,
    `"Kazanmak bazen oynamamaktır."`,
  );

  return withSiteLink(lines.join('\n'));
}

/**
 * 🌙 Gece Yarısı Operasyonu — Late night exotic league match
 */
export function formatNightOpsTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  const time = new Date(match.kickoff).toLocaleTimeString('tr-TR', { 
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' 
  });
  
  const lines = [
    `🌙 GECE YARISI OPERASYONU\n`,
    `⚽ ${home} vs ${away}`,
    `📍 ${match.leagueName}`,
    `⏰ Saat: ${time}`,
    ``,
    `Kimse bakmıyor ama algoritma sinyal yakaladı 👀\n`,
    `🎯 ${match.surprisePick.pick} (${match.surprisePick.odds.toFixed(2)})`,
    `📊 Sürpriz Skoru: ${match.surpriseScore}/100`,
    ``,
    ...match.dataPoints.slice(0, 2).map(dp => `📌 ${dp}`),
    ``,
    `Gece sessiz, sürpriz gürültülü. 🎰`,
  ];

  return withSiteLink(lines.join('\n'));
}

/**
 * Generic surprise tweet (herhangi bir kategori)
 */
export function formatGenericSurpriseTweet(data: SurpriseAlertData): string {
  const { match } = data;
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  
  const categoryEmojis = match.categories.map(c => {
    const map: Record<string, string> = {
      odds_anomaly: '📡', anti_public: '⚡', chaos_match: '🌪️',
      value_bomb: '💣', score_hunter: '🎯', trap_match: '🪤',
    };
    return map[c] || '📊';
  }).join('');
  
  const lines = [
    `${categoryEmojis} SÜRPRİZ RADAR\n`,
    `⚽ ${home} vs ${away}`,
    `📍 ${match.leagueName}`,
    ``,
    `🎯 ${match.surprisePick.pick} (${match.surprisePick.odds.toFixed(2)})`,
    `📊 Sürpriz: ${match.surpriseScore}/100`,
    `⚡ Kaos: %${(match.chaosIndex * 100).toFixed(0)}`,
    ``,
    ...match.dataPoints.slice(0, 3).map(dp => `📌 ${dp}`),
  ];

  return withSiteLink(lines.join('\n'));
}

/**
 * Günlük Sürpriz Radar Özeti — Sabah thread'i
 */
export function formatDailySurpriseRadarThread(data: DailySurpriseData): string[] {
  const { summary } = data;
  const tweets: string[] = [];
  
  // Tweet 1: Genel özet
  tweets.push(withSiteLink([
    `📡 SÜRPRİZ RADAR — ${data.date}\n`,
    `${summary.totalMatches} maç tarandı, ${summary.surpriseMatches.length} sinyal tespit edildi.\n`,
    `🏆 Altın Liste: ${summary.goldList.length} maç`,
    `🔍 Gümüş Liste: ${summary.silverList.length} maç`,
    `⛔ Kırmızı Liste: ${summary.redList.length} maç`,
    ``,
    `📊 Ortalama Sürpriz Skoru: ${summary.stats.avgSurpriseScore}/100`,
    `⚡ Anomali: ${summary.stats.anomalyCount} | Ters Köşe: ${summary.stats.antiPublicCount}`,
  ].join('\n')));
  
  // Tweet 2: Top surprise (Altın #1)
  if (summary.topSurprise) {
    const top = summary.topSurprise;
    tweets.push([
      `🏆 GÜNÜN 1 NUMARASI\n`,
      `⚽ ${shortTeamName(top.homeTeam)} vs ${shortTeamName(top.awayTeam)}`,
      `📍 ${top.leagueName}`,
      ``,
      `🎯 ${top.surprisePick.pick} (${top.surprisePick.odds.toFixed(2)})`,
      `📊 Sürpriz: ${top.surpriseScore}/100`,
      ``,
      `${top.detailReason}`,
    ].join('\n'));
  }
  
  // Tweet 3: Red list (tuzaklar)
  if (summary.redList.length > 0) {
    const redLines = summary.redList.slice(0, 3).map(r => 
      `❌ ${shortTeamName(r.homeTeam)} vs ${shortTeamName(r.awayTeam)} — Kaos %${(r.chaosIndex * 100).toFixed(0)}`
    );
    
    tweets.push([
      `🪤 TUZAK LİSTESİ — Uzak Durun!\n`,
      ...redLines,
      ``,
      `Bugün bu maçlarda oynamayın.\n"Kazanmak bazen oynamamaktır." 🛡️`,
    ].join('\n'));
  }
  
  return tweets;
}

/**
 * Maç sonu sürpriz doğrulama tweet'i
 * Tahmin tuttuysa: "Yine Bildik!" fotoğrafla birlikte
 */
export function formatSurpriseVerifiedTweet(
  match: SurpriseMatch,
  actualScore: string,
  wasCorrect: boolean,
): string {
  const home = shortTeamName(match.homeTeam);
  const away = shortTeamName(match.awayTeam);
  
  if (wasCorrect) {
    return withSiteLink([
      `✅ DOĞRULANDI!\n`,
      `⚽ ${home} ${actualScore} ${away}`,
      ``,
      `🎯 Tahmin: ${match.surprisePick.pick} ✓`,
      `💎 Oran: ${match.surprisePick.odds.toFixed(2)} ✓`,
      `📊 Sürpriz Skoru: ${match.surpriseScore}/100`,
      ``,
      `Maç öncesi demiştik:`,
      `"${match.tweetHook}"`,
      ``,
      `Matematik asla yalan söylemez. 📐🧠`,
    ].join('\n'));
  }
  
  return [
    `📊 Sonuç Analizi\n`,
    `⚽ ${home} ${actualScore} ${away}`,
    ``,
    `🎯 Tahmin: ${match.surprisePick.pick} ✗`,
    `📌 Sürpriz sinyal doğru yöndeydi ama skor farklı geldi.`,
    ``,
    `Veriler doğru, futbol sürprizlerle dolu.\nDevam. 💪`,
  ].join('\n');
}

/**
 * Sürpriz match'e göre en uygun tweet formatter'ı seç
 */
export function formatSurpriseTweet(match: SurpriseMatch): string {
  const data: SurpriseAlertData = { match };
  
  // Öncelik sırası
  if (match.categories.includes('trap_match')) {
    return formatTrapAlertTweet(data);
  }
  if (match.categories.includes('odds_anomaly') && match.oddsMovements.length > 0) {
    return formatOddsAnomalyTweet(data);
  }
  if (match.categories.includes('anti_public') && match.antiPublicSignal?.isContrarian) {
    return formatAntiPublicTweet(data);
  }
  if (match.surprisePick.odds >= 5.0 && match.modelConfidence >= 55) {
    return formatKasaKapatanTweet(data);
  }
  if (match.categories.includes('score_hunter')) {
    return formatScoreHunterTweet(data);
  }
  
  // Gece maçı?
  const hour = new Date(match.kickoff).getHours();
  if (hour >= 22 || hour <= 3) {
    return formatNightOpsTweet(data);
  }
  
  return formatGenericSurpriseTweet(data);
}
