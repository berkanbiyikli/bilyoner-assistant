/**
 * Scanner Module - Batch Analysis & Smart Categorization
 * Features:
 * - League DNA (lig karakteristiği)
 * - AI Summary generator
 * - Smart sorting (Value, Confidence, KG, Ü2.5)
 * - Auto Coupon Generator
 * - H2H psychological weight (10%)
 * - Cluster Analysis (stil eşleşmesi)
 * - Monte Carlo simülasyonu
 */

import { 
  generateScoreMatrix, 
  calculateOutcomeProbabilities,
  type MatchOutcomeProbabilities 
} from './poisson';
import { 
  analyzeValueBet,
  type ValueBetAnalysis 
} from './value-bet';
import {
  createTeamProfile,
  analyzeStyleMatchup,
  runMonteCarloSimulation,
  createSimStats,
  type TeamProfile,
  type StyleMatchup,
  type SimulationResult,
  STYLE_DESCRIPTIONS
} from '../analysis';

// Simple client-side cache
const scannerCache = new Map<string, { data: ScannerResult; expiry: number }>();

function getCached(key: string): ScannerResult | null {
  const entry = scannerCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    scannerCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: ScannerResult, ttlMs: number): void {
  scannerCache.set(key, { data, expiry: Date.now() + ttlMs });
}

// ============ TYPES ============

export interface MatchAnalysis {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueId: number;
  kickoff: string;
  
  // Predictions
  poisson: MatchOutcomeProbabilities | null;
  valueBets: ValueBetAnalysis[];
  
  // Scores
  confidenceScore: number;      // 0-100
  valueScore: number;           // Avg value percentage
  goalProbability: number;      // Ü2.5 probability (0-1)
  bttsProb: number;             // KG Var probability (0-1)
  
  // Categorization
  isBanko: boolean;             // Confidence > 75 & Value > 15%
  isValue: boolean;             // Value > 10%
  isHighScoring: boolean;       // Ü2.5 > 55%
  isBTTS: boolean;              // KG > 55%
  
  // AI Summary
  aiSummary: string;
  
  // League DNA factor
  leagueDNA: LeagueDNA;
  
  // NEW: Advanced Analysis
  styleAnalysis?: {
    homeProfile: TeamProfile;
    awayProfile: TeamProfile;
    matchup: StyleMatchup;
  };
  
  monteCarloResult?: SimulationResult;
  
  // Risk assessment
  chaosLevel: number;           // 0-1, maçın tahmin edilebilirliği
  riskWarning?: string;         // Uzak durulması gereken maçlar için uyarı
}

export interface LeagueDNA {
  avgGoals: number;
  homeWinRate: number;
  drawRate: number;
  bttsRate: number;
  over25Rate: number;
}

export interface ScannerResult {
  all: MatchAnalysis[];
  banko: MatchAnalysis[];
  value: MatchAnalysis[];
  highScoring: MatchAnalysis[];
  btts: MatchAnalysis[];
  scannedAt: Date;
  totalMatches: number;
}

export interface CouponMatch {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odds: number;
  confidence: number;
  value: number;
}

export interface GeneratedCoupon {
  matches: CouponMatch[];
  totalOdds: number;
  expectedValue: number;
  riskLevel: 'low' | 'medium' | 'high';
  suggestedStake: number;
}

// ============ LEAGUE DNA DATABASE ============

