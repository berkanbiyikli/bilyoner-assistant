/**
 * Surprise Detector Engine
 * 
 * Sürpriz maçları tespit eden ana motor.
 * Mevcut Poisson, Monte Carlo, Value Bet, API Validation sistemlerini
 * birleştirerek bir "Sürpriz Skoru" hesaplar.
 * 
 * Sürpriz = Kamu beklentisinin tersi + Yüksek Value + Yüksek Kaos
 */

import type { MatchAnalysis, ScanInput } from '../prediction/scanner';
import type { SimulationResult } from '../analysis/monte-carlo';
import type { MatchOutcomeProbabilities } from '../prediction/poisson';
import { calculateValue } from '../prediction/value-bet';
import { detectOddsMovements } from './odds-tracker';
import { detectAntiPublicSignal } from './anti-public';
import type {
  SurpriseMatch,
  SurprisePick,
  SurpriseCategory,
  SurpriseLevel,
  ListCategory,
  ExactScorePrediction,
  ScorePredictionSet,
  SurpriseRadarSummary,
  SeriesContent,
  SeriesType,
} from './types';

// ============ CONFIGURATION ============

const SURPRISE_CONFIG = {
  // Minimum eşikler
  minSurpriseScore: 35,         // En az bu kadar sürpriz skoru olmalı
  minOdds: 2.00,                // Sürpriz pick minimum oran
  maxOdds: 50.00,               // Sürpriz pick maksimum oran
  
  // Ağırlıklar (toplam = 1.0)
  weights: {
    chaosIndex: 0.20,           // Monte Carlo kaos seviyesi
    valueEdge: 0.30,            // Value bet avantajı
    apiDeviation: 0.20,         // Model-API sapması
    antiPublic: 0.20,           // Kamu karşıtı sinyal
    oddsMovement: 0.10,         // Oran hareketi anomalisi
  },
  
  // Liste sınıflandırma
  goldThreshold: 70,            // Altın liste: SurpriseScore >= 70
  silverThreshold: 50,          // Gümüş liste: 50-69
  redTrapThreshold: 60,         // Kırmızı liste: Tuzak maçlar (kamu çok emin ama volatilite yüksek)
  
  // Seri konseptleri
  kasaKapatanMinOdds: 5.00,     // Kasa Kapatan: min 5.00 oran
  kasaKapatanMinConf: 55,       // Kasa Kapatan: min %55 model güveni
};

// ============ EXACT SCORE ============

/**
 * Poisson exact score'ları SurpriseMatch formatına dönüştür
 */
