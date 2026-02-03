/**
 * Kupon Store - Zustand
 * Kupon seçimleri ve sistem kuponu hesaplamaları
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  CouponState, 
  CouponActions, 
  CouponSelection, 
  SystemType,
  CombinationResult 
} from './types';

// Kombinasyon hesaplama (C(n,k))
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  
  return [...withFirst, ...withoutFirst];
}

// Faktöriyel hesaplama
function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// C(n,k) hesaplama
function binomial(n: number, k: number): number {
  if (k > n) return 0;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

// Sistem tipi parse
function parseSystemType(type: SystemType): { k: number; n: number } | null {
  if (type === 'single') return { k: 1, n: 1 };
  if (type === 'full') return null; // Full kombinasyon
  
  const match = type.match(/(\d+)\/(\d+)/);
  if (match) {
    return { k: parseInt(match[1]), n: parseInt(match[2]) };
  }
  return null;
}

const initialState: CouponState = {
  selections: [],
  systemType: 'full',
  stakePerCombination: 1,
  isOpen: false,
};

export const useCouponStore = create<CouponState & CouponActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addSelection: (selection) => {
        const id = `${selection.fixtureId}-${selection.market}-${Date.now()}`;
        const newSelection: CouponSelection = {
          ...selection,
          id,
          addedAt: Date.now(),
        };
        
        set((state) => ({
          selections: [...state.selections, newSelection],
          isOpen: true, // Kupon panelini aç
        }));
      },

      removeSelection: (id) => {
        set((state) => ({
          selections: state.selections.filter((s) => s.id !== id),
        }));
      },

      clearCoupon: () => {
        set({ selections: [], systemType: 'full' });
      },

      setSystemType: (type) => {
        set({ systemType: type });
      },

      setStake: (stake) => {
        set({ stakePerCombination: Math.max(0.5, stake) });
      },

      toggleOpen: () => {
        set((state) => ({ isOpen: !state.isOpen }));
      },

      setOpen: (open) => {
        set({ isOpen: open });
      },

      isInCoupon: (fixtureId, market) => {
        return get().selections.some(
          (s) => s.fixtureId === fixtureId && s.market === market
        );
      },

      calculateCombinations: () => {
        const { selections, systemType, stakePerCombination } = get();
        
        if (selections.length === 0) {
          return {
            combinations: [],
            totalCombinations: 0,
            totalStake: 0,
            potentialWin: 0,
            minWin: 0,
            maxWin: 0,
          };
        }

        // Tekli bahis
        if (systemType === 'single') {
          const combinations = selections.map(s => [s]);
          const totalStake = selections.length * stakePerCombination;
          const wins = selections.map(s => s.odds * stakePerCombination);
          
          return {
            combinations,
            totalCombinations: selections.length,
            totalStake,
            potentialWin: wins.reduce((a, b) => a + b, 0),
            minWin: Math.min(...wins),
            maxWin: Math.max(...wins),
          };
        }

        // Full kombinasyon (akümülatör)
        if (systemType === 'full') {
          const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
          const potentialWin = totalOdds * stakePerCombination;
          
          return {
            combinations: [selections],
            totalCombinations: 1,
            totalStake: stakePerCombination,
            potentialWin,
            minWin: potentialWin,
            maxWin: potentialWin,
          };
        }

        // Sistem kuponu (örn: 2/3, 3/4)
        const parsed = parseSystemType(systemType);
        if (!parsed) {
          return {
            combinations: [],
            totalCombinations: 0,
            totalStake: 0,
            potentialWin: 0,
            minWin: 0,
            maxWin: 0,
          };
        }

        const { k } = parsed;
        
        if (k > selections.length) {
          return {
            combinations: [],
            totalCombinations: 0,
            totalStake: 0,
            potentialWin: 0,
            minWin: 0,
            maxWin: 0,
          };
        }

        const combinations = getCombinations(selections, k);
        const totalCombinations = combinations.length;
        const totalStake = totalCombinations * stakePerCombination;

        // Her kombinasyonun potansiyel kazancını hesapla
        const combinationWins = combinations.map(combo => 
          combo.reduce((acc, s) => acc * s.odds, 1) * stakePerCombination
        );

        return {
          combinations,
          totalCombinations,
          totalStake,
          potentialWin: combinationWins.reduce((a, b) => a + b, 0),
          minWin: Math.min(...combinationWins),
          maxWin: Math.max(...combinationWins),
        };
      },
    }),
    {
      name: 'bilyoner-coupon',
      partialize: (state) => ({
        selections: state.selections,
        systemType: state.systemType,
        stakePerCombination: state.stakePerCombination,
      }),
    }
  )
);

// Selector hooks
export const useCouponSelections = () => useCouponStore((state) => state.selections);
export const useCouponIsOpen = () => useCouponStore((state) => state.isOpen);
export const useCouponCount = () => useCouponStore((state) => state.selections.length);
