/**
 * Daily Matches Hooks
 * Günlük maçlar için React Query hooks
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import type { DailyMatchFixture, Referee, BetSuggestion } from '@/types/api-football';
import { config } from '@/config/settings';

interface DailyMatchesResponse {
  success: boolean;
  data: DailyMatchFixture[];
  stats: {
    total: number;
    live: number;
    upcoming: number;
    finished: number;
    leagues: number;
  };
  error?: string;
}

interface TeamStatsResponse {
  homeGoalsScored: number;
  homeGoalsConceded: number;
  awayGoalsScored: number;
  awayGoalsConceded: number;
  homeCleanSheets: number;
  awayCleanSheets: number;
  homeCleanSheetRate?: number;
  awayCleanSheetRate?: number;
  homeBttsRate?: number;
  awayBttsRate?: number;
  homeBothTeamsScored: number;
  awayBothTeamsScored: number;
  homeAvgCards: number;
  awayAvgCards: number;
  weights?: {
    SEASON: number;
    FORM: number;
  };
}

interface PlayerCardStats {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  yellowCards: number;
  redCards: number;
  totalCards: number;
  matchesPlayed: number;
  cardRate: number;
}

// Poisson Analizi tipi
interface PoissonAnalysisResponse {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  expectedTotalGoals: number;
  mostLikelyScore: string;
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over15: number;
    over25: number;
    over35: number;
    bttsYes: number;
  };
  topScores: Array<{
    score: string;
    probability: number;
  }>;
}

// Value Bet tipi
interface ValueBetResponse {
  count: number;
  bets: Array<{
    market: string;
    pick: string;
    value: number;
    edge: number;
    fairOdds: number;
    kellyStake: number;
    recommendation: 'skip' | 'consider' | 'bet' | 'strong_bet';
  }>;
  bestBet: {
    market: string;
    pick: string;
    value: number;
  } | null;
}

interface MatchDetailResponse {
  success: boolean;
  data: {
    h2hSummary?: DailyMatchFixture['h2hSummary'];
    prediction?: DailyMatchFixture['prediction'];
    formComparison?: DailyMatchFixture['formComparison'];
    lineupsAvailable: boolean;
    refereeStats?: Referee;
    betSuggestions?: BetSuggestion[];
    teamStats?: TeamStatsResponse;
    playerCards?: {
      home: PlayerCardStats[];
      away: PlayerCardStats[];
    };
    // Yeni alanlar
    poissonAnalysis?: PoissonAnalysisResponse;
    valueBets?: ValueBetResponse;
    // API Ensemble Validation (Faz 2)
    apiValidation?: {
      label: 'high' | 'medium' | 'risky' | 'avoid';
      deviation: number;
      message: string;
    };
  };
  error?: string;
}

/**
 * Günlük maçları getir
 * @param date Tarih (varsayılan: bugün)
 * @param leagueIds Filtrelenecek lig ID'leri (boş = tüm ligler)
 */
export function useDailyMatches(date?: Date, leagueIds?: number[]) {
  // Local timezone kullan (UTC değil) - Türkiye saatine göre doğru tarih
  const dateStr = date 
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : 'today';
  
  return useQuery<DailyMatchesResponse>({
    queryKey: ['daily-matches', dateStr, leagueIds?.join(',') || 'all'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (date) params.set('date', date.toISOString().split('T')[0]);
      if (leagueIds && leagueIds.length > 0) {
        params.set('leagues', leagueIds.join(','));
      }
      
      const res = await fetch(`/api/daily-matches?${params.toString()}`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch daily matches');
      }
      
      return data;
    },
    staleTime: 300000, // 5 dakika - sık refetch'i engelle
    refetchInterval: config.polling.fixturesInterval, // Sabit interval (canlı maçlar /live sayfasında)
    refetchOnWindowFocus: false, // Pencere odaklanınca refetch yapma
    structuralSharing: true, // Veri değişmediyse referansı koru
  });
}

/**
 * Sadece canlı maçları getir
 */
export function useLiveDailyMatches() {
  return useQuery<DailyMatchesResponse>({
    queryKey: ['daily-matches', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/daily-matches?live=true');
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch live matches');
      }
      
      return data;
    },
    staleTime: 30000, // 30 saniye
    refetchInterval: config.polling.liveMatchInterval, // 60 saniye
  });
}

/**
 * Maç detaylarını on-demand getir (accordion açıldığında)
 * @param fixtureId Maç ID
 * @param homeTeamId Ev sahibi takım ID
 * @param awayTeamId Deplasman takım ID
 * @param leagueId Lig ID (sezon istatistikleri için)
 * @param refereeName Hakem adı (opsiyonel)
 * @param isExpanded Accordion açık mı (fetch tetikleyici)
 */