function buildScorePredictions(
  fixtureId: number,
  poisson: MatchOutcomeProbabilities | null,
  monteCarlo: SimulationResult | undefined,
  odds?: ScanInput['odds']
): ScorePredictionSet {
  const emptyScore: ExactScorePrediction = {
    score: '1-1', probability: 0, percentDisplay: '0%', odds: 0, isUpset: false,
  };
  
  // Poisson top 3 scores
  const poissonScores: ExactScorePrediction[] = [];
  if (poisson?.exactScores) {
    for (const es of poisson.exactScores.slice(0, 3)) {
      const impliedOdds = es.probability > 0 ? Math.round((1 / es.probability) * 100) / 100 : 100;
      const [h, a] = es.score.split('-').map(Number);
      // Sürpriz skor: Deplasman kazanıyor veya 0-0
      const isUpset = (a > h) || (h === 0 && a === 0);
      
      poissonScores.push({
        score: es.score,
        probability: es.probability,
        percentDisplay: `%${(es.probability * 100).toFixed(1)}`,
        odds: impliedOdds,
        isUpset,
      });
    }
  }
  
  // Monte Carlo top 3 scores
  const mcScores: ExactScorePrediction[] = [];
  if (monteCarlo?.topScores) {
    for (const ts of monteCarlo.topScores.slice(0, 3)) {
      const impliedOdds = ts.probability > 0 ? Math.round((1 / ts.probability) * 100) / 100 : 100;
      const [h, a] = ts.score.split('-').map(Number);
      const isUpset = (a > h) || (h === 0 && a === 0);
      
      mcScores.push({
        score: ts.score,
        probability: ts.probability,
        percentDisplay: `%${(ts.probability * 100).toFixed(1)}`,
        odds: impliedOdds,
        isUpset,
      });
    }
  }
  
  // Consensus: En yüksek olasılıklı skor (Poisson + MC ortalama)
  const allScores = new Map<string, number>();
  for (const s of poissonScores) {
    allScores.set(s.score, (allScores.get(s.score) || 0) + s.probability * 0.6);
  }
  for (const s of mcScores) {
    allScores.set(s.score, (allScores.get(s.score) || 0) + s.probability * 0.4);
  }
  
  let consensusScore = emptyScore;
  let maxProb = 0;
  for (const [score, prob] of allScores) {
    if (prob > maxProb) {
      maxProb = prob;
      const [h, a] = score.split('-').map(Number);
      consensusScore = {
        score,
        probability: prob,
        percentDisplay: `%${(prob * 100).toFixed(1)}`,
        odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 100,
        isUpset: (a > h) || (h === 0 && a === 0),
      };
    }
  }
  
  // Surprise score: Düşük olasılık ama deplasman galibiyeti skoru
  let surpriseScore: ExactScorePrediction | null = null;
  const allSorted = [...allScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([score]) => {
      const [h, a] = score.split('-').map(Number);
      return a > h; // Deplasman kazanıyor
    });
  
  if (allSorted.length > 0) {
    const [score, prob] = allSorted[0];
    const [h, a] = score.split('-').map(Number);
    surpriseScore = {
      score,
      probability: prob,
      percentDisplay: `%${(prob * 100).toFixed(1)}`,
      odds: prob > 0 ? Math.round((1 / prob) * 100) / 100 : 100,
      isUpset: true,
    };
  }
  
  return {
    fixtureId,
    poissonScores,
    monteCarloScores: mcScores,
    consensusScore,
    surpriseScore,
  };
}

// ============ SURPRISE SCORE CALCULATOR ============

/**
 * Composite surprise score hesapla (0-100)
 */
function calculateSurpriseScore(
  chaosIndex: number,       // 0-1
  valueEdge: number,        // 0-100+
  apiDeviation: number,     // 0-100
  antiPublicEdge: number,   // 0-100
  oddsAnomalyStrength: number, // 0-100
): number {
  const w = SURPRISE_CONFIG.weights;
  
  // Her faktörü 0-100 aralığına normalize et
  const chaosNorm = Math.min(chaosIndex * 100, 100);
  const valueNorm = Math.min(valueEdge, 100);
  const deviationNorm = Math.min(apiDeviation, 100);
  const antiPublicNorm = Math.min(antiPublicEdge, 100);
  const oddsNorm = Math.min(oddsAnomalyStrength, 100);
  
  const raw = 
    chaosNorm * w.chaosIndex +
    valueNorm * w.valueEdge +
    deviationNorm * w.apiDeviation +
    antiPublicNorm * w.antiPublic +
    oddsNorm * w.oddsMovement;
  
  // Bonus: Birden fazla sinyal çakışıyorsa (multi-signal bonus)
  let signalCount = 0;
  if (chaosNorm > 50) signalCount++;
  if (valueNorm > 20) signalCount++;
  if (deviationNorm > 15) signalCount++;
  if (antiPublicNorm > 15) signalCount++;
  if (oddsNorm > 10) signalCount++;
  
  const multiSignalBonus = signalCount >= 3 ? (signalCount - 2) * 5 : 0;
  
  return Math.min(100, Math.round(raw + multiSignalBonus));
}

/**
 * Sürpriz seviyesi belirle
 */
