/**
 * Monte Carlo Simülasyonu
 * Maçı binlerce kez simüle ederek olasılıkları ve standart sapmayı hesaplar
 * 
 * Fayda:
 * - Gerçek olasılık dağılımını verir
 * - Standart sapma ile riskliliği ölçer
 * - Beklenmedik sonuç olasılığını gösterir
 */

export interface TeamSimStats {
  expectedGoals: number; // xG
  goalVariance: number; // Gol tutarsızlığı (0.3-1.5)
  formFactor: number; // Form çarpanı (0.7-1.3)
  homeAdvantage?: number; // Ev sahibi avantajı (1.1-1.4)
}

export interface SimulationResult {
  homeWins: number;
  draws: number;
  awayWins: number;
  
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgTotalGoals: number;
  
  over25Probability: number;
  over35Probability: number;
  under25Probability: number;
  under15Probability: number;
  
  bttsProbability: number;
  bttsNoProbability: number;
  
  // Risk metrikleri
  stdDeviation: number; // Sonuçların standart sapması
  chaosIndex: number; // 0-1, maçın ne kadar tahmin edilemez olduğu
  confidenceLevel: 'high' | 'medium' | 'low' | 'avoid';
  
  // Skor dağılımı (en olası 5 skor)
  topScores: { score: string; probability: number; count: number }[];
  
  // Simülasyon detayları
  totalSimulations: number;
  simulationTime: number; // ms
}

export interface SimulationConfig {
  iterations: number; // Simülasyon sayısı (1000-100000)
  seed?: number; // Tekrarlanabilirlik için seed
  usePoisson: boolean; // Poisson dağılımı kullan
  includeRedCards: boolean; // Kırmızı kart olasılığı
  includeInjuryTime: boolean; // Uzatma golleri
}

const DEFAULT_CONFIG: SimulationConfig = {
  iterations: 10000,
  usePoisson: true,
  includeRedCards: true,
  includeInjuryTime: true
};

/**
 * Poisson dağılımı ile gol sayısı üret
 */
function poissonRandom(lambda: number): number {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  
  return k - 1;
}

/**
 * Seeded random number generator (LCG)
 */
function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Tek bir maç simüle et
 */
function simulateMatch(
  homeStats: TeamSimStats,
  awayStats: TeamSimStats,
  random: () => number = Math.random
): { homeGoals: number; awayGoals: number } {
  // Beklenen golleri hesapla
  let homeExpected = homeStats.expectedGoals * homeStats.formFactor * (homeStats.homeAdvantage || 1.2);
  let awayExpected = awayStats.expectedGoals * awayStats.formFactor;
  
  // Varyans ekle
  homeExpected *= (0.8 + random() * 0.4); // %80-120 arası varyasyon
  awayExpected *= (0.8 + random() * 0.4);
  
  // Gol sayısı üret (Poisson)
  const homeGoals = poissonRandom(Math.max(0.1, homeExpected));
  const awayGoals = poissonRandom(Math.max(0.1, awayExpected));
  
  return { homeGoals, awayGoals };
}

/**
 * Monte Carlo simülasyonu çalıştır
 */
