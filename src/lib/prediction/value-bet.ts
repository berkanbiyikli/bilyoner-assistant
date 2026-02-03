/**
 * Value Bet Detection & Kelly Criterion Module
 * Değerli bahisleri tespit et ve optimal stake hesapla
 */

export interface OddsComparison {
  market: string;
  pick: string;
  calculatedProb: number;      // Hesaplanan olasılık (%)
  calculatedOdds: number;      // Hesaplanan adil oran
  bookmakerOdds: number;       // Bahis sitesi oranı
  valuePercentage: number;     // Value yüzdesi
  isValueBet: boolean;         // Value bet mi?
  edge: number;                // Avantaj (%)
}

/**
 * Value hesapla
 * Value = (Hesaplanan olasılık × Bahis oranı) - 1
 * Pozitif value = değerli bahis
 */
export function calculateValue(
  calculatedProbability: number, // 0-100 arası
  bookmakerOdds: number
): { value: number; edge: number; fairOdds: number } {
  // Olasılığı 0-1 aralığına çevir
  const prob = calculatedProbability / 100;
  
  // Adil oran = 1 / Olasılık
  const fairOdds = prob > 0 ? 1 / prob : 100;
  
  // Expected Value = (Olasılık × Oran) - 1
  const ev = (prob * bookmakerOdds) - 1;
  
  // Edge (avantaj) yüzdesi
  const edge = ev * 100;
  
  // Value yüzdesi (bahis sitesi oranı vs adil oran)
  const value = ((bookmakerOdds / fairOdds) - 1) * 100;

  return {
    value: Math.round(value * 100) / 100,
    edge: Math.round(edge * 100) / 100,
    fairOdds: Math.round(fairOdds * 100) / 100,
  };
}

/**
 * Value bet mi kontrol et
 * Minimum value eşiği: %5
 */
export function isValueBet(
  calculatedProbability: number,
  bookmakerOdds: number,
  minValueThreshold: number = 5
): boolean {
  const { value } = calculateValue(calculatedProbability, bookmakerOdds);
  return value >= minValueThreshold;
}

/**
 * Kelly Criterion - Optimal Stake Hesaplama
 * 
 * f* = (bp - q) / b
 * f* = optimal stake fraction
 * b = decimal odds - 1
 * p = probability of winning
 * q = probability of losing (1 - p)
 * 
 * Half Kelly kullanılır (daha muhafazakar)
 */