export function useMatchDetail(
  fixtureId: number,
  homeTeamId: number,
  awayTeamId: number,
  leagueId?: number,
  refereeName?: string,
  isExpanded: boolean = false
) {
  return useQuery<MatchDetailResponse>({
    queryKey: ['match-detail', fixtureId],
    queryFn: async () => {
      const params = new URLSearchParams({
        fixtureId: fixtureId.toString(),
        homeTeamId: homeTeamId.toString(),
        awayTeamId: awayTeamId.toString(),
      });
      
      if (leagueId) {
        params.set('leagueId', leagueId.toString());
      }
      
      if (refereeName) {
        params.set('referee', refereeName);
      }
      
      const res = await fetch(`/api/match-detail?${params.toString()}`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch match details');
      }
      
      return data;
    },
    staleTime: 180000, // 3 dakika
    enabled: isExpanded, // Sadece accordion açıksa fetch et
  });
}

/**
 * Hakem istatistiklerini getir
 * @param refereeId Hakem ID veya adı
 * @param enabled Fetch tetikleyici
 */
export function useRefereeStats(refereeId: string | number | null, enabled: boolean = true) {
  return useQuery<{ success: boolean; data: Referee }>({
    queryKey: ['referee-stats', refereeId],
    queryFn: async () => {
      if (!refereeId) throw new Error('Referee ID is required');
      
      const res = await fetch(`/api/referees/${encodeURIComponent(refereeId)}`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch referee stats');
      }
      
      return data;
    },
    staleTime: 43200000, // 12 saat (ISR ile uyumlu)
    enabled: enabled && !!refereeId,
  });
}

/**
 * Birden fazla maç için detay bilgilerini batch olarak çek
 * API limitlerini korumak için sınırlı sayıda maç çeker
 * Paralel yerine sıralı çalışır (rate limit koruması)
 * Sadece upcoming (henüz başlamamış) maçları öncelikli çeker
 */
export function useBatchMatchDetails(
  fixtures: DailyMatchFixture[],
  enabled: boolean = false,
  maxMatches: number = 20
) {
  // Sadece henüz başlamamış (upcoming) maçları al - canlı/bitmiş maçlar hariç
  const eligibleFixtures = fixtures.filter(f => f.status.isUpcoming);
  // Sadece ilk N maçı al (API limitleri için)
  const limitedFixtures = eligibleFixtures.slice(0, maxMatches);
  // Stabil query key - sadece fixture ID'leri değiştiğinde refetch et
  const fixtureIds = limitedFixtures.map(f => f.id).sort().join(',');
  
  return useQuery<Map<number, MatchDetailResponse['data']>>({
    queryKey: ['batch-match-details', fixtureIds],
    queryFn: async () => {
      const detailsMap = new Map<number, MatchDetailResponse['data']>();
      
      // Sıralı olarak maç detaylarını çek (rate limit koruması)
      // Her seferinde 5'li gruplar halinde paralel çek
      const BATCH_SIZE = 5;
      for (let i = 0; i < limitedFixtures.length; i += BATCH_SIZE) {
        const batch = limitedFixtures.slice(i, i + BATCH_SIZE);
        
        const promises = batch.map(async (fixture) => {
          try {
            const params = new URLSearchParams({
              fixtureId: fixture.id.toString(),
              homeTeamId: fixture.homeTeam.id.toString(),
              awayTeamId: fixture.awayTeam.id.toString(),
            });
            
            if (fixture.league?.id) {
              params.set('leagueId', fixture.league.id.toString());
            }
            
            if (fixture.referee?.name) {
              params.set('referee', fixture.referee.name);
            }
            
            const res = await fetch(`/api/match-detail?${params.toString()}`);
            const data: MatchDetailResponse = await res.json();
            
            if (data.success) {
              detailsMap.set(fixture.id, data.data);
            }
          } catch (error) {
            console.error(`[Batch Details] Error for fixture ${fixture.id}:`, error);
          }
        });
        
        await Promise.all(promises);
        
        // Batch'ler arasında kısa bekleme (rate limit koruması)
        if (i + BATCH_SIZE < limitedFixtures.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      return detailsMap;
    },
    staleTime: 600000, // 10 dakika - batch detayları sık değişmez
    refetchOnWindowFocus: false,
    enabled: enabled && limitedFixtures.length > 0,
  });
}