export const LEAGUE_DNA: Record<number, LeagueDNA> = {
  // Turkey
  203: { avgGoals: 2.65, homeWinRate: 0.48, drawRate: 0.24, bttsRate: 0.52, over25Rate: 0.51 }, // Süper Lig
  204: { avgGoals: 2.45, homeWinRate: 0.45, drawRate: 0.26, bttsRate: 0.48, over25Rate: 0.45 }, // 1. Lig
  206: { avgGoals: 2.75, homeWinRate: 0.46, drawRate: 0.22, bttsRate: 0.54, over25Rate: 0.53 }, // Türkiye Kupası
  
  // England
  39: { avgGoals: 2.85, homeWinRate: 0.44, drawRate: 0.25, bttsRate: 0.55, over25Rate: 0.56 }, // Premier League
  40: { avgGoals: 2.72, homeWinRate: 0.46, drawRate: 0.24, bttsRate: 0.54, over25Rate: 0.53 }, // Championship
  
  // Spain
  140: { avgGoals: 2.55, homeWinRate: 0.47, drawRate: 0.26, bttsRate: 0.50, over25Rate: 0.48 }, // La Liga
  141: { avgGoals: 2.42, homeWinRate: 0.44, drawRate: 0.28, bttsRate: 0.47, over25Rate: 0.44 }, // La Liga 2
  
  // Germany
  78: { avgGoals: 3.15, homeWinRate: 0.45, drawRate: 0.22, bttsRate: 0.62, over25Rate: 0.64 }, // Bundesliga
  79: { avgGoals: 2.95, homeWinRate: 0.44, drawRate: 0.24, bttsRate: 0.58, over25Rate: 0.58 }, // 2. Bundesliga
  
  // Italy
  135: { avgGoals: 2.68, homeWinRate: 0.45, drawRate: 0.27, bttsRate: 0.51, over25Rate: 0.52 }, // Serie A
  136: { avgGoals: 2.55, homeWinRate: 0.43, drawRate: 0.28, bttsRate: 0.49, over25Rate: 0.48 }, // Serie B
  
  // France
  61: { avgGoals: 2.75, homeWinRate: 0.46, drawRate: 0.24, bttsRate: 0.53, over25Rate: 0.54 }, // Ligue 1
  62: { avgGoals: 2.58, homeWinRate: 0.44, drawRate: 0.26, bttsRate: 0.50, over25Rate: 0.50 }, // Ligue 2
  
  // Netherlands
  88: { avgGoals: 3.05, homeWinRate: 0.47, drawRate: 0.22, bttsRate: 0.60, over25Rate: 0.62 }, // Eredivisie
  
  // Portugal
  94: { avgGoals: 2.62, homeWinRate: 0.48, drawRate: 0.24, bttsRate: 0.51, over25Rate: 0.50 }, // Primeira Liga
  
  // Belgium
  144: { avgGoals: 2.88, homeWinRate: 0.46, drawRate: 0.23, bttsRate: 0.56, over25Rate: 0.57 }, // Pro League
  
  // European Cups
  2: { avgGoals: 2.92, homeWinRate: 0.52, drawRate: 0.20, bttsRate: 0.56, over25Rate: 0.58 }, // Champions League
  3: { avgGoals: 2.78, homeWinRate: 0.48, drawRate: 0.23, bttsRate: 0.54, over25Rate: 0.55 }, // Europa League
  848: { avgGoals: 2.65, homeWinRate: 0.46, drawRate: 0.25, bttsRate: 0.52, over25Rate: 0.52 }, // Conference League
};

// Default DNA for unknown leagues
const DEFAULT_DNA: LeagueDNA = {
  avgGoals: 2.55,
  homeWinRate: 0.45,
  drawRate: 0.26,
  bttsRate: 0.50,
  over25Rate: 0.50
};

// ============ AI SUMMARY GENERATOR ============

