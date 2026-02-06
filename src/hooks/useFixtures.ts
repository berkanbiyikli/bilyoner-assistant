'use client';

/**
 * Fixtures için React Query hooks
 */

import { useQuery } from '@tanstack/react-query';
import { ProcessedFixture, ProcessedStatistics, MatchEvent } from '@/types/api-football';
import { ProcessedPrediction, ProcessedOdds } from '@/lib/api-football/predictions';
import { EuropeanCupMatch } from '@/lib/api-football/european-cups';
import { TopLeagueMatch, LeagueGroup, TOP_10_LEAGUES } from '@/lib/api-football/top-leagues';
import { config } from '@/config/settings';

// API Response Types
interface FixturesResponse {
  success: boolean;
  date: string;
  count: number;
  fixtures: ProcessedFixture[];
  error?: string;
}

interface LiveFixturesResponse {
  success: boolean;
  count: number;
  fixtures: ProcessedFixture[];
  error?: string;
}

interface EnrichedLiveFixture {
  fixture: ProcessedFixture;
  statistics: ProcessedStatistics | null;
}

interface EnrichedLiveFixturesResponse {
  success: boolean;
  count: number;
  totalLive: number;
  enrichedFixtures: EnrichedLiveFixture[];
  error?: string;
}

interface FixtureDetailResponse {
  success: boolean;
  fixture: ProcessedFixture;
  statistics: ProcessedStatistics | null;
  events: MatchEvent[];
  prediction: ProcessedPrediction | null;
  odds: ProcessedOdds | null;
  error?: string;
}

interface StatisticsResponse {
  success: boolean;
  statistics: ProcessedStatistics;
  error?: string;
}

/**
 * Günün maçlarını getir
 */
export function useTodayFixtures(date?: Date) {
  const dateStr = date?.toISOString().split('T')[0];
  
  return useQuery<FixturesResponse>({
    queryKey: ['fixtures', 'today', dateStr || 'today'],
    queryFn: async () => {
      const url = dateStr ? `/api/fixtures/today?date=${dateStr}` : '/api/fixtures/today';
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    refetchInterval: config.polling.fixturesInterval,
  });
}

/**
 * Canlı maçları getir (60 saniye polling)
 */
export function useLiveFixtures() {
  return useQuery<LiveFixturesResponse>({
    queryKey: ['fixtures', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/fixtures/live');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    refetchInterval: config.polling.liveMatchInterval,
  });
}

/**
 * Canlı maçları İSTATİSTİKLERİYLE BİRLİKTE getir (60 saniye polling)
 * Hunter dashboard ve canlı analiz için kullanılır
 */
export function useLiveFixturesEnriched() {
  return useQuery<EnrichedLiveFixturesResponse>({
    queryKey: ['fixtures', 'live-enriched'],
    queryFn: async () => {
      const res = await fetch('/api/fixtures/live-enriched');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    refetchInterval: config.polling.liveMatchInterval,
  });
}

/**
 * Belirli bir maçın detaylarını getir
 */
export function useFixtureDetail(fixtureId: number | null) {
  return useQuery<FixtureDetailResponse>({
    queryKey: ['fixture', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/fixtures/${fixtureId}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    enabled: fixtureId !== null,
  });
}

/**
 * Canlı maç istatistiklerini getir (60 saniye polling)
 */
export function useLiveStatistics(fixtureId: number | null, isLive: boolean) {
  return useQuery<StatisticsResponse>({
    queryKey: ['statistics', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/fixtures/${fixtureId}/statistics`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    enabled: fixtureId !== null && isLive,
    refetchInterval: isLive ? config.polling.liveMatchInterval : false,
  });
}

// === UEFA Avrupa Kupası Hooks ===

interface EuropeanCupsResponse {
  success: boolean;
  data: {
    europaLeague: {
      id: number;
      name: string;
      logo: string;
      live: ProcessedFixture[];
      upcoming: ProcessedFixture[];
      finished: ProcessedFixture[];
    };
    conferenceLeague: {
      id: number;
      name: string;
      logo: string;
      live: ProcessedFixture[];
      upcoming: ProcessedFixture[];
      finished: ProcessedFixture[];
    };
    allMatches: EuropeanCupMatch[];
    stats: {
      total: number;
      live: number;
      upcoming: number;
      finished: number;
    };
    lastUpdated: string;
  };
}

/**
 * UEFA Avrupa Kupası maçlarını getir (Europa League + Conference League)
 */
export function useEuropeanCups(enablePolling: boolean = false) {
  return useQuery<EuropeanCupsResponse>({
    queryKey: ['european-cups'],
    queryFn: async () => {
      const res = await fetch('/api/european-cups');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'API hatası');
      return data;
    },
    refetchInterval: enablePolling ? config.polling.liveMatchInterval : false,
    staleTime: 30000, // 30 saniye
  });
}

/**
 * Tek bir Avrupa Kupası maçının detayını getir
 * Canlı maçlarda 30 saniyede bir otomatik yenilenir
 */
export function useEuropeanCupMatchDetail(fixtureId: number | null, isLive: boolean = false) {
  return useQuery<{ success: boolean; data: EuropeanCupMatch }>({
    queryKey: ['european-cup-match', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/european-cups?mode=detail&fixtureId=${fixtureId}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'API hatası');
      return data;
    },
    enabled: fixtureId !== null,
    refetchInterval: isLive ? 30000 : false, // Canlı maçlarda 30 saniyede bir yenile
    staleTime: isLive ? 15000 : 60000, // Canlı: 15sn, değilse 1dk
  });
}

// === Top 10 Ligler Hooks ===

interface TopLeaguesResponse {
  success: boolean;
  data: {
    leagues: typeof TOP_10_LEAGUES;
    leagueGroups: LeagueGroup[];
    allMatches: TopLeagueMatch[];
    byDate?: { date: string; dateLabel: string; fixtures: import('@/types/api-football').ProcessedFixture[] }[];
    stats: {
      total: number;
      live: number;
      upcoming: number;
      finished: number;
      leagueCount: number;
      daysAhead?: number;
    };
    lastUpdated: string;
  };
}

/**
 * Dünyanın en iyi 10 liginin maçlarını getir
 */
export function useTopLeagues(enablePolling: boolean = false) {
  return useQuery<TopLeaguesResponse>({
    queryKey: ['top-leagues'],
    queryFn: async () => {
      const res = await fetch('/api/top-leagues');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'API hatası');
      return data;
    },
    refetchInterval: enablePolling ? config.polling.liveMatchInterval : false,
    staleTime: 30000,
  });
}

/**
 * Tek bir Top League maçının detayını getir
 */
export function useTopLeagueMatchDetail(fixtureId: number | null, isLive: boolean = false) {
  return useQuery<{ success: boolean; data: TopLeagueMatch }>({
    queryKey: ['top-league-match', fixtureId],
    queryFn: async () => {
      const res = await fetch(`/api/top-leagues?mode=detail&fixtureId=${fixtureId}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'API hatası');
      return data;
    },
    enabled: fixtureId !== null,
    refetchInterval: isLive ? 30000 : false,
    staleTime: isLive ? 15000 : 60000,
  });
}
