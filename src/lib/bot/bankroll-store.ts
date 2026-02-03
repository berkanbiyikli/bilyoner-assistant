/**
 * Bankroll Store - Kasa Yönetimi (Zustand + localStorage + Redis)
 * 
 * 500 TL başlangıç kasası, Kelly Criterion %0.1
 * Server-side: Upstash Redis ile kalıcı storage
 * Client-side: Zustand + localStorage
 */

import { create } from 'zustand';
import { Redis } from '@upstash/redis';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  BankrollState, 
  BankrollHistoryItem, 
  BotCoupon,
  BotConfig,
  DEFAULT_BOT_CONFIG 
} from './types';
import { DEFAULT_STREAK_INFO } from './streak-tracker';
import { DEFAULT_AI_LEARNING_STATS } from './ai-learning';

// ============ STORE INTERFACE ============

interface BankrollStore extends BankrollState {
  // Aksiyonlar
  placeBet: (coupon: BotCoupon) => void;
  settleBet: (coupon: BotCoupon) => void;
  setActiveCoupon: (coupon: BotCoupon | null) => void;
  resetBankroll: () => void;
  updateBalance: (amount: number, description: string) => void;
  
  // Getters
  getWinRate: () => number;
  getROI: () => number;
  getProfitLoss: () => number;
}

// ============ INITIAL STATE ============

const INITIAL_BALANCE = 500; // TL

/**
 * Bugünün tarihini YYYY-MM-DD formatında döndür
 */
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

const initialState: BankrollState = {
  balance: INITIAL_BALANCE,
  initialBalance: INITIAL_BALANCE,
  totalBets: 0,
  wonBets: 0,
  lostBets: 0,
  totalStaked: 0,
  totalWon: 0,
  activeCoupon: null,
  history: [],
  lastUpdated: new Date(),
  dailyCoupons: {
    date: getTodayDateString(),
    count: 0,
    couponIds: [],
  },
  // 🔥 Streak Takibi
  streak: DEFAULT_STREAK_INFO,
  // 🤖 AI Öğrenme
  aiLearning: DEFAULT_AI_LEARNING_STATS,
};

// ============ STORE ============

export const useBankrollStore = create<BankrollStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      /**
       * Yeni bahis yerleştir
       */
      placeBet: (coupon: BotCoupon) => {
        const state = get();
        
        if (coupon.stake > state.balance) {
          console.error('[Bankroll] Yetersiz bakiye!');
          return;
        }
        
        const newBalance = state.balance - coupon.stake;
        
        const historyItem: BankrollHistoryItem = {
          id: `H-${Date.now()}`,
          date: new Date(),
          type: 'bet_placed',
          couponId: coupon.id,
          amount: -coupon.stake,
          balanceAfter: newBalance,
          description: `Kupon: ${coupon.matches.map(m => `${m.homeTeam} vs ${m.awayTeam}`).join(' | ')}`,
        };
        
        set({
          balance: newBalance,
          totalBets: state.totalBets + 1,
          totalStaked: state.totalStaked + coupon.stake,
          activeCoupon: coupon,
          history: [historyItem, ...state.history].slice(0, 100), // Max 100 kayıt
          lastUpdated: new Date(),
        });
        
        console.log(`[Bankroll] Bahis yerleştirildi: ${coupon.stake} TL, Yeni bakiye: ${newBalance} TL`);
      },
      
      /**
       * Bahis sonucunu işle
       */
      settleBet: (coupon: BotCoupon) => {
        const state = get();
        
        if (!coupon.result) {
          console.error('[Bankroll] Kupon sonucu yok!');
          return;
        }
        
        const isWon = coupon.status === 'won';
        const winAmount = isWon ? coupon.potentialWin : 0;
        const newBalance = state.balance + winAmount;
        
        const historyItem: BankrollHistoryItem = {
          id: `H-${Date.now()}`,
          date: new Date(),
          type: isWon ? 'bet_won' : 'bet_lost',
          couponId: coupon.id,
          amount: isWon ? coupon.result.profit : -coupon.stake,
          balanceAfter: newBalance,
          description: isWon 
            ? `✅ Kazandı! +${coupon.result.profit.toFixed(2)} TL`
            : `❌ Kaybetti! -${coupon.stake.toFixed(2)} TL`,
        };
        
        set({
          balance: newBalance,
          wonBets: isWon ? state.wonBets + 1 : state.wonBets,
          lostBets: isWon ? state.lostBets : state.lostBets + 1,
          totalWon: state.totalWon + winAmount,
          activeCoupon: null,
          history: [historyItem, ...state.history].slice(0, 100),
          lastUpdated: new Date(),
        });
        
        console.log(`[Bankroll] Bahis sonuçlandı: ${isWon ? 'KAZANDI' : 'KAYBETTİ'}, Yeni bakiye: ${newBalance} TL`);
      },
      
      /**
       * Aktif kuponu ayarla
       */
      setActiveCoupon: (coupon: BotCoupon | null) => {
        set({ activeCoupon: coupon, lastUpdated: new Date() });
      },
      
      /**
       * Kasayı sıfırla
       */
      resetBankroll: () => {
        const historyItem: BankrollHistoryItem = {
          id: `H-${Date.now()}`,
          date: new Date(),
          type: 'deposit',
          amount: INITIAL_BALANCE,
          balanceAfter: INITIAL_BALANCE,
          description: '🔄 Kasa sıfırlandı',
        };
        
        set({
          ...initialState,
          history: [historyItem],
          lastUpdated: new Date(),
        });
      },
      
      /**
       * Bakiyeyi manuel güncelle
       */
      updateBalance: (amount: number, description: string) => {
        const state = get();
        const newBalance = state.balance + amount;
        
        const historyItem: BankrollHistoryItem = {
          id: `H-${Date.now()}`,
          date: new Date(),
          type: amount > 0 ? 'deposit' : 'withdrawal',
          amount,
          balanceAfter: newBalance,
          description,
        };
        
        set({
          balance: newBalance,
          history: [historyItem, ...state.history].slice(0, 100),
          lastUpdated: new Date(),
        });
      },
      
      // ============ GETTERS ============
      
      /**
       * Kazanma oranı (%)
       */
      getWinRate: () => {
        const { wonBets, totalBets } = get();
        if (totalBets === 0) return 0;
        return (wonBets / totalBets) * 100;
      },
      
      /**
       * ROI (Return on Investment) (%)
       */
      getROI: () => {
        const { totalStaked, totalWon } = get();
        if (totalStaked === 0) return 0;
        return ((totalWon - totalStaked) / totalStaked) * 100;
      },
      
      /**
       * Toplam kar/zarar
       */
      getProfitLoss: () => {
        const { balance, initialBalance } = get();
        return balance - initialBalance;
      },
    }),
    {
      name: 'bilyoner-bot-bankroll',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        balance: state.balance,
        initialBalance: state.initialBalance,
        totalBets: state.totalBets,
        wonBets: state.wonBets,
        lostBets: state.lostBets,
        totalStaked: state.totalStaked,
        totalWon: state.totalWon,
        activeCoupon: state.activeCoupon,
        history: state.history,
        lastUpdated: state.lastUpdated,
      }),
    }
  )
);

