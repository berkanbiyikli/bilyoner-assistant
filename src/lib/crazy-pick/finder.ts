// ============================================
// Crazy Pick (Black Swan) Finder
// Yüksek oranlı exact score tahminleri
// Monte Carlo simülasyonunun piyasadan fazla gördüğü
// uç skorları tespit eder
// ============================================
//
// Strateji:
// 1. Volatilite skoru hesapla (liga + maç metrikleri)
// 2. Simülasyonun TÜM skor dağılımını al (allScorelines)
// 3. Bahisçi oranlarından implied probability hesapla
// 4. simProb > impliedProb → edge var → Crazy Pick
// 5. Aynı maçtan 3-5 skor varyasyonu seç (sistem kuponu)
// 6. Sabit 50 TL stake

import type { MatchPrediction, CrazyPick, CrazyPickResult } from "@/types";
import { getLeagueById, type VolatilityLevel } from "@/lib/api-football/leagues";

// ---- Konfigürasyon ----
const CRAZY_PICK_CONFIG = {
  minBookmakerOdds: 8.0,      // Minimum oran (daha erişilebilir)
  maxBookmakerOdds: 201.0,    // Maximum oran (çok absürd oranları pas geç)
  minSimProbability: 0.8,     // Minimum sim olasılığı % (en az 80/10000 iterasyon)
  minEdge: 3.0,               // Minimum edge % (sim piyasadan %3+ fazla görmeli)
  minVolatilityScore: 20,     // Minimum volatilite skoru (biraz esnetildi)
  minTotalGoals: 3,           // Minimum toplam gol (3-1 ve üstü)
  maxPicksPerMatch: 5,        // Maç başına max skor varyasyonu
  minPicksPerMatch: 1,        // Maç başına min skor varyasyonu (1'e düşürüldü)
  stake: 50,                  // Sabit stake (TL)
  vigCorrection: 0.92,        // Bahisçi marjı düzeltmesi (ortalama ~8% vig)
  syntheticVig: 1.12,         // Sentetik oranlar için vig ekle (gerçekçi olsun)
};

// ---- Volatilite Skoru ----

const VOLATILITY_BASE: Record<VolatilityLevel, number> = {
  high: 30,
  medium: 15,
  low: 5,
};

/**
 * Maç bazlı volatilite skoru hesapla (0-100)
 * Bileşenler:
 * 1. Liga volatilitesi (high=30, medium=15, low=5)
 * 2. Hücum-savunma dengesi (yüksek atak + düşük savunma = kaos)
 * 3. xG verimsizlik (yüksek δ = patlama potansiyeli)
 * 4. Form dalgalanması (tutarsız form = öngörülemez)
 * 5. H2H gol ortalaması (yüksek gol = volatil)
 */
export function calculateVolatilityScore(
  prediction: MatchPrediction
): { score: number; factors: string[] } {
  const analysis = prediction.analysis;
  const leagueConfig = getLeagueById(prediction.league.id);
  const factors: string[] = [];
  let score = 0;

  // 1. Liga bazlı volatilite (0-30)
  const leagueVolatility = leagueConfig?.volatility ?? "low";
  const leagueBase = VOLATILITY_BASE[leagueVolatility];
  score += leagueBase;
  if (leagueBase >= 25) factors.push(`🌍 Volatil lig: ${leagueConfig?.name}`);

  // 2. Hücum-savunma dengesi (0-25)
  // Yüksek atak + düşük savunma = golcü maç = kaos
  const avgAttack = (analysis.homeAttack + analysis.awayAttack) / 2;
  const avgDefense = (analysis.homeDefense + analysis.awayDefense) / 2;
  const attackDefenseRatio = Math.max(0, (avgAttack - avgDefense) / 100);
  const attackScore = Math.min(25, attackDefenseRatio * 50);
  score += attackScore;
  if (attackScore >= 12) factors.push(`⚔️ Hücum dominansı: ${avgAttack.toFixed(0)} vs ${avgDefense.toFixed(0)} savunma`);

  // 3. xG verimsizlik / şanssızlık (0-20)
  // Yüksek xgDelta = takım gol atamıyor ama şut çekiyor → patlama potansiyeli
  const xgDelta = Math.abs(analysis.xgDelta ?? 0);
  const xgScore = Math.min(20, xgDelta * 15);
  score += xgScore;
  if (xgScore >= 8) factors.push(`📊 xG verimsizlik: Δ${xgDelta.toFixed(2)}`);

  // 4. Yüksek gol beklentisi (0-15)
  const homeXg = analysis.homeXg ?? (analysis.homeAttack / 100) * 1.5;
  const awayXg = analysis.awayXg ?? (analysis.awayAttack / 100) * 1.5;
  const totalXg = homeXg + awayXg;
  const goalBonus = Math.min(15, Math.max(0, (totalXg - 2.0) * 8));
  score += goalBonus;
  if (totalXg >= 3.0) factors.push(`⚽ Yüksek gol beklentisi: xG ${totalXq(totalXg)}`);

  // 5. H2H gol ortalaması (0-10)
  const h2hGoalAvg = analysis.h2hGoalAvg ?? 0;
  const h2hScore = Math.min(10, Math.max(0, (h2hGoalAvg - 2.0) * 4));
  score += h2hScore;
  if (h2hGoalAvg >= 3.5) factors.push(`🤝 H2H gol ortalaması: ${h2hGoalAvg.toFixed(1)}`);

  return {
    score: Math.min(100, Math.round(score)),
    factors,
  };
}

