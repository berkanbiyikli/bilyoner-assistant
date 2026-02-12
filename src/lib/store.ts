// ============================================
// Global Store (Zustand)
// ============================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Coupon, CouponItem, CouponCategory, MatchPrediction, ValueBet } from "@/types";
import { calculateTotalOdds } from "@/lib/utils";

interface AppState {
  // Coupon
  activeCoupon: CouponItem[];
  couponCategory: CouponCategory;
  couponStake: number;

  // UI
  selectedLeagues: number[];
  darkMode: boolean;

  // Actions
  addToCoupon: (item: CouponItem) => void;
  removeFromCoupon: (fixtureId: number) => void;
  clearCoupon: () => void;
  setCouponCategory: (category: CouponCategory) => void;
  setCouponStake: (stake: number) => void;
  setSelectedLeagues: (leagues: number[]) => void;
  toggleDarkMode: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeCoupon: [],
      couponCategory: "balanced",
      couponStake: 100,
      selectedLeagues: [],
      darkMode: true,

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
    }),
    {
      name: "bilyoner-store",
      partialize: (state) => ({
        activeCoupon: state.activeCoupon,
        couponStake: state.couponStake,
        couponCategory: state.couponCategory,
        selectedLeagues: state.selectedLeagues,
        darkMode: state.darkMode,
      }),
    }
  )
);
