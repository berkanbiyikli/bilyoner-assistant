/**
 * Bankroll Store - Zustand
 * Kasa yönetimi, risk limitleri, P&L tracking
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BankrollBet {
  id: string;
  fixtureId?: number;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  odds: number;
  amount: number;
  confidence: number;
  result: 'pending' | 'won' | 'lost' | 'void';
  returns: number;
  createdAt: string;
  settledAt?: string;
}

export interface DailyPnL {
  date: string;
  openingBalance: number;
  closingBalance: number;
  totalStaked: number;
  totalReturns: number;
  betsPlaced: number;
  betsWon: number;
  betsLost: number;
  profitLoss: number;
  roi: number;
}

export interface RiskLimits {
  dailyLossLimit: number;
  weeklyLossLimit: number;
  maxBetPercentage: number;
  maxSingleBet: number;
  kellyFraction: number;
}

export interface BankrollStats {
  totalBets: number;
  totalWon: number;
  totalLost: number;
  totalVoid: number;
  totalStaked: number;
  totalReturns: number;
  winRate: number;
  roi: number;
  avgOdds: number;
  avgStake: number;
  profitLoss: number;
  currentStreak: number;
  bestStreak: number;
  worstStreak: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
}

interface BankrollState {
  // Core
  initialBalance: number;
  currentBalance: number;
  currency: string;
  
  // Bets
  bets: BankrollBet[];
  
  // Daily snapshots
  dailySnapshots: DailyPnL[];
  
  // Risk limits
  riskLimits: RiskLimits;
  
  // Streak tracking
  currentStreak: number;
  bestStreak: number;
  worstStreak: number;
  
  // Actions
  setInitialBalance: (amount: number) => void;
  deposit: (amount: number) => void;
  withdraw: (amount: number) => void;
  placeBet: (bet: Omit<BankrollBet, 'id' | 'result' | 'returns' | 'createdAt'>) => string;
  settleBet: (betId: string, result: 'won' | 'lost' | 'void') => void;
  updateRiskLimits: (limits: Partial<RiskLimits>) => void;
  resetBankroll: () => void;
  
  // Computed
  getStats: () => BankrollStats;
  getTodayPnL: () => DailyPnL;
  getWeeklyPnL: () => DailyPnL[];
  getDailyLossUsed: () => number;
  getWeeklyLossUsed: () => number;
  isWithinLimits: (amount: number) => { allowed: boolean; reason?: string };
  getDrawdownHistory: () => { date: string; drawdown: number; drawdownPct: number }[];
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

const DEFAULT_RISK_LIMITS: RiskLimits = {
  dailyLossLimit: 200,
  weeklyLossLimit: 500,
  maxBetPercentage: 5,
  maxSingleBet: 500,
  kellyFraction: 0.25,
};

export const useBankrollStore = create<BankrollState>()(
  persist(
    (set, get) => ({
      initialBalance: 1000,
      currentBalance: 1000,
      currency: 'TRY',
      bets: [],
      dailySnapshots: [],
      riskLimits: { ...DEFAULT_RISK_LIMITS },
      currentStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
      
      setInitialBalance: (amount) => set({ initialBalance: amount, currentBalance: amount }),
      
      deposit: (amount) => set((state) => ({
        currentBalance: Math.round((state.currentBalance + amount) * 100) / 100,
      })),
      
      withdraw: (amount) => set((state) => ({
        currentBalance: Math.round((state.currentBalance - amount) * 100) / 100,
      })),
      
      placeBet: (betInput) => {
        const id = generateId();
        const bet: BankrollBet = {
          ...betInput,
          id,
          result: 'pending',
          returns: 0,
          createdAt: new Date().toISOString(),
        };
        
        set((state) => ({
          bets: [bet, ...state.bets],
          currentBalance: Math.round((state.currentBalance - betInput.amount) * 100) / 100,
        }));
        
        return id;
      },
      
      settleBet: (betId, result) => {
        set((state) => {
          const betIndex = state.bets.findIndex((b) => b.id === betId);
          if (betIndex === -1) return state;
          
          const bet = state.bets[betIndex];
          if (bet.result !== 'pending') return state;
          
          let returns = 0;
          let balanceChange = 0;
          let newStreak = state.currentStreak;
          
          if (result === 'won') {
            returns = Math.round(bet.amount * bet.odds * 100) / 100;
            balanceChange = returns;
            newStreak = newStreak >= 0 ? newStreak + 1 : 1;
          } else if (result === 'lost') {
            returns = 0;
            balanceChange = 0;
            newStreak = newStreak <= 0 ? newStreak - 1 : -1;
          } else {
            // void - para iadesi
            returns = bet.amount;
            balanceChange = bet.amount;
          }
          
          const updatedBets = [...state.bets];
          updatedBets[betIndex] = {
            ...bet,
            result,
            returns,
            settledAt: new Date().toISOString(),
          };
          
          const newBest = Math.max(state.bestStreak, newStreak);
          const newWorst = Math.min(state.worstStreak, newStreak);
          
          // Update daily snapshot
          const today = getToday();
          const snapshots = [...state.dailySnapshots];
          let todaySnapshot = snapshots.find((s) => s.date === today);
          
          if (!todaySnapshot) {
            todaySnapshot = {
              date: today,
              openingBalance: state.currentBalance,
              closingBalance: state.currentBalance + balanceChange,
              totalStaked: bet.amount,
              totalReturns: returns,
              betsPlaced: 1,
              betsWon: result === 'won' ? 1 : 0,
              betsLost: result === 'lost' ? 1 : 0,
              profitLoss: returns - bet.amount,
              roi: bet.amount > 0 ? ((returns - bet.amount) / bet.amount) * 100 : 0,
            };
            snapshots.push(todaySnapshot);
          } else {
            const idx = snapshots.indexOf(todaySnapshot);
            const newClosing = state.currentBalance + balanceChange;
            const totalStaked = todaySnapshot.totalStaked + bet.amount;
            const totalReturns = todaySnapshot.totalReturns + returns;
            snapshots[idx] = {
              ...todaySnapshot,
              closingBalance: newClosing,
              totalStaked,
              totalReturns,
              betsPlaced: todaySnapshot.betsPlaced + 1,
              betsWon: todaySnapshot.betsWon + (result === 'won' ? 1 : 0),
              betsLost: todaySnapshot.betsLost + (result === 'lost' ? 1 : 0),
              profitLoss: totalReturns - totalStaked,
              roi: totalStaked > 0 ? ((totalReturns - totalStaked) / totalStaked) * 100 : 0,
            };
          }
          
          return {
            bets: updatedBets,
            currentBalance: Math.round((state.currentBalance + balanceChange) * 100) / 100,
            currentStreak: newStreak,
            bestStreak: newBest,
            worstStreak: newWorst,
            dailySnapshots: snapshots,
          };
        });
      },
      
      updateRiskLimits: (limits) => set((state) => ({
        riskLimits: { ...state.riskLimits, ...limits },
      })),
      
      resetBankroll: () => set({
        initialBalance: 1000,
        currentBalance: 1000,
        bets: [],
        dailySnapshots: [],
        currentStreak: 0,
        bestStreak: 0,
        worstStreak: 0,
      }),
      
      getStats: () => {
        const state = get();
        const settled = state.bets.filter((b) => b.result !== 'pending');
        const won = settled.filter((b) => b.result === 'won');
        const lost = settled.filter((b) => b.result === 'lost');
        const voided = settled.filter((b) => b.result === 'void');
        
        const totalStaked = settled.reduce((sum, b) => sum + b.amount, 0);
        const totalReturns = settled.reduce((sum, b) => sum + b.returns, 0);
        const profitLoss = totalReturns - totalStaked;
        const avgOdds = settled.length > 0 
          ? settled.reduce((sum, b) => sum + b.odds, 0) / settled.length 
          : 0;
        const avgStake = settled.length > 0 ? totalStaked / settled.length : 0;
        
        // Max drawdown hesapla
        let peak = state.initialBalance;
        let maxDrawdown = 0;
        let maxDrawdownPct = 0;
        let running = state.initialBalance;
        
        const sortedBets = [...settled].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        for (const bet of sortedBets) {
          running = running - bet.amount + bet.returns;
          if (running > peak) peak = running;
          const dd = peak - running;
          if (dd > maxDrawdown) {
            maxDrawdown = dd;
            maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
          }
        }
        
        return {
          totalBets: settled.length,
          totalWon: won.length,
          totalLost: lost.length,
          totalVoid: voided.length,
          totalStaked: Math.round(totalStaked * 100) / 100,
          totalReturns: Math.round(totalReturns * 100) / 100,
          winRate: settled.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0,
          roi: totalStaked > 0 ? (profitLoss / totalStaked) * 100 : 0,
          avgOdds: Math.round(avgOdds * 100) / 100,
          avgStake: Math.round(avgStake * 100) / 100,
          profitLoss: Math.round(profitLoss * 100) / 100,
          currentStreak: state.currentStreak,
          bestStreak: state.bestStreak,
          worstStreak: state.worstStreak,
          maxDrawdown: Math.round(maxDrawdown * 100) / 100,
          maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
        };
      },
      
      getTodayPnL: () => {
        const state = get();
        const today = getToday();
        return state.dailySnapshots.find((s) => s.date === today) || {
          date: today,
          openingBalance: state.currentBalance,
          closingBalance: state.currentBalance,
          totalStaked: 0,
          totalReturns: 0,
          betsPlaced: 0,
          betsWon: 0,
          betsLost: 0,
          profitLoss: 0,
          roi: 0,
        };
      },
      
      getWeeklyPnL: () => {
        const state = get();
        const weekStart = getWeekStart();
        return state.dailySnapshots.filter((s) => s.date >= weekStart);
      },
      
      getDailyLossUsed: () => {
        const state = get();
        const today = getToday();
        const todayBets = state.bets.filter((b) => {
          return b.createdAt.startsWith(today) && b.result === 'lost';
        });
        return todayBets.reduce((sum, b) => sum + b.amount, 0);
      },
      
      getWeeklyLossUsed: () => {
        const state = get();
        const weekStart = getWeekStart();
        const weekBets = state.bets.filter((b) => {
          return b.createdAt >= weekStart && b.result === 'lost';
        });
        return weekBets.reduce((sum, b) => sum + b.amount, 0);
      },
      
      isWithinLimits: (amount) => {
        const state = get();
        const { riskLimits, currentBalance } = state;
        
        // Kasa yeterli mi?
        if (amount > currentBalance) {
          return { allowed: false, reason: `Yetersiz bakiye. Kasa: ₺${currentBalance.toLocaleString('tr-TR')}` };
        }
        
        // Max bet percentage
        const maxByPct = currentBalance * (riskLimits.maxBetPercentage / 100);
        if (amount > maxByPct) {
          return { 
            allowed: false, 
            reason: `Kasanın %${riskLimits.maxBetPercentage}'ini aşıyor (max: ₺${maxByPct.toFixed(0)})` 
          };
        }
        
        // Max single bet
        if (amount > riskLimits.maxSingleBet) {
          return { 
            allowed: false, 
            reason: `Tek bahis limiti: ₺${riskLimits.maxSingleBet.toLocaleString('tr-TR')}` 
          };
        }
        
        // Daily loss limit
        const dailyLoss = state.getDailyLossUsed();
        if (dailyLoss + amount > riskLimits.dailyLossLimit) {
          return { 
            allowed: false, 
            reason: `Günlük kayıp limiti (₺${riskLimits.dailyLossLimit}) aşılacak. Bugünkü kayıp: ₺${dailyLoss.toFixed(0)}` 
          };
        }
        
        // Weekly loss limit
        const weeklyLoss = state.getWeeklyLossUsed();
        if (weeklyLoss + amount > riskLimits.weeklyLossLimit) {
          return { 
            allowed: false, 
            reason: `Haftalık kayıp limiti (₺${riskLimits.weeklyLossLimit}) aşılacak. Bu haftaki kayıp: ₺${weeklyLoss.toFixed(0)}` 
          };
        }
        
        return { allowed: true };
      },
      
      getDrawdownHistory: () => {
        const state = get();
        const sorted = [...state.dailySnapshots].sort((a, b) => a.date.localeCompare(b.date));
        
        let peak = state.initialBalance;
        return sorted.map((snap) => {
          if (snap.closingBalance > peak) peak = snap.closingBalance;
          const drawdown = peak - snap.closingBalance;
          const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
          return { date: snap.date, drawdown, drawdownPct };
        });
      },
    }),
    {
      name: 'bankroll-store',
      partialize: (state) => ({
        initialBalance: state.initialBalance,
        currentBalance: state.currentBalance,
        currency: state.currency,
        bets: state.bets,
        dailySnapshots: state.dailySnapshots,
        riskLimits: state.riskLimits,
        currentStreak: state.currentStreak,
        bestStreak: state.bestStreak,
        worstStreak: state.worstStreak,
      }),
    }
  )
);
