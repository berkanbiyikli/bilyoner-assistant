/**
 * Live Odds Integration Module
 * 
 * Fetches real-time bookmaker odds from API-Football (1xBet preferred)
 * and maps Turkish pick names to actual bookmaker odds.
 * 
 * Architecture:
 * - getLiveOdds() → API-Football /odds/live → ProcessedOdds
 * - getOddsForPick() → Maps "Üst 2.5 Gol" → real bookmaker odds number
 * - In-memory cache with 60s TTL (live odds change fast)
 */

import { getLiveOdds, processOdds, type ProcessedOdds } from '../api-football/predictions';

// ============ CACHE ============

const oddsCache = new Map<number, { data: ProcessedOdds; timestamp: number }>();
const CACHE_TTL = 60_000; // 60 seconds for live odds

/**
 * Fetch processed live odds for a fixture with caching
 */
export async function fetchLiveMatchOdds(fixtureId: number): Promise<ProcessedOdds | null> {
  // Check cache first
  const cached = oddsCache.get(fixtureId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const rawOdds = await getLiveOdds(fixtureId);
    if (!rawOdds) {
      console.log(`[LiveOdds] Fixture ${fixtureId}: Canlı oran bulunamadı`);
      return null;
    }

    const processed = processOdds(rawOdds, fixtureId);
    if (processed) {
      oddsCache.set(fixtureId, { data: processed, timestamp: Date.now() });
      console.log(`[LiveOdds] Fixture ${fixtureId}: Oranlar alındı (${processed.bookmaker})`);
    }
    return processed;
  } catch (error) {
    console.error(`[LiveOdds] Fixture ${fixtureId} hata:`, error);
    return null;
  }
}

/**
 * Fetch live odds for multiple fixtures (batched, rate limited)
 */
