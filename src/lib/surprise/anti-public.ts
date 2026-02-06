/**
 * Anti-Public Bet Detector
 * Kamuoyu bahis yönelimlerinin tersine giden sinyalleri tespit eder
 * 
 * Prensip: Herkesin aynı tarafa bastığı maçlar genelde sürprizle biter.
 * "Büyük para" her zaman kamuoyunun tersine akar.
 */

import type { AntiPublicSignal } from './types';

interface AntiPublicInput {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  
  // Model tahminleri (0-100)
  modelHome: number;
  modelDraw: number;
  modelAway: number;
  
  // Bookmaker oranları (implied probability hesaplanacak)
  oddsHome?: number;
  oddsDraw?: number;
  oddsAway?: number;
  
  // API-Football tahminleri (0-100, varsa)
  apiHome?: number;
  apiDraw?: number;
  apiAway?: number;
  
  // Opsiyonel: Popülerlik sinyalleri
  h2hHomeAdvantage?: number; // Son 10 maçta ev sahibi yüzdesi
  formDifference?: number;   // Form farkı (pozitif = ev sahibi avantajlı)
}

/**
 * Implied probability (margin dahil, normalize ederek)
 */
function normalizedImpliedProbs(
  oddsHome: number, 
  oddsDraw: number, 
  oddsAway: number
): { home: number; draw: number; away: number } {
  const rawHome = 1 / oddsHome;
  const rawDraw = 1 / oddsDraw;
  const rawAway = 1 / oddsAway;
  const total = rawHome + rawDraw + rawAway;
  
  return {
    home: (rawHome / total) * 100,
    draw: (rawDraw / total) * 100,
    away: (rawAway / total) * 100,
  };
}

/**
 * "Kamuoyu" tarafını belirle
 * Bookmaker oranlarından hangi tarafın favori olduğunu belirler.
 * API tahmini varsa onu da katarak "consensus" oluşturur.
 */
function determinePublicSide(input: AntiPublicInput): {
  side: 'home' | 'draw' | 'away';
  confidence: number;
} {
  // 1. Bookmaker implied probabilities (varsa)
  let publicHome = 0, publicDraw = 0, publicAway = 0;
  let hasOdds = false;
  
  if (input.oddsHome && input.oddsDraw && input.oddsAway) {
    const implied = normalizedImpliedProbs(input.oddsHome, input.oddsDraw, input.oddsAway);
    publicHome += implied.home;
    publicDraw += implied.draw;
    publicAway += implied.away;
    hasOdds = true;
  }
  
  // 2. API-Football tahminleri (varsa, %40 ağırlık)
  if (input.apiHome && input.apiDraw && input.apiAway) {
    const weight = hasOdds ? 0.4 : 0.7;
    const oddsWeight = hasOdds ? 0.6 : 0;
    
    publicHome = publicHome * oddsWeight + input.apiHome * weight;
    publicDraw = publicDraw * oddsWeight + input.apiDraw * weight;
    publicAway = publicAway * oddsWeight + input.apiAway * weight;
  }
  
  // H2H ve Form bilgisi varsa, kamuoyu tahminine küçük ağırlık ekle
  if (input.h2hHomeAdvantage && input.h2hHomeAdvantage > 70) {
    publicHome += 5; // H2H çok baskın → kamuoyu ev sahibi der
  }
  if (input.formDifference && input.formDifference > 20) {
    publicHome += 3; // Form farkı çok büyük → kamu favorisi
  } else if (input.formDifference && input.formDifference < -20) {
    publicAway += 3;
  }
  
  // Normalize
  const total = publicHome + publicDraw + publicAway;
  if (total === 0) return { side: 'home', confidence: 33 };
  
  publicHome = (publicHome / total) * 100;
  publicDraw = (publicDraw / total) * 100;
  publicAway = (publicAway / total) * 100;
  
  const max = Math.max(publicHome, publicDraw, publicAway);
  const side = publicHome === max ? 'home' : publicAway === max ? 'away' : 'draw';
  
  return { side, confidence: Math.round(max) };
}

/**
 * Anti-Public sinyal tespit
 * Model, kamuoyunun tersini söylüyorsa → sürpriz sinyali
 */
export function detectAntiPublicSignal(input: AntiPublicInput): AntiPublicSignal | null {
  const publicResult = determinePublicSide(input);
  
  // Model tarafını belirle
  const modelMax = Math.max(input.modelHome, input.modelDraw, input.modelAway);
  const modelSide = input.modelHome === modelMax ? 'home' as const
    : input.modelAway === modelMax ? 'away' as const
    : 'draw' as const;
  const modelConfidence = Math.round(modelMax);
  
  // Model ve kamuoyu aynı yönde mi?
  const isContrarian = modelSide !== publicResult.side;
  
  if (!isContrarian) {
    // Aynı yönde ama güven farkı çok büyükse yine not al
    const confDiff = Math.abs(modelConfidence - publicResult.confidence);
    if (confDiff < 15) return null; // Benzer düşünüyorlar, sürpriz yok
  }
  
  // Contrarian edge hesapla
  // Model ne kadar farklı düşünüyor?
  let contraryEdge = 0;
  if (isContrarian) {
    // Model kendi tarafına ne kadar güveniyor + kamuoyu kendi tarafına ne kadar güveniyor
    contraryEdge = modelConfidence - (100 - publicResult.confidence);
  } else {
    contraryEdge = Math.abs(modelConfidence - publicResult.confidence);
  }
  
  // Minimum edge eşiği: %10
  if (contraryEdge < 10 && !isContrarian) return null;
  
  // Sürpriz nedeni oluştur
  const publicLabel = publicResult.side === 'home' ? input.homeTeam 
    : publicResult.side === 'away' ? input.awayTeam 
    : 'Beraberlik';
  const modelLabel = modelSide === 'home' ? input.homeTeam 
    : modelSide === 'away' ? input.awayTeam 
    : 'Beraberlik';
  
  let reason: string;
  if (isContrarian) {
    reason = `Herkes "${publicLabel}" diyor (%${publicResult.confidence}), ama model "${modelLabel}" tarafında (%${modelConfidence}). Klasik "ters köşe" senaryosu.`;
  } else {
    reason = `Aynı yönde ama fark çok büyük: Kamu %${publicResult.confidence}, Model %${modelConfidence}. Model çok daha güvenli.`;
  }

  return {
    fixtureId: input.fixtureId,
    publicSide: publicResult.side,
    publicConfidence: publicResult.confidence,
    modelSide,
    modelConfidence,
    isContrarian,
    contraryEdge: Math.round(contraryEdge),
    reason,
  };
}

/**
 * Batch anti-public analiz
 */
export function analyzeAntiPublicBatch(inputs: AntiPublicInput[]): AntiPublicSignal[] {
  return inputs
    .map(detectAntiPublicSignal)
    .filter((s): s is AntiPublicSignal => s !== null)
    .sort((a, b) => b.contraryEdge - a.contraryEdge);
}
