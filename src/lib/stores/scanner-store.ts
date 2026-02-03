/**
 * Scanner Store - Zustand Global State
 * Manages scanner results, sorting, and coupon state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  ScannerResult, 
  MatchAnalysis, 
  SortType, 
  GeneratedCoupon,
  CouponConfig 
} from '../prediction/scanner';
import { sortAnalyses, generateCoupon } from '../prediction/scanner';

interface ScannerState {
  // Scanner Results
  result: ScannerResult | null;
  isScanning: boolean;
  lastScanTime: Date | null;
  
  // Filtering & Sorting
  activeTab: 'all' | 'banko' | 'value' | 'highScoring' | 'btts';
  sortBy: SortType;
  
  // Coupon
  coupon: GeneratedCoupon | null;
  couponConfig: CouponConfig;
  
  // User preferences
  bankroll: number;
  
  // Actions
  setScanResult: (result: ScannerResult) => void;
  setIsScanning: (isScanning: boolean) => void;
  setActiveTab: (tab: ScannerState['activeTab']) => void;
  setSortBy: (sortBy: SortType) => void;
  setBankroll: (bankroll: number) => void;
  setCouponConfig: (config: Partial<CouponConfig>) => void;
  generateNewCoupon: () => void;
  clearCoupon: () => void;
  
  // Computed
  getFilteredMatches: () => MatchAnalysis[];
  getSortedMatches: () => MatchAnalysis[];
}

const DEFAULT_COUPON_CONFIG: CouponConfig = {
  targetOdds: 5.0,
  riskLevel: 'medium',
  maxMatches: 5,
  minConfidence: 60,
  minValue: 5,
  bankroll: 1000
};

export const useScannerStore = create<ScannerState>()(
  persist(
    (set, get) => ({
      // Initial State
      result: null,
      isScanning: false,
      lastScanTime: null,
      activeTab: 'banko',
      sortBy: 'confidence',
      coupon: null,
      couponConfig: DEFAULT_COUPON_CONFIG,
      bankroll: 1000,
      
      // Actions
      setScanResult: (result) => set({ 
        result, 
        lastScanTime: new Date(),
        isScanning: false 
      }),
      
      setIsScanning: (isScanning) => set({ isScanning }),
      
      setActiveTab: (activeTab) => set({ activeTab }),
      
      setSortBy: (sortBy) => set({ sortBy }),
      
      setBankroll: (bankroll) => {
        set({ 
          bankroll,
          couponConfig: { ...get().couponConfig, bankroll }
        });
      },
      
      setCouponConfig: (config) => set({ 
        couponConfig: { ...get().couponConfig, ...config }
      }),
      
      generateNewCoupon: () => {
        const { result, couponConfig, bankroll } = get();
        if (!result) return;
        
        const configWithBankroll = { ...couponConfig, bankroll };
        const newCoupon = generateCoupon(result.all, configWithBankroll);
        set({ coupon: newCoupon });
      },
      
      clearCoupon: () => set({ coupon: null }),
      
      // Computed getters
      getFilteredMatches: () => {
        const { result, activeTab } = get();
        if (!result) return [];
        
        switch (activeTab) {
          case 'banko':
            return result.banko;
          case 'value':
            return result.value;
          case 'highScoring':
            return result.highScoring;
          case 'btts':
            return result.btts;
          default:
            return result.all;
        }
      },
      
      getSortedMatches: () => {
        const { sortBy } = get();
        const filtered = get().getFilteredMatches();
        return sortAnalyses(filtered, sortBy);
      }
    }),
    {
      name: 'scanner-storage',
      partialize: (state) => ({
        activeTab: state.activeTab,
        sortBy: state.sortBy,
        bankroll: state.bankroll,
        couponConfig: state.couponConfig
      })
    }
  )
);

// Selectors for performance
export const selectIsScanning = (state: ScannerState) => state.isScanning;
export const selectResult = (state: ScannerState) => state.result;
export const selectActiveTab = (state: ScannerState) => state.activeTab;
export const selectSortBy = (state: ScannerState) => state.sortBy;
export const selectCoupon = (state: ScannerState) => state.coupon;
export const selectBankroll = (state: ScannerState) => state.bankroll;

// Helper hooks
export const useScannerResult = () => useScannerStore(selectResult);
export const useIsScanning = () => useScannerStore(selectIsScanning);
export const useActiveTab = () => useScannerStore(selectActiveTab);
export const useSortBy = () => useScannerStore(selectSortBy);
export const useCoupon = () => useScannerStore(selectCoupon);
