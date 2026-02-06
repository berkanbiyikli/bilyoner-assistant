/**
 * Bulletin Formatters - Zamanlı İçerik Tweet Formatları
 *
 * Sabah bülteni, gece raporu, ana kupon thread, günlük önizleme,
 * gece seansı, haftalık performans raporu.
 */

import type { BotCoupon, BankrollState } from '../../types';
import { formatDateTR, shortTeamName, formatPredictionShort, withSiteLink } from './helpers';
import { safeTweet } from '../validator';

// ============ 10:00 TSİ — SABAH BÜLTENİ ============

export interface MorningBulletinData {
  date: string;
  totalMatches: number;
  topLeagueMatches: number;
  weakDefenseTeams: {
    team: string;
    concededLast5: number;
    league: string;
  }[];
  weatherImpactMatches: {
    match: string;
    impact: string;
  }[];
  keyAbsences: {
    match: string;
    player: string;
    importance: string;
  }[];
  expectedHighScoring: {
    match: string;
    avgGoals: number;
    reason: string;
  }[];
}

export function formatMorningBulletinThread(
  data: MorningBulletinData
): string[] {
  const tweets: string[] = [];

  // 1. Ana bülten tweet'i
  let mainTweet = `☀️ GÜNLÜK MODEL ANALİZİ - ${data.date}

📊 Bugün ${data.totalMatches} maç var (${data.topLeagueMatches} top lig)

⬇️ İşlenen veri setinden öne çıkanlar:

`;

  if (data.weakDefenseTeams.length > 0) {
    mainTweet += '🔓 Zayıf defanslar tespit edildi\n';
  }
  if (data.expectedHighScoring.length > 0) {
    mainTweet += '⚡ Yüksek gol beklentili maçlar var\n';
  }
  if (data.keyAbsences.length > 0) {
    mainTweet += '🏥 Kritik eksikler mevcut\n';
  }

  mainTweet +=
    '\nDetaylı rapor aşağıda 👇\n\n#SabahAnalizi #VeriRaporu';
  tweets.push(withSiteLink(mainTweet));

  // 2. Zayıf defanslar
  if (data.weakDefenseTeams.length > 0) {
    let defTweet = `🔓 ZAYIF DEFANS ANALİZİ

Son 5 maçta en çok gol yiyen takımlar:

`;
    for (const team of data.weakDefenseTeams.slice(0, 5)) {
      defTweet += `📉 ${team.team} (${team.league})\n`;
      defTweet += `   Son 5 maçta ${team.concededLast5} gol yedi\n\n`;
    }
    defTweet += `🎯 Bu takımların maçlarında "Gol Olur" potansiyeli yüksek.`;
    tweets.push(defTweet);
  }

  // 3. Yüksek gol beklentili maçlar
  if (data.expectedHighScoring.length > 0) {
    let goalTweet = `⚡ YÜKSEK GOL BEKLENTİLERİ

`;
    for (const match of data.expectedHighScoring.slice(0, 4)) {
      goalTweet += `🔥 ${match.match}\n`;
      goalTweet += `   Ort: ${match.avgGoals.toFixed(1)} gol/maç\n`;
      goalTweet += `   ${match.reason}\n\n`;
    }
    goalTweet += `📊 Veri seti değerlendirmenize sunulmuştur.`;
    tweets.push(goalTweet);
  }

  // 4. Eksikler
  if (data.keyAbsences.length > 0) {
    let absenceTweet = `🏥 KRİTİK EKSIKLER\n\n`;
    for (const absence of data.keyAbsences.slice(0, 3)) {
      absenceTweet += `❌ ${absence.match}\n`;
      absenceTweet += `   ${absence.player} - ${absence.importance}\n\n`;
    }
    absenceTweet += `⚠️ Bu eksikler oran değerlendirmelerini etkiliyor.`;
    tweets.push(absenceTweet);
  }

  return tweets;
}

// ============ 13:00 TSİ — GÜNÜN KUPONU LANSMANI ============

export interface DailyCouponLaunchData {
  date: string;
  filteredCount: number;
  matches: {
    homeTeam: string;
    awayTeam: string;
    prediction: string;
    odds: number;
  }[];
  totalOdds: number;
  units: number;
  bankrollPercent: number;
  analysisNote: string;
}

