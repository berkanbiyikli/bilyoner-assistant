/**
 * Brier Score - Algoritma Kalibrasyonu
 * Tahmin sisteminin doğruluğunu ölçer ve otomatik katsayı optimizasyonu yapar
 * 
 * Brier Score: 0 (mükemmel) - 1 (tamamen yanlış)
 * - 0.00 - 0.10: Mükemmel kalibrasyon
 * - 0.10 - 0.20: İyi kalibrasyon
 * - 0.20 - 0.30: Kabul edilebilir
 * - 0.30+: Kötü, yeniden kalibrasyon gerekli
 */

export interface PredictionRecord {
  fixtureId: number;
  date: string;
  predictedProbability: number; // 0-1 arası
  market: 'home' | 'draw' | 'away' | 'over25' | 'under25' | 'btts' | 'bttsNo';
  actualOutcome: 0 | 1; // 0: olmadı, 1: oldu
  confidence: number; // Sistemin verdiği güven skoru
}

export interface BrierAnalysis {
  brierScore: number;
  meanSquaredError: number;
  calibration: 'excellent' | 'good' | 'acceptable' | 'poor';
  
  // Detaylı analiz
  overconfidenceIndex: number; // Pozitif: aşırı özgüven, Negatif: az özgüven
  reliabilityScore: number; // 0-1, ne kadar güvenilir
  resolutionScore: number; // 0-1, ne kadar ayırt edici
  
  // Kalibrasyon eğrisi verileri
  calibrationCurve: {
    predictedBin: string; // "0-10%", "10-20%", vs.
    actualRate: number;
    count: number;
  }[];
  
  // Öneriler
  recommendations: string[];
  
  // Katsayı optimizasyonu
  suggestedAdjustments: {
    market: string;
    currentBias: number; // Mevcut sapma
    suggestedMultiplier: number; // Önerilen çarpan
  }[];
}

export interface CalibrationConfig {
  // Her market için ağırlıklar
  marketWeights: {
    home: number;
    draw: number;
    away: number;
    over25: number;
    under25: number;
    btts: number;
    bttsNo: number;
  };
  
  // Güven eşikleri
  confidenceThresholds: {
    high: number; // Üstü yüksek güven
    medium: number; // Üstü orta güven
  };
}

// Varsayılan kalibrasyon konfigürasyonu
export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  marketWeights: {
    home: 1.0,
    draw: 1.0,
    away: 1.0,
    over25: 1.0,
    under25: 1.0,
    btts: 1.0,
    bttsNo: 1.0
  },
  confidenceThresholds: {
    high: 70,
    medium: 55
  }
};

/**
 * Brier Score hesapla
 * BS = (1/N) * Σ(forecast - outcome)²
 */
export function calculateBrierScore(records: PredictionRecord[]): number {
  if (records.length === 0) return 0.5; // Veri yoksa nötr
  
  const sumSquaredError = records.reduce((sum, record) => {
    const error = record.predictedProbability - record.actualOutcome;
    return sum + error * error;
  }, 0);
  
  return sumSquaredError / records.length;
}

/**
 * Detaylı Brier analizi yap
 */
