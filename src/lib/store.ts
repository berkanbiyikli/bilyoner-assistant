// ============================================
// Global Store (Zustand)
// ============================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Coupon, CouponItem, CouponCategory, MatchPrediction, ValueBet } from "@/types";
import { calculateTotalOdds } from "@/lib/utils";

// ---- Tercih Filtreleri ----
export type MarketFilter =
  | "all"
  | "1x2"
  | "over_under"
  | "btts"
  | "htft"
  | "combo"
  | "score";

export interface PreferenceFilters {
  market: MarketFilter;
  minConfidence: number;     // 0-100
  minOdds: number;           // minimum oran
  maxOdds: number;           // maximum oran
  valueBetsOnly: boolean;    // sadece value bet
  sortBy: "confidence" | "odds" | "ev"; // sıralama
}

const DEFAULT_FILTERS: PreferenceFilters = {
  market: "all",
  minConfidence: 0,
  minOdds: 1.0,
  maxOdds: 50.0,
  valueBetsOnly: false,
  sortBy: "confidence",
};

interface AppState {
  // Coupon
  activeCoupon: CouponItem[];
  couponCategory: CouponCategory;
  couponStake: number;

  // UI
  selectedLeagues: number[];
  darkMode: boolean;

  // Tercih Filtreleri
  filters: PreferenceFilters;

  // Actions
  addToCoupon: (item: CouponItem) => void;
  removeFromCoupon: (fixtureId: number) => void;
  clearCoupon: () => void;
  setCouponCategory: (category: CouponCategory) => void;
  setCouponStake: (stake: number) => void;
  setSelectedLeagues: (leagues: number[]) => void;
  toggleDarkMode: () => void;
  setFilters: (filters: Partial<PreferenceFilters>) => void;
  resetFilters: () => void;
}

// Market filtre gruplama
export const MARKET_PICK_MAP: Record<MarketFilter, string[]> = {
  all: [],
  "1x2": ["1", "X", "2", "1X", "X2", "12"],
  over_under: ["Over 1.5", "Under 1.5", "Over 2.5", "Under 2.5", "Over 3.5", "Under 3.5", "HT Over 0.5", "HT Under 0.5"],
  btts: ["BTTS Yes", "BTTS No"],
  htft: ["1/1", "1/X", "1/2", "X/1", "X/X", "X/2", "2/1", "2/X", "2/2"],
  combo: ["1 & Over 1.5", "2 & Over 1.5"],
  score: [], // CS ile başlayanlar
};

export const MARKET_LABELS: Record<MarketFilter, string> = {
  all: "Tümü",
  "1x2": "Maç Sonucu",
  over_under: "Üst/Alt",
  btts: "KG Var/Yok",
  htft: "İY/MS",
  combo: "Kombine",
  score: "Skor",
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeCoupon: [],
      couponCategory: "balanced",
      couponStake: 100,
      selectedLeagues: [],
      darkMode: true,
      filters: DEFAULT_FILTERS,

      addToCoupon: (item) => {
        const existing = get().activeCoupon;
        const filtered = existing.filter((i) => i.fixtureId !== item.fixtureId);
        set({ activeCoupon: [...filtered, item] });
      },

      removeFromCoupon: (fixtureId) => {
        set({ activeCoupon: get().activeCoupon.filter((i) => i.fixtureId !== fixtureId) });
      },

      clearCoupon: () => set({ activeCoupon: [] }),

      setCouponCategory: (category) => set({ couponCategory: category }),
      setCouponStake: (stake) => set({ couponStake: stake }),
      setSelectedLeagues: (leagues) => set({ selectedLeagues: leagues }),
      toggleDarkMode: () => set({ darkMode: !get().darkMode }),
      setFilters: (partial) => set({ filters: { ...get().filters, ...partial } }),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
    }),
    {
      name: "bilyoner-store",
      partialize: (state) => ({
        activeCoupon: state.activeCoupon,
        couponStake: state.couponStake,
        couponCategory: state.couponCategory,
        selectedLeagues: state.selectedLeagues,
        darkMode: state.darkMode,
        filters: state.filters,
      }),
    }
  )
);
