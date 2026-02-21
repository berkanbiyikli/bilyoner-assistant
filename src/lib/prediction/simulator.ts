// ============================================
// Monte Carlo Simülasyon Motoru
// Poisson dağılımı ile maç simülasyonu (10.000 iterasyon)
// ============================================

import type { MatchAnalysis, MatchOdds, MonteCarloResult, RefereeProfile } from "@/types";
import type { MatchImportance } from "@/lib/prediction/importance";
import { getCalibratedHomeAdvantage } from "@/lib/prediction/optimizer";

const SIM_RUNS = 10_000;

/**
 * Liga bazlı ev sahibi avantaj çarpanları
 * Araştırma: Türkiye, İspanya, İtalya'da ev sahibi avantajı PL/Bundesliga'dan yüksek
 * Kaynak: Son 10 sezon ev-deplasman galibiyet oranları
 */
const LEAGUE_HOME_ADVANTAGE: Record<number, number> = {
  // Türkiye — taraftar baskısı çok yüksek
  203: 1.12, // Süper Lig
  204: 1.10, // 1. Lig

  // Top 5 Avrupa
  39:  1.04, // Premier League — oldukça dengeli
  140: 1.08, // La Liga
  135: 1.09, // Serie A
  78:  1.05, // Bundesliga
  61:  1.06, // Ligue 1

  // Diğer
  94:  1.07, // Primeira Liga
  88:  1.05, // Eredivisie
  144: 1.06, // Jupiler Pro League
  235: 1.11, // Rusya Premier Liga — seyahat mesafesi etkisi

  // Avrupa kupaları — nötr/düşük avantaj
  2:   1.03, // Champions League
  3:   1.04, // Europa League
  848: 1.04, // Conference League
};

const DEFAULT_HOME_ADVANTAGE = 1.05;

/**
 * Hakem tempo etkisi: Sık düdük çalan hakemler maçın temposunu düşürür
 * Bu da xG beklentisini negatif etkiler (gol aksiyon sayısı azalır)
 * strict hakem → tempo düşürücü → lambda azaltıcı çarpan
 * lenient hakem → akıcı oyun → lambda artırıcı çarpan
 */
function getRefereeLambdaFactor(refProfile?: RefereeProfile): number {
  if (!refProfile) return 1.0;

  // avgCardsPerMatch > 5.5 → çok fazla duruş, tempo düşük
  // avgCardsPerMatch < 3.5 → akıcı oyun, gol fırsatları artar
  const cards = refProfile.avgCardsPerMatch;
  if (cards >= 5.5) return 0.94;   // Ağır tempo düşüşü
  if (cards >= 5.0) return 0.96;   // Orta tempo düşüşü
  if (cards >= 4.5) return 0.98;   // Hafif tempo düşüşü
  if (cards <= 3.0) return 1.04;   // Akıcı oyun, gol fırsatı artışı
  if (cards <= 3.5) return 1.02;   // Hafif tempo artışı
  return 1.0;                       // Nötr
}

/**
 * Liga ID'sine göre ev sahibi avantaj çarpanını getir
 * Self-Correction: Önce optimizer'ın kalibre ettiği değeri kontrol eder.
 * Cache'te kalibrasyon yoksa base (LEAGUE_HOME_ADVANTAGE) değeri döner.
 */
