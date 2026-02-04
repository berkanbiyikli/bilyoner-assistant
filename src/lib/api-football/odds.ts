/**
 * API-Football Odds API
 * Gerçek bahis oranlarını çeker
 */

import { apiFootballFetch } from './client';

// Oran tipi eşleştirmeleri
const BET_TYPE_MAP: Record<string, { betId: number; betName: string; valueName: string }> = {
  // Over/Under 2.5
  'over25': { betId: 5, betName: 'Goals Over/Under', valueName: 'Over 2.5' },
  'under25': { betId: 5, betName: 'Goals Over/Under', valueName: 'Under 2.5' },
  // Over/Under 1.5
  'over15': { betId: 5, betName: 'Goals Over/Under', valueName: 'Over 1.5' },
  'under15': { betId: 5, betName: 'Goals Over/Under', valueName: 'Under 1.5' },
  // BTTS
  'btts': { betId: 8, betName: 'Both Teams Score', valueName: 'Yes' },
  'btts_no': { betId: 8, betName: 'Both Teams Score', valueName: 'No' },
  // 1X2
  'home': { betId: 1, betName: 'Match Winner', valueName: 'Home' },
  'draw': { betId: 1, betName: 'Match Winner', valueName: 'Draw' },
  'away': { betId: 1, betName: 'Match Winner', valueName: 'Away' },
  // Double Chance
  'home_draw': { betId: 12, betName: 'Double Chance', valueName: 'Home/Draw' },
  'home_away': { betId: 12, betName: 'Double Chance', valueName: 'Home/Away' },
  'draw_away': { betId: 12, betName: 'Double Chance', valueName: 'Draw/Away' },
};

// Tercih edilen bahis siteleri (sırasıyla)
const PREFERRED_BOOKMAKERS = [
  'Betano',      // Türkiye'de popüler
  '1xBet',       // Yüksek oranlar
  'Pinnacle',    // Profesyonel oranlar
  'bet365',      // Güvenilir
  'Betfair',     // Exchange
];

interface OddsValue {
  value: string;
  odd: string;
}

interface Bet {
  id: number;
  name: string;
  values: OddsValue[];
}

interface Bookmaker {
  id: number;
  name: string;
  bets: Bet[];
}

interface OddsResponse {
  league: { id: number; name: string };
  fixture: { id: number };
  update: string;
  bookmakers: Bookmaker[];
}

export interface RealOdds {
  fixtureId: number;
  bookmaker: string;
  betType: string;
  market: string;
  pick: string;
  odds: number;
  updatedAt: string;
}

/**
 * Fixture için gerçek bahis oranlarını çek
 */
export async function fetchRealOdds(fixtureId: number): Promise<RealOdds[]> {
  try {
    const apiResponse = await apiFootballFetch<OddsResponse[]>('/odds', {
      fixture: fixtureId,
    });

    if (!apiResponse.response || apiResponse.response.length === 0) {
      console.log(`[Odds] Fixture ${fixtureId} için oran bulunamadı`);
      return [];
    }

    const data = apiResponse.response[0];
    const results: RealOdds[] = [];

    // Tercih edilen bookmaker'ı bul
    let selectedBookmaker: Bookmaker | null = null;
    for (const preferred of PREFERRED_BOOKMAKERS) {
      const found = data.bookmakers.find(b => 
        b.name.toLowerCase().includes(preferred.toLowerCase())
      );
      if (found) {
        selectedBookmaker = found;
        break;
      }
    }

    // Bulunamazsa ilk bookmaker'ı kullan
    if (!selectedBookmaker && data.bookmakers.length > 0) {
      selectedBookmaker = data.bookmakers[0];
    }

    if (!selectedBookmaker) {
      return [];
    }

    // Tüm bet tiplerini çıkar
    for (const [betType, mapping] of Object.entries(BET_TYPE_MAP)) {
      const bet = selectedBookmaker.bets.find(b => b.id === mapping.betId);
      if (bet) {
        const value = bet.values.find(v => 
          v.value.toLowerCase() === mapping.valueName.toLowerCase()
        );
        if (value) {
          results.push({
            fixtureId,
            bookmaker: selectedBookmaker.name,
            betType,
            market: bet.name,
            pick: value.value,
            odds: parseFloat(value.odd),
            updatedAt: data.update,
          });
        }
      }
    }

    console.log(`[Odds] ${fixtureId}: ${results.length} oran bulundu (${selectedBookmaker.name})`);
    return results;
  } catch (error) {
    console.error(`[Odds] Fixture ${fixtureId} oran hatası:`, error);
    return [];
  }
}

/**
 * Belirli bir tahmin tipi için gerçek oranı bul
 */
export async function getRealOddsForPrediction(
  fixtureId: number,
  predictionType: string
): Promise<{ odds: number; bookmaker: string } | null> {
  const allOdds = await fetchRealOdds(fixtureId);
  
  // Prediction type'ı normalize et
  const normalizedType = normalizePredictionType(predictionType);
  
  const match = allOdds.find(o => o.betType === normalizedType);
  
  if (match) {
    return { odds: match.odds, bookmaker: match.bookmaker };
  }
  
  return null;
}

/**
 * Tahmin tipini API formatına çevir
 */
function normalizePredictionType(predType: string): string {
  const type = predType.toLowerCase();
  
  if (type.includes('üst 2.5') || type.includes('over 2.5') || type === 'over25') {
    return 'over25';
  }
  if (type.includes('alt 2.5') || type.includes('under 2.5') || type === 'under25') {
    return 'under25';
  }
  if (type.includes('üst 1.5') || type.includes('over 1.5') || type === 'over15') {
    return 'over15';
  }
  if (type.includes('alt 1.5') || type.includes('under 1.5') || type === 'under15') {
    return 'under15';
  }
  if (type.includes('kg var') || type.includes('btts') || type === 'btts') {
    return 'btts';
  }
  if (type.includes('kg yok')) {
    return 'btts_no';
  }
  if (type.includes('ms 1') || type === 'home') {
    return 'home';
  }
  if (type.includes('ms x') || type === 'draw') {
    return 'draw';
  }
  if (type.includes('ms 2') || type === 'away') {
    return 'away';
  }
  
  return type;
}

/**
 * Birden fazla fixture için toplu oran çek
 */
export async function fetchBulkRealOdds(fixtureIds: number[]): Promise<Map<number, RealOdds[]>> {
  const results = new Map<number, RealOdds[]>();
  
  // Paralel çek (max 3 aynı anda - rate limit için)
  const BATCH_SIZE = 3;
  
  for (let i = 0; i < fixtureIds.length; i += BATCH_SIZE) {
    const batch = fixtureIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(id => fetchRealOdds(id))
    );
    
    batch.forEach((id, idx) => {
      results.set(id, batchResults[idx]);
    });
    
    // Rate limit için kısa bekleme
    if (i + BATCH_SIZE < fixtureIds.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  return results;
}
