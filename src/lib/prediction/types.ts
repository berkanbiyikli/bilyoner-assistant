/**
 * AI Tahmin Motoru - Types
 * Akıllı tahmin sistemi için tip tanımlamaları
 */

// Tahmin sonucu
export interface PredictionResult {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  
  // Ana tahminler
  predictions: {
    matchResult: MatchResultPrediction;
    goals: GoalsPrediction;
    btts: BTTSPrediction;
    corners?: CornersPrediction;
    cards?: CardsPrediction;
  };
  
  // En iyi bahis önerisi
  bestBet: BetSuggestion;
  
  // Analiz faktörleri
  factors: PredictionFactors;
  
  // Genel güven skoru
  overallConfidence: number;
  
  // Tahmin zamanı
  generatedAt: number;
}

// Maç sonucu tahmini
export interface MatchResultPrediction {
  homeWin: PredictionOdds;
  draw: PredictionOdds;
  awayWin: PredictionOdds;
  recommended: '1' | 'X' | '2' | null;
}

// Gol tahmini
export interface GoalsPrediction {
  expectedGoals: {
    home: number;
    away: number;
    total: number;
  };
  over15: PredictionOdds;
  over25: PredictionOdds;
  over35: PredictionOdds;
  under25: PredictionOdds;
  recommended: string | null;
}

// BTTS tahmini
export interface BTTSPrediction {
  yes: PredictionOdds;
  no: PredictionOdds;
  recommended: 'yes' | 'no' | null;
}

// Korner tahmini
export interface CornersPrediction {
  expectedTotal: number;
  over85: PredictionOdds;
  over105: PredictionOdds;
}

// Kart tahmini
export interface CardsPrediction {
  expectedTotal: number;
  over35: PredictionOdds;
  over45: PredictionOdds;
}

// Tahmin odds bilgisi
export interface PredictionOdds {
  probability: number; // 0-100
  confidence: number; // 0-100
  value: number; // Expected value percentage
  bookmakerOdds?: number;
  fairOdds?: number;
}

// Bahis önerisi
export interface BetSuggestion {
  type: string;
  label: string;
  probability: number;
  confidence: number;
  value: number;
  odds: number;
  stake: 'low' | 'medium' | 'high';
  reasoning: string[];
}

// Tahmin faktörleri
export interface PredictionFactors {
  // Form analizi
  form: {
    homeForm: number; // 0-100
    awayForm: number;
    homeHomeForm: number;
    awayAwayForm: number;
    formDifference: number;
    // GPP - Rakip gücüne göre ağırlıklı form
    homeGPP?: number;
    awayGPP?: number;
  };
  
  // H2H analizi
  h2h: {
    totalMatches: number;
    homeWins: number;
    draws: number;
    awayWins: number;
    avgGoals: number;
    bttsPercentage: number;
    recentTrend: 'home' | 'away' | 'balanced';
  };
  
  // İstatistiksel analiz
  stats: {
    homeAttack: number; // 0-100
    homeDefense: number;
    awayAttack: number;
    awayDefense: number;
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
  };
  
  // Lig pozisyonu
  standings: {
    homePosition: number;
    awayPosition: number;
    positionDifference: number;
    homePoints: number;
    awayPoints: number;
  };
  
  // Motivasyon faktörleri
  motivation: {
    homeMotivation: number; // 0-100
    awayMotivation: number;
    importanceLevel: 'low' | 'medium' | 'high' | 'critical';
  };
}

// Form hesaplama için maç sonucu
export interface FormMatch {
  result: 'W' | 'D' | 'L';
  goalsScored: number;
  goalsConceded: number;
  isHome: boolean;
  date: string;
}

// Tahmin modeli ayarları
export interface PredictionSettings {
  formWeight: number; // 0-1
  h2hWeight: number;
  statsWeight: number;
  standingsWeight: number;
  motivationWeight: number;
  minConfidenceThreshold: number;
  minValueThreshold: number;
}

export const DEFAULT_PREDICTION_SETTINGS: PredictionSettings = {
  formWeight: 0.30,
  h2hWeight: 0.20,
  statsWeight: 0.25,
  standingsWeight: 0.15,
  motivationWeight: 0.10,
  minConfidenceThreshold: 55,
  minValueThreshold: 5,
};

// =====================================
// 🎯 API Ensemble Cross-Check (Faz 2)
// =====================================

/**
 * Güven seviyesi etiketi
 * Model ve API tahminlerinin uyumuna göre belirlenir
 */
export type ConfidenceLabel = 'high' | 'medium' | 'risky' | 'avoid';

/**
 * API Tahmin karşılaştırma sonucu
 */
export interface APIValidationResult {
  /** Güven etiketi */
  confidenceLabel: ConfidenceLabel;
  
  /** Model tahmini (0-100) */
  modelProbability: number;
  
  /** API tahmini (0-100) */
  apiProbability: number;
  
  /** Sapma yüzdesi (mutlak fark) */
  deviation: number;
  
  /** Tahminler aynı yönde mi (aynı sonucu mu öngörüyor) */
  isSameDirection: boolean;
  
  /** Açıklama mesajı */
  message: string;
  
  /** Brier Score döngüsüne dahil edilsin mi */
  includeInCalibration: boolean;
  
  /** Kalibrasyon ağırlığı (0-1) */
  calibrationWeight: number;
}

/**
 * API Tahmin verisi (API-Football'dan gelen)
 */
export interface APIPrediction {
  homeWinPercent: number;
  drawPercent: number;
  awayWinPercent: number;
  advice?: string | null;
  underOver?: string | null;
}
