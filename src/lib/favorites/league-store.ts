/**
 * Favori Lig Store
 * Kullanıcının pinlediği ligleri takip etme
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LeagueStore {
  // Pinlenmiş lig ID'leri
  pinnedLeagues: number[];
  
  // Lig pinleme/çıkarma
  togglePin: (leagueId: number) => void;
  
  // Lig pinli mi kontrol
  isPinned: (leagueId: number) => boolean;
  
  // Tüm pinleri temizle
  clearAllPins: () => void;
  
  // Varsayılanlara dön
  resetToDefaults: () => void;
  
  // Toplu pin ayarla
  setPinnedLeagues: (leagueIds: number[]) => void;
}

// Varsayılan pinli ligler (Türkiye, Premier League, La Liga)
const DEFAULT_PINNED_LEAGUES = [203, 39, 140];

export const useLeagueStore = create<LeagueStore>()(
  persist(
    (set, get) => ({
      pinnedLeagues: DEFAULT_PINNED_LEAGUES,
      
      togglePin: (leagueId) => {
        set((state) => ({
          pinnedLeagues: state.pinnedLeagues.includes(leagueId)
            ? state.pinnedLeagues.filter(id => id !== leagueId)
            : [...state.pinnedLeagues, leagueId]
        }));
      },
      
      isPinned: (leagueId) => {
        return get().pinnedLeagues.includes(leagueId);
      },
      
      clearAllPins: () => {
        set({ pinnedLeagues: [] });
      },
      
      resetToDefaults: () => {
        set({ pinnedLeagues: DEFAULT_PINNED_LEAGUES });
      },
      
      setPinnedLeagues: (leagueIds) => {
        set({ pinnedLeagues: leagueIds });
      },
    }),
    {
      name: 'bilyoner-favorite-leagues',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Selector hooks
export const usePinnedLeagues = () => useLeagueStore((state) => state.pinnedLeagues);
export const useIsPinned = (leagueId: number) => useLeagueStore((state) => state.pinnedLeagues.includes(leagueId));