export function generateAISummary(analysis: Omit<MatchAnalysis, 'aiSummary'>): string {
  const reasons: string[] = [];
  
  // Risk uyarısı varsa önce göster
  if (analysis.riskWarning) {
    return analysis.riskWarning;
  }
  
  // Stil eşleşmesi bilgisi
  if (analysis.styleAnalysis) {
    const { homeProfile, awayProfile, matchup } = analysis.styleAnalysis;
    const homeStyle = STYLE_DESCRIPTIONS[homeProfile.style];
    const awayStyle = STYLE_DESCRIPTIONS[awayProfile.style];
    reasons.push(`${homeStyle.emoji} ${homeStyle.name} vs ${awayStyle.emoji} ${awayStyle.name}: ${matchup.reasoning}`);
  }
  
  // Monte Carlo sonucu
  if (analysis.monteCarloResult) {
    const mc = analysis.monteCarloResult;
    if (mc.topScores.length > 0) {
      reasons.push(`En olası skor: ${mc.topScores[0].score} (%${(mc.topScores[0].probability * 100).toFixed(0)})`);
    }
    
    if (mc.confidenceLevel === 'high') {
      reasons.push(`📊 Simülasyon tutarlı, güvenle oynayabilirsin`);
    }
  }
  
  // Banko match
  if (analysis.isBanko) {
    const bestBet = analysis.valueBets[0];
    if (bestBet) {
      reasons.push(`🔒 ${bestBet.market} için %${bestBet.value.toFixed(0)} value fırsatı`);
    }
  }
  
  // High value
  if (analysis.valueScore > 15) {
    reasons.push(`💎 Oranlar gerçek olasılığın altında`);
  }
  
  // High scoring potential
  if (analysis.isHighScoring && analysis.leagueDNA.avgGoals > 2.8) {
    reasons.push(`⚽ Gollü lig, Ü2.5 %${(analysis.goalProbability * 100).toFixed(0)}`);
  }
  
  // BTTS potential
  if (analysis.isBTTS) {
    reasons.push(`🎯 Her iki takım da gol atar (%${(analysis.bttsProb * 100).toFixed(0)})`);
  }
  
  // Poisson-based insight
  if (analysis.poisson) {
    const { homeWin, draw, awayWin } = analysis.poisson;
    if (homeWin > 55) {
      reasons.push(`🏠 Ev sahibi favori (%${homeWin.toFixed(0)})`);
    } else if (awayWin > 45) {
      reasons.push(`✈️ Deplasman sürprizi olabilir (%${awayWin.toFixed(0)})`);
    } else if (draw > 30) {
      reasons.push(`🤝 Beraberlik ihtimali yüksek (%${draw.toFixed(0)})`);
    }
  }
  
  // League DNA insight
  if (analysis.leagueDNA.over25Rate > 0.58) {
    reasons.push(`📈 Bu ligde maçların %${(analysis.leagueDNA.over25Rate * 100).toFixed(0)}'i 2.5 üstü`);
  }
  
  if (reasons.length === 0) {
    return 'Standart maç, özel bir fırsat yok.';
  }
  
  return reasons.slice(0, 2).join('. ') + '.';
}

// ============ MAIN SCANNER ============

export interface ScanInput {
  fixtureId: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  league: { id: number; name: string };
  kickoff: string;
  homeStats?: {
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
  };
  awayStats?: {
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
  };
  odds?: {
    home?: number;
    draw?: number;
    away?: number;
    over25?: number;
    under25?: number;
    bttsYes?: number;
    bttsNo?: number;
  };
  h2h?: {
    homeWins: number;
    draws: number;
    awayWins: number;
    totalMatches: number;
  };
}

export async function scanMatches(matches: ScanInput[]): Promise<ScannerResult> {
  const cacheKey = `scanner_${new Date().toDateString()}`;
  const cached = getCached(cacheKey);
  
  if (cached && cached.totalMatches === matches.length) {
    return cached;
  }
  
  const analyses: MatchAnalysis[] = [];
  
  for (const match of matches) {
    const analysis = analyzeMatch(match);
    analyses.push(analysis);
  }
  
  const result: ScannerResult = {
    all: analyses,
    banko: analyses.filter(a => a.isBanko),
    value: analyses.filter(a => a.isValue),
    highScoring: analyses.filter(a => a.isHighScoring),
    btts: analyses.filter(a => a.isBTTS),
    scannedAt: new Date(),
    totalMatches: matches.length
  };
  
  // Cache for 10 minutes
  setCache(cacheKey, result, 10 * 60 * 1000);
  
  return result;
}