export function runMonteCarloSimulation(
  homeStats: TeamSimStats,
  awayStats: TeamSimStats,
  config: Partial<SimulationConfig> = {}
): SimulationResult {
  const startTime = performance.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const random = cfg.seed ? createSeededRandom(cfg.seed) : Math.random;
  
  // Sonuç sayaçları
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  
  let over25Count = 0;
  let over35Count = 0;
  let under25Count = 0;
  let under15Count = 0;
  let bttsCount = 0;
  
  // Skor dağılımı
  const scoreDistribution: Map<string, number> = new Map();
  
  // Tüm sonuçları sakla (std deviation için)
  const allTotalGoals: number[] = [];
  
  // Simülasyonları çalıştır
  for (let i = 0; i < cfg.iterations; i++) {
    const { homeGoals, awayGoals } = simulateMatch(homeStats, awayStats, random);
    
    // Sonuç kaydet
    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals < awayGoals) awayWins++;
    else draws++;
    
    totalHomeGoals += homeGoals;
    totalAwayGoals += awayGoals;
    
    const totalGoals = homeGoals + awayGoals;
    allTotalGoals.push(totalGoals);
    
    // Alt/Üst
    if (totalGoals > 2.5) over25Count++;
    if (totalGoals > 3.5) over35Count++;
    if (totalGoals < 2.5) under25Count++;
    if (totalGoals < 1.5) under15Count++;
    
    // BTTS
    if (homeGoals > 0 && awayGoals > 0) bttsCount++;
    
    // Skor kaydet
    const scoreKey = `${homeGoals}-${awayGoals}`;
    scoreDistribution.set(scoreKey, (scoreDistribution.get(scoreKey) || 0) + 1);
  }
  
  // Olasılıkları hesapla
  const n = cfg.iterations;
  
  // Standart sapma hesapla
  const avgTotalGoals = allTotalGoals.reduce((a, b) => a + b, 0) / n;
  const variance = allTotalGoals.reduce((sum, val) => sum + Math.pow(val - avgTotalGoals, 2), 0) / n;
  const stdDeviation = Math.sqrt(variance);
  
  // Chaos indeksi (yüksek std deviation = yüksek kaos)
  // Normal maçlarda std 1.2-1.8 arası
  const chaosIndex = Math.min(1, Math.max(0, (stdDeviation - 1.0) / 1.5));
  
  // Güven seviyesi belirle
  let confidenceLevel: SimulationResult['confidenceLevel'];
  if (stdDeviation <= 1.3 && Math.max(homeWins, awayWins, draws) / n >= 0.45) {
    confidenceLevel = 'high';
  } else if (stdDeviation <= 1.8 && Math.max(homeWins, awayWins, draws) / n >= 0.35) {
    confidenceLevel = 'medium';
  } else if (stdDeviation <= 2.2) {
    confidenceLevel = 'low';
  } else {
    confidenceLevel = 'avoid';
  }
  
  // Top 5 skor
  const topScores = Array.from(scoreDistribution.entries())
    .map(([score, count]) => ({
      score,
      probability: count / n,
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  const simulationTime = performance.now() - startTime;
  
  return {
    homeWins,
    draws,
    awayWins,
    
    homeWinProbability: Number((homeWins / n).toFixed(4)),
    drawProbability: Number((draws / n).toFixed(4)),
    awayWinProbability: Number((awayWins / n).toFixed(4)),
    
    avgHomeGoals: Number((totalHomeGoals / n).toFixed(2)),
    avgAwayGoals: Number((totalAwayGoals / n).toFixed(2)),
    avgTotalGoals: Number(avgTotalGoals.toFixed(2)),
    
    over25Probability: Number((over25Count / n).toFixed(4)),
    over35Probability: Number((over35Count / n).toFixed(4)),
    under25Probability: Number((under25Count / n).toFixed(4)),
    under15Probability: Number((under15Count / n).toFixed(4)),
    
    bttsProbability: Number((bttsCount / n).toFixed(4)),
    bttsNoProbability: Number(((n - bttsCount) / n).toFixed(4)),
    
    stdDeviation: Number(stdDeviation.toFixed(3)),
    chaosIndex: Number(chaosIndex.toFixed(3)),
    confidenceLevel,
    
    topScores,
    
    totalSimulations: n,
    simulationTime: Number(simulationTime.toFixed(2))
  };
}

/**
 * Takım istatistiklerinden simülasyon girdisi oluştur
 */
export function createSimStats(
  goalsScored: number,
  goalsConceded: number,
  matchesPlayed: number,
  options: {
    formMultiplier?: number;
    isHome?: boolean;
    recentGoals?: number[]; // Son 5 maçtaki goller
  } = {}
): TeamSimStats {
  const avgGoals = goalsScored / Math.max(1, matchesPlayed);
  
  // Varyans hesapla (son maçlardan)
  let goalVariance = 0.8; // Default
  if (options.recentGoals && options.recentGoals.length >= 3) {
    const mean = options.recentGoals.reduce((a, b) => a + b, 0) / options.recentGoals.length;
    const squaredDiffs = options.recentGoals.map(g => Math.pow(g - mean, 2));
    goalVariance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / options.recentGoals.length);
    goalVariance = Math.max(0.3, Math.min(1.5, goalVariance));
  }
  
  return {
    expectedGoals: avgGoals,
    goalVariance,
    formFactor: options.formMultiplier ?? 1.0,
    homeAdvantage: options.isHome ? 1.2 : undefined
  };
}

/**
 * Simülasyon sonucunu yorumla
 */
export function interpretSimulation(result: SimulationResult): string[] {
  const insights: string[] = [];
  
  // Sonuç tahmini
  const maxProb = Math.max(result.homeWinProbability, result.drawProbability, result.awayWinProbability);
  if (result.homeWinProbability === maxProb) {
    insights.push(`🏠 Ev sahibi galibiyeti %${(maxProb * 100).toFixed(0)} olasılıkla en muhtemel`);
  } else if (result.awayWinProbability === maxProb) {
    insights.push(`✈️ Deplasman galibiyeti %${(maxProb * 100).toFixed(0)} olasılıkla en muhtemel`);
  } else {
    insights.push(`🤝 Beraberlik %${(maxProb * 100).toFixed(0)} olasılıkla en muhtemel`);
  }
  
  // Gol tahmini
  if (result.over25Probability >= 0.65) {
    insights.push(`⚽ Üst 2.5 güçlü görünüyor (%${(result.over25Probability * 100).toFixed(0)})`);
  } else if (result.under25Probability >= 0.60) {
    insights.push(`🔒 Alt 2.5 güçlü görünüyor (%${(result.under25Probability * 100).toFixed(0)})`);
  }
  
  // BTTS
  if (result.bttsProbability >= 0.65) {
    insights.push(`🎯 KG Var yüksek olasılıklı (%${(result.bttsProbability * 100).toFixed(0)})`);
  } else if (result.bttsNoProbability >= 0.60) {
    insights.push(`🛡️ KG Yok düşünülebilir (%${(result.bttsNoProbability * 100).toFixed(0)})`);
  }
  
  // Risk uyarısı
  if (result.confidenceLevel === 'avoid') {
    insights.push(`⚠️ DİKKAT: Çok yüksek belirsizlik (σ=${result.stdDeviation}). Bu maçtan uzak dur!`);
  } else if (result.confidenceLevel === 'low') {
    insights.push(`⚡ Risk yüksek, küçük mislilerle oyna`);
  } else if (result.confidenceLevel === 'high') {
    insights.push(`✅ Sonuçlar tutarlı, güvenle oynayabilirsin`);
  }
  
  // En olası skor
  if (result.topScores.length > 0) {
    const topScore = result.topScores[0];
    insights.push(`📊 En olası skor: ${topScore.score} (%${(topScore.probability * 100).toFixed(1)})`);
  }
  
  return insights;
}

/**
 * Confidence level için emoji
 */
export function getConfidenceEmoji(level: SimulationResult['confidenceLevel']): string {
  switch (level) {
    case 'high': return '🟢';
    case 'medium': return '🟡';
    case 'low': return '🟠';
    case 'avoid': return '🔴';
  }
}