function totalXq(xg: number): string {
  return xg.toFixed(1);
}

// ---- Surprise Value (Edge) Hesaplama ----

/**
 * Bookmaker oranından implied probability hesapla (vig düzeltmeli)
 * Bahisçiler %8-12 vig koyar, bunu düzeltiyoruz
 */
function impliedProbability(odds: number): number {
  return (1 / odds) * 100 * CRAZY_PICK_CONFIG.vigCorrection;
}

// ---- Ana Finder Fonksiyonu ----

/**
 * Crazy Pick'leri bul
 * 1. Her maç için volatilite skoru hesapla
 * 2. Simülasyonun tüm skor dağılımını al
 * 3. Bahisçi exact score oranlarıyla karşılaştır
 * 4. Edge > threshold olan skorları seç
 * 5. Aynı maçtan 3-5 varyasyon döndür (sistem kupon mantığı)
 */
export function findCrazyPicks(predictions: MatchPrediction[]): CrazyPickResult[] {
  const results: CrazyPickResult[] = [];

  for (const prediction of predictions) {
    const sim = prediction.analysis.simulation;
    const odds = prediction.odds;

    // Guard: En azından simülasyon skor dağılımı olmalı
    if (!sim?.allScorelines?.length) continue;

    // Exact score odds yoksa simülasyondan sentetik oranlar üret
    const exactScoreOdds = odds?.exactScoreOdds ?? generateSyntheticOdds(sim.allScorelines);

    // 1. Volatilite skoru
    const { score: volatilityScore, factors: chaosFactors } = calculateVolatilityScore(prediction);
    if (volatilityScore < CRAZY_PICK_CONFIG.minVolatilityScore) continue;

    // 2. Her skor için edge hesapla
    const crazyPicks: CrazyPick[] = [];

    for (const scoreline of sim.allScorelines) {
      const bookmakerOdds = exactScoreOdds[scoreline.score];
      if (!bookmakerOdds) continue; // Bu skor için oran yoksa atla

      // Filtreleme
      if (bookmakerOdds < CRAZY_PICK_CONFIG.minBookmakerOdds) continue;
      if (bookmakerOdds > CRAZY_PICK_CONFIG.maxBookmakerOdds) continue;
      if (scoreline.probability < CRAZY_PICK_CONFIG.minSimProbability) continue;

      // Total gol filtresi (uç skorlar = yüksek gol)
      const [homeGoals, awayGoals] = scoreline.score.split("-").map(Number);
      const totalGoals = homeGoals + awayGoals;
      if (totalGoals < CRAZY_PICK_CONFIG.minTotalGoals) continue;

      // Edge hesapla
      const implied = impliedProbability(bookmakerOdds);
      const edge = ((scoreline.probability / implied) - 1) * 100;
      if (edge < CRAZY_PICK_CONFIG.minEdge) continue;

      crazyPicks.push({
        fixtureId: prediction.fixtureId,
        homeTeam: prediction.homeTeam.name,
        awayTeam: prediction.awayTeam.name,
        league: prediction.league.name,
        leagueId: prediction.league.id,
        kickoff: prediction.kickoff,
        score: scoreline.score,
        simProbability: Math.round(scoreline.probability * 10) / 10,
        impliedProbability: Math.round(implied * 10) / 10,
        edge: Math.round(edge * 10) / 10,
        bookmakerOdds,
        volatilityScore,
        chaosFactors,
        totalGoals,
      });
    }

    // 3. Edge'e göre sırala ve top N seç
    crazyPicks.sort((a, b) => b.edge - a.edge);
    const topPicks = crazyPicks.slice(0, CRAZY_PICK_CONFIG.maxPicksPerMatch);

    // Minimum varyasyon sayısına ulaşamadıysa bu maçı atla
    if (topPicks.length < CRAZY_PICK_CONFIG.minPicksPerMatch) continue;

    const avgEdge = topPicks.reduce((sum, p) => sum + p.edge, 0) / topPicks.length;

    results.push({
      match: {
        fixtureId: prediction.fixtureId,
        homeTeam: prediction.homeTeam.name,
        awayTeam: prediction.awayTeam.name,
        league: prediction.league.name,
        leagueId: prediction.league.id,
        kickoff: prediction.kickoff,
        volatilityScore,
        chaosFactors,
      },
      picks: topPicks,
      bestEdge: topPicks[0].edge,
      avgEdge: Math.round(avgEdge * 10) / 10,
      stake: CRAZY_PICK_CONFIG.stake,
    });
  }

  // En yüksek volatilite + edge'e göre sırala
  results.sort((a, b) => {
    const aScore = a.match.volatilityScore * 0.4 + a.bestEdge * 0.6;
    const bScore = b.match.volatilityScore * 0.4 + b.bestEdge * 0.6;
    return bScore - aScore;
  });

  return results;
}