// ============ HELPERS ============

/**
 * Kelly Criterion ile stake hesapla
 */
export function calculateBotStake(
  probability: number,
  odds: number,
  bankroll: number,
  config: typeof DEFAULT_BOT_CONFIG
): number {
  // Kelly Formula: f* = (bp - q) / b
  // b = decimal odds - 1
  // p = probability of winning
  // q = 1 - p
  
  const b = odds - 1;
  const p = probability;
  const q = 1 - p;
  
  const kelly = (b * p - q) / b;
  
  // Negatif Kelly = değersiz bahis
  if (kelly <= 0) return 0;
  
  // %0.1 Kelly uygula (çok muhafazakar)
  let stake = bankroll * kelly * config.kellyFraction;
  
  // Limitleri uygula
  stake = Math.max(config.minStake, Math.min(config.maxStake, stake));
  
  return Math.round(stake * 100) / 100;
}

/**
 * Bankroll state'ini JSON olarak dışa aktar
 */
export function exportBankrollState(): BankrollState {
  return useBankrollStore.getState();
}

/**
 * Bankroll istatistiklerini al
 */
export function getBankrollStats() {
  const state = useBankrollStore.getState();
  
  return {
    balance: state.balance,
    profitLoss: state.balance - state.initialBalance,
    totalBets: state.totalBets,
    wonBets: state.wonBets,
    lostBets: state.lostBets,
    winRate: state.totalBets > 0 ? (state.wonBets / state.totalBets) * 100 : 0,
    roi: state.totalStaked > 0 ? ((state.totalWon - state.totalStaked) / state.totalStaked) * 100 : 0,
    avgStake: state.totalBets > 0 ? state.totalStaked / state.totalBets : 0,
    hasActiveCoupon: !!state.activeCoupon,
  };
}

// ============ SERVER-SIDE STATE (Vercel KV veya Environment Variable) ============

// Initial state for server-side
const INITIAL_SERVER_STATE: BankrollState = {
  balance: 500,
  initialBalance: 500,
  totalBets: 0,
  wonBets: 0,
  lostBets: 0,
  totalStaked: 0,
  totalWon: 0,
  dailyCoupons: {
    date: getTodayDateString(),
    count: 0,
    couponIds: [],
  },
  // 🔥 Streak Takibi
  streak: DEFAULT_STREAK_INFO,
  // 🤖 AI Öğrenme
  aiLearning: DEFAULT_AI_LEARNING_STATS,
  activeCoupon: null,
  history: [],
  lastUpdated: new Date(),
};

// In-memory cache for serverless (persists within same instance)
let serverStateCache: BankrollState | null = null;

// Redis key for bot state
const REDIS_STATE_KEY = 'bilyoner:bot:state';

// Redis client singleton
let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  
  // Vercel KV isimlendirmesi veya standart Upstash isimlendirmesi
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    console.log('[Bankroll] Redis credentials not found, using memory cache');
    return null;
  }
  
  redis = new Redis({ url, token });
  return redis;
}

