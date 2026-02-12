// ============================================
// Monte Carlo Simülasyon Motoru
// Poisson dağılımı ile maç simülasyonu (10.000 iterasyon)
// ============================================

import type { MatchAnalysis, MatchOdds, MonteCarloResult } from "@/types";

const SIM_RUNS = 10_000;

/**
 * Poisson dağılımından rastgele sayı üretimi (Knuth algoritması)
 * Harici kütüphane gerektirmez — O(lambda) karmaşıklık
 */
function poissonRandom(lambda: number): number {
  if (lambda <= 0) return 0;

  // Büyük lambda değerleri için normal yaklaşım (lambda > 30 nadir ama güvenlik)
  if (lambda > 30) {
    const normal = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
    return Math.max(0, Math.round(lambda + normal * Math.sqrt(lambda)));
  }

  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;

  do {
    k++;
    p *= Math.random();
  } while (p > L);

  return k - 1;
}

/**
 * Maçı 10.000 kez simüle et ve olasılık dağılımlarını döndür
 *
 * Lambda hesabı:
 * - Base: xG veya (attack/100 * 1.5) fallback
 * - Ev sahibi avantajı: ×1.05
 * - Sakatlık düzeltmesi: kilit eksikler lambda'yı düşürür
 * - Savunma etkisi: rakip savunma güçlüyse lambda düşer
 */
export function simulateMatch(
  analysis: MatchAnalysis,
  odds?: MatchOdds
): MonteCarloResult {
  // --- Lambda hesaplama ---
  const baseHomeLambda = analysis.homeXg ?? (analysis.homeAttack / 100) * 1.5;
  const baseAwayLambda = analysis.awayXg ?? (analysis.awayAttack / 100) * 1.5;

  // Savunma etkisi: Rakip savunma güçlüyse lambda düşer
  // 50 = nötr, 70+ = güçlü savunma → lambda'yı %15'e kadar düşür
  const awayDefFactor = 1 - Math.max(0, (analysis.awayDefense - 50) / 200); // 0.9 – 1.0
  const homeDefFactor = 1 - Math.max(0, (analysis.homeDefense - 50) / 200);

  // Sakatlık etkisi: Kilit forvet eksikliği lambda'yı düşürür
  const homeInjuryFactor = 1 - Math.min(0.25, analysis.injuryImpact.home / 80);
  const awayInjuryFactor = 1 - Math.min(0.25, analysis.injuryImpact.away / 80);

  // Ev sahibi avantajı: %5
  const homeAdvantageFactor = 1.05;

  let homeLambda = baseHomeLambda * awayDefFactor * homeInjuryFactor * homeAdvantageFactor;
  let awayLambda = baseAwayLambda * homeDefFactor * awayInjuryFactor;

  // Lambda aralığını sınırla (0.3 – 4.0 arası mantıklı)
  homeLambda = Math.max(0.3, Math.min(4.0, homeLambda));
  awayLambda = Math.max(0.3, Math.min(4.0, awayLambda));

  // --- Simülasyon ---
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;

  const scoreMap = new Map<string, number>();

  for (let i = 0; i < SIM_RUNS; i++) {
    const homeGoals = poissonRandom(homeLambda);
    const awayGoals = poissonRandom(awayLambda);
    const totalGoals = homeGoals + awayGoals;

    // Sonuç sayaçları
    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals === awayGoals) draws++;
    else awayWins++;

    if (totalGoals > 1.5) over15++;
    if (totalGoals > 2.5) over25++;
    if (totalGoals > 3.5) over35++;
    if (homeGoals > 0 && awayGoals > 0) bttsYes++;

    // Skor haritası
    const scoreKey = `${homeGoals}-${awayGoals}`;
    scoreMap.set(scoreKey, (scoreMap.get(scoreKey) || 0) + 1);
  }

  // --- Sonuçları normalize et ---
  const toPercent = (count: number) => Math.round((count / SIM_RUNS) * 1000) / 10;

  // En olası 5 skor
  const topScorelines = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([score, count]) => ({
      score,
      probability: toPercent(count),
    }));

  return {
    simHomeWinProb: toPercent(homeWins),
    simDrawProb: toPercent(draws),
    simAwayWinProb: toPercent(awayWins),
    simOver15Prob: toPercent(over15),
    simOver25Prob: toPercent(over25),
    simOver35Prob: toPercent(over35),
    simBttsProb: toPercent(bttsYes),
    topScorelines,
    simRuns: SIM_RUNS,
  };
}

/**
 * Simülasyon sonuçlarından pazar bazında olasılık getir
 * Pick type'a göre doğru simülasyon olasılığını döndürür
 */
export function getSimProbability(
  sim: MonteCarloResult,
  pickType: string
): number | undefined {
  switch (pickType) {
    case "1":
      return sim.simHomeWinProb;
    case "X":
      return sim.simDrawProb;
    case "2":
      return sim.simAwayWinProb;
    case "Over 1.5":
      return sim.simOver15Prob;
    case "Over 2.5":
      return sim.simOver25Prob;
    case "Over 3.5":
      return sim.simOver35Prob;
    case "Under 1.5":
      return 100 - sim.simOver15Prob;
    case "Under 2.5":
      return 100 - sim.simOver25Prob;
    case "Under 3.5":
      return 100 - sim.simOver35Prob;
    case "BTTS Yes":
      return sim.simBttsProb;
    case "BTTS No":
      return 100 - sim.simBttsProb;
    default:
      return undefined; // Korner/Kart gibi pazarlar için simülasyon yok
  }
}
