/**
 * Uygulama Konfigürasyonu
 * Fırsat eşikleri, polling intervalleri ve bahis ayarları
 */

export const config = {
  // API Polling Ayarları
  polling: {
    liveMatchInterval: 60000, // 60 saniye - canlı maç güncelleme
    fixturesInterval: 300000, // 5 dakika - günün maçları güncelleme
    oddsInterval: 180000, // 3 dakika - oran güncelleme
  },

  // Fırsat Tespit Eşikleri (SUPER DÜŞÜK - daha fazla fırsat için)
  opportunities: {
    // Şut Baskısı (Over için)
    shotPressure: {
      minShotsOnTarget: 1, // 1 isabetli şut yeterli
      shotRatioThreshold: 0.50, // %50 şut hakimiyeti yeterli
      noGoalMinute: 15, // 15. dakikadan sonra kontrol
      minShotQuality: 0.15, // %15 isabetli şut oranı yeterli
    },

    // Possession Hakimiyeti
    possession: {
      dominanceThreshold: 0.52, // %52 top kontrolü yeterli
      sustainedMinutes: 5, // 5 dakika yeterli
      minMinute: 10, // 10. dakikadan sonra aktif
    },

    // Agresiflik (Kart bahisleri için)
    aggressiveness: {
      foulFrequency: 1.5, // Dakika başına 1.5 faul yeterli
      cardThreshold: 1, // 1 kart bile agresiflik işareti
      earlyCardMinute: 30, // 30 dakika içinde kart = daha fazla beklenir
    },

    // Korner Baskısı
    cornerPressure: {
      minCorners: 2, // 2 korner yeterli
      dominanceThreshold: 0.55, // %55 korner üstünlüğü yeterli
    },

    // Momentum Değişimi
    momentum: {
      statSwingThreshold: 0.10, // %10 istatistik değişimi yeterli
      windowMinutes: 10, // Son 10 dakika
    },

    // Gol Beklentisi (Gol Yakında algoritması)
    goalExpectancy: {
      highExpectancy: 2.0, // Daha düşük xG eşiği
      lowExpectancy: 0.5, // Düşük gol beklentisi
      imminentThreshold: 25, // 25 puan yeterli
      dominanceMultiplier: 1.15, // Rakipten 1.15x fazla yeterli
    },
  },

  // Güven Skoru Kategorileri
  confidence: {
    high: 70, // %70+ güvenli bahis
    medium: 55, // %55-70 orta risk
    low: 40, // %40-55 yüksek risk
  },

  // Kupon Ayarları
  coupon: {
    maxCombinations: 5, // Maksimum kombine sayısı
    minConfidenceForCombo: 60, // Kombine için minimum güven
    singleBetMinConfidence: 50, // Tekli için minimum güven
  },

  // Desteklenen Bahis Tipleri
  betTypes: {
    matchWinner: true,
    overUnder: true,
    bothTeamsToScore: true,
    doubleChance: true,
    cards: true,
    corners: true,
  },

  // UI Ayarları
  ui: {
    maxVisibleMatches: 50,
    showOnlyWithOdds: false,
    defaultTimezone: 'Europe/Istanbul',
  },
} as const;

export type Config = typeof config;
