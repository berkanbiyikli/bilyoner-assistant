/**
 * Filter Utilities
 * Fixture ve suggestion filtreleme fonksiyonları
 */

import { ProcessedFixture } from '@/types/api-football';
import { FilterState } from './types';
import { BILYONER_LEAGUES } from '@/config/league-priorities';

// Suggestion için tip
export interface FilterableSuggestion {
  fixture: ProcessedFixture;
  betType: string;
  odds: number;
  confidence: number;
  expectedValue: number;
}

/**
 * Maçları filtrele
 */
export function filterFixtures(
  fixtures: ProcessedFixture[],
  filters: FilterState
): ProcessedFixture[] {
  return fixtures.filter(fixture => {
    // Bilyoner Only
    if (filters.bilyonerOnly) {
      if (!BILYONER_LEAGUES.includes(fixture.league.id)) {
        return false;
      }
    }
    
    // League Filter
    if (filters.leagues.enabled && filters.leagues.selectedLeagueIds.length > 0) {
      if (!filters.leagues.selectedLeagueIds.includes(fixture.league.id)) {
        return false;
      }
    }
    
    // Match Status
    if (!filters.matchStatus.showLive && fixture.status.isLive) return false;
    if (!filters.matchStatus.showUpcoming && fixture.status.isUpcoming) return false;
    if (!filters.matchStatus.showFinished && fixture.status.isFinished) return false;
    
    // Time Range
    if (filters.timeRange.enabled) {
      const matchHour = new Date(fixture.timestamp * 1000).getHours();
      if (matchHour < filters.timeRange.startHour || matchHour > filters.timeRange.endHour) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Önerileri filtrele
 */
export function filterSuggestions(
  suggestions: FilterableSuggestion[],
  filters: FilterState
): FilterableSuggestion[] {
  return suggestions.filter(suggestion => {
    // Önce fixture filtresi
    const fixtureFilter = filterFixtures([suggestion.fixture], filters);
    if (fixtureFilter.length === 0) return false;
    
    // Odds Filter
    if (filters.odds.enabled) {
      if (suggestion.odds < filters.odds.minOdds || suggestion.odds > filters.odds.maxOdds) {
        return false;
      }
    }
    
    // Value Filter
    if (filters.value.enabled) {
      if (suggestion.expectedValue < filters.value.minValue) {
        return false;
      }
    }
    
    // Confidence Filter
    if (filters.confidence.enabled) {
      if (suggestion.confidence < filters.confidence.minConfidence) {
        return false;
      }
    }
    
    // Bet Type Filter
    if (filters.betTypes.enabled && filters.betTypes.selectedTypes.length > 0) {
      const normalizedType = normalizeBetType(suggestion.betType);
      if (!filters.betTypes.selectedTypes.includes(normalizedType)) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Bet type normalize
 */
function normalizeBetType(betType: string): string {
  const lower = betType.toLowerCase();
  
  if (lower.includes('home') || lower.includes('ms 1') || lower === '1') return 'home';
  if (lower.includes('draw') || lower.includes('ms x') || lower === 'x') return 'draw';
  if (lower.includes('away') || lower.includes('ms 2') || lower === '2') return 'away';
  if (lower.includes('over 2.5') || lower.includes('üst 2.5')) return 'over25';
  if (lower.includes('under 2.5') || lower.includes('alt 2.5')) return 'under25';
  if (lower.includes('btts') || lower.includes('kg var')) return 'btts';
  if (lower.includes('over 1.5') || lower.includes('üst 1.5')) return 'over15';
  if (lower.includes('under 3.5') || lower.includes('alt 3.5')) return 'under35';
  
  return betType;
}

/**
 * Aktif filtre özeti
 */
export function getFilterSummary(filters: FilterState): string[] {
  const summary: string[] = [];
  
  if (filters.bilyonerOnly) {
    summary.push('Sadece Bilyoner Ligleri');
  }
  
  if (filters.odds.enabled) {
    summary.push(`Oran: ${filters.odds.minOdds} - ${filters.odds.maxOdds}`);
  }
  
  if (filters.value.enabled) {
    summary.push(`Min Value: %${filters.value.minValue}`);
  }
  
  if (filters.confidence.enabled) {
    summary.push(`Min Güven: %${filters.confidence.minConfidence}`);
  }
  
  if (filters.leagues.enabled && filters.leagues.selectedLeagueIds.length > 0) {
    summary.push(`${filters.leagues.selectedLeagueIds.length} Lig Seçili`);
  }
  
  if (filters.betTypes.enabled && filters.betTypes.selectedTypes.length > 0) {
    summary.push(`${filters.betTypes.selectedTypes.length} Bahis Tipi`);
  }
  
  if (filters.timeRange.enabled) {
    summary.push(`Saat: ${filters.timeRange.startHour}:00 - ${filters.timeRange.endHour}:00`);
  }
  
  return summary;
}
