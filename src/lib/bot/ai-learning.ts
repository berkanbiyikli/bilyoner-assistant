/**
 * AI Learning - Geçmiş Kuponlardan Öğrenme Sistemi
 * 
 * Hangi liglerde daha başarılı?
 * Hangi tahmin tipi daha tutarlı?
 * Model kendini optimize etsin
 */

import type { 
  BotCoupon, 
  BotMatch, 
  AILearningStats, 
  BankrollState 
} from './types';

// ============ VARSAYILAN AI STATS ============

export const DEFAULT_AI_LEARNING_STATS: AILearningStats = {
  leaguePerformance: {},
  predictionTypePerformance: {},
  oddsRangePerformance: {
    low: { range: '1.20-1.50', total: 0, won: 0, winRate: 0 },
    medium: { range: '1.50-2.00', total: 0, won: 0, winRate: 0 },
    high: { range: '2.00-3.00', total: 0, won: 0, winRate: 0 },
  },
  confidenceCalibration: {
    ranges: {},
  },
  lastUpdated: new Date(),
};

// ============ ÖĞRENCİ FONKSİYONLAR ============

/**
 * Kupon sonucundan öğren - tüm istatistikleri güncelle
 */
export function learnFromCouponResult(
  coupon: BotCoupon, 
  stats: AILearningStats
): AILearningStats {
  if (!coupon.result) return stats;
  
  const newStats = { ...stats };
  
  for (const match of coupon.matches) {
    const matchResult = coupon.result.matchResults.find(
      r => r.fixtureId === match.fixtureId
    );
    
    if (!matchResult) continue;
    
    const won = matchResult.predictionWon;
    const odds = match.prediction.odds;
    const profit = won ? (odds - 1) : -1; // Birim stake için kar/zarar
    
    // 1. Lig performansı güncelle
    newStats.leaguePerformance = updateLeaguePerformance(
      newStats.leaguePerformance,
      match,
      won,
      profit
    );
    
    // 2. Tahmin tipi performansı güncelle
    newStats.predictionTypePerformance = updatePredictionTypePerformance(
      newStats.predictionTypePerformance,
      match,
      won,
      profit
    );
    
    // 3. Oran aralığı performansı güncelle
    newStats.oddsRangePerformance = updateOddsRangePerformance(
      newStats.oddsRangePerformance,
      odds,
      won
    );
    
    // 4. Güven skoru kalibrasyon güncelle
    newStats.confidenceCalibration = updateConfidenceCalibration(
      newStats.confidenceCalibration,
      match.confidenceScore,
      won
    );
  }
  
  newStats.lastUpdated = new Date();
  
  return newStats;
}

/**
 * Lig performansını güncelle
 */
function updateLeaguePerformance(
  current: AILearningStats['leaguePerformance'],
  match: BotMatch,
  won: boolean,
  profit: number
): AILearningStats['leaguePerformance'] {
  const leagueId = match.leagueId;
  const existing = current[leagueId] || {
    leagueName: match.league,
    totalPredictions: 0,
    correctPredictions: 0,
    winRate: 0,
    avgValue: 0,
    profit: 0,
  };
  
  const newTotal = existing.totalPredictions + 1;
  const newCorrect = existing.correctPredictions + (won ? 1 : 0);
  const newProfit = existing.profit + profit;
  
  return {
    ...current,
    [leagueId]: {
      leagueName: match.league,
      totalPredictions: newTotal,
      correctPredictions: newCorrect,
      winRate: (newCorrect / newTotal) * 100,
      avgValue: (existing.avgValue * existing.totalPredictions + match.valuePercent) / newTotal,
      profit: newProfit,
    },
  };
}

/**
 * Tahmin tipi performansını güncelle
 */
