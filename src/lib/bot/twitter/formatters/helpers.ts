/**
 * Formatter Helpers - Tüm formatterların kullandığı ortak yardımcılar
 *
 * Terminoloji, emoji map, prediction format, güven sınıflandırması
 */

import { formatTurkeyTime } from '@/lib/utils';
import type { LiveMarket } from '../../live-types';

// ============ TERMİNOLOJİ ============

/**
 * "Mühendislik dili" terminolojisi — bot'un profesyonel sesini tanımlar
 */
export const TERMINOLOGY = {
  prediction: 'Model Çıktısı',
  coupon: 'Proje',
  win: 'Doğrulandı',
  loss: 'Veri Sapması',
  confidence: 'Güven Endeksi',
  bankroll: 'Kasa',
  stake: 'Risk',
  roi: 'Yatırım Getirisi (ROI)',
  winRate: 'İsabet Oranı',
  streak: 'Seri',
  value: 'Değer Farkı',
} as const;

// ============ GÜVEN SINIFLANDIRMASI ============

export type ConfidenceClass = 'A' | 'B' | 'C';

export interface ConfidenceInfo {
  label: ConfidenceClass;
  emoji: string;
  description: string;
  /** Kaç birim risk alınmalı (20 birimlik kasadan) */
  suggestedUnits: number;
}

/**
 * Güven sınıfını belirle
 */
export function getConfidenceInfo(avgConfidence: number): ConfidenceInfo {
  if (avgConfidence >= 85) {
    return {
      label: 'A',
      emoji: '🟢',
      description: 'Yüksek güvenli',
      suggestedUnits: 1.5,
    };
  }
  if (avgConfidence >= 70) {
    return {
      label: 'B',
      emoji: '🟡',
      description: 'Orta güvenli',
      suggestedUnits: 1.0,
    };
  }
  return {
    label: 'C',
    emoji: '🟠',
    description: 'Düşük güvenli / Sürpriz',
    suggestedUnits: 0.5,
  };
}

// ============ TAHMİN FORMAT ============

/**
 * Tahmin label'ını kısa ve tutarlı formata çevirir
 * Parantez içindeki güven yüzdesini ve fazlalıkları temizler
 */
export function formatPredictionShort(label: string): string {
  // "(85%)" gibi suffix'leri temizle
  const clean = label.replace(/\s*\(.*?\)\s*/g, '').trim();

  const map: Record<string, string> = {
    'Ev Sahibi': 'MS 1',
    'Beraberlik': 'MS X',
    'Deplasman': 'MS 2',
    'Üst 2.5': 'Üst 2.5',
    'Alt 2.5': 'Alt 2.5',
    'Üst 1.5': 'Üst 1.5',
    'Alt 1.5': 'Alt 1.5',
    'Üst 3.5': 'Üst 3.5',
    'Alt 3.5': 'Alt 3.5',
    'İY Üst 0.5': 'İY Ü0.5',
    'İY Alt 0.5': 'İY A0.5',
    'İY Üst 1.5': 'İY Ü1.5',
    'İY Alt 1.5': 'İY A1.5',
    'KG Var': 'KG Var',
    'KG Yok': 'KG Yok',
    'MS 1': 'MS 1',
    'MS X': 'MS X',
    'MS 2': 'MS 2',
  };

  return map[clean] || clean;
}

// ============ CANLI TAHMİN DURUMU ============

export type LivePredictionStatus = 'winning' | 'losing' | 'pending';

/**
 * Canlı tahmin durumunu skordan hesapla
 */
export function checkLivePrediction(
  label: string,
  homeScore: number,
  awayScore: number
): LivePredictionStatus {
  const totalGoals = homeScore + awayScore;
  const clean = label.replace(/\s*\(.*?\)\s*/g, '').trim();

  const checks: Record<string, () => LivePredictionStatus> = {
    'Ev Sahibi': () =>
      homeScore > awayScore
        ? 'winning'
        : homeScore < awayScore
          ? 'losing'
          : 'pending',
    'MS 1': () =>
      homeScore > awayScore
        ? 'winning'
        : homeScore < awayScore
          ? 'losing'
          : 'pending',
    'Beraberlik': () =>
      homeScore === awayScore ? 'winning' : 'losing',
    'MS X': () =>
      homeScore === awayScore ? 'winning' : 'losing',
    'Deplasman': () =>
      awayScore > homeScore
        ? 'winning'
        : awayScore < homeScore
          ? 'losing'
          : 'pending',
    'MS 2': () =>
      awayScore > homeScore
        ? 'winning'
        : awayScore < homeScore
          ? 'losing'
          : 'pending',
    'Üst 2.5': () => (totalGoals > 2 ? 'winning' : 'pending'),
    'Alt 2.5': () => (totalGoals < 3 ? 'winning' : 'losing'),
    'Üst 1.5': () => (totalGoals > 1 ? 'winning' : 'pending'),
    'Üst 3.5': () => (totalGoals > 3 ? 'winning' : 'pending'),
    'Alt 3.5': () => (totalGoals < 4 ? 'winning' : 'losing'),
    'KG Var': () =>
      homeScore > 0 && awayScore > 0 ? 'winning' : 'pending',
    'KG Yok': () =>
      homeScore === 0 || awayScore === 0 ? 'winning' : 'losing',
  };

  const fn = checks[clean];
  return fn ? fn() : 'pending';
}

