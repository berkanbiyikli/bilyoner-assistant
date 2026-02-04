/**
 * Poisson Distribution Module
 * Bilimsel skor tahmini için Poisson dağılımı
 * 
 * P(X = k) = (λ^k × e^(-λ)) / k!
 * λ = expected goals (beklenen gol)
 */

import type { StandingEntry } from '@/types/api-football';
import { 
  LEAGUE_HOME_ADVANTAGE, 
  DEFAULT_HOME_ADVANTAGE,
  MIN_WEEKS_FOR_DYNAMIC,
  EXPERT_WEIGHT_EARLY_SEASON,
  EXPERT_WEIGHT_NORMAL
} from '@/config/league-priorities';

// =====================================
// 🏠 Dinamik Ev Avantajı Hesaplama
// =====================================

/**
 * Dinamik ev avantajı hesapla
 * Standings'ten ev/deplasman galibiyet oranlarını analiz eder
 * %50 Expert + %50 Dinamik harmanlama (sezon başında %80 Expert)
 * 
 * @param standings Lig sıralaması verileri
 * @param leagueId Lig ID'si
 * @returns Dinamik ev avantajı katsayısı (1.0 - 1.40 arası)
 */
export function calculateDynamicHomeAdvantage(
  standings: StandingEntry[],
  leagueId: number
): number {
  const expertValue = LEAGUE_HOME_ADVANTAGE[leagueId] || DEFAULT_HOME_ADVANTAGE;
  
  // Standings yoksa expert değeri kullan
  if (!standings || standings.length === 0) {
    return expertValue;
  }
  
  // Toplam oynanan maç sayısını hesapla
  const totalHomeMatches = standings.reduce((acc, team) => acc + team.home.played, 0);
  
  // Henüz yeterli maç oynanmadıysa expert değeri kullan
  if (totalHomeMatches === 0) {
    return expertValue;
  }
  
  // Hafta sayısını tahmin et (her takım 1 ev maçı = 1 hafta varsayımı)
  const weeksPlayed = Math.floor(totalHomeMatches / (standings.length / 2));
  
  // Ev/Deplasman galibiyet sayılarını hesapla
  const homeWins = standings.reduce((acc, team) => acc + team.home.win, 0);
  const awayWins = standings.reduce((acc, team) => acc + team.away.win, 0);
  
  // Galibiyet oranları
  const homeWinRate = homeWins / totalHomeMatches;
  const totalAwayMatches = standings.reduce((acc, team) => acc + team.away.played, 0);
  const awayWinRate = totalAwayMatches > 0 ? awayWins / totalAwayMatches : 0.3;
  
  // Dinamik faktör: 1 + (ev oranı - deplasman oranı)
  // Örnek: Ev %50, Deplasman %25 → 1 + (0.50 - 0.25) = 1.25
  const dynamicFactor = 1 + (homeWinRate - awayWinRate);
  
  // Sezon başı güvenlik: Az maç varsa expert ağırlığını artır
  const expertWeight = weeksPlayed < MIN_WEEKS_FOR_DYNAMIC 
    ? EXPERT_WEIGHT_EARLY_SEASON 
    : EXPERT_WEIGHT_NORMAL;
  const dynamicWeight = 1 - expertWeight;
  
  // %50 Expert + %50 Dinamik harmanlama (veya sezon başı %80/%20)
  const blendedAdvantage = (expertValue * expertWeight) + (dynamicFactor * dynamicWeight);
  
  // Sınırla: 1.0 - 1.40 arası (aşırı uç değerleri engelle)
  return Math.max(1.0, Math.min(1.40, blendedAdvantage));
}

/**
 * Lig gol ortalamasını standings'ten dinamik hesapla
 * @param standings Lig sıralaması verileri
 * @returns { home: number, away: number } - Ev ve deplasman gol ortalamaları
 */
