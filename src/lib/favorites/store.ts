/**
 * Favorites Store
 * Favori maçlar ve takımları takip etme
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Favori maç
export interface FavoriteMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  time: string;
  addedAt: string;
}

// Favori takım
export interface FavoriteTeam {
  id: number;
  name: string;
  logo: string;
  league: string;
  addedAt: string;
}

// Bildirim ayarları
export interface NotificationSettings {
  matchStart: boolean;
  goals: boolean;
  halfTime: boolean;
  fullTime: boolean;
  redCards: boolean;
  valueBets: boolean;
}

interface FavoritesStore {
  // State
  matches: FavoriteMatch[];
  teams: FavoriteTeam[];
  notifications: NotificationSettings;
  
  // Match actions
  addMatch: (match: Omit<FavoriteMatch, 'addedAt'>) => void;
  removeMatch: (matchId: number) => void;
  isMatchFavorite: (matchId: number) => boolean;
  clearExpiredMatches: () => void;
  
  // Team actions
  addTeam: (team: Omit<FavoriteTeam, 'addedAt'>) => void;
  removeTeam: (teamId: number) => void;
  isTeamFavorite: (teamId: number) => boolean;
  
  // Notification actions
  updateNotifications: (settings: Partial<NotificationSettings>) => void;
  toggleNotification: (key: keyof NotificationSettings) => void;
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  matchStart: true,
  goals: true,
  halfTime: false,
  fullTime: true,
  redCards: true,
  valueBets: true,
};

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      matches: [],
      teams: [],
      notifications: DEFAULT_NOTIFICATIONS,
      
      // Match actions
      addMatch: (match) => {
        set((state) => ({
          matches: [
            { ...match, addedAt: new Date().toISOString() },
            ...state.matches.filter(m => m.id !== match.id),
          ],
        }));
      },
      
      removeMatch: (matchId) => {
        set((state) => ({
          matches: state.matches.filter(m => m.id !== matchId),
        }));
      },
      
      isMatchFavorite: (matchId) => {
        return get().matches.some(m => m.id === matchId);
      },
      
      clearExpiredMatches: () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        set((state) => ({
          matches: state.matches.filter(m => {
            const matchDate = new Date(m.date);
            return matchDate >= yesterday;
          }),
        }));
      },
      
      // Team actions
      addTeam: (team) => {
        set((state) => ({
          teams: [
            { ...team, addedAt: new Date().toISOString() },
            ...state.teams.filter(t => t.id !== team.id),
          ],
        }));
      },
      
      removeTeam: (teamId) => {
        set((state) => ({
          teams: state.teams.filter(t => t.id !== teamId),
        }));
      },
      
      isTeamFavorite: (teamId) => {
        return get().teams.some(t => t.id === teamId);
      },
      
      // Notification actions
      updateNotifications: (settings) => {
        set((state) => ({
          notifications: { ...state.notifications, ...settings },
        }));
      },
      
      toggleNotification: (key) => {
        set((state) => ({
          notifications: {
            ...state.notifications,
            [key]: !state.notifications[key],
          },
        }));
      },
    }),
    {
      name: 'bilyoner-favorites',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Selector hooks
export const useFavoriteMatches = () => useFavoritesStore((state) => state.matches);
export const useFavoriteTeams = () => useFavoritesStore((state) => state.teams);
export const useNotificationSettings = () => useFavoritesStore((state) => state.notifications);