export async function fetchBulkLiveOdds(fixtureIds: number[]): Promise<Map<number, ProcessedOdds>> {
  const results = new Map<number, ProcessedOdds>();
  const BATCH_SIZE = 3;

  for (let i = 0; i < fixtureIds.length; i += BATCH_SIZE) {
    const batch = fixtureIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(id => fetchLiveMatchOdds(id)));

    batch.forEach((id, idx) => {
      const result = batchResults[idx];
      if (result) results.set(id, result);
    });

    // Rate limit between batches
    if (i + BATCH_SIZE < fixtureIds.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return results;
}

// ============ PICK → ODDS MAPPING ============

/**
 * Map a Turkish pick name to actual bookmaker odds from ProcessedOdds.
 * 
 * Supports:
 * - Over/Under goals (1.5, 2.5, 3.5)
 * - BTTS (KG Var/Yok)
 * - Match Winner (MS 1/X/2)
 * - Double Chance (Çifte Şans)
 * 
 * @param odds - Processed odds from API
 * @param pick - Turkish pick name (e.g. "Üst 2.5 Gol", "KG Var")
 * @param homeTeam - Home team name (for double chance mapping)
 * @param awayTeam - Away team name (for double chance mapping)
 * @returns Real bookmaker odds or null if not found
 */
export function getOddsForPick(
  odds: ProcessedOdds,
  pick: string,
  homeTeam?: string,
  awayTeam?: string,
): number | null {
  const p = pick.toLowerCase();

  // İlk Yarı Over/Under (İY önce kontrol - "iy üst 0.5" gibi)
  if ((p.includes('iy') || p.includes('İy') || p.includes('ilk yarı')) && (p.includes('üst 0.5') || p.includes('over 0.5'))) return odds.firstHalfOverUnder?.over05 ?? null;
  if ((p.includes('iy') || p.includes('İy') || p.includes('ilk yarı')) && (p.includes('alt 0.5') || p.includes('under 0.5'))) return odds.firstHalfOverUnder?.under05 ?? null;
  if ((p.includes('iy') || p.includes('İy') || p.includes('ilk yarı')) && (p.includes('üst 1.5') || p.includes('over 1.5'))) return odds.firstHalfOverUnder?.over15 ?? null;
  if ((p.includes('iy') || p.includes('İy') || p.includes('ilk yarı')) && (p.includes('alt 1.5') || p.includes('under 1.5'))) return odds.firstHalfOverUnder?.under15 ?? null;

  // Over/Under Goals (Maç Toplam)
  if (p.includes('üst 1.5') || p.includes('over 1.5')) return odds.overUnder?.over15 ?? null;
  if (p.includes('üst 2.5') || p.includes('over 2.5')) return odds.overUnder?.over25 ?? null;
  if (p.includes('üst 3.5') || p.includes('over 3.5')) return odds.overUnder?.over35 ?? null;
  if (p.includes('alt 2.5') || p.includes('under 2.5')) return odds.overUnder?.under25 ?? null;
  if (p.includes('alt 1.5') || p.includes('under 1.5')) return odds.overUnder?.under15 ?? null;

  // BTTS
  if (p.includes('kg var') || p.includes('karşılıklı gol var')) return odds.bothTeamsToScore?.yes ?? null;
  if (p.includes('kg yok') || p.includes('karşılıklı gol yok')) return odds.bothTeamsToScore?.no ?? null;

  // Match Winner
  if (p.includes('ms 1')) return odds.matchWinner?.home ?? null;
  if (p.includes('ms x') || p === 'berabere') return odds.matchWinner?.draw ?? null;
  if (p.includes('ms 2')) return odds.matchWinner?.away ?? null;

  // Double Chance - needs team name context
  if (p.includes('kazanır veya berabere') || p.includes('çifte şans')) {
    if (homeTeam && p.toLowerCase().includes(homeTeam.toLowerCase())) {
      return odds.doubleChance?.homeOrDraw ?? null;
    }
    if (awayTeam && p.toLowerCase().includes(awayTeam.toLowerCase())) {
      return odds.doubleChance?.awayOrDraw ?? null;
    }
    // Fallback if team name not in pick
    return odds.doubleChance?.homeOrDraw ?? null;
  }

  return null;
}

/**
 * Get all available markets and their odds from processed data
 * Returns a map of market key → odds value for easy iteration
 */
export function getAllAvailableOdds(odds: ProcessedOdds): Map<string, { pick: string; odds: number }> {
  const available = new Map<string, { pick: string; odds: number }>();

  if (odds.overUnder?.over15) available.set('over15', { pick: 'Üst 1.5 Gol', odds: odds.overUnder.over15 });
  if (odds.overUnder?.over25) available.set('over25', { pick: 'Üst 2.5 Gol', odds: odds.overUnder.over25 });
  if (odds.overUnder?.over35) available.set('over35', { pick: 'Üst 3.5', odds: odds.overUnder.over35 });
  if (odds.bothTeamsToScore?.yes) available.set('btts', { pick: 'Karşılıklı Gol Var', odds: odds.bothTeamsToScore.yes });
  if (odds.bothTeamsToScore?.no) available.set('bttsNo', { pick: 'Karşılıklı Gol Yok', odds: odds.bothTeamsToScore.no });
  if (odds.matchWinner?.home) available.set('home', { pick: 'MS 1', odds: odds.matchWinner.home });
  if (odds.matchWinner?.draw) available.set('draw', { pick: 'MS X', odds: odds.matchWinner.draw });
  if (odds.matchWinner?.away) available.set('away', { pick: 'MS 2', odds: odds.matchWinner.away });
  if (odds.doubleChance?.homeOrDraw) available.set('homeOrDraw', { pick: '1X Çifte Şans', odds: odds.doubleChance.homeOrDraw });
  if (odds.doubleChance?.awayOrDraw) available.set('awayOrDraw', { pick: 'X2 Çifte Şans', odds: odds.doubleChance.awayOrDraw });

  return available;
}
