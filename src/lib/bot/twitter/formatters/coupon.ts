/**
 * Coupon Formatters - Kupon, Sonuç, Z Raporu, Proje Doğrulama
 *
 * Tüm kupon odaklı tweet formatları burada.
 */

import type { BotCoupon, BankrollState } from '../../types';
import {
  formatPredictionShort,
  formatDateTR,
  formatTurkeyTime,
  getConfidenceInfo,
  withSiteLink,
} from './helpers';
import { safeTweet } from '../validator';

// ============ YENİ KUPON ============

/**
 * Yeni kupon tweet metni — Mühendislik dili
 */
export function formatNewCouponTweet(
  coupon: BotCoupon,
  bankroll: number
): string {
  const lines: string[] = [];
  const projectId = coupon.id.slice(-6).toUpperCase();

  // Güven endeksi
  const avgConf =
    coupon.matches.reduce((s, m) => s + m.confidenceScore, 0) /
    coupon.matches.length;

  lines.push(`🔍 YENİ PROJE #${projectId}`);
  lines.push('');
  lines.push(`📊 Güven Endeksi: %${avgConf.toFixed(0)}`);
  lines.push('');

  coupon.matches.forEach((match, i) => {
    const time = formatTurkeyTime(match.kickoff);
    const pred = formatPredictionShort(match.prediction.label);
    lines.push(`${i + 1}. ${match.homeTeam} vs ${match.awayTeam}`);
    lines.push(
      `   ⏰ ${time} | Model: ${pred} @${match.prediction.odds.toFixed(2)}`
    );
  });

  lines.push('');
  lines.push(`💻 Toplam Oran: ${coupon.totalOdds.toFixed(2)}`);
  lines.push(`🛠️ Risk: ${coupon.stake.toFixed(0)} Birim`);
  lines.push('');
  lines.push('Veri disiplinine sadık kalıyoruz. 📈');
  lines.push('#VeriAnalizi #Algoritma');

  return safeTweet(withSiteLink(lines.join('\n')));
}

// ============ SONUÇ ============

/**
 * Kupon sonuç tweeti — Doğrulama / Sapma formatı
 */
export function formatResultTweet(
  coupon: BotCoupon,
  newBankroll: number
): string {
  const lines: string[] = [];
  const isWon = coupon.status === 'won';
  const profit = coupon.result?.profit || -coupon.stake;
  const projectId = coupon.id.slice(-6).toUpperCase();

  lines.push(
    isWon
      ? `✅ Proje Doğrulandı: #${projectId}`
      : `⚠️ Veri Sapması: #${projectId}`
  );
  lines.push('');

  coupon.matches.forEach((match) => {
    const result = coupon.result?.matchResults.find(
      (r) => r.fixtureId === match.fixtureId
    );
    const won = result?.predictionWon;
    const status = won ? '✓' : '✗';
    const score = result
      ? `${result.homeScore}-${result.awayScore}`
      : '?-?';
    const pred = formatPredictionShort(match.prediction.label);

    lines.push(`${match.homeTeam} ${score} ${match.awayTeam} - ${status}`);
    lines.push(`   Model: ${pred}`);
  });

  lines.push('');

  if (isWon) {
    lines.push(`🚀 Net Kar: +${profit.toFixed(1)} Birim`);
    lines.push(`📈 Güncel Kasa: ${newBankroll.toFixed(1)} Birim`);
    lines.push('');
    lines.push('Varyansı ekarte ettiğimiz sürece kasa büyür.');
    lines.push('Bize mühendislik yeter. 💻📊');
  } else {
    lines.push(`📉 Kayıp: ${Math.abs(profit).toFixed(1)} Birim`);
    lines.push(`💼 Güncel Kasa: ${newBankroll.toFixed(1)} Birim`);
    lines.push('');
    lines.push('Stop-Loss aktif, disiplin korunuyor. 🛡️');
    lines.push('Hata analizi gelecek.');
  }

  return safeTweet(withSiteLink(lines.join('\n')));
}

// ============ KISA FORMAT (280 CHAR FALLBACK) ============

/**
 * Kısa tweet formatı — 280 karaktere sığacak şekilde
 */