function updatePredictionTypePerformance(
  current: AILearningStats['predictionTypePerformance'],
  match: BotMatch,
  won: boolean,
  profit: number
): AILearningStats['predictionTypePerformance'] {
  const predType = match.prediction.type;
  const existing = current[predType] || {
    type: predType,
    totalPredictions: 0,
    correctPredictions: 0,
    winRate: 0,
    avgOdds: 0,
    profit: 0,
  };
  
  const newTotal = existing.totalPredictions + 1;
  const newCorrect = existing.correctPredictions + (won ? 1 : 0);
  const newProfit = existing.profit + profit;
  
  return {
    ...current,
    [predType]: {
      type: predType,
      totalPredictions: newTotal,
      correctPredictions: newCorrect,
      winRate: (newCorrect / newTotal) * 100,
      avgOdds: (existing.avgOdds * existing.totalPredictions + match.prediction.odds) / newTotal,
      profit: newProfit,
    },
  };
}

/**
 * Oran aralığı performansını güncelle
 */
function updateOddsRangePerformance(
  current: AILearningStats['oddsRangePerformance'],
  odds: number,
  won: boolean
): AILearningStats['oddsRangePerformance'] {
  // Hangi aralığa düşüyor?
  let rangeKey: 'low' | 'medium' | 'high';
  if (odds < 1.50) {
    rangeKey = 'low';
  } else if (odds < 2.00) {
    rangeKey = 'medium';
  } else {
    rangeKey = 'high';
  }
  
  const currentRange = current[rangeKey];
  const newTotal = currentRange.total + 1;
  const newWon = currentRange.won + (won ? 1 : 0);
  const newWinRate = (newWon / newTotal) * 100;
  
  return {
    low: rangeKey === 'low' 
      ? { range: currentRange.range, total: newTotal, won: newWon, winRate: newWinRate }
      : current.low,
    medium: rangeKey === 'medium'
      ? { range: currentRange.range, total: newTotal, won: newWon, winRate: newWinRate }
      : current.medium,
    high: rangeKey === 'high'
      ? { range: currentRange.range, total: newTotal, won: newWon, winRate: newWinRate }
      : current.high,
  };
}

/**
 * Güven skoru kalibrasyonunu güncelle
 */
function updateConfidenceCalibration(
  current: AILearningStats['confidenceCalibration'],
  confidenceScore: number,
  won: boolean
): AILearningStats['confidenceCalibration'] {
  // Confidence'ı 10'luk aralıklara böl: 70-80, 80-90, 90-100
  const rangeKey = `${Math.floor(confidenceScore / 10) * 10}-${Math.floor(confidenceScore / 10) * 10 + 10}`;
  
  const existing = current.ranges[rangeKey] || {
    predicted: confidenceScore,
    actual: 0,
    count: 0,
  };
  
  const newCount = existing.count + 1;
  const newActual = ((existing.actual * existing.count) + (won ? 100 : 0)) / newCount;
  
  return {
    ranges: {
      ...current.ranges,
      [rangeKey]: {
        predicted: (existing.predicted * existing.count + confidenceScore) / newCount,
        actual: newActual,
        count: newCount,
      },
    },
  };
}

// ============ ANALİZ FONKSİYONLAR ============

/**
 * En başarılı ligleri bul (en az 5 tahmin yapılmış)
 */
