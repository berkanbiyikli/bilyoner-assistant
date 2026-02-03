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