export function calculateLeagueAvgGoals(standings: StandingEntry[]): { home: number; away: number } {
  if (!standings || standings.length === 0) {
    return { home: 1.5, away: 1.2 }; // Varsayılan değerler
  }
  
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  let totalHomeMatches = 0;
  let totalAwayMatches = 0;
  
  standings.forEach(team => {
    totalHomeGoals += team.home.goals.for;
    totalAwayGoals += team.away.goals.for;
    totalHomeMatches += team.home.played;
    totalAwayMatches += team.away.played;
  });
  
  return {
    home: totalHomeMatches > 0 ? totalHomeGoals / totalHomeMatches : 1.5,
    away: totalAwayMatches > 0 ? totalAwayGoals / totalAwayMatches : 1.2,
  };
}

// =====================================
// 📊 Poisson Temel Fonksiyonlar
// =====================================

// Factorial hesaplama (memoized)
const factorialCache: Map<number, number> = new Map();

function factorial(n: number): number {
  if (n <= 1) return 1;
  
  const cached = factorialCache.get(n);
  if (cached !== undefined) return cached;
  
  const result = n * factorial(n - 1);
  factorialCache.set(n, result);
  return result;
}

/**
 * Poisson olasılık hesabı
 * @param k Beklenen olay sayısı (gol)
 * @param lambda Ortalama beklenti (xG)
 * @returns Olasılık (0-1 arası)
 */
export function poissonProbability(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  
  // P(X = k) = (λ^k × e^(-λ)) / k!
  const numerator = Math.pow(lambda, k) * Math.exp(-lambda);
  const denominator = factorial(k);
  
  return numerator / denominator;
}

/**
 * Kümülatif Poisson olasılık (P(X <= k))
 */
export function poissonCumulativeProbability(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += poissonProbability(i, lambda);
  }
  return sum;
}

/**
 * Skor matrisi oluştur
 * Her olası skor kombinasyonunun olasılığını hesapla
 */
export interface ScoreMatrix {
  matrix: number[][];
  homeGoals: number[];
  awayGoals: number[];
  maxGoals: number;
}

export function generateScoreMatrix(
  homeXG: number,
  awayXG: number,
  maxGoals: number = 6
): ScoreMatrix {
  const matrix: number[][] = [];
  const homeGoals: number[] = [];
  const awayGoals: number[] = [];

  for (let h = 0; h <= maxGoals; h++) {
    homeGoals.push(h);
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      if (h === 0) awayGoals.push(a);
      
      // Bağımsız olasılıkların çarpımı
      const homeProb = poissonProbability(h, homeXG);
      const awayProb = poissonProbability(a, awayXG);
      matrix[h][a] = homeProb * awayProb;
    }
  }

  return { matrix, homeGoals, awayGoals, maxGoals };
}

/**
 * Skor matrisinden maç sonucu olasılıkları
 */
export interface MatchOutcomeProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  over45: number;
  bttsYes: number;
  bttsNo: number;
  exactScores: { score: string; probability: number }[];
}

export function calculateOutcomeProbabilities(
  matrix: ScoreMatrix
): MatchOutcomeProbabilities {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over05 = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let over45 = 0;
  let bttsYes = 0;
  let bttsNo = 0;

  const exactScores: { score: string; probability: number }[] = [];

  for (let h = 0; h <= matrix.maxGoals; h++) {
    for (let a = 0; a <= matrix.maxGoals; a++) {
      const prob = matrix.matrix[h][a];
      const total = h + a;

      // Maç sonucu
      if (h > a) homeWin += prob;
      else if (h < a) awayWin += prob;
      else draw += prob;

      // Alt/Üst
      if (total >= 1) over05 += prob;
      if (total >= 2) over15 += prob;
      if (total >= 3) over25 += prob;
      if (total >= 4) over35 += prob;
      if (total >= 5) over45 += prob;

      // BTTS
      if (h > 0 && a > 0) bttsYes += prob;
      else bttsNo += prob;

      // Skor
      exactScores.push({
        score: `${h}-${a}`,
        probability: prob,
      });
    }
  }

  // Normalize (sayısal hatalar için)
  const total = homeWin + draw + awayWin;
  homeWin /= total;
  draw /= total;
  awayWin /= total;

  // En olası skorlar
  exactScores.sort((a, b) => b.probability - a.probability);

  return {
    homeWin: homeWin * 100,
    draw: draw * 100,
    awayWin: awayWin * 100,
    over05: over05 * 100,
    over15: over15 * 100,
    over25: over25 * 100,
    over35: over35 * 100,
    over45: over45 * 100,
    bttsYes: bttsYes * 100,
    bttsNo: bttsNo * 100,
    exactScores: exactScores.slice(0, 10).map(s => ({
      ...s,
      probability: s.probability * 100,
    })),
  };
}