export function analyzeBrierScore(records: PredictionRecord[]): BrierAnalysis {
  if (records.length < 10) {
    return {
      brierScore: 0.5,
      meanSquaredError: 0.5,
      calibration: 'poor',
      overconfidenceIndex: 0,
      reliabilityScore: 0,
      resolutionScore: 0,
      calibrationCurve: [],
      recommendations: ['Yeterli veri yok. En az 50 maç sonucu gerekli.'],
      suggestedAdjustments: []
    };
  }
  
  const brierScore = calculateBrierScore(records);
  
  // Kalibrasyon seviyesi
  let calibration: BrierAnalysis['calibration'];
  if (brierScore <= 0.10) calibration = 'excellent';
  else if (brierScore <= 0.20) calibration = 'good';
  else if (brierScore <= 0.30) calibration = 'acceptable';
  else calibration = 'poor';
  
  // Kalibrasyon eğrisi oluştur (10'luk binler)
  const bins = Array.from({ length: 10 }, (_, i) => ({
    min: i * 0.1,
    max: (i + 1) * 0.1,
    predictions: [] as PredictionRecord[]
  }));
  
  records.forEach(record => {
    const binIndex = Math.min(9, Math.floor(record.predictedProbability * 10));
    bins[binIndex].predictions.push(record);
  });
  
  const calibrationCurve = bins.map((bin, i) => {
    const count = bin.predictions.length;
    const actualRate = count > 0
      ? bin.predictions.reduce((sum, r) => sum + r.actualOutcome, 0) / count
      : 0;
    
    return {
      predictedBin: `${i * 10}-${(i + 1) * 10}%`,
      actualRate,
      count
    };
  });
  
  // Aşırı özgüven indeksi hesapla
  let overconfidenceSum = 0;
  let overconfidenceCount = 0;
  
  calibrationCurve.forEach((bin, i) => {
    if (bin.count >= 5) {
      const expectedRate = (i * 0.1 + (i + 1) * 0.1) / 2;
      overconfidenceSum += (expectedRate - bin.actualRate);
      overconfidenceCount++;
    }
  });
  
  const overconfidenceIndex = overconfidenceCount > 0
    ? overconfidenceSum / overconfidenceCount
    : 0;
  
  // Reliability (güvenilirlik) hesapla
  const baseRate = records.reduce((sum, r) => sum + r.actualOutcome, 0) / records.length;
  
  let reliabilityNumerator = 0;
  calibrationCurve.forEach((bin, i) => {
    if (bin.count > 0) {
      const expectedRate = (i * 0.1 + (i + 1) * 0.1) / 2;
      reliabilityNumerator += bin.count * Math.pow(expectedRate - bin.actualRate, 2);
    }
  });
  const reliabilityScore = Math.max(0, 1 - reliabilityNumerator / records.length);
  
  // Resolution (ayırt edicilik) hesapla
  let resolutionNumerator = 0;
  calibrationCurve.forEach(bin => {
    if (bin.count > 0) {
      resolutionNumerator += bin.count * Math.pow(bin.actualRate - baseRate, 2);
    }
  });
  const resolutionScore = resolutionNumerator / records.length;
  
  // Öneriler oluştur
  const recommendations: string[] = [];
  
  if (overconfidenceIndex > 0.1) {
    recommendations.push('⚠️ Sistem aşırı özgüvenli. Olasılıkları %10-15 düşür.');
  } else if (overconfidenceIndex < -0.1) {
    recommendations.push('📈 Sistem çok muhafazakar. Olasılıkları artırabilirsin.');
  }
  
  if (brierScore > 0.25) {
    recommendations.push('🔧 Tahmin modeli yeniden kalibre edilmeli.');
  }
  
  if (reliabilityScore < 0.7) {
    recommendations.push('📊 Güvenilirlik düşük. Daha fazla faktör ekle.');
  }
  
  if (resolutionScore < 0.1) {
    recommendations.push('🎯 Ayırt edicilik düşük. Model çok fazla %50 civarı tahmin veriyor.');
  }
  
  // Market bazlı ayarlama önerileri
  const marketGroups = groupByMarket(records);
  const suggestedAdjustments = Object.entries(marketGroups).map(([market, marketRecords]) => {
    const marketBrier = calculateBrierScore(marketRecords);
    const avgPredicted = marketRecords.reduce((s, r) => s + r.predictedProbability, 0) / marketRecords.length;
    const avgActual = marketRecords.reduce((s, r) => s + r.actualOutcome, 0) / marketRecords.length;
    
    const bias = avgPredicted - avgActual;
    const multiplier = avgActual > 0 ? avgPredicted / avgActual : 1;
    
    return {
      market,
      currentBias: Number(bias.toFixed(3)),
      suggestedMultiplier: Number((1 / multiplier).toFixed(2))
    };
  });
  
  return {
    brierScore: Number(brierScore.toFixed(4)),
    meanSquaredError: Number(brierScore.toFixed(4)),
    calibration,
    overconfidenceIndex: Number(overconfidenceIndex.toFixed(3)),
    reliabilityScore: Number(reliabilityScore.toFixed(3)),
    resolutionScore: Number(resolutionScore.toFixed(3)),
    calibrationCurve,
    recommendations,
    suggestedAdjustments
  };
}

/**
 * Kayıtları market'a göre grupla
 */
function groupByMarket(records: PredictionRecord[]): Record<string, PredictionRecord[]> {
  return records.reduce((groups, record) => {
    if (!groups[record.market]) {
      groups[record.market] = [];
    }
    groups[record.market].push(record);
    return groups;
  }, {} as Record<string, PredictionRecord[]>);
}

/**
 * Olasılığı kalibre et (öğrenilmiş bias'a göre)
 */
export function calibrateProbability(
  rawProbability: number,
  market: PredictionRecord['market'],
  adjustments: BrierAnalysis['suggestedAdjustments']
): number {
  const adjustment = adjustments.find(a => a.market === market);
  if (!adjustment) return rawProbability;
  
  // Bias'ı çıkar ve sınırla
  const calibrated = rawProbability * adjustment.suggestedMultiplier;
  return Math.max(0.01, Math.min(0.99, calibrated));
}