export interface KellyResult {
  fullKelly: number;           // Tam Kelly oranı (%)
  halfKelly: number;           // Yarım Kelly oranı (%) - önerilen
  quarterKelly: number;        // Çeyrek Kelly oranı (%) - çok muhafazakar
  suggestedStake: number;      // Önerilen stake (birim)
  confidence: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

export function calculateKellyStake(
  probability: number,         // 0-100 arası
  bookmakerOdds: number,
  bankroll: number = 100       // Varsayılan 100 birim
): KellyResult {
  const p = probability / 100;  // Kazanma olasılığı
  const q = 1 - p;              // Kaybetme olasılığı
  const b = bookmakerOdds - 1;  // Net kazanç çarpanı

  // Kelly formülü
  // f* = (b × p - q) / b
  const fullKelly = ((b * p) - q) / b;
  
  // Negatif Kelly = value yok, bahis yapma
  if (fullKelly <= 0) {
    return {
      fullKelly: 0,
      halfKelly: 0,
      quarterKelly: 0,
      suggestedStake: 0,
      confidence: 'low',
      riskLevel: 'high',
    };
  }

  // Kelly oranlarını yüzdeye çevir
  const fullKellyPct = fullKelly * 100;
  const halfKellyPct = (fullKelly / 2) * 100;
  const quarterKellyPct = (fullKelly / 4) * 100;

  // Önerilen stake (Half Kelly × Bankroll)
  const suggestedStake = (halfKellyPct / 100) * bankroll;

  // Güven seviyesi
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (fullKellyPct >= 10) confidence = 'high';
  else if (fullKellyPct >= 5) confidence = 'medium';

  // Risk seviyesi (yüksek Kelly = yüksek risk)
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (fullKellyPct >= 20) riskLevel = 'high';
  else if (fullKellyPct >= 10) riskLevel = 'medium';

  return {
    fullKelly: Math.round(fullKellyPct * 100) / 100,
    halfKelly: Math.round(halfKellyPct * 100) / 100,
    quarterKelly: Math.round(quarterKellyPct * 100) / 100,
    suggestedStake: Math.round(suggestedStake * 100) / 100,
    confidence,
    riskLevel,
  };
}

/**
 * Value bet analizi
 * Tüm marketler için value ve Kelly hesapla
 */
export interface ValueBetAnalysis {
  market: string;
  pick: string;
  probability: number;
  bookmakerOdds: number;
  fairOdds: number;
  value: number;
  edge: number;
  isValue: boolean;
  kelly: KellyResult;
  rating: number;              // 0-100 arası genel değerlendirme
  recommendation: 'skip' | 'consider' | 'bet' | 'strong_bet';
}

export function analyzeValueBet(
  market: string,
  pick: string,
  probability: number,
  bookmakerOdds: number,
  bankroll: number = 100
): ValueBetAnalysis {
  const { value, edge, fairOdds } = calculateValue(probability, bookmakerOdds);
  const isValue = value >= 5; // %5 minimum value
  const kelly = calculateKellyStake(probability, bookmakerOdds, bankroll);

  // Rating hesapla (value + probability + kelly kombinasyonu)
  let rating = 0;
  if (isValue) {
    rating = Math.min(100, 
      (value * 2) +                    // Value ağırlığı
      (probability * 0.3) +            // Olasılık ağırlığı
      (kelly.halfKelly * 3)            // Kelly ağırlığı
    );
  }

  // Öneri
  let recommendation: 'skip' | 'consider' | 'bet' | 'strong_bet' = 'skip';
  if (rating >= 80 && value >= 15 && kelly.halfKelly >= 3) {
    recommendation = 'strong_bet';
  } else if (rating >= 60 && value >= 10 && kelly.halfKelly >= 2) {
    recommendation = 'bet';
  } else if (rating >= 40 && value >= 5 && kelly.halfKelly >= 1) {
    recommendation = 'consider';
  }

  return {
    market,
    pick,
    probability,
    bookmakerOdds,
    fairOdds,
    value,
    edge,
    isValue,
    kelly,
    rating: Math.round(rating),
    recommendation,
  };
}

/**
 * Birden fazla bahis için toplam value analizi
 */
export interface MultiValueAnalysis {
  bets: ValueBetAnalysis[];
  totalValueBets: number;
  avgValue: number;
  totalSuggestedStake: number;
  bestBet: ValueBetAnalysis | null;
  systemSuggestion: string;
}

export function analyzeMultipleValueBets(
  bets: Array<{
    market: string;
    pick: string;
    probability: number;
    bookmakerOdds: number;
  }>,
  bankroll: number = 100
): MultiValueAnalysis {
  const analyses = bets.map(bet => 
    analyzeValueBet(bet.market, bet.pick, bet.probability, bet.bookmakerOdds, bankroll)
  );

  const valueBets = analyses.filter(a => a.isValue);
  const totalValueBets = valueBets.length;
  const avgValue = valueBets.length > 0 
    ? valueBets.reduce((sum, b) => sum + b.value, 0) / valueBets.length 
    : 0;
  const totalSuggestedStake = valueBets.reduce((sum, b) => sum + b.kelly.suggestedStake, 0);

  // En iyi bahis
  const bestBet = valueBets.length > 0 
    ? valueBets.reduce((best, current) => 
        current.rating > best.rating ? current : best
      )
    : null;

  // Sistem önerisi
  let systemSuggestion = '';
  if (totalValueBets === 0) {
    systemSuggestion = 'Bu maçta değerli bahis bulunamadı. Bekle.';
  } else if (totalValueBets === 1) {
    systemSuggestion = `Tek value bet: ${bestBet?.market} - ${bestBet?.pick}`;
  } else if (totalValueBets >= 3 && avgValue >= 10) {
    systemSuggestion = `${totalValueBets} value bet bulundu. Sistem bahsi düşünülebilir.`;
  } else {
    systemSuggestion = `${totalValueBets} value bet mevcut. En iyisi: ${bestBet?.market}`;
  }

  return {
    bets: analyses,
    totalValueBets,
    avgValue: Math.round(avgValue * 100) / 100,
    totalSuggestedStake: Math.round(totalSuggestedStake * 100) / 100,
    bestBet,
    systemSuggestion,
  };
}
