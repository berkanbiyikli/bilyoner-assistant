// ============================================
// Monte Carlo Simülasyon Motoru v2
// Dixon-Coles Bivariate Poisson + Form Decay + Elo
// Hibrit model: 10.000 MC iterasyon + analitik DC doğrulama
// ============================================

import type { MatchAnalysis, MatchOdds, MonteCarloResult, RefereeProfile } from "@/types";
import type { MatchImportance } from "@/lib/prediction/importance";
import { getCalibratedHomeAdvantage, getMarketCalibrationAdjustment } from "@/lib/prediction/optimizer";
import { estimateRho, calculateAnalyticProbabilities, dixonColesTau } from "@/lib/prediction/dixon-coles";
import type { FormAnalysis } from "@/lib/prediction/form-analyzer";
import { formToLambdaMultiplier } from "@/lib/prediction/form-analyzer";

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
 * Negative Binomial dağılımından rastgele sayı üretimi
 * Futbolda Poisson'un öngördüğünden daha yüksek varyans var (overdispersion).
 * NB(r, p): mean = lambda, variance = lambda + lambda²/r
 * r parametresi ne kadar küçükse overdispersion o kadar yüksek.
 * r → ∞ olduğunda Poisson'a yakınsar.
 *
 * Algoritma: Gamma-Poisson mixture
 *   1) Gamma(r, r/lambda) → rate
 *   2) Poisson(rate) → gol sayısı
 *
 * @param lambda Beklenen gol (mean)
 * @param r Overdispersion parametresi (küçük = daha fazla varyans). Futbol için 4-8 arası ideal.
 */
function negativeBinomialRandom(lambda: number, r: number = 6): number {
  if (lambda <= 0) return 0;

  // Gamma(r, lambda/r) üretimi — Marsaglia & Tsang yöntemi
  const scale = lambda / r;
  const gammaValue = gammaRandom(r, scale);
  
  // Gamma sonucundan Poisson çekimi
  return poissonRandom(gammaValue);
}

/**
 * Gamma dağılımından rastgele sayı üretimi (Marsaglia & Tsang, 2000)
 * Shape = alpha (r), Scale = beta (lambda/r)
 */