export function formatShortTweet(
  coupon: BotCoupon,
  bankroll: number,
  isResult: boolean
): string {
  const lines: string[] = [];

  if (isResult) {
    const isWon = coupon.status === 'won';
    const profit = coupon.result?.profit || -coupon.stake;

    lines.push(isWon ? '✅ KAZANDI!' : '⚠️ KAYBETTİ');
    coupon.matches.forEach((m) => {
      const result = coupon.result?.matchResults.find(
        (r) => r.fixtureId === m.fixtureId
      );
      const emoji = result?.predictionWon ? '✓' : '✗';
      const score = result
        ? `${result.homeScore}-${result.awayScore}`
        : '?-?';
      lines.push(`${emoji} ${m.homeTeam} ${score} ${m.awayTeam}`);
    });
    lines.push(
      `Kasa: ${bankroll.toFixed(0)}₺ (${profit >= 0 ? '+' : ''}${profit.toFixed(0)})`
    );
    lines.push('#VeriAnalizi');
    return safeTweet(withSiteLink(lines.join('\n')));
  } else {
    lines.push(`🔍 #${coupon.id.slice(-6).toUpperCase()}`);
    coupon.matches.forEach((m, i) => {
      const pred = formatPredictionShort(m.prediction.label);
      lines.push(
        `${i + 1}. ${m.homeTeam} vs ${m.awayTeam} | ${pred} @${m.prediction.odds.toFixed(2)}`
      );
    });
    lines.push(
      `Oran: ${coupon.totalOdds.toFixed(2)} | Risk: ${coupon.stake.toFixed(0)}₺`
    );
    lines.push('#VeriAnalizi #Algoritma');
  }

  return safeTweet(withSiteLink(lines.join('\n')));
}

// ============ Z RAPORU ============

/**
 * Gün sonu Z Raporu — kasa durumu, istatistikler
 */
