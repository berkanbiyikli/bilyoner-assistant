/**
 * Bankroll Store - Kasa Yönetimi (Zustand + localStorage)
 * 
 * 500 TL başlangıç kasası, Kelly Criterion %0.1
 * Tam client-side, veritabanı yok
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  BankrollState, 
  BankrollHistoryItem, 
  BotCoupon,
  BotConfig,
  DEFAULT_BOT_CONFIG 
} from './types';

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
  activeCoupon: null,
  history: [],
  lastUpdated: new Date(),
};

// In-memory cache for serverless (persists within same instance)
let serverStateCache: BankrollState | null = null;

/**
 * Server-side state'i yükle
 * Vercel KV yoksa environment variable kullan
 */
export async function getBankrollState(): Promise<BankrollState> {
  // Cache varsa döndür
  if (serverStateCache) {
    return serverStateCache;
  }
  
  // Environment variable'dan state oku
  const stateJson = process.env.BOT_STATE;
  
  if (stateJson) {
    try {
      const parsed = JSON.parse(stateJson);
      const parsedState: BankrollState = {
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
      console.error('[Bankroll] State parse hatası:', e);
    }
  }
  
  // Default state döndür
  const defaultState = { ...INITIAL_SERVER_STATE };
  serverStateCache = defaultState;
  return defaultState;
}

/**
 * Server-side state'i kaydet
 * Console'a log yaz (Vercel logs'da görülebilir)
 */
export async function saveBankrollState(state: BankrollState): Promise<void> {
  serverStateCache = state;
  
  // State'i console'a log yaz (debug için)
  console.log('[Bankroll] State güncellendi:', JSON.stringify({
    balance: state.balance,
    totalBets: state.totalBets,
    wonBets: state.wonBets,
    lostBets: state.lostBets,
    activeCoupon: state.activeCoupon?.id || null,
  }));
  
  // TODO: Vercel KV veya Upstash Redis entegrasyonu
  // await kv.set('bot-state', JSON.stringify(state));
}