// ============ FIRSAT TİPİ ============

/**
 * Canlı fırsat tipini emoji ve açıklamaya çevirir
 */
export function formatOpportunityType(type: string): {
  emoji: string;
  label: string;
} {
  const map: Record<string, { emoji: string; label: string }> = {
    goal_pressure: { emoji: '⚡', label: 'Gol Baskısı' },
    home_momentum: { emoji: '🏠', label: 'Ev Sahibi Baskın' },
    away_momentum: { emoji: '✈️', label: 'Deplasman Baskın' },
    high_tempo: { emoji: '🔥', label: 'Yüksek Tempo' },
    low_scoring: { emoji: '🛡️', label: 'Düşük Skor' },
    card_risk: { emoji: '🟨', label: 'Kart Riski' },
    corner_fest: { emoji: '🚩', label: 'Korner Şov' },
  };
  return map[type] || { emoji: '🎯', label: 'Fırsat' };
}

/**
 * Bahis pazarını okunabilir Türkçe formata çevirir
 */
export function formatMarket(market: LiveMarket, pick: string): string {
  const labels: Record<LiveMarket, string> = {
    next_goal: 'Sonraki Gol',
    match_result: 'Maç Sonucu',
    double_chance: 'Çifte Şans',
    over_under_15: '1.5 Gol',
    over_under_25: '2.5 Gol',
    over_under_35: '3.5 Gol',
    btts: 'Karşılıklı Gol',
    home_over_05: 'Ev 0.5 Üstü',
    away_over_05: 'Dep 0.5 Üstü',
    corner_over: 'Korner',
    card_over: 'Kart',
  };
  return `${labels[market] || market}: ${pick}`;
}

// ============ HATA NEDENLERİ ============

/**
 * Kupon kaybettiğinde kullanılabilecek hata nedeni şablonları
 */
export const ERROR_REASONS = {
  redCard: (team: string, minute: number) =>
    `${team} ${minute}. dakikada kırmızı kart görünce oyun planı ve modelin veri seti çöktü.`,
  injury: (player: string, minute: number) =>
    `${player}'ın ${minute}. dakikada sakatlanması modelin hesaplamadığı bir değişken oldu.`,
  tacticalChange: (team: string) =>
    `${team}'ın beklenmedik taktik değişikliği model varsayımlarını geçersiz kıldı.`,
  weatherImpact: () =>
    `Hava koşulları oyun stilini beklenenden fazla etkiledi.`,
  refereeDecision: (desc: string) =>
    `Tartışmalı hakem kararı: ${desc}`,
  unexpectedPerformance: (team: string, type: 'üstün' | 'düşük') =>
    `${team} normalin ${type} bir performans sergiledi.`,
  goalkeepingHeroics: (team: string) =>
    `${team} kalecisinin olağanüstü kurtarışları xG'yi geçersiz kıldı.`,
  varianceFactor: () =>
    `Modelin %70 güven aralığında bile karşılaşılabilecek doğal bir varyans örneğiydi.`,
};

// ============ BATCH NUMARASI ============

/**
 * Saat bilgisinden batch numarası hesapla (canlı takip için)
 */
export function getBatchNumber(hour: number): string {
  if (hour >= 17) return String(hour - 16).padStart(2, '0');
  if (hour <= 2) return String(hour + 8).padStart(2, '0');
  return '01';
}

// ============ WEB SİTESİ LİNKİ ============

/** Tüm tweetlere eklenecek site linki */
export const SITE_URL = 'https://bilyoner-assistant.vercel.app';

/** Tweet sonuna site linki ekle (safeTweet'ten ÖNCE çağrılır) */
export function withSiteLink(text: string, path: string = ''): string {
  const url = path ? `${SITE_URL}${path}` : SITE_URL;
  return `${text}\n\n🔗 ${url}`;
}

// ============ YARDIMCILAR ============

/** Takım ismini kısalt (tweet'e sığdırmak için) */
export function shortTeamName(name: string, maxLen = 14): string {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 2) + '..';
}

/** Tarih formatlama (Türkçe) */
export function formatDateTR(
  date: Date = new Date(),
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
  }
): string {
  return date.toLocaleDateString('tr-TR', options);
}

/** Saat formatlama — re-export for convenience */
export { formatTurkeyTime };