/**
 * Prediction kaydını oluştur (sonuç geldiğinde)
 */
export function createPredictionRecord(
  fixtureId: number,
  date: string,
  market: PredictionRecord['market'],
  predictedProbability: number,
  confidence: number,
  actualOutcome: 0 | 1
): PredictionRecord {
  return {
    fixtureId,
    date,
    predictedProbability: Math.max(0, Math.min(1, predictedProbability)),
    market,
    actualOutcome,
    confidence
  };
}

/**
 * LocalStorage'dan kayıtları yükle
 */
export function loadPredictionHistory(): PredictionRecord[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem('prediction-history');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * LocalStorage'a kaydet
 */
export function savePredictionRecord(record: PredictionRecord): void {
  if (typeof window === 'undefined') return;
  
  try {
    const history = loadPredictionHistory();
    
    // Aynı fixture + market varsa güncelle
    const existingIndex = history.findIndex(
      r => r.fixtureId === record.fixtureId && r.market === record.market
    );
    
    if (existingIndex >= 0) {
      history[existingIndex] = record;
    } else {
      history.push(record);
    }
    
    // Son 500 kaydı tut
    const trimmed = history.slice(-500);
    localStorage.setItem('prediction-history', JSON.stringify(trimmed));
  } catch {
    console.error('Failed to save prediction record');
  }
}

/**
 * Kalibrasyon durumunu emoji ile göster
 */
export function getCalibrationEmoji(calibration: BrierAnalysis['calibration']): string {
  switch (calibration) {
    case 'excellent': return '🎯';
    case 'good': return '✅';
    case 'acceptable': return '⚠️';
    case 'poor': return '❌';
  }
}

// =====================================
// 🔄 Otomatik Feedback Döngüsü (Faz 2)
// =====================================

/**
 * Pending (bekleyen) tahmin kaydı
 * Maç bitmeden önce kaydedilir, sonra actualOutcome güncellenir
 */
export interface PendingPrediction {
  fixtureId: number;
  date: string;
  timestamp: number;
  homeTeam: string;
  awayTeam: string;
  predictions: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    btts: number;
  };
  confidence: number;
  apiValidationLabel?: 'high' | 'medium' | 'risky' | 'avoid';
  calibrationWeight: number;
}

/**
 * Biten maç sonucu
 */
export interface MatchResult {
  fixtureId: number;
  homeGoals: number;
  awayGoals: number;
  timestamp: number;
}

/**
 * Pending tahminleri LocalStorage'dan yükle
 */