/**
 * xG (Expected Goals) hesaplama
 * Ev/Deplasman avantajı ve savunma gücü dahil
 */
export interface XGCalculationInput {
  // Atak gücü (gol atma)
  homeGoalsScored: number;      // Ev sahibi ortalama gol
  awayGoalsScored: number;      // Deplasman ortalama gol
  
  // Savunma gücü (gol yeme)
  homeGoalsConceded: number;    // Ev sahibi ortalama yediği gol
  awayGoalsConceded: number;    // Deplasman ortalama yediği gol
  
  // Lig ortalamaları
  leagueAvgHomeGoals?: number;  // Lig ev sahibi gol ort.
  leagueAvgAwayGoals?: number;  // Lig deplasman gol ort.
  
  // Ev avantajı faktörü
  homeAdvantage?: number;       // 1.0 = nötr, 1.1 = %10 avantaj
  
  // 🆕 xG Entegrasyonu (Faz 2)
  homeRecentXG?: number[];      // Son 5 maçın xG değerleri
  awayRecentXG?: number[];      // Son 5 maçın xG değerleri
  leagueId?: number;            // Dinamik hesaplamalar için lig ID
}

// =====================================
// 📊 xG Weighted Average (Ağırlıklı Ortalama)
// =====================================

/** Son maçlara verilen ağırlıklar (son maç = 1.0, en eski = 0.4) */
const XG_DECAY_WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4];

/** Varsayılan shrinkage oranı (%70 gerçek veri, %30 lig ortalaması) */
export const DEFAULT_XG_SHRINKAGE = 0.7;

/**
 * Ağırlıklı xG ortalaması hesapla
 * Son maçlara daha yüksek ağırlık verir (Recency Decay)
 * xG yoksa shrinkage ile lig ortalamasına regrese eder
 * 
 * Formül:
 * - xG varsa: Weighted Average with decay [1.0, 0.85, 0.7, 0.55, 0.4]
 * - xG yoksa: (actualGoals × shrinkage) + (leagueAvg × (1 - shrinkage))
 * 
 * @param recentXG Son maçların xG değerleri (veya gerçek goller fallback olarak)
 * @param leagueAvg Lig gol ortalaması
 * @param shrinkage Shrinkage oranı (0-1 arası, default 0.7)
 * @param hasRealXG Verinin gerçek xG mi yoksa gol mi olduğu
 * @returns Ağırlıklı xG değeri
 */
export function calculateWeightedXG(
  recentXG: number[],
  leagueAvg: number,
  shrinkage: number = DEFAULT_XG_SHRINKAGE,
  hasRealXG: boolean = true
): number {
  // Veri yoksa lig ortalamasını döndür
  if (!recentXG || recentXG.length === 0) {
    return leagueAvg;
  }
  
  // Ağırlıklı ortalama hesapla
  let weightedSum = 0;
  let totalWeight = 0;
  
  recentXG.slice(0, 5).forEach((xg, i) => {
    const weight = XG_DECAY_WEIGHTS[i] ?? 0.3;
    weightedSum += xg * weight;
    totalWeight += weight;
  });
  
  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : leagueAvg;
  
  // Gerçek xG verisi varsa direkt kullan
  if (hasRealXG) {
    return weightedAvg;
  }
  
  // Gerçek gol verisi (fallback) ise shrinkage uygula
  // Uç değerlerden kaçınmak için lig ortalamasına doğru regrese et
  // Formül: (gerçekGol × 0.7) + (ligOrt × 0.3)
  return (weightedAvg * shrinkage) + (leagueAvg * (1 - shrinkage));
}