/**
 * Server-side state'i yükle
 * Önce Redis, yoksa memory cache, yoksa default state
 */
export async function getBankrollState(): Promise<BankrollState> {
  // Memory cache varsa döndür (aynı instance için hızlı)
  if (serverStateCache) {
    return serverStateCache;
  }
  
  // Redis'ten oku
  const redisClient = getRedis();
  if (redisClient) {
    try {
      const stored = await redisClient.get<string>(REDIS_STATE_KEY);
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const parsedState: BankrollState = {
          ...INITIAL_SERVER_STATE,
          ...parsed,
          lastUpdated: new Date(parsed.lastUpdated),
          activeCoupon: parsed.activeCoupon ? {
            ...parsed.activeCoupon,
            createdAt: new Date(parsed.activeCoupon.createdAt),
            matches: parsed.activeCoupon.matches.map((m: any) => ({
              ...m,
              kickoff: new Date(m.kickoff),
            })),
          } : null,
        };
        serverStateCache = parsedState;
        console.log('[Bankroll] State Redis\'ten yüklendi, activeCoupon:', parsedState.activeCoupon?.id || 'yok');
        return parsedState;
      }
    } catch (e) {
      console.error('[Bankroll] Redis okuma hatası:', e);
    }
  }
  
  // Fallback: Environment variable'dan state oku
  const stateJson = process.env.BOT_STATE;
  if (stateJson) {
    try {
      const parsed = JSON.parse(stateJson);
      const parsedState: BankrollState = {
        ...INITIAL_SERVER_STATE,
        ...parsed,
        lastUpdated: new Date(parsed.lastUpdated),
        activeCoupon: parsed.activeCoupon ? {
          ...parsed.activeCoupon,
          createdAt: new Date(parsed.activeCoupon.createdAt),
          matches: parsed.activeCoupon.matches.map((m: any) => ({
            ...m,
            kickoff: new Date(m.kickoff),
          })),
        } : null,
      };
      serverStateCache = parsedState;
      return parsedState;
    } catch (e) {
      console.error('[Bankroll] ENV State parse hatası:', e);
    }
  }
  
  // Default state döndür
  console.log('[Bankroll] Default state kullanılıyor');
  const defaultState = { ...INITIAL_SERVER_STATE };
  serverStateCache = defaultState;
  return defaultState;
}

/**
 * Server-side state'i kaydet
 * Redis'e yaz, memory cache'i güncelle
 */
export async function saveBankrollState(state: BankrollState): Promise<void> {
  // Memory cache güncelle
  serverStateCache = state;
  
  // State'i console'a log yaz (debug için)
  console.log('[Bankroll] State güncellendi:', JSON.stringify({
    balance: state.balance,
    totalBets: state.totalBets,
    wonBets: state.wonBets,
    lostBets: state.lostBets,
    dailyCoupons: state.dailyCoupons,
    activeCoupon: state.activeCoupon?.id || null,
  }));
  
  // Redis'e kaydet
  const redisClient = getRedis();
  if (redisClient) {
    try {
      await redisClient.set(REDIS_STATE_KEY, JSON.stringify(state));
      console.log('[Bankroll] State Redis\'e kaydedildi');
    } catch (e) {
      console.error('[Bankroll] Redis yazma hatası:', e);
    }
  } else {
    console.warn('[Bankroll] Redis bağlantısı yok, state sadece memory\'de');
  }
}

// ============ GÜNLÜK LİMİT FONKSİYONLARI ============

/**
 * Günlük kupon sayısını kontrol et
 * Yeni gün başladıysa sayaç sıfırlanır
 */
export function getDailyCouponCount(state: BankrollState): number {
  const today = getTodayDateString();
  
  // Yeni gün başladıysa 0 döndür
  if (!state.dailyCoupons || state.dailyCoupons.date !== today) {
    return 0;
  }
  
  return state.dailyCoupons.count;
}

/**
 * Günlük limit doldu mu?
 */
export function isDailyLimitReached(state: BankrollState, maxDaily: number = 3): boolean {
  return getDailyCouponCount(state) >= maxDaily;
}

/**
 * Günlük kupon sayısını artır
 */
export function incrementDailyCoupon(state: BankrollState, couponId: string): BankrollState {
  const today = getTodayDateString();
  
  // Yeni gün mü?
  if (!state.dailyCoupons || state.dailyCoupons.date !== today) {
    return {
      ...state,
      dailyCoupons: {
        date: today,
        count: 1,
        couponIds: [couponId],
      },
    };
  }
  
  // Mevcut güne ekle
  return {
    ...state,
    dailyCoupons: {
      ...state.dailyCoupons,
      count: state.dailyCoupons.count + 1,
      couponIds: [...state.dailyCoupons.couponIds, couponId],
    },
  };
}

/**
 * Günlük kalan kupon hakkı
 */
export function getRemainingDailyCoupons(state: BankrollState, maxDaily: number = 3): number {
  return Math.max(0, maxDaily - getDailyCouponCount(state));
}