export function formatDailyCouponLaunch(
  data: DailyCouponLaunchData
): string {
  let matchLines = '';
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  data.matches.forEach((match, i) => {
    matchLines += `${emojis[i] || `${i + 1}.`} ${match.homeTeam} - ${match.awayTeam}: ${match.prediction} (Odds: ${match.odds.toFixed(2)})\n`;
  });

  return safeTweet(withSiteLink(`🚀 [GÜNLÜK VERİ SETİ: #${data.date}]

Toplam bültenden filtrelenen ${data.filteredCount} yüksek olasılıklı çıktı:

${matchLines.trim()}

📊 Toplam Oran: ${data.totalOdds.toFixed(2)}
🛡 Kasa Yönetimi: ${data.units.toFixed(1)} Birim (Kasa %${data.bankrollPercent})
🔑 Analiz Notu: ${data.analysisNote}

#GününKuponu #KuponMühendisi`));
}

// ============ 05:00 TSİ — GECE RAPORU ============

export interface NightReportData {
  date: string;
  totalCoupons: number;
  wonCoupons: number;
  lostCoupons: number;
  totalStaked: number;
  totalReturned: number;
  profit: number;
  roi: number;
  weeklyProfit: number;
  weeklyROI: number;
  bestPrediction?: {
    match: string;
    odds: number;
    reasoning: string;
  };
  worstPrediction?: {
    match: string;
    odds: number;
    whatWentWrong: string;
  };
}

export function formatNightReportThread(
  data: NightReportData
): string[] {
  const tweets: string[] = [];
  const profitEmoji = data.profit >= 0 ? '📈' : '📉';
  const profitSign = data.profit >= 0 ? '+' : '';
  const statusText = data.profit >= 0 ? 'Pozitif ROI' : 'Negatif ROI';

  // Ana özet
  tweets.push(withSiteLink(`🌙 ${data.date} - GÜNLÜK PERFORMANS RAPORU

${profitEmoji} ${statusText}:
• Projeler: ${data.wonCoupons}/${data.totalCoupons} doğrulandı
• Giriş: ${data.totalStaked.toFixed(0)} Birim
• Çıkış: ${data.totalReturned.toFixed(0)} Birim
• Net: ${profitSign}${data.profit.toFixed(1)} Birim
• ROI: ${profitSign}${data.roi.toFixed(1)}%

📊 Haftalık ROI: ${profitSign}${data.weeklyROI.toFixed(1)}%

Varyansı minimize ettiğimiz sürece kasa büyür.
Matematik yalan söylemez. 💻`));

  // Doğrulanan model çıktısı
  if (data.bestPrediction && data.wonCoupons > 0) {
    tweets.push(`✅ DOĞRULANAN MODEL ÇIKTISI

${data.bestPrediction.match}
@${data.bestPrediction.odds.toFixed(2)}

🔍 Neden doğrulandı?
${data.bestPrediction.reasoning}

Model bu tür kalıpları tanımlıyor ve katalogluyor. 📊`);
  }

  // Hata analizi
  if (data.worstPrediction && data.lostCoupons > 0) {
    tweets.push(`⚠️ VERİ SAPMASI ANALİZİ

${data.worstPrediction.match}

❓ Model burada neden yanıldı?
${data.worstPrediction.whatWentWrong}

🔄 Bu veri noktası modeli güçlendirecek.

(Hataları analiz etmek, başarıdan daha öğreticidir.)
Yarın sabah yeni verilerle devam. 🛡️`);
  }

  return tweets;
}

// ============ GECE SEANSI ============

export interface NightSessionData {
  sportType: 'football' | 'basketball';
  matchName: string;
  prediction: string;
  algorithmNote: string;
  region: string;
}

export function formatNightSessionTweet(
  data: NightSessionData
): string {
  const sportIcon = data.sportType === 'basketball' ? '🏀' : '⚽';

  return safeTweet(withSiteLink(`🌑 [NIGHT SHIFT: GECE ANALİZİ]

Yerel bülten kapandı, modelimiz okyanus ötesi verilere odaklandı.

${sportIcon} Maç: ${data.matchName}
🎯 Tahmin: ${data.prediction}
🔬 Algoritma Notu: ${data.algorithmNote}

#${data.region} #GeceSeansi #BahisAnaliz`));
}

// ============ HAFTALIK PERFORMANS ============

export interface WeeklyPerformanceData {
  dateRange: { start: string; end: string };
  successfulPredictions: number;
  failedPredictions: number;
  roiPercent: number;
  bankrollChange: number;
  nextWeekFocus: string;
}

