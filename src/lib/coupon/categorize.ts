/**
 * Kupon Kategorilendirme
 * Bahis önerilerini risk kategorilerine ayırma
 */

import type { BetSuggestion, DailyMatchFixture } from '@/types/api-football';
import type { RiskCategory, CategorizedBet } from './types';
import { CATEGORY_THRESHOLDS } from './types';

/**
 * Tek bir bahis önerisini kategorize et
 */
export function categorizeBet(
  fixture: DailyMatchFixture,
  suggestion: BetSuggestion
): CategorizedBet {
  const { confidence, odds, value } = suggestion;
  const numericValue = value === 'high' ? 15 : value === 'medium' ? 8 : 3;
  
  let category: RiskCategory;
  let categoryReason: string;

  // BANKO: Yüksek güven (%80+), düşük oran (≤1.65)
  if (
    confidence >= CATEGORY_THRESHOLDS.banko.minConfidence &&
    odds <= CATEGORY_THRESHOLDS.banko.maxOdds
  ) {
    category = 'banko';
    categoryReason = `%${confidence} güven, ${odds.toFixed(2)} oran - Güvenli seçim`;
  }
  // SÜRPRİZ: Yüksek oran (≥2.50), düşük-orta güven
  else if (
    odds >= CATEGORY_THRESHOLDS.surprise.minOdds &&
    confidence <= CATEGORY_THRESHOLDS.surprise.maxConfidence
  ) {
    category = 'surprise';
    categoryReason = `${odds.toFixed(2)} yüksek oran - Sürpriz potansiyeli`;
  }
  // DEĞER: Orta güven, iyi oran/değer oranı
  else if (
    confidence >= CATEGORY_THRESHOLDS.value.minConfidence &&
    confidence <= CATEGORY_THRESHOLDS.value.maxConfidence &&
    odds >= CATEGORY_THRESHOLDS.value.minOdds &&
    odds <= CATEGORY_THRESHOLDS.value.maxOdds
  ) {
    category = 'value';
    categoryReason = `Değerli oran - Olasılığa göre ${odds.toFixed(2)} yüksek`;
  }
  // DEĞER: Yüksek expected value
  else if (numericValue >= CATEGORY_THRESHOLDS.value.minValue) {
    category = 'value';
    categoryReason = `Yüksek değer - %${numericValue} beklenen getiri`;
  }
  // Varsayılan: Güvene göre kategorize
  else if (confidence >= 75) {
    category = 'banko';
    categoryReason = `%${confidence} güven - Güçlü tahmin`;
  } else if (confidence >= 55) {
    category = 'value';
    categoryReason = `%${confidence} güven, ${odds.toFixed(2)} oran`;
  } else {
    category = 'surprise';
    categoryReason = `Risk/Ödül dengeli seçim`;
  }

  return {
    fixture,
    suggestion,
    category,
    categoryReason,
  };
}

/**
 * Tüm maçların önerilerini kategorize et
 */
export function categorizeAllBets(
  fixtures: DailyMatchFixture[],
  getSuggestions: (fixture: DailyMatchFixture) => BetSuggestion[] | undefined
): Map<RiskCategory, CategorizedBet[]> {
  const categorized = new Map<RiskCategory, CategorizedBet[]>([
    ['banko', []],
    ['value', []],
    ['surprise', []],
  ]);

  for (const fixture of fixtures) {
    const suggestions = getSuggestions(fixture);
    if (!suggestions) continue;

    // Her maçtan en iyi 2 öneriyi al (farklı tiplerden)
    const usedTypes = new Set<string>();
    const topSuggestions = suggestions
      .filter(s => {
        if (usedTypes.has(s.type)) return false;
        usedTypes.add(s.type);
        return true;
      })
      .slice(0, 2);

    for (const suggestion of topSuggestions) {
      const categorizedBet = categorizeBet(fixture, suggestion);
      categorized.get(categorizedBet.category)!.push(categorizedBet);
    }
  }

  // Her kategoriyi güvene göre sırala
  for (const [, bets] of categorized) {
    bets.sort((a, b) => b.suggestion.confidence - a.suggestion.confidence);
  }

  return categorized;
}

/**
 * Filtreleme: Belirli kategorideki bahisleri getir
 */
export function filterByCategory(
  categorizedBets: Map<RiskCategory, CategorizedBet[]>,
  category: RiskCategory
): CategorizedBet[] {
  return categorizedBets.get(category) || [];
}

/**
 * İstatistik: Kategorilerdeki bahis sayıları
 */
export function getCategoryStats(
  categorizedBets: Map<RiskCategory, CategorizedBet[]>
): Record<RiskCategory, { count: number; avgConfidence: number; avgOdds: number }> {
  const stats: Record<RiskCategory, { count: number; avgConfidence: number; avgOdds: number }> = {
    banko: { count: 0, avgConfidence: 0, avgOdds: 0 },
    value: { count: 0, avgConfidence: 0, avgOdds: 0 },
    surprise: { count: 0, avgConfidence: 0, avgOdds: 0 },
  };

  for (const [category, bets] of categorizedBets) {
    if (bets.length === 0) continue;
    
    const totalConfidence = bets.reduce((sum, b) => sum + b.suggestion.confidence, 0);
    const totalOdds = bets.reduce((sum, b) => sum + b.suggestion.odds, 0);
    
    stats[category] = {
      count: bets.length,
      avgConfidence: Math.round(totalConfidence / bets.length),
      avgOdds: Number((totalOdds / bets.length).toFixed(2)),
    };
  }

  return stats;
}