function analyzeMatch(match: ScanInput): MatchAnalysis {
  const leagueDNA = LEAGUE_DNA[match.league.id] || DEFAULT_DNA;
  
  // Calculate Poisson if stats available
  let poisson: MatchOutcomeProbabilities | null = null;
  if (match.homeStats && match.awayStats) {
    const homeAvg = match.homeStats.goalsScored / Math.max(match.homeStats.matchesPlayed, 1);
    const awayAvg = match.awayStats.goalsScored / Math.max(match.awayStats.matchesPlayed, 1);
    
    // Adjust with League DNA
    const adjustedHomeExpected = (homeAvg * 0.7) + (leagueDNA.avgGoals / 2 * 0.3);
    const adjustedAwayExpected = (awayAvg * 0.7) + (leagueDNA.avgGoals / 2 * 0.3);
    
    // Generate score matrix and calculate probabilities
    const matrix = generateScoreMatrix(adjustedHomeExpected, adjustedAwayExpected);
    poisson = calculateOutcomeProbabilities(matrix);
  }
  
  // NEW: Cluster Analysis (Stil Eşleşmesi)
  let styleAnalysis: MatchAnalysis['styleAnalysis'] = undefined;
  let monteCarloResult: SimulationResult | undefined = undefined;
  let chaosLevel = 0.5; // Default orta
  let riskWarning: string | undefined = undefined;
  
  if (match.homeStats && match.awayStats) {
    // Takım profilleri oluştur
    const homeProfile = createTeamProfile(
      match.homeTeam.id,
      match.homeTeam.name,
      {
        goalsScored: match.homeStats.goalsScored,
        goalsConceded: match.homeStats.goalsConceded,
        matchesPlayed: match.homeStats.matchesPlayed
      }
    );
    
    const awayProfile = createTeamProfile(
      match.awayTeam.id,
      match.awayTeam.name,
      {
        goalsScored: match.awayStats.goalsScored,
        goalsConceded: match.awayStats.goalsConceded,
        matchesPlayed: match.awayStats.matchesPlayed
      }
    );
    
    // Stil eşleşmesi analizi
    const matchup = analyzeStyleMatchup(homeProfile, awayProfile);
    styleAnalysis = { homeProfile, awayProfile, matchup };
    
    // Monte Carlo Simülasyonu (5000 iterasyon - performans için)
    const homeSimStats = createSimStats(
      match.homeStats.goalsScored,
      match.homeStats.goalsConceded,
      match.homeStats.matchesPlayed,
      { isHome: true }
    );
    
    const awaySimStats = createSimStats(
      match.awayStats.goalsScored,
      match.awayStats.goalsConceded,
      match.awayStats.matchesPlayed,
      { isHome: false }
    );
    
    monteCarloResult = runMonteCarloSimulation(homeSimStats, awaySimStats, {
      iterations: 5000
    });
    
    // Chaos level ve risk uyarısı
    chaosLevel = monteCarloResult.chaosIndex;
    
    if (monteCarloResult.confidenceLevel === 'avoid') {
      riskWarning = `⚠️ Yüksek belirsizlik (σ=${monteCarloResult.stdDeviation.toFixed(2)}). Bu maçtan uzak dur!`;
    } else if (matchup.prediction.chaosLevel >= 0.8) {
      riskWarning = `⚡ Kaotik eşleşme: ${STYLE_DESCRIPTIONS[homeProfile.style].emoji} vs ${STYLE_DESCRIPTIONS[awayProfile.style].emoji}`;
    }
  }
  
  // Find value bets
  const valueBets = match.odds ? findValueBetsForMatch(match, poisson, leagueDNA, styleAnalysis) : [];
  
  // Calculate scores
  const valueScore = valueBets.length > 0 
    ? valueBets.filter(vb => vb.isValue).reduce((sum, vb) => sum + vb.value, 0) / Math.max(valueBets.filter(vb => vb.isValue).length, 1)
    : 0;
  
  const confidenceScore = calculateConfidence(match, poisson, valueBets, leagueDNA, monteCarloResult);
  
  // Goal probabilities - Monte Carlo varsa onu kullan
  let goalProbability = poisson ? poisson.over25 / 100 : leagueDNA.over25Rate;
  let bttsProb = poisson ? poisson.bttsYes / 100 : leagueDNA.bttsRate;
  
  // Monte Carlo sonuçlarını ağırlıklandır
  if (monteCarloResult) {
    goalProbability = (goalProbability * 0.4) + (monteCarloResult.over25Probability * 0.6);
    bttsProb = (bttsProb * 0.4) + (monteCarloResult.bttsProbability * 0.6);
  }
  
  // Stil eşleşmesi boost'larını uygula
  if (styleAnalysis) {
    goalProbability = Math.max(0.05, Math.min(0.95, goalProbability + styleAnalysis.matchup.prediction.overBoost));
    bttsProb = Math.max(0.05, Math.min(0.95, bttsProb + styleAnalysis.matchup.prediction.bttsBoost));
  }
  
  // H2H psychological factor (10% weight)
  let h2hFactor = 0;
  if (match.h2h && match.h2h.totalMatches >= 3) {
    const homeWinRate = match.h2h.homeWins / match.h2h.totalMatches;
    h2hFactor = (homeWinRate - 0.5) * 0.1; // -5% to +5%
  }
  
  // Categorization - yüksek kaos seviyesi varsa banko olmamalı
  const isBanko = confidenceScore > 75 && valueScore > 15 && chaosLevel < 0.6;
  const isValue = valueScore > 10;
  const isHighScoring = goalProbability > 0.55;
  const isBTTS = bttsProb > 0.55;
  
  const partialAnalysis = {
    fixtureId: match.fixtureId,
    homeTeam: match.homeTeam.name,
    awayTeam: match.awayTeam.name,
    league: match.league.name,
    leagueId: match.league.id,
    kickoff: match.kickoff,
    poisson,
    valueBets,
    confidenceScore: Math.min(100, confidenceScore + h2hFactor * 100),
    valueScore,
    goalProbability,
    bttsProb,
    isBanko,
    isValue,
    isHighScoring,
    isBTTS,
    leagueDNA,
    styleAnalysis,
    monteCarloResult,
    chaosLevel,
    riskWarning
  };
  
  return {
    ...partialAnalysis,
    aiSummary: generateAISummary(partialAnalysis)
  };
}

