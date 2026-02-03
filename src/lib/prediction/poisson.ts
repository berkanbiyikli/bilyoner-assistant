/**
 * Poisson Distribution Module
 * Bilimsel skor tahmini için Poisson dağılımı
 * 
 * P(X = k) = (λ^k × e^(-λ)) / k!
 * λ = expected goals (beklenen gol)
 */

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
