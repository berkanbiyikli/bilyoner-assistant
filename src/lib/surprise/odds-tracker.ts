/**
 * Odds Movement Tracker
 * Oran hareketlerini izler, anomali tespit eder
 * 
 * Önceki oranlar olmadığında "implied probability" farkından
 * sinyal üretir (favori oranı vs model oranı karşılaştırması)
 */

import type { OddsMovement, OddsSnapshot } from './types';

// In-memory oran geçmişi (session-based, cron ile dolacak)
const oddsHistory = new Map<number, OddsSnapshot[]>();

/**
 * Oran snapshot kaydet
 */
export function saveOddsSnapshot(snapshot: OddsSnapshot): void {
  const existing = oddsHistory.get(snapshot.fixtureId) || [];
  existing.push(snapshot);
  oddsHistory.set(snapshot.fixtureId, existing);
}

/**
 * Fixture'ın oran geçmişini al
 */
export function getOddsHistory(fixtureId: number): OddsSnapshot[] {
  return oddsHistory.get(fixtureId) || [];
}

/**
 * Tüm oran geçmişini temizle (günlük reset)
 */
export function clearOddsHistory(): void {
  oddsHistory.clear();
}

/**
 * Implied probability hesapla (margin dahil)
 */
function impliedProb(odds: number): number {
  if (odds <= 1) return 100;
  return (1 / odds) * 100;
}

/**
 * Oran değişiminden sürpriz sinyali üret
 * Opening odds yoksa, bookmaker oranı vs model olasılığı karşılaştırır
 */
export function detectOddsMovements(
  fixtureId: number,
  currentOdds: {
    home?: number;
    draw?: number;
    away?: number;
    over25?: number;
    under25?: number;
    bttsYes?: number;
    bttsNo?: number;
  },
  modelProbabilities?: {
    homeWin: number;    // 0-100
    draw: number;       // 0-100
    awayWin: number;    // 0-100
    over25?: number;
    btts?: number;
  }
): OddsMovement[] {
  const movements: OddsMovement[] = [];
  const history = getOddsHistory(fixtureId);
  const opening = history.length > 0 ? history[0] : null;

  // Market listesi
  const markets = [
    { key: 'home', label: 'MS 1 (Ev Sahibi)', current: currentOdds.home, openVal: opening?.home },
    { key: 'draw', label: 'Beraberlik', current: currentOdds.draw, openVal: opening?.draw },
    { key: 'away', label: 'MS 2 (Deplasman)', current: currentOdds.away, openVal: opening?.away },
    { key: 'over25', label: 'Üst 2.5', current: currentOdds.over25, openVal: opening?.over25 },
    { key: 'under25', label: 'Alt 2.5', current: currentOdds.under25, openVal: opening?.under25 },
    { key: 'bttsYes', label: 'KG Var', current: currentOdds.bttsYes, openVal: opening?.bttsYes },
  ];

  for (const market of markets) {
    if (!market.current || market.current <= 1) continue;

    // Eğer opening odds varsa, gerçek hareket analizi yap
    if (market.openVal && market.openVal > 1) {
      const change = ((market.current - market.openVal) / market.openVal) * 100;
      const openImplied = impliedProb(market.openVal);
      const currentImplied = impliedProb(market.current);
      const probShift = Math.abs(openImplied - currentImplied);
      
      const direction = change > 1 ? 'up' : change < -1 ? 'down' : 'stable';
      const isAnomaly = Math.abs(change) >= 10; // %10+ oran hareketi
      
      // Favori oranı yükseldi = para akışı tersine döndü
      const isFavorite = market.openVal < 2.0; // 2.00 altı favoriydi
      const isSuspicious = isFavorite && direction === 'up' && Math.abs(change) >= 8;
      
      let signal = '';
      if (isSuspicious) {
        signal = `🚨 ${market.label}: Favori oranı ${market.openVal.toFixed(2)} → ${market.current.toFixed(2)} yükseldi! Sakatlık veya kadro sorunu olabilir.`;
      } else if (isAnomaly && direction === 'down') {
        signal = `📉 ${market.label}: Oran ${market.openVal.toFixed(2)} → ${market.current.toFixed(2)} düştü. Büyük para akışı var.`;
      } else if (isAnomaly && direction === 'up') {
        signal = `📈 ${market.label}: Oran ${market.openVal.toFixed(2)} → ${market.current.toFixed(2)} çıktı. Piyasa güvensiz.`;
      }

      if (isAnomaly || isSuspicious) {
        movements.push({
          fixtureId,
          market: market.label,
          openingOdds: market.openVal,
          currentOdds: market.current,
          change: Math.round(change * 100) / 100,
          direction,
          impliedProbShift: Math.round(probShift * 100) / 100,
          isAnomaly,
          isSuspicious,
          signal,
        });
      }
    }

    // Model olasılığı ile bookmaker karşılaştırması
    if (modelProbabilities) {
      let modelProb = 0;
      if (market.key === 'home') modelProb = modelProbabilities.homeWin;
      else if (market.key === 'draw') modelProb = modelProbabilities.draw;
      else if (market.key === 'away') modelProb = modelProbabilities.awayWin;
      else if (market.key === 'over25') modelProb = modelProbabilities.over25 || 0;
      else if (market.key === 'bttsYes') modelProb = modelProbabilities.btts || 0;

      if (modelProb > 0) {
        const bookmakerImplied = impliedProb(market.current);
        const gap = modelProb - bookmakerImplied;
        
        // Model, bookmaker'dan %15+ farklı düşünüyorsa — sinyal
        if (Math.abs(gap) >= 15) {
          const direction = gap > 0 ? 'down' : 'up'; // Model daha yüksek olasılık veriyorsa, oran "düşük" (value)
          
          movements.push({
            fixtureId,
            market: market.label,
            openingOdds: market.current, // Opening bilinmiyor
            currentOdds: market.current,
            change: 0,
            direction,
            impliedProbShift: Math.round(Math.abs(gap) * 100) / 100,
            isAnomaly: Math.abs(gap) >= 20,
            isSuspicious: gap > 20, // Model çok daha iyimser
            signal: gap > 0
              ? `🎯 ${market.label}: Model %${modelProb.toFixed(0)} veriyor, piyasa %${bookmakerImplied.toFixed(0)} diyor. +${gap.toFixed(0)}% edge!`
              : `⚠️ ${market.label}: Piyasa %${bookmakerImplied.toFixed(0)} veriyor, model sadece %${modelProb.toFixed(0)}. Dikkat!`,
          });
        }
      }
    }
  }

  // Deduplicate: Aynı market'ten birden fazla movement varsa en güçlüsünü al
  const deduped = new Map<string, OddsMovement>();
  for (const m of movements) {
    const existing = deduped.get(m.market);
    if (!existing || m.impliedProbShift > existing.impliedProbShift) {
      deduped.set(m.market, m);
    }
  }

  return Array.from(deduped.values());
}

/**
 * Tüm oran hareketlerini JSON-serializable hale getir
 */
export function serializeOddsHistory(): Record<string, OddsSnapshot[]> {
  const result: Record<string, OddsSnapshot[]> = {};
  for (const [fixtureId, snapshots] of oddsHistory) {
    result[fixtureId.toString()] = snapshots;
  }
  return result;
}

/**
 * Oran geçmişini JSON'dan yükle
 */
export function loadOddsHistory(data: Record<string, OddsSnapshot[]>): void {
  for (const [fixtureId, snapshots] of Object.entries(data)) {
    oddsHistory.set(Number(fixtureId), snapshots);
  }
}