function gammaRandom(alpha: number, scale: number): number {
  if (alpha < 1) {
    // alpha < 1 için: Gamma(alpha) = Gamma(alpha+1) * U^(1/alpha)
    return gammaRandom(alpha + 1, scale) * Math.pow(Math.random(), 1 / alpha);
  }

  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number, v: number;
    do {
      x = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Liga bazlı overdispersion parametresi
 * Bazı ligler doğası gereği daha öngörülmez (düşük r = yüksek varyans)
 * Araştırma: Bundesliga ve Eredivisie gol profili daha "patlak", Serie A daha öngörülebilir
 */
const LEAGUE_OVERDISPERSION: Record<number, number> = {
  78:  4.5,  // Bundesliga — yüksek gollü, sürprizli
  88:  4.5,  // Eredivisie — benzer profil
  203: 5.0,  // Süper Lig — taraftar etkisiyle volatil
  39:  6.0,  // Premier League — dengeli ama fiziksel
  140: 6.5,  // La Liga — daha taktiksel, öngörülebilir
  135: 7.0,  // Serie A — defansif, düşük varyans
  61:  5.5,  // Ligue 1 — PSG etkisi
  94:  5.5,  // Primeira Liga
  2:   5.0,  // Champions League — knockout volatilitesi
  3:   5.0,  // Europa League
  848: 4.5,  // Conference League — kalite farkları yüksek
};

const DEFAULT_OVERDISPERSION = 6.0;

function getOverdispersion(leagueId?: number): number {
  if (!leagueId) return DEFAULT_OVERDISPERSION;
  return LEAGUE_OVERDISPERSION[leagueId] ?? DEFAULT_OVERDISPERSION;
}

/**
 * Liga bazlı ortalama gol oranı (takım başına, maç başına)
 * xG yoksa fallback lambda hesabında kullanılır: attack/100 * leagueAvgGoals
 * Kaynak: 2023-24 sezonu ampirik verileri
 */
const LEAGUE_AVG_GOALS_PER_TEAM: Record<number, number> = {
  78:  1.65, // Bundesliga — yüksek tempolu
  88:  1.60, // Eredivisie — açık futbol
  203: 1.40, // Süper Lig — defansif eğilimli
  39:  1.45, // Premier League — fiziksel, dengeli
  140: 1.30, // La Liga — taktiksel, düşük gollü
  135: 1.25, // Serie A — defansif gelenek
  61:  1.40, // Ligue 1
  94:  1.35, // Primeira Liga
  2:   1.35, // Champions League
  3:   1.40, // Europa League
  848: 1.45, // Conference League — kalite farkı
  179: 1.50, // Scottish Premiership
  144: 1.35, // Belgian Pro League
  218: 1.30, // MLS (düşük defans kalitesi ama temposu da düşük)
  253: 1.50, // Argentine Primera División
  71:  1.55, // Brazilian Serie A
};

const DEFAULT_AVG_GOALS = 1.40;

function getLeagueAvgGoals(leagueId?: number): number {
  if (!leagueId) return DEFAULT_AVG_GOALS;
  return LEAGUE_AVG_GOALS_PER_TEAM[leagueId] ?? DEFAULT_AVG_GOALS;
}

/**
 * Maçı 10.000 kez simüle et ve olasılık dağılımlarını döndür
 *
 * Lambda hesabı (v2 — Dixon-Coles hybrid):
 * - Base: xG veya (attack/100 * 1.5) fallback
 * - Ev sahibi avantajı: ×1.05 (liga bazlı, kalibre edilmiş)
 * - Sakatlık düzeltmesi: kilit eksikler lambda'yı düşürür
 * - Savunma etkisi: rakip savunma güçlüyse lambda düşer
 * - Form decay: son maçlar ağırlıklı momentum çarpanı
 * - Market kalibrasyon: optimizer'dan gelen pazar düzeltmeleri
 * - Dixon-Coles: Düşük skor korelasyonu (ρ parametresi)
 */
export function simulateMatch(
  analysis: MatchAnalysis,
  odds?: MatchOdds,
  leagueId?: number,
  importance?: MatchImportance,
  homeFormAnalysis?: FormAnalysis,
  awayFormAnalysis?: FormAnalysis
): MonteCarloResult {
  // --- Lambda hesaplama ---
  const leagueAvg = getLeagueAvgGoals(leagueId);
  const baseHomeLambda = analysis.homeXg ?? (analysis.homeAttack / 100) * leagueAvg;
  const baseAwayLambda = analysis.awayXg ?? (analysis.awayAttack / 100) * leagueAvg;

  // Savunma etkisi: Rakip savunma güçlüyse lambda düşer
  // 50 = nötr. 70+ = güçlü savunma → lambda'yı %25'e kadar düşür
  // 30- = zayıf savunma → lambda'yı %12'ye kadar artır
  const defFactor = (defenseScore: number): number => {
    if (defenseScore >= 50) {
      // Güçlü savunma: 50→70 → 1.0→0.80 (nonlinear)
      return 1 - Math.pow((defenseScore - 50) / 50, 1.3) * 0.25;
    } else {
      // Zayıf savunma: 50→30 → 1.0→1.12
      return 1 + Math.pow((50 - defenseScore) / 50, 1.2) * 0.12;
    }
  };
  const awayDefFactor = defFactor(analysis.awayDefense);
  const homeDefFactor = defFactor(analysis.homeDefense);

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

  // Form Decay etkisi: Son maçların momentum çarpanı
  if (homeFormAnalysis) {
    const homeFormMul = formToLambdaMultiplier(homeFormAnalysis);
    homeLambda *= homeFormMul.attackMultiplier;
    awayLambda *= homeFormMul.defenseMultiplier; // Ev sahibi iyi formdaysa rakip daha az atar
  }
  if (awayFormAnalysis) {
    const awayFormMul = formToLambdaMultiplier(awayFormAnalysis);
    awayLambda *= awayFormMul.attackMultiplier;
    homeLambda *= awayFormMul.defenseMultiplier;
  }

  // Market-specific kalibrasyon: Optimizer'dan gelen pazar düzeltmeleri
  const marketAdj = getMarketCalibrationAdjustment();
  if (marketAdj) {
    // Over pazarları over-confident ise lambda'yı düşür
    homeLambda *= (1 + (marketAdj.goalLambdaAdjustment ?? 0));
    awayLambda *= (1 + (marketAdj.goalLambdaAdjustment ?? 0));
  }

  // Lambda aralığını sınırla (0.25 – 3.8 arası mantıklı)
  homeLambda = Math.max(0.25, Math.min(3.8, homeLambda));
  awayLambda = Math.max(0.25, Math.min(3.8, awayLambda));

  // === Dixon-Coles Korelasyon Parametresi ===
  const rho = estimateRho(homeLambda, awayLambda, analysis.homeDefense, analysis.awayDefense, leagueId);

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

  // --- Overdispersion parametresi (Negative Binomial) ---
  const overdispersionR = getOverdispersion(leagueId);

  // --- Simülasyon ---
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let bttsYes = 0;

  // Double Chance
  let homeOrDraw = 0;
  let awayOrDraw = 0;
  let homeOrAway = 0;

  // Combo picks
  let homeAndOver15 = 0;
  let awayAndOver15 = 0;
  let homeAndBtts = 0;
  let awayAndBtts = 0;
  let drawAndBtts = 0;

  // İlk yarı sayaçları
  let htOver05 = 0;
  let htOver15 = 0;
  let htBttsYes = 0;
  let htHomeGoal = 0;
  let htAwayGoal = 0;

  // İY/MS sayaçları
  const htftMap = new Map<string, number>();

  const scoreMap = new Map<string, number>();
  const htScoreMap = new Map<string, number>();

  for (let i = 0; i < SIM_RUNS; i++) {
    // --- Maç sonu (full time) simülasyonu ---
    // Negative Binomial: Poisson'dan daha yüksek varyans (overdispersion)
    // Gerçek futbol verisine daha iyi uyum sağlar
    let homeGoals = negativeBinomialRandom(homeLambda, overdispersionR);
    let awayGoals = negativeBinomialRandom(awayLambda, overdispersionR);

    // Dixon-Coles düşük skor düzeltmesi (rejection sampling)
    if (homeGoals <= 1 && awayGoals <= 1) {
      const tau = dixonColesTau(homeGoals, awayGoals, homeLambda, awayLambda, rho);
      if (tau < 1 && Math.random() > tau) {
        homeGoals = negativeBinomialRandom(homeLambda, overdispersionR);
        awayGoals = negativeBinomialRandom(awayLambda, overdispersionR);
      }
    }

    const totalGoals = homeGoals + awayGoals;
    const isBtts = homeGoals > 0 && awayGoals > 0;

    // İlk yarı simülasyonu (Negative Binomial)
    const homeGoalsHT = negativeBinomialRandom(homeLambdaHT, overdispersionR);
    const awayGoalsHT = negativeBinomialRandom(awayLambdaHT, overdispersionR);
    const totalGoalsHT = homeGoalsHT + awayGoalsHT;

    // --- Sonuç sayaçları (full time) ---
    const isHomeWin = homeGoals > awayGoals;
    const isDraw = homeGoals === awayGoals;
    const isAwayWin = homeGoals < awayGoals;

    if (isHomeWin) homeWins++;
    else if (isDraw) draws++;
    else awayWins++;

    if (totalGoals > 1.5) over15++;
    if (totalGoals > 2.5) over25++;
    if (totalGoals > 3.5) over35++;
    if (isBtts) bttsYes++;

    // Double Chance
    if (isHomeWin || isDraw) homeOrDraw++;
    if (isAwayWin || isDraw) awayOrDraw++;
    if (isHomeWin || isAwayWin) homeOrAway++;

    // Combo picks
    if (isHomeWin && totalGoals > 1.5) homeAndOver15++;
    if (isAwayWin && totalGoals > 1.5) awayAndOver15++;
    if (isHomeWin && isBtts) homeAndBtts++;
    if (isAwayWin && isBtts) awayAndBtts++;
    if (isDraw && isBtts) drawAndBtts++;

    // İlk yarı sayaçları
    if (totalGoalsHT > 0.5) htOver05++;
    if (totalGoalsHT > 1.5) htOver15++;
    if (homeGoalsHT > 0 && awayGoalsHT > 0) htBttsYes++;
    if (homeGoalsHT > 0) htHomeGoal++;
    if (awayGoalsHT > 0) htAwayGoal++;

    // İY/MS: İlk yarı sonucunu belirle ve MS ile eşleştir
    const htResult = homeGoalsHT > awayGoalsHT ? "1" : homeGoalsHT === awayGoalsHT ? "X" : "2";
    const ftResult = isHomeWin ? "1" : isDraw ? "X" : "2";
    const htftKey = `${htResult}/${ftResult}`;
    htftMap.set(htftKey, (htftMap.get(htftKey) || 0) + 1);

    // Skor haritaları
    const scoreKey = `${homeGoals}-${awayGoals}`;
    scoreMap.set(scoreKey, (scoreMap.get(scoreKey) || 0) + 1);

    const htScoreKey = `${homeGoalsHT}-${awayGoalsHT}`;
    htScoreMap.set(htScoreKey, (htScoreMap.get(htScoreKey) || 0) + 1);
  }

  // --- Sonuçları normalize et ---
  const toPercent = (count: number) => Math.round((count / SIM_RUNS) * 1000) / 10;

  // === Dixon-Coles Analitik Cross-Validation ===
  // MC sonuçlarını analitik DC olasılıklarıyla harmanlayarak daha doğru sonuç elde et
  const dcAnalytic = calculateAnalyticProbabilities(homeLambda, awayLambda, rho);

  // Hibrit: %70 MC + %30 DC Analitik (MC varyansı yüksek olabilir, DC stabilize eder)
  const hybridPercent = (mcCount: number, dcValue: number): number => {
    const mcPercent = (mcCount / SIM_RUNS) * 100;
    return Math.round((mcPercent * 0.70 + dcValue * 0.30) * 10) / 10;
  };

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

  // İY/MS olasılıkları
  const htFtProbs: Record<string, number> = {};
  for (const [key, count] of htftMap.entries()) {
    htFtProbs[key] = toPercent(count);
  }

  return {
    simHomeWinProb: hybridPercent(homeWins, dcAnalytic.homeWin),
    simDrawProb: hybridPercent(draws, dcAnalytic.draw),
    simAwayWinProb: hybridPercent(awayWins, dcAnalytic.awayWin),
    simOver15Prob: hybridPercent(over15, dcAnalytic.over15),
    simOver25Prob: hybridPercent(over25, dcAnalytic.over25),
    simOver35Prob: hybridPercent(over35, dcAnalytic.over35),
    simBttsProb: hybridPercent(bttsYes, dcAnalytic.bttsYes),
    simHtOver05Prob: toPercent(htOver05),
    simHtOver15Prob: toPercent(htOver15),
    simHtBttsProb: toPercent(htBttsYes),
    simHtHomeGoalProb: toPercent(htHomeGoal),
    simHtAwayGoalProb: toPercent(htAwayGoal),
    // Double Chance
    simHomeOrDrawProb: toPercent(homeOrDraw),
    simAwayOrDrawProb: toPercent(awayOrDraw),
    simHomeOrAwayProb: toPercent(homeOrAway),
    // Combo picks
    simHomeAndOver15Prob: toPercent(homeAndOver15),
    simAwayAndOver15Prob: toPercent(awayAndOver15),
    simHomeAndBttsProb: toPercent(homeAndBtts),
    simAwayAndBttsProb: toPercent(awayAndBtts),
    simDrawAndBttsProb: toPercent(drawAndBtts),
    // İY/MS
    simHtFtProbs: htFtProbs,
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
    // Double Chance
    case "1X":
      return sim.simHomeOrDrawProb;
    case "X2":
      return sim.simAwayOrDrawProb;
    case "12":
      return sim.simHomeOrAwayProb;
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
    // Combo picks
    case "1 & Over 1.5":
      return sim.simHomeAndOver15Prob;
    case "2 & Over 1.5":
      return sim.simAwayAndOver15Prob;
    default: {
      // İY/MS desteği: "1/1", "X/2", etc.
      if (pickType.includes("/") && pickType.length <= 3) {
        return sim.simHtFtProbs?.[pickType];
      }
      // Exact Score desteği: "CS 2-1" → allScorelines'tan oku
      if (pickType.startsWith("CS ")) {
        const score = pickType.slice(3); // "2-1"
        const found = sim.allScorelines?.find((s) => s.score === score);
        return found ? found.probability : undefined;
      }
      return undefined;
    }
  }
}
