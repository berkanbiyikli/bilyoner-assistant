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
  // Over/Under 3.5
  'over35': { betId: 5, betName: 'Goals Over/Under', valueName: 'Over 3.5' },
  'under35': { betId: 5, betName: 'Goals Over/Under', valueName: 'Under 3.5' },
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
  // HT/FT (İY/MS) — betId 13 = HT/FT
  'htft_11': { betId: 13, betName: 'HT/FT Double', valueName: 'Home/Home' },
  'htft_12': { betId: 13, betName: 'HT/FT Double', valueName: 'Home/Away' },
  'htft_1x': { betId: 13, betName: 'HT/FT Double', valueName: 'Home/Draw' },
  'htft_x1': { betId: 13, betName: 'HT/FT Double', valueName: 'Draw/Home' },
  'htft_xx': { betId: 13, betName: 'HT/FT Double', valueName: 'Draw/Draw' },
  'htft_x2': { betId: 13, betName: 'HT/FT Double', valueName: 'Draw/Away' },
  'htft_21': { betId: 13, betName: 'HT/FT Double', valueName: 'Away/Home' },
  'htft_2x': { betId: 13, betName: 'HT/FT Double', valueName: 'Away/Draw' },
  'htft_22': { betId: 13, betName: 'HT/FT Double', valueName: 'Away/Away' },
  // First Half Over/Under 0.5
  'ht_over05': { betId: 6, betName: 'Goals Over/Under First Half', valueName: 'Over 0.5' },
  'ht_under05': { betId: 6, betName: 'Goals Over/Under First Half', valueName: 'Under 0.5' },
  // First Half Over/Under 1.5
  'ht_over15': { betId: 6, betName: 'Goals Over/Under First Half', valueName: 'Over 1.5' },
  'ht_under15': { betId: 6, betName: 'Goals Over/Under First Half', valueName: 'Under 1.5' },
};

// Tercih edilen bahis siteleri (sırasıyla)
const PREFERRED_BOOKMAKERS = [
  '1xBet',       // Sadece 1xBet oranları
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
  const type = predType.toLowerCase().trim();
  
  // Over/Under 3.5
  if (type.includes('üst 3.5') || type.includes('over 3.5') || type.includes('3.5 üst') || type === 'over35') {
    return 'over35';
  }
  if (type.includes('alt 3.5') || type.includes('under 3.5') || type.includes('3.5 alt') || type === 'under35') {
    return 'under35';
  }
  // Over/Under 2.5
  if (type.includes('üst 2.5') || type.includes('over 2.5') || type.includes('2.5 üst') || type.includes('ü2.5') || type === 'over25') {
    return 'over25';
  }
  if (type.includes('alt 2.5') || type.includes('under 2.5') || type.includes('2.5 alt') || type.includes('a2.5') || type === 'under25') {
    return 'under25';
  }
  // Over/Under 1.5
  if (type.includes('üst 1.5') || type.includes('over 1.5') || type.includes('1.5 üst') || type === 'over15') {
    return 'over15';
  }
  if (type.includes('alt 1.5') || type.includes('under 1.5') || type.includes('1.5 alt') || type === 'under15') {
    return 'under15';
  }
  // BTTS
  if (type.includes('kg var') || type.includes('btts') || type === 'btts' || type === 'var') {
    return 'btts';
  }
  if (type.includes('kg yok') || type === 'yok') {
    return 'btts_no';
  }
  // İY/MS (Half-Time/Full-Time)
  if (type.includes('iy/ms') || type.includes('İy/ms') || type.includes('htft')) {
    // İY/MS 1/1, İY/MS 1/X, etc.
    if (type.includes('1/1') || type.includes('1-1')) return 'htft_11';
    if (type.includes('1/2') || type.includes('1-2')) return 'htft_12';
    if (type.includes('1/x') || type.includes('1-x')) return 'htft_1x';
    if (type.includes('x/1') || type.includes('x-1')) return 'htft_x1';
    if (type.includes('x/x') || type.includes('x-x')) return 'htft_xx';
    if (type.includes('x/2') || type.includes('x-2')) return 'htft_x2';
    if (type.includes('2/1') || type.includes('2-1')) return 'htft_21';
    if (type.includes('2/x') || type.includes('2-x')) return 'htft_2x';
    if (type.includes('2/2') || type.includes('2-2')) return 'htft_22';
  }
  // 1X2
  if (type.includes('ms 1') || type === 'home' || type === 'ev sahibi') {
    return 'home';
  }
  if (type.includes('ms x') || type === 'draw' || type === 'beraberlik') {
    return 'draw';
  }
  if (type.includes('ms 2') || type === 'away' || type === 'deplasman') {
    return 'away';
  }
  // Double Chance
  if (type === '1x' || type.includes('ev/beraberlik')) return 'home_draw';
  if (type === 'x2' || type.includes('beraberlik/deplasman')) return 'draw_away';
  if (type === '12' || type.includes('ev/deplasman')) return 'home_away';
  // İlk yarı gol
  if (type.includes('iy ü0.5') || type.includes('iy üst 0.5')) return 'ht_over05';
  if (type.includes('iy a0.5') || type.includes('iy alt 0.5')) return 'ht_under05';
  if (type.includes('iy ü1.5') || type.includes('iy üst 1.5')) return 'ht_over15';
  if (type.includes('iy a1.5') || type.includes('iy alt 1.5')) return 'ht_under15';
  
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
