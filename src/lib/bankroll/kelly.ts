/**
 * Kelly Criterion & Bet Sizing Engine
 * Matematiksel olarak optimal bahis miktarı hesaplama
 */

export interface KellyInput {
  odds: number;          // Bahis oranı (decimal, ör: 1.85)
  probability: number;   // Tahmin edilen kazanma olasılığı (0-1)
  bankroll: number;      // Mevcut kasa
  kellyFraction: number; // Kelly fraksiyonu (0.25 = Quarter Kelly)
  maxBetPercentage: number; // Kasanın max %'si
  maxSingleBet: number | null; // Tek bahis üst limiti
}

export interface KellyResult {
  fullKelly: number;       // Tam Kelly önerisi (kasa %)
  fractionalKelly: number; // Fraksiyonel Kelly (kasa %)
  suggestedAmount: number; // Önerilen bahis miktarı (₺)
  expectedValue: number;   // Beklenen değer (EV)
  edge: number;            // Bahisçi kenarı (%)
  isValueBet: boolean;     // +EV mi?
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  warnings: string[];
}

/**
 * Full Kelly Criterion hesapla
 * f* = (bp - q) / b
 * b = odds - 1 (net oran)
 * p = kazanma olasılığı
 * q = 1 - p (kaybetme olasılığı)
 */
export function calculateKelly(input: KellyInput): KellyResult {
  const { odds, probability, bankroll, kellyFraction, maxBetPercentage, maxSingleBet } = input;
  
  const b = odds - 1; // Net oran
  const p = probability;
  const q = 1 - p;
  
  // Full Kelly
  const fullKellyFraction = (b * p - q) / b;
  
  // Expected Value
  const ev = (p * b) - q;
  const edge = ev * 100;
  
  const isValueBet = fullKellyFraction > 0;
  
  const warnings: string[] = [];
  
  if (!isValueBet) {
    warnings.push('Bu bahis -EV (negatif beklenen değer). Oynamamanız önerilir.');
    return {
      fullKelly: fullKellyFraction * 100,
      fractionalKelly: 0,
      suggestedAmount: 0,
      expectedValue: ev,
      edge,
      isValueBet: false,
      riskLevel: 'extreme',
      warnings,
    };
  }
  
  // Fractional Kelly
  let fractional = fullKellyFraction * kellyFraction;
  
  // Max bet percentage cap
  const maxPct = maxBetPercentage / 100;
  if (fractional > maxPct) {
    fractional = maxPct;
    warnings.push(`Kelly önerisi kasa limitini (%${maxBetPercentage}) aştı, limit uygulandı.`);
  }
  
  // Hesapla
  let suggestedAmount = Math.round(bankroll * fractional * 100) / 100;
  
  // Max single bet cap
  if (maxSingleBet && suggestedAmount > maxSingleBet) {
    suggestedAmount = maxSingleBet;
    warnings.push(`Tek bahis limiti (₺${maxSingleBet}) uygulandı.`);
  }
  
  // Min bet check
  if (suggestedAmount < 1) {
    suggestedAmount = 0;
    warnings.push('Hesaplanan miktar minimum bahis tutarının altında.');
  }
  
  // Risk level
  let riskLevel: KellyResult['riskLevel'] = 'low';
  if (fractional > 0.10) riskLevel = 'extreme';
  else if (fractional > 0.05) riskLevel = 'high';
  else if (fractional > 0.02) riskLevel = 'medium';
  
  if (fullKellyFraction > 0.25) {
    warnings.push('Full Kelly çok yüksek — Quarter Kelly kullanmanız şiddetle tavsiye edilir.');
  }
  
  return {
    fullKelly: Math.round(fullKellyFraction * 10000) / 100,
    fractionalKelly: Math.round(fractional * 10000) / 100,
    suggestedAmount,
    expectedValue: Math.round(ev * 10000) / 10000,
    edge: Math.round(edge * 100) / 100,
    isValueBet,
    riskLevel,
    warnings,
  };
}

/**
 * Flat Betting hesapla
 */
export function calculateFlatBet(
  bankroll: number, 
  percentage: number = 2
): number {
  return Math.round(bankroll * (percentage / 100) * 100) / 100;
}

/**
 * Bahis oranından ima edilen olasılık
 */
export function impliedProbability(odds: number): number {
  return 1 / odds;
}

/**
 * Confidence score'dan olasılık tahmini (basit mapping)
 * Confidence 0-100 → Probability 0-1
 */
export function confidenceToProbability(confidence: number, odds: number): number {
  // Confidence'ı olasılığa çevir, ama implied probability'den de uzaklaşma
  const implied = impliedProbability(odds);
  const confProb = confidence / 100;
  
  // Weighted average: %60 confidence-based, %40 implied
  return confProb * 0.6 + implied * 0.4;
}

/**
 * Compound (bileşik) strateji simülasyonu
 */
export interface CompoundSimulation {
  step: number;
  startBalance: number;
  odds: number;
  endBalance: number;
  note: string;
}

export function simulateCompound(
  initialBalance: number,
  steps: { odds: number; withdrawAt?: number }[],
): CompoundSimulation[] {
  let balance = initialBalance;
  const results: CompoundSimulation[] = [];
  
  for (let i = 0; i < steps.length; i++) {
    const { odds, withdrawAt } = steps[i];
    const startBalance = balance;
    balance = Math.round(balance * odds * 1000) / 1000;
    
    let note = '';
    if (withdrawAt && balance > withdrawAt) {
      const withdrawn = withdrawAt;
      balance = balance - withdrawn;
      note = `${withdrawn.toLocaleString('tr-TR')} çek → Kasa: ${balance.toLocaleString('tr-TR')}`;
    }
    
    results.push({
      step: i + 1,
      startBalance,
      odds,
      endBalance: balance,
      note,
    });
  }
  
  return results;
}

/**
 * Risk hesaplama - Ruin olasılığı (basitleştirilmiş)
 * P(ruin) ≈ ((1-edge)/(1+edge))^(bankroll/unit)
 */
export function probabilityOfRuin(
  winRate: number,
  avgOdds: number,
  bankrollUnits: number
): number {
  const edge = (winRate * avgOdds) - 1;
  if (edge <= 0) return 1; // Kenar yoksa eninde sonunda batar
  
  const ratio = (1 - edge) / (1 + edge);
  return Math.pow(ratio, bankrollUnits);
}