function getSurpriseLevel(score: number): SurpriseLevel {
  if (score >= 80) return 'extreme';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Liste kategorisi belirle
 */
function getListCategory(
  surpriseScore: number,
  chaosIndex: number,
  publicConfidence: number,
  modelConfidence: number,
  isContrarian: boolean
): ListCategory {
  // KIRMIZI LİSTE (Tuzak):
  // Kamu çok emin (%70+) ama kaos yüksek → herkes bir tarafa yükleniyor ama maç patlar
  if (publicConfidence >= 65 && chaosIndex > 0.6 && !isContrarian) {
    return 'red';
  }
  
  // ALTIN LİSTE (Oyna):
  // Yüksek sürpriz skoru + model güvenli + contrarian
  if (surpriseScore >= SURPRISE_CONFIG.goldThreshold && modelConfidence >= 55) {
    return 'gold';
  }
  
  // GÜMÜŞ LİSTE (İzle):
  if (surpriseScore >= SURPRISE_CONFIG.silverThreshold) {
    return 'silver';
  }
  
  // Düşük sürpriz → kırmızıya bile girmez ama varsayılan silver
  return 'silver';
}

// ============ SURPRISE PICK ============

/**
 * Maç için en iyi sürpriz pick belirle
 */
function determineSurprisePick(
  analysis: MatchAnalysis,
  odds?: ScanInput['odds']
): SurprisePick {
  const reasoning: string[] = [];
  
  // Value bet'ler arasından en yüksek value'lu olanı bul
  const valueBets = analysis.valueBets?.filter(vb => 
    vb.rating >= 30 && (vb.recommendation === 'bet' || vb.recommendation === 'strong_bet' || vb.recommendation === 'consider')
  ) || [];
  
  // En yüksek value
  const bestValue = valueBets.length > 0
    ? valueBets.sort((a, b) => b.rating - a.rating)[0]
    : null;
  
  // Poisson'dan en olası sonuç
  const poisson = analysis.poisson;
  let poissonPick = { market: 'MS 1', pick: 'Ev Sahibi', prob: 0, odds: 2.0 };
  
  if (poisson) {
    const { homeWin, draw, awayWin } = poisson;
    
    // Sürpriz odaklı: Eğer deplasman veya beraberlik value'su yüksekse onu tercih et
    if (awayWin > 30 && odds?.away && odds.away >= 2.50) {
      poissonPick = { market: 'MS 2', pick: 'Deplasman', prob: awayWin, odds: odds.away };
      reasoning.push(`Poisson deplasman galibiyetine %${awayWin.toFixed(0)} ihtimal veriyor`);
    } else if (draw > 25 && odds?.draw && odds.draw >= 3.00) {
      poissonPick = { market: 'Beraberlik', pick: 'X', prob: draw, odds: odds.draw };
      reasoning.push(`Poisson beraberliğe %${draw.toFixed(0)} ihtimal veriyor`);
    } else if (homeWin > 50 && odds?.home && odds.home >= 2.00) {
      poissonPick = { market: 'MS 1', pick: 'Ev Sahibi', prob: homeWin, odds: odds.home };
    }
    
    // Üst/Alt market
    if (poisson.over25 && poisson.over25 > 55 && odds?.over25 && odds.over25 >= 1.80) {
      const overValue = calculateValue(poisson.over25, odds.over25);
      if (overValue.value > 15) {
        reasoning.push(`Üst 2.5 Gol: %${poisson.over25.toFixed(0)} olasılık, +${overValue.value.toFixed(0)}% value`);
      }
    }
  }
  
  // Value bet varsa onu, yoksa Poisson'u kullan
  if (bestValue) {
    reasoning.push(`Value analizi: ${bestValue.recommendation} (rating: ${bestValue.rating})`);
    return {
      market: bestValue.market || poissonPick.market,
      pick: bestValue.pick || poissonPick.pick,
      odds: poissonPick.odds,
      modelProbability: poissonPick.prob,
      valuePct: bestValue.value || 0,
      confidence: analysis.confidenceScore,
      reasoning,
    };
  }
  
  // Kaos yüksekse beraberlik/alt değerlendir
  if (analysis.chaosLevel > 0.65) {
    reasoning.push(`Yüksek kaos seviyesi (${(analysis.chaosLevel * 100).toFixed(0)}%) — sürpriz potansiyeli yüksek`);
  }
  
  // Monte Carlo result varsa
  if (analysis.monteCarloResult) {
    const mc = analysis.monteCarloResult;
    if (mc.stdDeviation && mc.stdDeviation > 1.5) {
      reasoning.push(`Monte Carlo std sapma: ${mc.stdDeviation.toFixed(2)} — sonuç belirsiz`);
    }
  }
  
  return {
    market: poissonPick.market,
    pick: poissonPick.pick,
    odds: poissonPick.odds,
    modelProbability: poissonPick.prob,
    valuePct: 0,
    confidence: analysis.confidenceScore,
    reasoning: reasoning.length > 0 ? reasoning : ['Standart tahmin — belirgin sürpriz sinyali tespit edilemedi'],
  };
}

// ============ TWEET HOOKS ============

/**
 * Viral tweet hook oluştur
 */
function generateTweetHook(match: Partial<SurpriseMatch>, categories: SurpriseCategory[]): string {
  if (categories.includes('odds_anomaly')) {
    return `🚨 ANOMALI TESPİT: ${match.homeTeam} - ${match.awayTeam} maçında oran hareketleri şüpheli!`;
  }
  if (categories.includes('anti_public')) {
    return `⚡ TERS KÖŞE: ${match.homeTeam} - ${match.awayTeam} — Herkes bir tarafa yükleniyor, AI tam tersini söylüyor.`;
  }
  if (categories.includes('value_bomb')) {
    return `💣 VALUE BOMB: ${match.homeTeam} - ${match.awayTeam} — Bahis sitesi hata mı yaptı?`;
  }
  if (categories.includes('chaos_match')) {
    return `🌪️ KAOS MAÇI: ${match.homeTeam} - ${match.awayTeam} — Bu maçta her şey olabilir.`;
  }
  if (categories.includes('trap_match')) {
    return `🪤 TUZAK ALARM: ${match.homeTeam} - ${match.awayTeam} — Herkes aynı şeyi söylüyor, dikkat!`;
  }
  if (categories.includes('score_hunter')) {
    return `🎯 SKOR AVCISI: ${match.homeTeam} - ${match.awayTeam} — Poisson modeli sürpriz skor bekliyor.`;
  }
  return `📡 SÜRPRİZ RADAR: ${match.homeTeam} - ${match.awayTeam} — Algoritma sinyal yakaladı.`;
}

/**
 * Detaylı neden açıklaması
 */
function generateDetailReason(
  match: Partial<SurpriseMatch>,
  categories: SurpriseCategory[],
  antiPublic: ReturnType<typeof detectAntiPublicSignal> | null,
  chaosIndex: number,
  valueEdge: number,
): string {
  const parts: string[] = [];
  
  if (antiPublic?.isContrarian) {
    parts.push(`Kamuoyu "${antiPublic.publicSide === 'home' ? match.homeTeam : antiPublic.publicSide === 'away' ? match.awayTeam : 'Beraberlik'}" diyor (%${antiPublic.publicConfidence}), ama AI modeli tam tersini gösteriyor (%${antiPublic.modelConfidence} güvenle).`);
  }
  
  if (chaosIndex > 0.6) {
    parts.push(`Maçın kaos endeksi ${(chaosIndex * 100).toFixed(0)}% — tahmin edilebilirlik düşük, sürpriz olasılığı yüksek.`);
  }
  
  if (valueEdge > 20) {
    parts.push(`Bahis oranlarında +${valueEdge.toFixed(0)}% value tespit edildi — piyasa bu maçı yanlış fiyatlıyor olabilir.`);
  }
  
  if (categories.includes('trap_match')) {
    parts.push(`⚠️ DİKKAT: Bu maçta kamu güveni çok yüksek ama veriler tutarsız. Tuzak potansiyeli var.`);
  }
  
  return parts.length > 0 
    ? parts.join(' ') 
    : 'Algoritma bu maçta normal dışı sinyal tespit etti.';
}

// ============ MAIN DETECTOR ============

/**
 * MatchAnalysis'ten SurpriseMatch üret
 */
export function analyzeSurprise(
  analysis: MatchAnalysis,
  scanInput: ScanInput,
  apiPrediction?: { homeWinPercent: number; drawPercent: number; awayWinPercent: number },
): SurpriseMatch | null {
  const odds = scanInput.odds;
  
  // --- 1. Odds movement ---
  const oddsMovements = detectOddsMovements(
    analysis.fixtureId,
    {
      home: odds?.home,
      draw: odds?.draw,
      away: odds?.away,
      over25: odds?.over25,
      under25: odds?.under25,
      bttsYes: odds?.bttsYes,
      bttsNo: odds?.bttsNo,
    },
    analysis.poisson ? {
      homeWin: analysis.poisson.homeWin,
      draw: analysis.poisson.draw,
      awayWin: analysis.poisson.awayWin,
      over25: analysis.poisson.over25,
      btts: analysis.poisson.bttsYes,
    } : undefined,
  );
  
  // --- 2. Anti-public signal ---
  const antiPublicSignal = analysis.poisson ? detectAntiPublicSignal({
    fixtureId: analysis.fixtureId,
    homeTeam: analysis.homeTeam,
    awayTeam: analysis.awayTeam,
    modelHome: analysis.poisson.homeWin,
    modelDraw: analysis.poisson.draw,
    modelAway: analysis.poisson.awayWin,
    oddsHome: odds?.home,
    oddsDraw: odds?.draw,
    oddsAway: odds?.away,
    apiHome: apiPrediction?.homeWinPercent,
    apiDraw: apiPrediction?.drawPercent,
    apiAway: apiPrediction?.awayWinPercent,
  }) : null;
  
  // --- 3. Score predictions ---
  const scorePredictions = buildScorePredictions(
    analysis.fixtureId,
    analysis.poisson,
    analysis.monteCarloResult,
    odds,
  );
  
  // --- 4. Calculate component scores ---
  const chaosIndex = analysis.chaosLevel || 0;
  const valueEdge = analysis.valueScore || 0;
  
  // API deviation: Poisson vs API tahmini fark
  let apiDeviation = 0;
  if (analysis.poisson && apiPrediction) {
    const modelMax = Math.max(analysis.poisson.homeWin, analysis.poisson.draw, analysis.poisson.awayWin);
    const apiMax = Math.max(apiPrediction.homeWinPercent, apiPrediction.drawPercent, apiPrediction.awayWinPercent);
    apiDeviation = Math.abs(modelMax - apiMax);
  }
  
  const antiPublicEdge = antiPublicSignal?.contraryEdge || 0;
  const oddsAnomalyStrength = oddsMovements.length > 0 
    ? Math.min(oddsMovements.reduce((sum, m) => sum + m.impliedProbShift, 0), 100)
    : 0;
  
  // --- 5. Composite surprise score ---
  const surpriseScore = calculateSurpriseScore(
    chaosIndex,
    valueEdge,
    apiDeviation,
    antiPublicEdge,
    oddsAnomalyStrength,
  );
  
  // Minimum eşik kontrolü
  if (surpriseScore < SURPRISE_CONFIG.minSurpriseScore) {
    return null;
  }
  
  // --- 6. Categorize ---
  const categories: SurpriseCategory[] = [];
  if (oddsMovements.some(m => m.isAnomaly || m.isSuspicious)) categories.push('odds_anomaly');
  if (antiPublicSignal?.isContrarian) categories.push('anti_public');
  if (chaosIndex > 0.6) categories.push('chaos_match');
  if (valueEdge > 30) categories.push('value_bomb');
  if (scorePredictions.surpriseScore) categories.push('score_hunter');
  
  const isContrarian = antiPublicSignal?.isContrarian || false;
  const publicConf = antiPublicSignal?.publicConfidence || 50;
  
  // Tuzak maç tespiti
  if (publicConf >= 65 && chaosIndex > 0.55 && !isContrarian) {
    categories.push('trap_match');
  }
  
  const listCategory = getListCategory(
    surpriseScore,
    chaosIndex,
    publicConf,
    analysis.confidenceScore,
    isContrarian,
  );
  
  // --- 7. Surprise pick ---
  const surprisePick = determineSurprisePick(analysis, odds);
  
  // --- 8. Data points ---
  const dataPoints: string[] = [];
  if (analysis.poisson) {
    dataPoints.push(`Poisson xG: ${analysis.poisson.homeWin > analysis.poisson.awayWin ? 'Ev' : 'Dep'} favorisi`);
  }
  if (analysis.monteCarloResult) {
    dataPoints.push(`Monte Carlo kaos: %${(chaosIndex * 100).toFixed(0)}`);
  }
  if (antiPublicSignal?.isContrarian) {
    dataPoints.push(`Kamu: %${publicConf} → Model: %${antiPublicSignal.modelConfidence}`);
  }
  if (valueEdge > 15) {
    dataPoints.push(`Value edge: +%${valueEdge.toFixed(0)}`);
  }
  if (scorePredictions.consensusScore.probability > 0) {
    dataPoints.push(`En olası skor: ${scorePredictions.consensusScore.score} (${scorePredictions.consensusScore.percentDisplay})`);
  }
  
  // --- 9. Build SurpriseMatch ---
  const tweetHook = generateTweetHook(
    { homeTeam: analysis.homeTeam, awayTeam: analysis.awayTeam },
    categories,
  );
  const detailReason = generateDetailReason(
    { homeTeam: analysis.homeTeam, awayTeam: analysis.awayTeam },
    categories,
    antiPublicSignal,
    chaosIndex,
    valueEdge,
  );
  
  return {
    fixtureId: analysis.fixtureId,
    homeTeam: analysis.homeTeam,
    awayTeam: analysis.awayTeam,
    homeTeamId: scanInput.homeTeam.id,
    awayTeamId: scanInput.awayTeam.id,
    leagueName: analysis.league,
    leagueId: analysis.leagueId,
    kickoff: analysis.kickoff,
    
    surpriseScore,
    surpriseLevel: getSurpriseLevel(surpriseScore),
    categories,
    listCategory,
    
    oddsMovements,
    antiPublicSignal,
    scorePredictions,
    
    chaosIndex,
    valueEdge,
    modelConfidence: analysis.confidenceScore,
    apiDeviation,
    
    surprisePick,
    
    tweetHook,
    detailReason,
    dataPoints,
  };
}

/**
 * Batch analyze — Tüm maçları sürpriz radarından geçir
 */
export function analyzeAllSurprises(
  analyses: MatchAnalysis[],
  scanInputs: ScanInput[],
  apiPredictions?: Map<number, { homeWinPercent: number; drawPercent: number; awayWinPercent: number }>,
): SurpriseMatch[] {
  const results: SurpriseMatch[] = [];
  
  for (const analysis of analyses) {
    const scanInput = scanInputs.find(s => s.fixtureId === analysis.fixtureId);
    if (!scanInput) continue;
    
    const apiPred = apiPredictions?.get(analysis.fixtureId);
    const surprise = analyzeSurprise(analysis, scanInput, apiPred);
    
    if (surprise) {
      results.push(surprise);
    }
  }
  
  // En yüksek sürpriz skoruna göre sırala
  return results.sort((a, b) => b.surpriseScore - a.surpriseScore);
}

// ============ SERIES CONTENT GENERATOR ============

/**
 * Twitter seri içeriği üret
 */
export function generateSeriesContent(surprises: SurpriseMatch[]): SeriesContent[] {
  const series: SeriesContent[] = [];
  
  // 1. Kasa Kapatan Sürprizler — Haftada 1x, oran ≥ 5.00
  const kasaKapatan = surprises.find(s => 
    s.surprisePick.odds >= SURPRISE_CONFIG.kasaKapatanMinOdds &&
    s.modelConfidence >= SURPRISE_CONFIG.kasaKapatanMinConf &&
    s.listCategory === 'gold'
  );
  
  if (kasaKapatan) {
    series.push({
      type: 'kasa_kapatan',
      title: '💰 KASA KAPATAN SÜRPRİZ',
      emoji: '💰',
      match: kasaKapatan,
      tweetThread: [
        `💰 KASA KAPATAN SÜRPRİZ #${new Date().getDate()}\n\n${kasaKapatan.homeTeam} vs ${kasaKapatan.awayTeam}\n\n🎯 Tahmin: ${kasaKapatan.surprisePick.pick}\n💎 Oran: ${kasaKapatan.surprisePick.odds.toFixed(2)}\n📊 Model güven: %${kasaKapatan.modelConfidence}\n\n${kasaKapatan.detailReason}\n\n⚠️ Yüksek riskli, düşük stake önerilir.`,
      ],
      imageData: {
        headline: 'KASA KAPATAN SÜRPRİZ',
        subtext: `${kasaKapatan.homeTeam} vs ${kasaKapatan.awayTeam}`,
        stats: kasaKapatan.dataPoints,
        prediction: kasaKapatan.surprisePick.pick,
        odds: kasaKapatan.surprisePick.odds.toFixed(2),
      },
    });
  }
  
  // 2. AI vs İnsan
  const aiVsInsan = surprises.find(s => 
    s.antiPublicSignal?.isContrarian &&
    s.antiPublicSignal.contraryEdge >= 15
  );
  
  if (aiVsInsan) {
    const ap = aiVsInsan.antiPublicSignal!;
    const publicLabel = ap.publicSide === 'home' ? aiVsInsan.homeTeam
      : ap.publicSide === 'away' ? aiVsInsan.awayTeam
      : 'Beraberlik';
    const modelLabel = ap.modelSide === 'home' ? aiVsInsan.homeTeam
      : ap.modelSide === 'away' ? aiVsInsan.awayTeam
      : 'Beraberlik';
    
    series.push({
      type: 'ai_vs_insan',
      title: '🤖 AI vs İNSAN',
      emoji: '🤖',
      match: aiVsInsan,
      tweetThread: [
        `🤖 AI vs İNSAN\n\n${aiVsInsan.homeTeam} - ${aiVsInsan.awayTeam}\n\n👥 İnsanlar: "${publicLabel}" (%${ap.publicConfidence})\n🧠 AI Model: "${modelLabel}" (%${ap.modelConfidence})\n\nFark: +%${ap.contraryEdge} edge\n\n${aiVsInsan.detailReason}`,
      ],
      imageData: {
        headline: 'AI vs İNSAN',
        subtext: `${aiVsInsan.homeTeam} - ${aiVsInsan.awayTeam}`,
        stats: [`İnsan: ${publicLabel} (%${ap.publicConfidence})`, `AI: ${modelLabel} (%${ap.modelConfidence})`],
        prediction: modelLabel,
        odds: aiVsInsan.surprisePick.odds.toFixed(2),
      },
    });
  }
  
  // 3. Gece Yarısı Operasyonu — Gece 22:00 sonrası maçlar
  const nightOps = surprises.filter(s => {
    const hour = new Date(s.kickoff).getHours();
    return hour >= 22 || hour <= 3;
  });
  
  if (nightOps.length > 0) {
    const best = nightOps[0];
    series.push({
      type: 'gece_yarisi_op',
      title: '🌙 GECE YARISI OPERASYONU',
      emoji: '🌙',
      match: best,
      tweetThread: [
        `🌙 GECE YARISI OPERASYONU\n\n${best.homeTeam} vs ${best.awayTeam}\n📍 ${best.leagueName}\n⏰ Saat: ${new Date(best.kickoff).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n\n🎯 ${best.surprisePick.pick} (${best.surprisePick.odds.toFixed(2)})\n📊 Sürpriz skoru: ${best.surpriseScore}/100\n\nKimse bakmıyor ama algoritma sinyal yakaladı 👀`,
      ],
    });
  }
  
  // 4. Tuzak Alarm
  const traps = surprises.filter(s => s.categories.includes('trap_match'));
  if (traps.length > 0) {
    const trap = traps[0];
    series.push({
      type: 'tuzak_alarm',
      title: '🪤 TUZAK ALARM',
      emoji: '🪤',
      match: trap,
      tweetThread: [
        `🪤 TUZAK ALARM ⛔\n\n${trap.homeTeam} vs ${trap.awayTeam}\n\nHerkes "${trap.antiPublicSignal?.publicSide === 'home' ? trap.homeTeam : trap.awayTeam}" diyor ama:\n\n⚠️ Kaos: %${(trap.chaosIndex * 100).toFixed(0)}\n⚠️ Model-API sapma: %${trap.apiDeviation.toFixed(0)}\n⚠️ ${trap.detailReason}\n\n❌ BU MAÇTAN UZAK DURUN.`,
      ],
    });
  }
  
  // 5. Sinyal Yakalandı — Odds anomaly
  const signal = surprises.find(s => s.categories.includes('odds_anomaly'));
  if (signal && signal.oddsMovements.length > 0) {
    const move = signal.oddsMovements[0];
    series.push({
      type: 'sinyal_yakalandi',
      title: '📡 SİNYAL YAKALANDI',
      emoji: '📡',
      match: signal,
      tweetThread: [
        `📡 SİNYAL YAKALANDI 🚨\n\n${signal.homeTeam} vs ${signal.awayTeam}\n\n${move.signal}\n\n🎯 Tahmin: ${signal.surprisePick.pick} (${signal.surprisePick.odds.toFixed(2)})\n📊 AI güven: %${signal.modelConfidence}\n\n${signal.detailReason}`,
      ],
    });
  }
  
  return series;
}

// ============ RADAR SUMMARY ============

/**
 * Günün sürpriz radar özeti
 */
export function buildSurpriseRadarSummary(
  surprises: SurpriseMatch[],
  totalMatchCount: number,
): SurpriseRadarSummary {
  const goldList = surprises.filter(s => s.listCategory === 'gold');
  const silverList = surprises.filter(s => s.listCategory === 'silver');
  const redList = surprises.filter(s => s.listCategory === 'red');
  const seriesContent = generateSeriesContent(surprises);
  
  return {
    date: new Date().toISOString().split('T')[0],
    totalMatches: totalMatchCount,
    surpriseMatches: surprises,
    goldList,
    silverList,
    redList,
    topSurprise: surprises.length > 0 ? surprises[0] : null,
    seriesContent,
    stats: {
      avgSurpriseScore: surprises.length > 0 
        ? Math.round(surprises.reduce((sum, s) => sum + s.surpriseScore, 0) / surprises.length)
        : 0,
      anomalyCount: surprises.filter(s => s.categories.includes('odds_anomaly')).length,
      antiPublicCount: surprises.filter(s => s.categories.includes('anti_public')).length,
      highChaosCount: surprises.filter(s => s.categories.includes('chaos_match')).length,
    },
  };
}