function findValueBetsForMatch(
  match: ScanInput, 
  poisson: MatchOutcomeProbabilities | null,
  leagueDNA: LeagueDNA,
  styleAnalysis?: MatchAnalysis['styleAnalysis']
): ValueBetAnalysis[] {
  if (!match.odds) return [];
  
  const bets: { market: string; pick: string; probability: number; odds: number }[] = [];
  
  // Calculate probabilities from Poisson or League DNA
  let probs = poisson ? {
    '1': poisson.homeWin,
    'X': poisson.draw,
    '2': poisson.awayWin,
    'Ü2.5': poisson.over25,
    'A2.5': 100 - poisson.over25,
    'KG Var': poisson.bttsYes,
    'KG Yok': poisson.bttsNo
  } : {
    '1': leagueDNA.homeWinRate * 100,
    'X': leagueDNA.drawRate * 100,
    '2': (1 - leagueDNA.homeWinRate - leagueDNA.drawRate) * 100,
    'Ü2.5': leagueDNA.over25Rate * 100,
    'A2.5': (1 - leagueDNA.over25Rate) * 100,
    'KG Var': leagueDNA.bttsRate * 100,
    'KG Yok': (1 - leagueDNA.bttsRate) * 100
  };
  
  // Stil eşleşmesi boost'larını uygula
  if (styleAnalysis) {
    const boost = styleAnalysis.matchup.prediction;
    probs = {
      ...probs,
      '1': Math.max(5, Math.min(90, probs['1'] + boost.homeWinBoost * 100)),
      'X': Math.max(5, Math.min(45, probs['X'] + boost.drawBoost * 100)),
      '2': Math.max(5, Math.min(90, probs['2'] + boost.awayWinBoost * 100)),
      'Ü2.5': Math.max(10, Math.min(90, probs['Ü2.5'] + boost.overBoost * 100)),
      'A2.5': Math.max(10, Math.min(90, probs['A2.5'] - boost.overBoost * 100)),
      'KG Var': Math.max(10, Math.min(90, probs['KG Var'] + boost.bttsBoost * 100)),
      'KG Yok': Math.max(10, Math.min(90, probs['KG Yok'] - boost.bttsBoost * 100)),
    };
    
    // Normalize result probabilities
    const totalResult = probs['1'] + probs['X'] + probs['2'];
    probs['1'] = (probs['1'] / totalResult) * 100;
    probs['X'] = (probs['X'] / totalResult) * 100;
    probs['2'] = (probs['2'] / totalResult) * 100;
  }
  
  const oddsMap: Record<string, number | undefined> = {
    '1': match.odds.home,
    'X': match.odds.draw,
    '2': match.odds.away,
    'Ü2.5': match.odds.over25,
    'A2.5': match.odds.under25,
    'KG Var': match.odds.bttsYes,
    'KG Yok': match.odds.bttsNo
  };
  
  // Build bets array for analysis
  for (const [market, prob] of Object.entries(probs)) {
    const odds = oddsMap[market];
    if (odds && odds > 1) {
      bets.push({ market, pick: market, probability: prob, odds });
    }
  }
  
  // Analyze each bet
  return bets.map(bet => 
    analyzeValueBet(bet.market, bet.pick, bet.probability, bet.odds)
  );
}

