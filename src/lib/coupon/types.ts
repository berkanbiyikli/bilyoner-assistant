/**
 * Kupon Sistemi - Types
 * Risk kategorileri ve kupon hesaplama tipleri
 */

import type { BetSuggestion, DailyMatchFixture } from '@/types/api-football';

// Risk kategorileri
export type RiskCategory = 'banko' | 'value' | 'surprise';

// Kategorize edilmiş bahis önerisi
export interface CategorizedBet {
  fixture: DailyMatchFixture;
  suggestion: BetSuggestion;
  category: RiskCategory;
  categoryReason: string;
}

// Kupon seçimi
export interface CouponSelection {
  id: string; // unique id
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  time: string;
  market: string;
  pick: string;
  odds: number;
  confidence: number;
  category: RiskCategory;
  addedAt: number;
}

// Sistem kuponu tipi
export type SystemType = 
  | 'single' 
  | '2/3' 
  | '3/4' 
  | '4/5' 
  | '5/6' 
  | '2/4' 
  | '3/5' 
  | '3/6'
  | 'full';

// Kombinasyon sonucu
export interface CombinationResult {
  combinations: CouponSelection[][];
  totalCombinations: number;
  totalStake: number;
  potentialWin: number;
  minWin: number;
  maxWin: number;
}

// Kupon state
export interface CouponState {
  selections: CouponSelection[];
  systemType: SystemType;
  stakePerCombination: number;
  isOpen: boolean;
}

// Kupon store actions
export interface CouponActions {
  addSelection: (selection: Omit<CouponSelection, 'id' | 'addedAt'>) => void;
  removeSelection: (id: string) => void;
  clearCoupon: () => void;
  setSystemType: (type: SystemType) => void;
  setStake: (stake: number) => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  isInCoupon: (fixtureId: number, market: string) => boolean;
  calculateCombinations: () => CombinationResult;
}

// Kategori eşik değerleri
export const CATEGORY_THRESHOLDS = {
  banko: {
    minConfidence: 80,
    maxOdds: 1.65,
    description: 'Yüksek güvenli, düşük oranlı bahisler'
  },
  value: {
    minConfidence: 60,
    maxConfidence: 79,
    minOdds: 1.60,
    maxOdds: 1.90,
    minValue: 10, // %10 expected value
    description: 'Değerli oranlı bahisler'
  },
  surprise: {
    minOdds: 2.50,
    maxConfidence: 65,
    description: 'Yüksek riskli, yüksek kazançlı bahisler'
  }
} as const;

// Kategori görsel bilgileri
export const CATEGORY_INFO: Record<RiskCategory, {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  banko: {
    label: 'Banko',
    emoji: '🔒',
    color: 'text-green-600',
    bgColor: 'bg-green-500/10 border-green-500/30',
    description: 'Düşük risk, güvenli bahisler'
  },
  value: {
    label: 'Değer',
    emoji: '💎',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    description: 'Oranı olasılığına göre yüksek'
  },
  surprise: {
    label: 'Sürpriz',
    emoji: '🎯',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
    description: 'Yüksek risk, yüksek kazanç'
  }
};