export function formatWeeklyPerformanceReport(
  data: WeeklyPerformanceData
): string {
  const changeSign = data.bankrollChange >= 0 ? '+' : '';
  const totalPredictions =
    data.successfulPredictions + data.failedPredictions;
  const hitRate =
    totalPredictions > 0
      ? ((data.successfulPredictions / totalPredictions) * 100).toFixed(1)
      : '0.0';

  return safeTweet(withSiteLink(`📈 [HAFTALIK SİSTEM PERFORMANSI]

Tarih Aralığı: ${data.dateRange.start} - ${data.dateRange.end}

✅ Başarılı Tahmin: ${data.successfulPredictions}
❌ Hatalı Tahmin: ${data.failedPredictions}
🎯 İsabet Oranı: %${hitRate}
📊 ROI (Yatırım Getirisi): %${data.roiPercent.toFixed(1)}
💰 Kasa Değişimi: ${changeSign}${data.bankrollChange.toFixed(1)} Birim

🛠 Gelecek Hafta Odağı: ${data.nextWeekFocus}

Şeffaflık, mühendisliğin temelidir. 💻📉`));
}

// ============ GÜNLÜK ÖNİZLEME THREAD ============

export interface MatchPreviewItem {
  homeTeam: string;
  awayTeam: string;
  league: string;
  time: string;
  pick: string;
  odds: number;
  confidence: number;
  value: 'high' | 'medium' | 'low';
  formInfo?: string;
}

/**
 * Günün maçlarını lig bazlı thread'e böl
 */
export function formatDailyPreviewThreads(
  previews: MatchPreviewItem[],
  minValueOdds: number = 1.5
): string[] {
  const tweets: string[] = [];
  const today = formatDateTR();

  // Özet istatistikler
  const highValueCount = previews.filter((p) => p.value === 'high').length;
  const avgConf = Math.round(
    previews.reduce((a, p) => a + p.confidence, 0) / previews.length
  );

  tweets.push(
    safeTweet(withSiteLink(`📅 ${today} - GÜNÜN ANALİZLERİ

📊 ${previews.length} maç için VALUE tahminleri
🔥 ${highValueCount} yüksek değerli fırsat
📈 Ortalama güven: %${avgConf}

⚠️ Min oran: ${minValueOdds} (value odaklı)

👇 Detaylar aşağıda

#bahis #iddaa #futbol #tahmin`))
  );

  // Liglere göre grupla
  const byLeague: Record<string, MatchPreviewItem[]> = {};
  for (const p of previews) {
    if (!byLeague[p.league]) byLeague[p.league] = [];
    byLeague[p.league].push(p);
  }

  for (const [league, matches] of Object.entries(byLeague)) {
    let tweetText = `🏆 ${league}\n\n`;

    for (let idx = 0; idx < matches.length; idx++) {
      const m = matches[idx];
      const home = shortTeamName(m.homeTeam, 11);
      const away = shortTeamName(m.awayTeam, 11);
      const valueBadge = m.value === 'high' ? '🔥' : '✅';

      tweetText += `${valueBadge} ${home} vs ${away}\n`;
      tweetText += `⏰ ${m.time} | 🎯 ${m.pick} @${m.odds.toFixed(2)}\n`;
      tweetText += `📊 Güven: %${m.confidence}`;
      if (m.formInfo) tweetText += ` | Form: ${m.formInfo}`;
      tweetText += '\n\n';

      // 250 karakter aşıldıysa yeni tweet'e geç
      if (tweetText.length > 250 && idx < matches.length - 1) {
        tweets.push(safeTweet(tweetText.trim()));
        tweetText = `🏆 ${league} (devam)\n\n`;
      }
    }

    if (tweetText.trim().length > 20) {
      tweets.push(safeTweet(tweetText.trim()));
    }
  }

  return tweets;
}

// ============ MAÇ ÖNCESİ ANALİZ ============

export interface PreMatchAnalysisData {
  match: string;
  league: string;
  time: string;
  homeForm: string;
  awayForm: string;
  h2hSummary: string;
  keyStats: string[];
  prediction: string;
  confidencePercent: number;
}

export function formatPreMatchAnalysisTweet(
  data: PreMatchAnalysisData
): string {
  let statsText = '';
  for (const stat of data.keyStats.slice(0, 3)) {
    statsText += `• ${stat}\n`;
  }

  return safeTweet(withSiteLink(`🔍 MAÇ ÖNCESİ ANALİZ

🏟 ${data.match} (${data.league})
⏰ ${data.time}

📊 Form:
   Ev: ${data.homeForm} | Dep: ${data.awayForm}
📈 H2H: ${data.h2hSummary}

${statsText}
🎯 ${data.prediction}
📊 Güven: %${data.confidencePercent}

#MacAnalizi`));
}