function calculateConfidence(
  match: ScanInput,
  poisson: MatchOutcomeProbabilities | null,
  valueBets: ValueBetAnalysis[],
  leagueDNA: LeagueDNA,
  monteCarloResult?: SimulationResult
): number {
  let score = 50; // Base score
  
  // Stats availability bonus
  if (match.homeStats && match.awayStats) {
    score += 10;
  }
  
  // Poisson clarity bonus
  if (poisson) {
    const maxProb = Math.max(poisson.homeWin, poisson.draw, poisson.awayWin);
    if (maxProb > 50) score += 15;
    else if (maxProb > 40) score += 10;
  }
  
  // Value bets bonus
  const valuableBets = valueBets.filter(vb => vb.isValue);
  if (valuableBets.length > 0) {
    const avgValue = valuableBets.reduce((s, v) => s + v.value, 0) / valuableBets.length;
    score += Math.min(avgValue * 0.5, 15);
  }
  
  // H2H data bonus
  if (match.h2h && match.h2h.totalMatches >= 5) {
    score += 5;
  }
  
  // League DNA alignment
  if (LEAGUE_DNA[match.league.id]) {
    score += 5; // Known league bonus
  }
  
  // NEW: Monte Carlo confidence adjustment
  if (monteCarloResult) {
    // Düşük standart sapma = daha güvenilir
    if (monteCarloResult.stdDeviation <= 1.3) {
      score += 10;
    } else if (monteCarloResult.stdDeviation <= 1.6) {
      score += 5;
    } else if (monteCarloResult.stdDeviation >= 2.0) {
      score -= 10; // Yüksek belirsizlik = düşük güven
    }
    
    // Confidence level'a göre
    if (monteCarloResult.confidenceLevel === 'high') {
      score += 5;
    } else if (monteCarloResult.confidenceLevel === 'avoid') {
      score -= 15;
    }
  }
  
  return Math.min(100, Math.max(0, score));
}