/**
 * xG verisi olan maçları gerçek xG olmayan maçlardan ayır
 * @param recentData Son maçların verileri
 * @returns { xgValues, hasRealXG } - xG değerleri ve gerçek xG olup olmadığı
 */
export function processRecentXGData(
  recentData: Array<{ xg?: number | null; goals: number }>
): { xgValues: number[]; hasRealXG: boolean } {
  const xgValues: number[] = [];
  let realXGCount = 0;
  
  recentData.slice(0, 5).forEach(match => {
    if (match.xg !== null && match.xg !== undefined) {
      xgValues.push(match.xg);
      realXGCount++;
    } else {
      xgValues.push(match.goals);
    }
  });
  
  // En az yarısında gerçek xG varsa "hasRealXG" true
  const hasRealXG = realXGCount >= Math.ceil(xgValues.length / 2);
  
  return { xgValues, hasRealXG };
}

export interface XGResult {
  homeXG: number;
  awayXG: number;
  totalXG: number;
  homeAttackStrength: number;
  homeDefenseStrength: number;
  awayAttackStrength: number;
  awayDefenseStrength: number;
}

export function calculateXG(input: XGCalculationInput): XGResult {
  const {
    homeGoalsScored,
    awayGoalsScored,
    homeGoalsConceded,
    awayGoalsConceded,
    leagueAvgHomeGoals = 1.5,
    leagueAvgAwayGoals = 1.2,
    homeAdvantage = 1.1,
  } = input;

  // Atak gücü = Takımın attığı gol / Lig ortalaması
  const homeAttackStrength = homeGoalsScored / leagueAvgHomeGoals;
  const awayAttackStrength = awayGoalsScored / leagueAvgAwayGoals;

  // Savunma gücü = Takımın yediği gol / Lig ortalaması
  // Düşük = iyi savunma
  const homeDefenseStrength = homeGoalsConceded / leagueAvgAwayGoals;
  const awayDefenseStrength = awayGoalsConceded / leagueAvgHomeGoals;

  // xG hesabı
  // Ev sahibi xG = Lig ort. × Ev atak gücü × Deplasman savunma zayıflığı × Ev avantajı
  const homeXG = leagueAvgHomeGoals * homeAttackStrength * awayDefenseStrength * homeAdvantage;
  
  // Deplasman xG = Lig ort. × Dep. atak gücü × Ev savunma zayıflığı
  const awayXG = leagueAvgAwayGoals * awayAttackStrength * homeDefenseStrength;

  return {
    homeXG: Math.max(0.2, Math.min(4.0, homeXG)),  // 0.2 - 4.0 arası sınırla
    awayXG: Math.max(0.1, Math.min(3.5, awayXG)),  // 0.1 - 3.5 arası sınırla
    totalXG: homeXG + awayXG,
    homeAttackStrength,
    homeDefenseStrength,
    awayAttackStrength,
    awayDefenseStrength,
  };
}

/**
 * Tam Poisson analizi
 * xG hesabı + Skor matrisi + Olasılıklar
 */
export interface PoissonAnalysis {
  xg: XGResult;
  probabilities: MatchOutcomeProbabilities;
  mostLikelyScore: string;
  confidence: number;
}

export function analyzePoissonPrediction(input: XGCalculationInput): PoissonAnalysis {
  // xG hesapla
  const xg = calculateXG(input);
  
  // Skor matrisi oluştur
  const matrix = generateScoreMatrix(xg.homeXG, xg.awayXG);
  
  // Olasılıkları hesapla
  const probabilities = calculateOutcomeProbabilities(matrix);
  
  // En olası skor
  const mostLikelyScore = probabilities.exactScores[0]?.score || '1-1';
  
  // Güven skoru (en olası sonucun olasılığına göre)
  const maxProb = Math.max(
    probabilities.homeWin,
    probabilities.draw,
    probabilities.awayWin
  );
  const confidence = Math.min(95, 50 + maxProb);

  return {
    xg,
    probabilities,
    mostLikelyScore,
    confidence,
  };
}
