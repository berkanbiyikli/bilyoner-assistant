/**
 * Stats Formatters - İstatistik, Milestone, Kasa Yönetimi Tweet Formatları
 */

import { safeTweet, validateTweet, truncateTweet } from '../validator';
import { formatDateTR, withSiteLink } from './helpers';

// ============ DERİN İSTATİSTİK ============

export interface DeepStatsData {
  stat: string;
  context: string;
  source: string;
  league: string;
  actionable: string;
}

export function formatDeepStatsTweet(data: DeepStatsData): string {
  return safeTweet(withSiteLink(`📊 BİLİYOR MUYDUNUZ?

${data.stat}

📈 Bağlam: ${data.context}

💡 Uygulanabilirlik: ${data.actionable}

📖 Kaynak: ${data.source}

#futbol #istatistik #analiz #${data.league.toLowerCase().replace(/\s/g, '')}`));
}

// ============ GENEL İSTATİSTİK ============

/**
 * Genel istatistik tweet formatı (stats-tweet endpoint için)
 */
export function formatStatsTweet(
  stat: string,
  category: string
): string {
  return safeTweet(withSiteLink(`📈 BİLİYOR MUYDUNUZ?

${stat}

📊 Kategori: ${category}

#futbol #istatistik #bahis #bilgi`));
}

// ============ DİNAMİK İSTATİSTİK ============

export interface DynamicStat {
  template: string;
  variables: Record<string, string | number>;
  context: string;
  actionable: string;
}

export function generateDynamicStat(stat: DynamicStat): string {
  let text = stat.template;
  for (const [key, value] of Object.entries(stat.variables)) {
    text = text.replace(`{${key}}`, String(value));
  }
  return text;
}

// ============ MİLESTONE ============

/**
 * Milestone kutlama tweet'i
 */
export function formatMilestoneTweet(
  type: 'streak' | 'profit' | 'accuracy' | 'coupon_count',
  value: number,
  context: string
): string {
  const templates: Record<string, string> = {
    streak: `🔥 ${value} KUPON SERİSİ!

Art arda ${value} kupon tutturuldu.

${context}

Disiplin + Model = Sonuç 💻`,
    profit: `📈 +${value} BİRİM HEDEFE ULAŞILDI!

${context}

Küçük adımlar, büyük hedefler.
Matematik yalan söylemez. 💻`,
    accuracy: `🎯 %${value} DOĞRULUK ORANI!

${context}

Model kalibrasyonu başarılı. 📊`,
    coupon_count: `📊 ${value}. KUPON TAMAMLANDI!

${context}

Her kupon, modeli güçlendiren bir veri noktası. 💻`,
  };

  return safeTweet(withSiteLink(templates[type] || ''));
}

// ============ KASA YÖNETİMİ ============

export function formatBankrollIntroTweet(): string {
  return safeTweet(withSiteLink(`📢 DUYURU: Kasa Yönetimi Protokolü

Kuponun tutması başarıdır ama kasanın büyümesi disiplindir.

Bugün itibariyle "20 Birimlik Kasa Yönetimi"ne geçiyoruz:

📊 Günlük Risk: Max %10 (2 Birim)
📈 A Sınıfı (%85+): 1.5 Birim
📊 B Sınıfı (%70-85): 1 Birim
📉 C Sınıfı (Sürpriz): 0.5 Birim

⚖️ Stop-Loss: -2 Birim/gün
🎯 Hedef: +2 Birim/gün

Mühendislik bunu gerektirir. 💻`));
}

export function formatROITweet(
  daysCount: number,
  totalInvested: number,
  totalReturned: number,
  roi: number
): string {
  return safeTweet(withSiteLink(`📊 ${daysCount} GÜNLÜK PERFORMANS RAPORU

Toplam Yatırım: ${totalInvested.toFixed(0)} Birim
Toplam Getiri: ${totalReturned.toFixed(1)} Birim
Net Kar: ${(totalReturned - totalInvested).toFixed(1)} Birim

ROI (Yatırım Getirisi): %${roi.toFixed(1)}

${roi > 0 ? '✅ Sistem pozitif çalışıyor.' : '📈 Model optimizasyonu devam ediyor.'}

Matematik yalan söylemez. 💻📊`));
}

// ============ HAFTALIK KASA RAPORU ============

export interface WeeklySummaryStats {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  winRate: number;
  profit: number;
  roi: number;
  balance: number;
  streakText: string;
  bestLeague: string;
  bestLeagueWinRate: number;
}

export function formatWeeklySummaryTweet(stats: WeeklySummaryStats): string {
  const profitEmoji = stats.profit >= 0 ? '📈' : '📉';
  const profitSign = stats.profit >= 0 ? '+' : '';
  const lines: string[] = [];

  lines.push('📊 HAFTALIK KASA RAPORU');
  lines.push('');
  lines.push(`✅ Kazanan: ${stats.wonBets} kupon`);
  lines.push(`❌ Kaybeden: ${stats.lostBets} kupon`);
  lines.push(`🎯 Başarı: %${stats.winRate.toFixed(1)}`);
  lines.push('');
  lines.push(
    `${profitEmoji} Kar/Zarar: ${profitSign}${stats.profit.toFixed(0)} TL`
  );
  lines.push(`💰 Güncel Kasa: ${stats.balance.toFixed(0)} TL`);
  lines.push(`📊 ROI: ${profitSign}${stats.roi.toFixed(1)}%`);

  if (stats.streakText) {
    lines.push('');
    lines.push(stats.streakText);
  }

  if (stats.bestLeague && stats.bestLeagueWinRate > 60) {
    lines.push('');
    lines.push(
      `🏆 En iyi lig: ${stats.bestLeague} (%${stats.bestLeagueWinRate.toFixed(0)})`
    );
  }

  lines.push('');
  lines.push('#bahis #iddaa #haftalık #kasa');

  return safeTweet(withSiteLink(lines.join('\n')));
}

// ============ RE-EXPORT VALIDATOR (backward compat) ============

export { validateTweet as validateTweetLength, truncateTweet };