export function getHomeAdvantage(leagueId?: number): number {
  return getCalibratedHomeAdvantage(leagueId);
}

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
  odds?: MatchOdds,
  leagueId?: number,
  importance?: MatchImportance
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

  // Ev sahibi avantajı: Liga bazlı dinamik çarpan
  const homeAdvantageFactor = getHomeAdvantage(leagueId);

  // Hakem tempo etkisi: Sık düdük çalan hakemler xG'yi düşürür
  const refTempoFactor = getRefereeLambdaFactor(analysis.refereeProfile);

  // Match Importance (motivasyon) çarpanı
  const homeImportanceFactor = importance?.homeImportance ?? 1.0;
  const awayImportanceFactor = importance?.awayImportance ?? 1.0;

  let homeLambda = baseHomeLambda * awayDefFactor * homeInjuryFactor * homeAdvantageFactor * refTempoFactor * homeImportanceFactor;
  let awayLambda = baseAwayLambda * homeDefFactor * awayInjuryFactor * refTempoFactor * awayImportanceFactor;

  // Lambda aralığını sınırla (0.3 – 4.0 arası mantıklı)
  homeLambda = Math.max(0.3, Math.min(4.0, homeLambda));
  awayLambda = Math.max(0.3, Math.min(4.0, awayLambda));

  // --- İlk yarı lambda hesaplama ---
  // Ampirik olarak gollerin ~%42'si ilk yarıda atılır
  // Gol zamanlaması verisi varsa takıma özel oran kullan
  const htFactorHome = analysis.goalTiming
    ? Math.max(0.30, Math.min(0.55, analysis.goalTiming.home.first45 / 100))
    : 0.42;
  const htFactorAway = analysis.goalTiming
    ? Math.max(0.30, Math.min(0.55, analysis.goalTiming.away.first45 / 100))
    : 0.42;

  const homeLambdaHT = homeLambda * htFactorHome;
  const awayLambdaHT = awayLambda * htFactorAway;

  // --- Simülasyon ---
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;

  // İlk yarı sayaçları
  let htOver05 = 0;
  let htOver15 = 0;
  let htBttsYes = 0;
  let htHomeGoal = 0;
  let htAwayGoal = 0;

  const scoreMap = new Map<string, number>();
  const htScoreMap = new Map<string, number>();

  for (let i = 0; i < SIM_RUNS; i++) {
    // Maç sonu (full time) simülasyonu
    const homeGoals = poissonRandom(homeLambda);
    const awayGoals = poissonRandom(awayLambda);
    const totalGoals = homeGoals + awayGoals;

    // İlk yarı simülasyonu (ayrı Poisson çekimi)
    const homeGoalsHT = poissonRandom(homeLambdaHT);
    const awayGoalsHT = poissonRandom(awayLambdaHT);
    const totalGoalsHT = homeGoalsHT + awayGoalsHT;

    // Sonuç sayaçları (full time)
    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals === awayGoals) draws++;
    else awayWins++;

    if (totalGoals > 1.5) over15++;
    if (totalGoals > 2.5) over25++;
    if (totalGoals > 3.5) over35++;
    if (homeGoals > 0 && awayGoals > 0) bttsYes++;

    // İlk yarı sayaçları
    if (totalGoalsHT > 0.5) htOver05++;
    if (totalGoalsHT > 1.5) htOver15++;
    if (homeGoalsHT > 0 && awayGoalsHT > 0) htBttsYes++;
    if (homeGoalsHT > 0) htHomeGoal++;
    if (awayGoalsHT > 0) htAwayGoal++;

    // Skor haritaları
    const scoreKey = `${homeGoals}-${awayGoals}`;
    scoreMap.set(scoreKey, (scoreMap.get(scoreKey) || 0) + 1);

    const htScoreKey = `${homeGoalsHT}-${awayGoalsHT}`;
    htScoreMap.set(htScoreKey, (htScoreMap.get(htScoreKey) || 0) + 1);
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

  // Tüm skorlar (>%0.5 olasılık) — Crazy Pick modülü için
  const allScorelines = Array.from(scoreMap.entries())
    .filter(([, count]) => toPercent(count) >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([score, count]) => ({
      score,
      probability: toPercent(count),
    }));

  // İlk yarı en olası skorlar
  const htScorelines = Array.from(htScoreMap.entries())
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
    simHtOver05Prob: toPercent(htOver05),
    simHtOver15Prob: toPercent(htOver15),
    simHtBttsProb: toPercent(htBttsYes),
    simHtHomeGoalProb: toPercent(htHomeGoal),
    simHtAwayGoalProb: toPercent(htAwayGoal),
    topScorelines,
    allScorelines,
    htScorelines,
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
    case "HT BTTS Yes":
      return sim.simHtBttsProb;
    case "HT BTTS No":
      return sim.simHtBttsProb != null ? 100 - sim.simHtBttsProb : undefined;
    case "HT Over 0.5":
      return sim.simHtOver05Prob;
    case "HT Under 0.5":
      return sim.simHtOver05Prob != null ? 100 - sim.simHtOver05Prob : undefined;
    default: {
      // Exact Score desteği: "CS 2-1" → allScorelines'tan oku
      if (pickType.startsWith("CS ")) {
        const score = pickType.slice(3); // "2-1"
        const found = sim.allScorelines?.find((s) => s.score === score);
        return found ? found.probability : undefined;
      }
      return undefined; // Korner/Kart gibi pazarlar için simülasyon yok
    }
  }
}