export function loadPendingPredictions(): PendingPrediction[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem('pending-predictions');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Pending tahmini kaydet (maç başlamadan önce)
 */
export function savePendingPrediction(prediction: PendingPrediction): void {
  if (typeof window === 'undefined') return;
  
  try {
    const pending = loadPendingPredictions();
    
    // Aynı fixture varsa güncelle
    const existingIndex = pending.findIndex(p => p.fixtureId === prediction.fixtureId);
    
    if (existingIndex >= 0) {
      pending[existingIndex] = prediction;
    } else {
      pending.push(prediction);
    }
    
    // Son 100 pending kaydı tut
    const trimmed = pending.slice(-100);
    localStorage.setItem('pending-predictions', JSON.stringify(trimmed));
  } catch {
    console.error('Failed to save pending prediction');
  }
}

/**
 * Maç sonucu geldiğinde pending tahmini işle ve history'e taşı
 * @returns İşlenen kayıt sayısı
 */
export function processMatchResult(result: MatchResult): number {
  if (typeof window === 'undefined') return 0;
  
  const pending = loadPendingPredictions();
  const prediction = pending.find(p => p.fixtureId === result.fixtureId);
  
  if (!prediction) return 0;
  
  // Sonuçları belirle
  const homeWon = result.homeGoals > result.awayGoals ? 1 : 0;
  const isDraw = result.homeGoals === result.awayGoals ? 1 : 0;
  const awayWon = result.homeGoals < result.awayGoals ? 1 : 0;
  const totalGoals = result.homeGoals + result.awayGoals;
  const over25 = totalGoals > 2.5 ? 1 : 0;
  const btts = (result.homeGoals > 0 && result.awayGoals > 0) ? 1 : 0;
  
  // Her market için kayıt oluştur
  const records: PredictionRecord[] = [
    createPredictionRecord(
      result.fixtureId,
      prediction.date,
      'home',
      prediction.predictions.homeWin / 100,
      prediction.confidence,
      homeWon as 0 | 1
    ),
    createPredictionRecord(
      result.fixtureId,
      prediction.date,
      'draw',
      prediction.predictions.draw / 100,
      prediction.confidence,
      isDraw as 0 | 1
    ),
    createPredictionRecord(
      result.fixtureId,
      prediction.date,
      'away',
      prediction.predictions.awayWin / 100,
      prediction.confidence,
      awayWon as 0 | 1
    ),
    createPredictionRecord(
      result.fixtureId,
      prediction.date,
      'over25',
      prediction.predictions.over25 / 100,
      prediction.confidence,
      over25 as 0 | 1
    ),
    createPredictionRecord(
      result.fixtureId,
      prediction.date,
      'btts',
      prediction.predictions.btts / 100,
      prediction.confidence,
      btts as 0 | 1
    ),
  ];
  
  // Tüm kayıtları history'e ekle
  records.forEach(record => savePredictionRecord(record));
  
  // Pending'den sil
  const updatedPending = pending.filter(p => p.fixtureId !== result.fixtureId);
  localStorage.setItem('pending-predictions', JSON.stringify(updatedPending));
  
  return records.length;
}

/**
 * Kalibrasyon önerilerini yükle veya hesapla
 */
export function getCalibrationAdjustments(): BrierAnalysis['suggestedAdjustments'] {
  if (typeof window === 'undefined') return [];
  
  try {
    // Önce cache'e bak
    const cached = localStorage.getItem('calibration-adjustments');
    if (cached) {
      const { adjustments, timestamp } = JSON.parse(cached);
      // 24 saatten eskiyse yeniden hesapla
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return adjustments;
      }
    }
    
    // Yeniden hesapla
    const history = loadPredictionHistory();
    if (history.length < 50) return []; // Yeterli veri yok
    
    const analysis = analyzeBrierScore(history);
    
    // Cache'e kaydet
    localStorage.setItem('calibration-adjustments', JSON.stringify({
      adjustments: analysis.suggestedAdjustments,
      timestamp: Date.now()
    }));
    
    return analysis.suggestedAdjustments;
  } catch {
    return [];
  }
}

/**
 * Tahmin olasılığını otomatik kalibre et
 * Geçmiş performansa göre bias düzeltmesi yapar
 */
export function autoCalibrateProbability(
  rawProbability: number,
  market: PredictionRecord['market']
): number {
  const adjustments = getCalibrationAdjustments();
  return calibrateProbability(rawProbability, market, adjustments);
}

/**
 * Günlük kalibrasyon raporu oluştur
 */
export function generateDailyCalibrationReport(): {
  totalPredictions: number;
  brierScore: number;
  calibration: BrierAnalysis['calibration'];
  recommendations: string[];
  marketPerformance: { market: string; accuracy: number; count: number }[];
} {
  const history = loadPredictionHistory();
  
  // Son 7 günün kayıtlarını al
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentHistory = history.filter(r => {
    const recordTime = new Date(r.date).getTime();
    return recordTime >= sevenDaysAgo;
  });
  
  if (recentHistory.length < 10) {
    return {
      totalPredictions: recentHistory.length,
      brierScore: 0.5,
      calibration: 'poor',
      recommendations: ['Yeterli veri yok. En az 10 maç sonucu gerekli.'],
      marketPerformance: []
    };
  }
  
  const analysis = analyzeBrierScore(recentHistory);
  
  // Market bazlı performans
  const marketGroups = groupByMarketExternal(recentHistory);
  const marketPerformance = Object.entries(marketGroups).map(([market, records]) => {
    const correct = records.filter(r => {
      // %50 üstü tahmin doğru mu?
      return (r.predictedProbability >= 0.5 && r.actualOutcome === 1) ||
             (r.predictedProbability < 0.5 && r.actualOutcome === 0);
    }).length;
    
    return {
      market,
      accuracy: Number((correct / records.length * 100).toFixed(1)),
      count: records.length
    };
  });
  
  return {
    totalPredictions: recentHistory.length,
    brierScore: analysis.brierScore,
    calibration: analysis.calibration,
    recommendations: analysis.recommendations,
    marketPerformance
  };
}

// Helper - export için
function groupByMarketExternal(records: PredictionRecord[]): Record<string, PredictionRecord[]> {
  return records.reduce((groups, record) => {
    if (!groups[record.market]) {
      groups[record.market] = [];
    }
    groups[record.market].push(record);
    return groups;
  }, {} as Record<string, PredictionRecord[]>);
}