export function formatDailyReportTweet(
  coupon: BotCoupon,
  state: BankrollState
): string {
  const lines: string[] = [];
  const dateStr = formatDateTR(new Date(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const isWon = coupon.status === 'won';
  const profit = coupon.result?.profit || -coupon.stake;

  lines.push('📊 GÜN SONU Z RAPORU');
  lines.push(`📅 ${dateStr}`);
  lines.push('━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(isWon ? '✅ KUPON KAZANDI!' : '❌ KUPON KAYBETTİ');
  lines.push('');

  coupon.matches.forEach((match) => {
    const result = coupon.result?.matchResults.find(
      (r) => r.fixtureId === match.fixtureId
    );
    const won = result?.predictionWon;
    const emoji = won ? '✅' : '❌';
    const score = result
      ? `${result.homeScore}-${result.awayScore}`
      : '?-?';
    const pred = formatPredictionShort(match.prediction.label);

    lines.push(`${emoji} ${match.homeTeam} ${score} ${match.awayTeam}`);
    lines.push(`   └ ${pred} @${match.prediction.odds.toFixed(2)}`);
  });

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push('💰 KASA DURUMU');
  lines.push(`   Yatırım: ${coupon.stake.toFixed(0)}₺`);
  lines.push(`   Oran: ${coupon.totalOdds.toFixed(2)}x`);

  if (isWon) {
    lines.push(`   Kazanç: +${coupon.potentialWin.toFixed(0)}₺`);
    lines.push(`   Net Kar: +${profit.toFixed(0)}₺ 🎉`);
  } else {
    lines.push(`   Kayıp: -${Math.abs(profit).toFixed(0)}₺ 💸`);
  }

  lines.push('');
  lines.push(`💼 Güncel Kasa: ${state.balance.toFixed(0)}₺`);

  const winRate =
    state.totalBets > 0
      ? ((state.wonBets / state.totalBets) * 100).toFixed(0)
      : '0';
  const totalProfit = state.totalWon - state.totalStaked;
  const roi =
    state.totalStaked > 0
      ? ((totalProfit / state.totalStaked) * 100).toFixed(1)
      : '0';

  lines.push('');
  lines.push('📈 GENEL İSTATİSTİK');
  lines.push(`   Toplam: ${state.totalBets} kupon`);
  lines.push(
    `   Kazanan: ${state.wonBets} | Kaybeden: ${state.lostBets}`
  );
  lines.push(`   Win Rate: %${winRate}`);
  lines.push(`   ROI: %${roi}`);
  lines.push('');
  lines.push('#Bahis #ZRaporu #BilyonerBot');

  return withSiteLink(lines.join('\n'));
}

// ============ PROJE DOĞRULANDI / HATA ANALİZİ ============

export interface ProjectValidatedData {
  projectId: string;
  matches: { name: string; result: 'OK' | 'FAIL' }[];
  netProfit: number;
  currentBankroll: number;
  totalOdds: number;
}

export function formatProjectValidatedTweet(
  data: ProjectValidatedData
): string {
  let matchResults = '';
  for (const m of data.matches) {
    const icon = m.result === 'OK' ? '✓' : '✗';
    matchResults += `${m.name} - ${icon}\n`;
  }

  return safeTweet(withSiteLink(`✅ Proje Doğrulandı: #${data.projectId}

${matchResults}
🚀 Net Kar: +${data.netProfit.toFixed(1)} Birim
📈 Güncel Kasa: ${data.currentBankroll.toFixed(1)} Birim

Varyansı ekarte ettiğimiz sürece kasa büyümeye devam eder.

Veri disiplinine sadık kalanlara tebrikler.
Bize mühendislik yeter. 💻📊`));
}

export interface ErrorAnalysisData {
  matchName: string;
  expectedOutcome: string;
  actualOutcome: string;
  errorReason: string;
  unitsLost: number;
  stopLossNote: string;
}

export function formatErrorAnalysisTweet(data: ErrorAnalysisData): string {
  return safeTweet(withSiteLink(`⚠️ Hata Analizi (Post-Match Report)

${data.matchName} beklentimizin altında kaldı.

❓ Neden?
${data.errorReason}

📊 Beklenen: ${data.expectedOutcome}
📉 Gerçekleşen: ${data.actualOutcome}

Kasa yönetim protokolümüz (Stop-Loss) sayesinde sadece ${data.unitsLost.toFixed(1)} birim kayıpla günü kapattık.

${data.stopLossNote}

Disiplin, tek bir kupondan daha önemlidir. 🛡️`));
}

// ============ KUPON DURUMU (CANLI ARA RAPOR) ============

export interface CouponStatusData {
  batchNumber: string;
  matches: {
    name: string;
    status: 'validated' | 'in_progress' | 'pending' | 'failed';
    progressPercent?: number;
    note?: string;
  }[];
  instantSuccessRate: number;
  modelStatus: string;
}

export function formatCouponStatusReport(data: CouponStatusData): string {
  const statusIcons = {
    validated: '🟢',
    in_progress: '🟡',
    pending: '🔵',
    failed: '🔴',
  };
  const statusLabels = {
    validated: 'Sistem Doğrulandı',
    in_progress: 'Süreç devam ediyor',
    pending: 'Beklemede',
    failed: 'Veri Sapması',
  };

  let matchLines = '';
  for (const match of data.matches) {
    const icon = statusIcons[match.status];
    let statusText = statusLabels[match.status];
    if (match.status === 'in_progress' && match.progressPercent) {
      statusText = `Momentumun %${match.progressPercent}'i tamamlandı. ${statusText}`;
    }
    if (match.note) statusText += ` (${match.note})`;
    matchLines += `${icon} ${match.name}: ${statusText}\n`;
  }

  return safeTweet(withSiteLink(`🔄 [KUPON DURUM RAPORU - BATCH #${data.batchNumber}]

${matchLines.trim()}

💹 Anlık Başarı Oranı: %${data.instantSuccessRate}
💻 Model ${data.modelStatus}, veri akışını takip ediyoruz.`));
}

// ============ ANA KUPON THREAD ============

export interface MainCouponData {
  coupon: BotCoupon;
  avgConfidence: number;
  confidenceClass: 'A' | 'B' | 'C';
  units: number;
  bankrollPercentage: number;
  matchReasons: { match: string; pick: string; why: string }[];
}

export function formatMainCouponThread(data: MainCouponData): string[] {
  const tweets: string[] = [];
  const today = formatDateTR();

  // Ana tweet
  let mainTweet = `🎯 ${today} - GÜNÜN KUPONU

📊 Güven Endeksi: %${data.avgConfidence}
📈 Sınıf: ${data.confidenceClass}
💰 Önerilen Risk: ${data.units} Birim (Kasanın %${data.bankrollPercentage}'${data.bankrollPercentage >= 5 ? 'i' : 'u'})

`;

  for (const m of data.coupon.matches) {
    mainTweet += `${m.homeTeam} - ${m.awayTeam}\n`;
    mainTweet += `🎯 ${m.prediction.label} @${m.prediction.odds.toFixed(2)}\n\n`;
  }

  mainTweet += `💵 Toplam Oran: ${data.coupon.totalOdds.toFixed(2)}\n\n`;
  mainTweet += `⚠️ Bahis bir maratondur, 100 metre koşusu değil.`;
  tweets.push(mainTweet);

  // Model detayları
  let reasonTweet = `📝 MODEL DETAYLARI\n\n`;
  for (const mr of data.matchReasons) {
    reasonTweet += `🔍 ${mr.match}\n   ${mr.pick}: ${mr.why}\n\n`;
  }
  reasonTweet += `\n💻 Veri disiplinine sadık kalıyoruz.`;
  tweets.push(withSiteLink(reasonTweet));

  return tweets;
}
