/**
 * Filtre Store
 * Zustand ile filter state yönetimi
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FilterState, DEFAULT_FILTER_STATE, BetTypeId } from './types';

interface FilterStore extends FilterState {
  // Actions
  setOddsRange: (min: number, max: number) => void;
  toggleOddsFilter: () => void;
  
  setMinValue: (value: number) => void;
  toggleValueFilter: () => void;
  
  setMinConfidence: (confidence: number) => void;
  toggleConfidenceFilter: () => void;
  
  setSelectedLeagues: (leagueIds: number[]) => void;
  addLeague: (leagueId: number) => void;
  removeLeague: (leagueId: number) => void;
  toggleLeagueFilter: () => void;
  
  setMatchStatus: (status: Partial<FilterState['matchStatus']>) => void;
  
  toggleBetType: (betType: BetTypeId) => void;
  toggleBetTypeFilter: () => void;
  
  setTimeRange: (start: number, end: number) => void;
  toggleTimeFilter: () => void;
  
  toggleBilyonerOnly: () => void;
  
  resetFilters: () => void;
  
  // Computed
  getActiveFilterCount: () => number;
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_FILTER_STATE,
      
      // Odds
      setOddsRange: (min, max) => set(state => ({
        odds: { ...state.odds, minOdds: min, maxOdds: max }
      })),
      toggleOddsFilter: () => set(state => ({
        odds: { ...state.odds, enabled: !state.odds.enabled }
      })),
      
      // Value
      setMinValue: (value) => set(state => ({
        value: { ...state.value, minValue: value }
      })),
      toggleValueFilter: () => set(state => ({
        value: { ...state.value, enabled: !state.value.enabled }
      })),
      
      // Confidence
      setMinConfidence: (confidence) => set(state => ({
        confidence: { ...state.confidence, minConfidence: confidence }
      })),
      toggleConfidenceFilter: () => set(state => ({
        confidence: { ...state.confidence, enabled: !state.confidence.enabled }
      })),
      
      // Leagues
      setSelectedLeagues: (leagueIds) => set(state => ({
        leagues: { ...state.leagues, selectedLeagueIds: leagueIds }
      })),
      addLeague: (leagueId) => set(state => ({
        leagues: {
          ...state.leagues,
          selectedLeagueIds: [...state.leagues.selectedLeagueIds, leagueId]
        }
      })),
      removeLeague: (leagueId) => set(state => ({
        leagues: {
          ...state.leagues,
          selectedLeagueIds: state.leagues.selectedLeagueIds.filter(id => id !== leagueId)
        }
      })),
      toggleLeagueFilter: () => set(state => ({
        leagues: { ...state.leagues, enabled: !state.leagues.enabled }
      })),
      
      // Match Status
      setMatchStatus: (status) => set(state => ({
        matchStatus: { ...state.matchStatus, ...status }
      })),
      
      // Bet Types
      toggleBetType: (betType) => set(state => {
        const selected = state.betTypes.selectedTypes;
        const newSelected = selected.includes(betType)
          ? selected.filter(t => t !== betType)
          : [...selected, betType];
        return {
          betTypes: { ...state.betTypes, selectedTypes: newSelected }
        };
      }),
      toggleBetTypeFilter: () => set(state => ({
        betTypes: { ...state.betTypes, enabled: !state.betTypes.enabled }
      })),
      
      // Time Range
      setTimeRange: (start, end) => set(state => ({
        timeRange: { ...state.timeRange, startHour: start, endHour: end }
      })),
      toggleTimeFilter: () => set(state => ({
        timeRange: { ...state.timeRange, enabled: !state.timeRange.enabled }
      })),
      
      // Bilyoner Only
      toggleBilyonerOnly: () => set(state => ({
        bilyonerOnly: !state.bilyonerOnly
      })),
      
      // Reset
      resetFilters: () => set(DEFAULT_FILTER_STATE),
      
      // Active filter count
      getActiveFilterCount: () => {
        const state = get();
        let count = 0;
        if (state.odds.enabled) count++;
        if (state.value.enabled) count++;
        if (state.confidence.enabled) count++;
        if (state.leagues.enabled && state.leagues.selectedLeagueIds.length > 0) count++;
        if (!state.matchStatus.showLive || !state.matchStatus.showUpcoming) count++;
        if (state.betTypes.enabled && state.betTypes.selectedTypes.length > 0) count++;
        if (state.timeRange.enabled) count++;
        if (state.bilyonerOnly) count++;
        return count;
      }
    }),
    {
      name: 'bilyoner-filters',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Selector hooks
export const useOddsFilter = () => useFilterStore(state => state.odds);
export const useValueFilter = () => useFilterStore(state => state.value);
export const useConfidenceFilter = () => useFilterStore(state => state.confidence);
export const useLeagueFilter = () => useFilterStore(state => state.leagues);
export const useMatchStatusFilter = () => useFilterStore(state => state.matchStatus);
export const useBetTypeFilter = () => useFilterStore(state => state.betTypes);
export const useTimeRangeFilter = () => useFilterStore(state => state.timeRange);
export const useBilyonerOnly = () => useFilterStore(state => state.bilyonerOnly);
