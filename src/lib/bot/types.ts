/**
 * Bot Types - Otomatik Kasa Takip Sistemi Tipleri
 */

import type { PlayStyle, StyleMatchup } from '../analysis/cluster-analysis';
import type { SimulationResult } from '../analysis/monte-carlo';

// ============ KUPON TİPLERİ ============

export interface BotMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  league: string;
  leagueId: number;
  kickoff: Date;
  
  // Analiz Sonuçları
  prediction: {
    type: 'home' | 'draw' | 'away' | 'over25' | 'btts';
    label: string;          // "MS 1", "KG Var", "Ü2.5" vb.
    probability: number;    // 0-1 arası
    odds: number;           // Bahis oranı
  };
  
  // Skor Metrikleri
  confidenceScore: number;    // 0-100
  valuePercent: number;       // Value yüzdesi (örn: 15.5)
  chaosLevel: number;         // 0-1 arası
  
  // Stil Analizi
  homeStyle: PlayStyle;
  awayStyle: PlayStyle;
  styleMatchup?: StyleMatchup;
  
  // Monte Carlo
  monteCarlo?: SimulationResult;
}

export interface BotCoupon {
  id: string;
  createdAt: Date;
  matches: BotMatch[];
  
  // Finansal
  totalOdds: number;
  stake: number;              // Yatırılan tutar (TL)
  potentialWin: number;       // Potansiyel kazanç
  
  // Durum
  status: 'pending' | 'won' | 'lost' | 'partial';
  
  // Tweet ID (ilk kupon tweeti)
  tweetId?: string;
  
  // Sonuç (maç bittikten sonra)
  result?: CouponResult;
}

export interface CouponResult {
  settledAt: Date;
  matchResults: {
    fixtureId: number;
    homeScore: number;
    awayScore: number;
    predictionWon: boolean;
  }[];
  totalWon: number;           // Kazanç tutarı (0 ise kayıp)
  profit: number;             // Net kar/zarar (kazanç - stake)
}

// ============ STREAK & AI LEARNING TİPLERİ ============

export interface StreakInfo {
  currentStreak: number;      // Pozitif = kazanç serisi, Negatif = kayıp serisi
  longestWinStreak: number;
  longestLoseStreak: number;
  lastResults: ('W' | 'L')[];  // Son 10 sonuç
  milestones: MilestoneEvent[];
}

export interface MilestoneEvent {
  id: string;
  type: 'total_coupons' | 'win_streak' | 'roi_target' | 'profit_target';
  value: number;              // 10, 50, 100 kupon veya %50 ROI gibi
  achievedAt: Date;
  tweeted: boolean;
}

export interface AILearningStats {
  // Lig performansı
  leaguePerformance: Record<number, {
    leagueName: string;
    totalPredictions: number;
    correctPredictions: number;
    winRate: number;
    avgValue: number;
    profit: number;
  }>;
  
  // Tahmin tipi performansı
  predictionTypePerformance: Record<string, {
    type: string;             // 'home', 'draw', 'away', 'over25', 'btts'
    totalPredictions: number;
    correctPredictions: number;
    winRate: number;
    avgOdds: number;
    profit: number;
  }>;
  
  // Oran aralığı performansı
  oddsRangePerformance: {
    low: { range: string; total: number; won: number; winRate: number };
    medium: { range: string; total: number; won: number; winRate: number };
    high: { range: string; total: number; won: number; winRate: number };
  };
  
  // Güven skoru kalibrasyon
  confidenceCalibration: {
    // Confidence 70-80: Gerçek win rate ne kadar?
    ranges: Record<string, { predicted: number, actual: number, count: number }>;
  };
  
  lastUpdated: Date;
}

// ============ KASA TİPLERİ ============

export interface BankrollState {
  balance: number;            // Güncel bakiye (TL)
  initialBalance: number;     // Başlangıç kasası (500 TL)
  
  // İstatistikler
  totalBets: number;
  wonBets: number;
  lostBets: number;
  totalStaked: number;
  totalWon: number;
  
  // Günlük limit takibi
  dailyCoupons: {
    date: string;             // YYYY-MM-DD formatında
    count: number;            // O gün verilen kupon sayısı
    couponIds: string[];      // O gün verilen kupon ID'leri
  };
  
  // 🔥 Streak Takibi
  streak: StreakInfo;
  
  // 🤖 AI Öğrenme İstatistikleri
  aiLearning: AILearningStats;
  
  // Aktif kupon
  activeCoupon: BotCoupon | null;
  
  // Geçmiş
  history: BankrollHistoryItem[];
  
  // Son güncelleme
  lastUpdated: Date;
}

export interface BankrollHistoryItem {
  id: string;
  date: Date;
  type: 'bet_placed' | 'bet_won' | 'bet_lost' | 'deposit' | 'withdrawal';
  couponId?: string;
  amount: number;             // İşlem tutarı
  balanceAfter: number;       // İşlem sonrası bakiye
  description: string;
}

// ============ AYARLAR ============

export interface BotConfig {
  // Kasa
  initialBankroll: number;    // 500 TL
  kellyFraction: number;      // 0.1 (%10 Kelly)
  minStake: number;           // Minimum bahis (5 TL)
  maxStake: number;           // Maksimum bahis (50 TL)
  
  // Kupon Kriterleri
  matchCount: number;         // 3 maç
  minConfidence: number;      // 70
  maxChaosLevel: number;      // 0.5
  minValue: number;           // 15 (%)
  minKickoffMinutes: number;  // 30 dk sonra başlayanlar
  maxKickoffHours: number;    // 6 saat içinde başlayanlar
  
  // Oran Limitleri
  minMatchOdds: number;       // 1.30
  maxMatchOdds: number;       // 3.00
  minTotalOdds: number;       // 3.00
  maxTotalOdds: number;       // 10.00
  
  // Twitter
  twitterEnabled: boolean;
  tweetOnNewCoupon: boolean;
  tweetOnResult: boolean;
  
  // Günlük Limitler
  maxDailyCoupons: number;    // Günde maksimum kupon sayısı
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  initialBankroll: 500,
  kellyFraction: 1.0,        // Tam stake
  minStake: 500,             // 500 TL sabit
  maxStake: 500,             // 500 TL sabit
  
  matchCount: 3,
  minConfidence: 70,
  maxChaosLevel: 0.5,
  minValue: 15,
  minKickoffMinutes: 30,
  maxKickoffHours: 6,
  
  minMatchOdds: 1.30,
  maxMatchOdds: 3.00,
  minTotalOdds: 3.00,
  maxTotalOdds: 10.00,
  
  twitterEnabled: true,
  tweetOnNewCoupon: true,
  tweetOnResult: true,
  
  maxDailyCoupons: 3,        // Günde maksimum 3 kupon
};

// ============ TWEET TİPLERİ ============

export interface TweetData {
  type: 'new_coupon' | 'result';
  coupon: BotCoupon;
  bankroll: number;
  imageUrl?: string;
}

export interface TweetResponse {
  success: boolean;
  tweetId?: string;
  error?: string;
}