// ============ SORTING ============

export type SortType = 'value' | 'confidence' | 'goals' | 'btts' | 'kickoff';

export function sortAnalyses(analyses: MatchAnalysis[], sortBy: SortType): MatchAnalysis[] {
  const sorted = [...analyses];
  
  switch (sortBy) {
    case 'value':
      return sorted.sort((a, b) => b.valueScore - a.valueScore);
    case 'confidence':
      return sorted.sort((a, b) => b.confidenceScore - a.confidenceScore);
    case 'goals':
      return sorted.sort((a, b) => b.goalProbability - a.goalProbability);
    case 'btts':
      return sorted.sort((a, b) => b.bttsProb - a.bttsProb);
    case 'kickoff':
      return sorted.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    default:
      return sorted;
  }
}

// ============ AUTO COUPON GENERATOR ============

export interface CouponConfig {
  targetOdds: number;        // Target total odds (e.g., 3.0, 5.0, 10.0)
  riskLevel: 'low' | 'medium' | 'high';
  maxMatches: number;
  minConfidence: number;
  minValue: number;
  bankroll?: number;
}

export function generateCoupon(
  analyses: MatchAnalysis[],
  config: CouponConfig
): GeneratedCoupon {
  // Filter by minimum requirements
  let candidates = analyses.filter(a => 
    a.confidenceScore >= config.minConfidence &&
    a.valueScore >= config.minValue &&
    a.valueBets.some(vb => vb.isValue)
  );
  
  // Sort by value + confidence combo
  candidates = candidates.sort((a, b) => 
    (b.valueScore + b.confidenceScore) - (a.valueScore + a.confidenceScore)
  );
  
  // Risk level adjustments
  const riskMultiplier = {
    low: 0.7,
    medium: 1.0,
    high: 1.3
  }[config.riskLevel];
  
  const minOdds = {
    low: 1.3,
    medium: 1.5,
    high: 1.8
  }[config.riskLevel];
  
  const matches: CouponMatch[] = [];
  let currentOdds = 1;
  
  for (const analysis of candidates) {
    if (matches.length >= config.maxMatches) break;
    if (currentOdds >= config.targetOdds) break;
    
    // Select best value bet for this match
    const bestBet = analysis.valueBets
      .filter(vb => vb.isValue && vb.bookmakerOdds >= minOdds)
      .sort((a, b) => (b.value * b.bookmakerOdds) - (a.value * a.bookmakerOdds))[0];
    
    if (!bestBet) continue;
    
    matches.push({
      fixtureId: analysis.fixtureId,
      homeTeam: analysis.homeTeam,
      awayTeam: analysis.awayTeam,
      selection: bestBet.market,
      odds: bestBet.bookmakerOdds,
      confidence: analysis.confidenceScore,
      value: bestBet.value
    });
    
    currentOdds *= bestBet.bookmakerOdds;
  }
  
  // Calculate expected value
  const combinedProbability = matches.reduce((p, m) => {
    const impliedProb = 1 / m.odds;
    const realProb = impliedProb * (1 + m.value / 100);
    return p * realProb;
  }, 1);
  
  const expectedValue = (combinedProbability * currentOdds - 1) * 100;
  
  // Kelly-based stake suggestion
  const kellyFraction = Math.max(0, expectedValue / 100 / (currentOdds - 1));
  const suggestedStake = config.bankroll 
    ? Math.round(config.bankroll * kellyFraction * riskMultiplier * 0.25) // Quarter Kelly
    : 0;
  
  return {
    matches,
    totalOdds: Math.round(currentOdds * 100) / 100,
    expectedValue: Math.round(expectedValue * 10) / 10,
    riskLevel: config.riskLevel,
    suggestedStake
  };
}