export function getTopLeagues(stats: AILearningStats, minPredictions = 5): Array<{
  leagueId: number;
  leagueName: string;
  winRate: number;
  profit: number;
  totalPredictions: number;
}> {
  return Object.entries(stats.leaguePerformance)
    .filter(([, data]) => data.totalPredictions >= minPredictions)
    .map(([leagueId, data]) => ({
      leagueId: parseInt(leagueId),
      leagueName: data.leagueName,
      winRate: data.winRate,
      profit: data.profit,
      totalPredictions: data.totalPredictions,
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);
}

/**
 * En başarılı tahmin tiplerini bul
 */
export function getTopPredictionTypes(stats: AILearningStats, minPredictions = 5): Array<{
  type: string;
  label: string;
  winRate: number;
  profit: number;
  avgOdds: number;
}> {
  const labels: Record<string, string> = {
    home: 'MS 1',
    draw: 'MS X',
    away: 'MS 2',
    over25: 'Üst 2.5',
    btts: 'KG Var',
  };
  
  return Object.entries(stats.predictionTypePerformance)
    .filter(([, data]) => data.totalPredictions >= minPredictions)
    .map(([type, data]) => ({
      type,
      label: labels[type] || type,
      winRate: data.winRate,
      profit: data.profit,
      avgOdds: data.avgOdds,
    }))
    .sort((a, b) => b.profit - a.profit);
}

/**
 * En uygun oran aralığını bul
 */
export function getBestOddsRange(stats: AILearningStats): {
  range: string;
  winRate: number;
  roi: number;
} {
  const ranges = stats.oddsRangePerformance;
  
  // ROI hesapla (basit)
  const calculateROI = (data: { total: number; won: number }, avgOdds: number) => {
    if (data.total === 0) return 0;
    const expectedWins = data.won;
    const profit = expectedWins * (avgOdds - 1) - (data.total - expectedWins);
    return (profit / data.total) * 100;
  };
  
  const results = [
    { range: ranges.low.range, winRate: ranges.low.winRate, roi: calculateROI(ranges.low, 1.35) },
    { range: ranges.medium.range, winRate: ranges.medium.winRate, roi: calculateROI(ranges.medium, 1.75) },
    { range: ranges.high.range, winRate: ranges.high.winRate, roi: calculateROI(ranges.high, 2.50) },
  ];
  
  return results.sort((a, b) => b.roi - a.roi)[0];
}

/**
 * Confidence kalibrasyonunu analiz et
 */
export function analyzeConfidenceCalibration(stats: AILearningStats): {
  isOverconfident: boolean;
  isUnderconfident: boolean;
  calibrationScore: number; // 0-100, 100 = mükemmel kalibrasyon
  suggestions: string[];
} {
  const ranges = Object.values(stats.confidenceCalibration.ranges);
  
  if (ranges.length === 0) {
    return {
      isOverconfident: false,
      isUnderconfident: false,
      calibrationScore: 50,
      suggestions: ['Henüz yeterli veri yok'],
    };
  }
  
  let totalDiff = 0;
  let overconfidentRanges = 0;
  let underconfidentRanges = 0;
  
  for (const range of ranges) {
    const diff = range.predicted - range.actual;
    totalDiff += Math.abs(diff);
    
    if (diff > 10) overconfidentRanges++;
    if (diff < -10) underconfidentRanges++;
  }
  
  const avgDiff = totalDiff / ranges.length;
  const calibrationScore = Math.max(0, 100 - avgDiff);
  
  const suggestions: string[] = [];
  
  if (overconfidentRanges > underconfidentRanges) {
    suggestions.push('Model aşırı güvenli, daha temkinli ol');
  } else if (underconfidentRanges > overconfidentRanges) {
    suggestions.push('Model yeterince güvenli değil, daha cesur ol');
  }
  
  return {
    isOverconfident: overconfidentRanges > underconfidentRanges,
    isUnderconfident: underconfidentRanges > overconfidentRanges,
    calibrationScore,
    suggestions,
  };
}

/**
 * AI önerisi: Hangi liglere odaklanmalı, hangi tahmin tipleri kullanmalı
 */
export function getAIRecommendations(stats: AILearningStats): {
  preferredLeagues: number[];
  avoidLeagues: number[];
  preferredTypes: string[];
  avoidTypes: string[];
  optimalOddsRange: { min: number; max: number };
  summary: string;
} {
  const topLeagues = getTopLeagues(stats);
  const topTypes = getTopPredictionTypes(stats);
  const bestOdds = getBestOddsRange(stats);
  
  // Kârlı ligler
  const preferredLeagues = topLeagues
    .filter(l => l.profit > 0)
    .map(l => l.leagueId);
  
  // Zararlı ligler (en az 5 tahmin, negatif profit)
  const avoidLeagues = Object.entries(stats.leaguePerformance)
    .filter(([, d]) => d.totalPredictions >= 5 && d.profit < -2)
    .map(([id]) => parseInt(id));
  
  // Kârlı tahmin tipleri
  const preferredTypes = topTypes
    .filter(t => t.profit > 0)
    .map(t => t.type);
  
  // Zararlı tahmin tipleri
  const avoidTypes = Object.entries(stats.predictionTypePerformance)
    .filter(([, d]) => d.totalPredictions >= 5 && d.profit < -2)
    .map(([type]) => type);
  
  // Optimal oran aralığı
  const oddsRangeMap: Record<string, { min: number; max: number }> = {
    '1.20-1.50': { min: 1.20, max: 1.50 },
    '1.50-2.00': { min: 1.50, max: 2.00 },
    '2.00-3.00': { min: 2.00, max: 3.00 },
  };
  
  const optimalOddsRange = oddsRangeMap[bestOdds.range] || { min: 1.50, max: 2.00 };
  
  // Özet mesaj oluştur
  const summaryParts: string[] = [];
  
  if (preferredLeagues.length > 0) {
    const leagueNames = preferredLeagues
      .slice(0, 3)
      .map(id => stats.leaguePerformance[id]?.leagueName || id)
      .join(', ');
    summaryParts.push(`En iyi ligiler: ${leagueNames}`);
  }
  
  if (preferredTypes.length > 0) {
    const typeLabels: Record<string, string> = {
      home: 'MS 1', draw: 'MS X', away: 'MS 2', over25: 'Ü2.5', btts: 'KG Var'
    };
    const typeNames = preferredTypes
      .slice(0, 2)
      .map(t => typeLabels[t] || t)
      .join(', ');
    summaryParts.push(`En başarılı tahminler: ${typeNames}`);
  }
  
  summaryParts.push(`Optimal oran: ${optimalOddsRange.min}-${optimalOddsRange.max}`);
  
  return {
    preferredLeagues,
    avoidLeagues,
    preferredTypes,
    avoidTypes,
    optimalOddsRange,
    summary: summaryParts.join(' | '),
  };
}

/**
 * Haftalık AI performans raporu oluştur
 */
export function generateAIPerformanceReport(stats: AILearningStats): string {
  const lines: string[] = [];
  
  lines.push('🤖 AI PERFORMANS RAPORU');
  lines.push('');
  
  // En iyi ligler
  const topLeagues = getTopLeagues(stats, 3);
  if (topLeagues.length > 0) {
    lines.push('📊 EN BAŞARILI LİGLER');
    topLeagues.slice(0, 3).forEach((l, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      lines.push(`${emoji} ${l.leagueName}: %${l.winRate.toFixed(0)} (${l.totalPredictions} tahmin)`);
    });
    lines.push('');
  }
  
  // En iyi tahmin tipleri
  const topTypes = getTopPredictionTypes(stats, 3);
  if (topTypes.length > 0) {
    lines.push('🎯 EN TUTARLI TAHMİNLER');
    topTypes.slice(0, 3).forEach((t, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      lines.push(`${emoji} ${t.label}: %${t.winRate.toFixed(0)} (@${t.avgOdds.toFixed(2)})`);
    });
    lines.push('');
  }
  
  // Kalibrasyon
  const calibration = analyzeConfidenceCalibration(stats);
  lines.push(`📈 Kalibrasyon Skoru: ${calibration.calibrationScore.toFixed(0)}/100`);
  
  if (calibration.suggestions.length > 0) {
    lines.push(`💡 ${calibration.suggestions[0]}`);
  }
  
  lines.push('');
  lines.push('#AI #MachineLearning #BilyonerBot');
  
  return lines.join('\n');
}