/**
 * Simülasyon olasılıklarından sentetik bahis oranları üret
 * API-Football'dan exact score odds gelmediğinde fallback olarak kullanılır
 * 
 * Formül: odds = (1 / probability) * vig
 * Vig eklenerek gerçekçi bahisçi oranları simüle edilir
 */
function generateSyntheticOdds(
  allScorelines: Array<{ score: string; probability: number }>
): Record<string, number> {
  const odds: Record<string, number> = {};
  
  for (const scoreline of allScorelines) {
    if (scoreline.probability <= 0) continue;
    
    // Olasılıktan oran hesapla: odds = (100 / prob%) * vig
    const rawOdds = (100 / scoreline.probability) * CRAZY_PICK_CONFIG.syntheticVig;
    
    // Gerçekçi bahis oranı aralığında tut (5-300 arası)
    const clampedOdds = Math.max(5, Math.min(300, rawOdds));
    
    odds[scoreline.score] = Math.round(clampedOdds * 100) / 100;
  }
  
  return odds;
}

/**
 * Crazy Pick sonuçlarını özet metriğe çevir
 */
export function summarizeCrazyPicks(results: CrazyPickResult[]): {
  totalMatches: number;
  totalPicks: number;
  avgVolatility: number;
  avgEdge: number;
  bestEdge: number;
  totalStake: number;
  potentialMaxReturn: number;
} {
  if (results.length === 0) {
    return { totalMatches: 0, totalPicks: 0, avgVolatility: 0, avgEdge: 0, bestEdge: 0, totalStake: 0, potentialMaxReturn: 0 };
  }

  const totalPicks = results.reduce((sum, r) => sum + r.picks.length, 0);
  const avgVolatility = results.reduce((sum, r) => sum + r.match.volatilityScore, 0) / results.length;
  const avgEdge = results.reduce((sum, r) => sum + r.avgEdge, 0) / results.length;
  const bestEdge = Math.max(...results.map((r) => r.bestEdge));
  const totalStake = totalPicks * CRAZY_PICK_CONFIG.stake;

  // En yüksek oranlı pick tutarsa potansiyel kazanç
  const maxOdds = Math.max(...results.flatMap((r) => r.picks.map((p) => p.bookmakerOdds)));
  const potentialMaxReturn = CRAZY_PICK_CONFIG.stake * maxOdds;

  return {
    totalMatches: results.length,
    totalPicks,
    avgVolatility: Math.round(avgVolatility),
    avgEdge: Math.round(avgEdge * 10) / 10,
    bestEdge: Math.round(bestEdge * 10) / 10,
    totalStake,
    potentialMaxReturn: Math.round(potentialMaxReturn),
  };
}
