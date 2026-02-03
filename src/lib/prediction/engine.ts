/**
 * AI Tahmin Motoru - Core Engine
 * Form, H2H ve istatistik bazlı akıllı tahmin algoritması
 * GPP (Rakip Gücüne Göre Ağırlıklı Form) dahil
 */

import {
  PredictionResult,
  PredictionFactors,
  MatchResultPrediction,
  GoalsPrediction,
  BTTSPrediction,
  BetSuggestion,
  PredictionOdds,
  FormMatch,
  PredictionSettings,
  DEFAULT_PREDICTION_SETTINGS,
} from './types';
import { analyzePoissonPrediction } from './poisson';

// =====================================
// GPP - Opponent Strength Weighted Form
// Rakip gücüne göre ağırlıklı form hesabı
// =====================================

/**
 * Rakip gücü çarpanı hesapla
 * Lig sıralamasına göre rakip gücünü belirler
 * @param opponentRank Rakibin lig sıralaması (1-20)
 * @param totalTeams Ligteki toplam takım sayısı
 * @returns Çarpan (0.7 - 1.5 arası)
 */
function getOpponentMultiplier(opponentRank: number, totalTeams: number = 20): number {
  // Rakip ne kadar üst sıradaysa, o galibiyetin değeri o kadar yüksek
  // Top 3 rakip: 1.3 - 1.5 çarpan (güçlü rakip)
  // Alt 3 rakip: 0.7 - 0.8 çarpan (zayıf rakip)
  
  const normalizedRank = opponentRank / totalTeams; // 0-1 arası
  
  if (normalizedRank <= 0.15) {
    // Top 3 takım (lig liderleri) - çok güçlü rakip
    return 1.5 - (normalizedRank * 1.33);
  } else if (normalizedRank <= 0.30) {
    // 4-6. sıra - güçlü rakip
    return 1.3;
  } else if (normalizedRank <= 0.50) {
    // 7-10. sıra - ortalama üstü
    return 1.1;
  } else if (normalizedRank <= 0.75) {
    // 11-15. sıra - ortalama altı
    return 0.9;
  } else {
    // 16-20. sıra - zayıf rakip
    return 0.75;
  }
}

/**
 * GPP Form Skoru Hesapla
 * Her maçın sonucunu rakip gücüyle ağırlıklandır
 */
interface GPPMatch extends FormMatch {
  opponentRank?: number;
  opponentName?: string;
}

function calculateGPPFormScore(matches: GPPMatch[], homeOnly: boolean = false): number {
  const filtered = homeOnly 
    ? matches.filter(m => m.isHome) 
    : matches;
  
  if (filtered.length === 0) return 50;
  
  let weightedScore = 0;
  let totalWeight = 0;
  
  // Recency weights (son maçlar daha önemli)
  const recencyWeights = [1.5, 1.3, 1.1, 0.9, 0.7];
  
  filtered.slice(0, 5).forEach((match, i) => {
    const recency = recencyWeights[i] || 0.5;
    const opponentMultiplier = match.opponentRank 
      ? getOpponentMultiplier(match.opponentRank) 
      : 1.0;
    
    const combinedWeight = recency * opponentMultiplier;
    
    // Sonuca göre puan
    let matchScore = 0;
    if (match.result === 'W') matchScore = 100;
    else if (match.result === 'D') matchScore = 40;
    // L = 0
    
    weightedScore += matchScore * combinedWeight;
    totalWeight += combinedWeight;
  });
  
  return totalWeight > 0 ? Math.round((weightedScore / totalWeight)) : 50;
}

/**
 * Ana tahmin motoru
 */
export class PredictionEngine {
  private settings: PredictionSettings;
  
  constructor(settings: Partial<PredictionSettings> = {}) {
    this.settings = { ...DEFAULT_PREDICTION_SETTINGS, ...settings };
  }
  
  /**
   * Tam maç tahmini oluştur
   */
  generatePrediction(
    matchId: number,
    homeTeam: string,
    awayTeam: string,
    league: string,
    date: string,
    homeForm: FormMatch[],
    awayForm: FormMatch[],
    h2hMatches: any[],
    homeStats: any,
    awayStats: any,
    standings: any,
    odds: { home: number; draw: number; away: number; over25: number; btts: number }
  ): PredictionResult {
    // Faktörleri hesapla
    const factors = this.calculateFactors(
      homeForm, 
      awayForm, 
      h2hMatches, 
      homeStats, 
      awayStats, 
      standings
    );
    
    // Tahminleri hesapla
    const matchResult = this.predictMatchResult(factors, odds);
    const goals = this.predictGoals(factors, odds);
    const btts = this.predictBTTS(factors, odds);
    
    // En iyi bahisi bul
    const bestBet = this.findBestBet(matchResult, goals, btts, factors);
    
    // Genel güven skoru
    const overallConfidence = this.calculateOverallConfidence(factors);
    
    return {
      matchId,
      homeTeam,
      awayTeam,
      league,
      date,
      predictions: {
        matchResult,
        goals,
        btts,
      },
      bestBet,
      factors,
      overallConfidence,
      generatedAt: Date.now(),
    };
  }
  
  /**
   * Tahmin faktörlerini hesapla
   */
  private calculateFactors(
    homeForm: FormMatch[],
    awayForm: FormMatch[],
    h2hMatches: any[],
    homeStats: any,
    awayStats: any,
    standings: any
  ): PredictionFactors {
    return {
      form: this.analyzeForm(homeForm, awayForm),
      h2h: this.analyzeH2H(h2hMatches),
      stats: this.analyzeStats(homeStats, awayStats),
      standings: this.analyzeStandings(standings),
      motivation: this.analyzeMotivation(standings),
    };
  }
  
  /**
   * Form analizi (GPP destekli)
   * GPP: Rakip gücüne göre ağırlıklı form hesabı
   */
  private analyzeForm(homeForm: FormMatch[], awayForm: FormMatch[]) {
    // Basit form skoru (backward compatible)
    const calcFormScore = (matches: FormMatch[], homeOnly: boolean = false): number => {
      const filtered = homeOnly 
        ? matches.filter(m => m.isHome) 
        : matches;
      
      if (filtered.length === 0) return 50;
      
      let score = 0;
      const weights = [1.5, 1.3, 1.1, 0.9, 0.7]; // Son maçlar daha önemli
      
      filtered.slice(0, 5).forEach((match, i) => {
        const weight = weights[i] || 0.5;
        if (match.result === 'W') score += 100 * weight;
        else if (match.result === 'D') score += 40 * weight;
        else score += 0;
      });
      
      const maxScore = weights.slice(0, Math.min(filtered.length, 5)).reduce((a, b) => a + b, 0) * 100;
      return Math.round((score / maxScore) * 100);
    };
    
    // GPP (Rakip Gücüne Göre Ağırlıklı) form skoru
    const homeGPPScore = calculateGPPFormScore(homeForm as GPPMatch[]);
    const awayGPPScore = calculateGPPFormScore(awayForm as GPPMatch[]);
    
    // Basit form skorları
    const homeFormScore = calcFormScore(homeForm);
    const awayFormScore = calcFormScore(awayForm);
    const homeHomeFormScore = calcFormScore(homeForm, true);
    const awayAwayFormScore = calcFormScore(awayForm.map(m => ({ ...m, isHome: !m.isHome })), true);
    
    // GPP varsa kullan, yoksa basit skoru kullan
    // GPP %60, Basit form %40 ağırlıklı kombine
    const combineWithGPP = (simple: number, gpp: number): number => {
      return Math.round((gpp * 0.6) + (simple * 0.4));
    };
    
    return {
      homeForm: combineWithGPP(homeFormScore, homeGPPScore),
      awayForm: combineWithGPP(awayFormScore, awayGPPScore),
      homeHomeForm: homeHomeFormScore,
      awayAwayForm: awayAwayFormScore,
      formDifference: combineWithGPP(homeFormScore, homeGPPScore) - combineWithGPP(awayFormScore, awayGPPScore),
      // Yeni: GPP skorları ayrı olarak
      homeGPP: homeGPPScore,
      awayGPP: awayGPPScore,
    };
  }
  
  /**
   * H2H analizi
   */
  private analyzeH2H(h2hMatches: any[]) {
    if (!h2hMatches || h2hMatches.length === 0) {
      return {
        totalMatches: 0,
        homeWins: 0,
        draws: 0,
        awayWins: 0,
        avgGoals: 2.5,
        bttsPercentage: 50,
        recentTrend: 'balanced' as const,
      };
    }
    
    let homeWins = 0, draws = 0, awayWins = 0;
    let totalGoals = 0;
    let bttsCount = 0;
    
    h2hMatches.forEach(match => {
      const homeGoals = match.goals?.home ?? 0;
      const awayGoals = match.goals?.away ?? 0;
      
      if (homeGoals > awayGoals) homeWins++;
      else if (homeGoals < awayGoals) awayWins++;
      else draws++;
      
      totalGoals += homeGoals + awayGoals;
      if (homeGoals > 0 && awayGoals > 0) bttsCount++;
    });
    
    // Son 3 maçın trendi
    const recentMatches = h2hMatches.slice(0, 3);
    const recentHomeWins = recentMatches.filter(m => (m.goals?.home ?? 0) > (m.goals?.away ?? 0)).length;
    const recentAwayWins = recentMatches.filter(m => (m.goals?.home ?? 0) < (m.goals?.away ?? 0)).length;
    
    let recentTrend: 'home' | 'away' | 'balanced' = 'balanced';
    if (recentHomeWins >= 2) recentTrend = 'home';
    else if (recentAwayWins >= 2) recentTrend = 'away';
    
    return {
      totalMatches: h2hMatches.length,
      homeWins,
      draws,
      awayWins,
      avgGoals: Math.round((totalGoals / h2hMatches.length) * 10) / 10,
      bttsPercentage: Math.round((bttsCount / h2hMatches.length) * 100),
      recentTrend,
    };
  }
  
  /**
   * İstatistik analizi
   */
  private analyzeStats(homeStats: any, awayStats: any) {
    // Varsayılan değerler
    const defaultStats = {
      goalsScored: 1.3,
      goalsConceded: 1.2,
      shotsOnTarget: 4,
      possession: 50,
    };
    
    const home = homeStats || defaultStats;
    const away = awayStats || defaultStats;
    
    // Atak ve defans skoru hesapla (0-100)
    const homeAttack = Math.min(100, (home.goalsScored || 1.3) * 40);
    const homeDefense = Math.max(0, 100 - (home.goalsConceded || 1.2) * 40);
    const awayAttack = Math.min(100, (away.goalsScored || 1.3) * 40);
    const awayDefense = Math.max(0, 100 - (away.goalsConceded || 1.2) * 40);
    
    return {
      homeAttack: Math.round(homeAttack),
      homeDefense: Math.round(homeDefense),
      awayAttack: Math.round(awayAttack),
      awayDefense: Math.round(awayDefense),
      homeGoalsScored: home.goalsScored || 1.3,
      homeGoalsConceded: home.goalsConceded || 1.2,
      awayGoalsScored: away.goalsScored || 1.3,
      awayGoalsConceded: away.goalsConceded || 1.2,
    };
  }
  
  /**
   * Lig sıralaması analizi
   */
  private analyzeStandings(standings: any) {
    if (!standings) {
      return {
        homePosition: 10,
        awayPosition: 10,
        positionDifference: 0,
        homePoints: 0,
        awayPoints: 0,
      };
    }
    
    return {
      homePosition: standings.homePosition || 10,
      awayPosition: standings.awayPosition || 10,
      positionDifference: (standings.awayPosition || 10) - (standings.homePosition || 10),
      homePoints: standings.homePoints || 0,
      awayPoints: standings.awayPoints || 0,
    };
  }
  
  /**
   * Motivasyon analizi
   */
  private analyzeMotivation(standings: any) {
    // Basit motivasyon hesabı - sıralamaya göre
    const homePos = standings?.homePosition || 10;
    const awayPos = standings?.awayPosition || 10;
    
    // Üst sıralar ve alt sıralar daha motive
    const getMotivation = (pos: number): number => {
      if (pos <= 3) return 90; // Şampiyonluk
      if (pos <= 6) return 75; // Avrupa
      if (pos >= 17) return 85; // Küme düşme
      return 60; // Orta sıra
    };
    
    const homeMotivation = getMotivation(homePos);
    const awayMotivation = getMotivation(awayPos);
    
    // Önem seviyesi
    let importanceLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if ((homePos <= 3 || homePos >= 17) && (awayPos <= 3 || awayPos >= 17)) {
      importanceLevel = 'critical';
    } else if (homePos <= 6 || awayPos <= 6 || homePos >= 15 || awayPos >= 15) {
      importanceLevel = 'high';
    }
    
    return {
      homeMotivation,
      awayMotivation,
      importanceLevel,
    };
  }
  
  /**
   * Maç sonucu tahmini
   */
  private predictMatchResult(
    factors: PredictionFactors, 
    odds: { home: number; draw: number; away: number }
  ): MatchResultPrediction {
    const { form, h2h, stats, standings, motivation } = factors;
    
    // Ağırlıklı skor hesapla
    let homeScore = 50;
    let awayScore = 50;
    
    // Form etkisi (%30)
    homeScore += (form.homeForm - 50) * 0.3;
    awayScore += (form.awayForm - 50) * 0.3;
    
    // Ev/Deplasman formu (%10)
    homeScore += (form.homeHomeForm - 50) * 0.1;
    awayScore += (form.awayAwayForm - 50) * 0.1;
    
    // H2H etkisi (%15)
    if (h2h.totalMatches > 0) {
      const h2hHomeAdvantage = ((h2h.homeWins - h2h.awayWins) / h2h.totalMatches) * 15;
      homeScore += h2hHomeAdvantage;
      awayScore -= h2hHomeAdvantage;
    }
    
    // İstatistik etkisi (%20)
    homeScore += ((stats.homeAttack + stats.homeDefense) / 2 - 50) * 0.2;
    awayScore += ((stats.awayAttack + stats.awayDefense) / 2 - 50) * 0.2;
    
    // Sıralama etkisi (%15)
    homeScore += (standings.positionDifference * 1.5);
    awayScore -= (standings.positionDifference * 1.5);
    
    // Motivasyon etkisi (%10)
    homeScore += (motivation.homeMotivation - 70) * 0.1;
    awayScore += (motivation.awayMotivation - 70) * 0.1;
    
    // Ev avantajı bonus (%5-10)
    homeScore += 5;
    
    // Normalize et
    const total = homeScore + awayScore;
    const homePct = Math.min(70, Math.max(20, (homeScore / total) * 100));
    const awayPct = Math.min(70, Math.max(20, (awayScore / total) * 100));
    const drawPct = 100 - homePct - awayPct;
    
    // Value hesapla
    const calcValue = (prob: number, odds: number): number => {
      const fairOdds = 100 / prob;
      return Math.round(((odds / fairOdds) - 1) * 100);
    };
    
    const homeWin: PredictionOdds = {
      probability: Math.round(homePct),
      confidence: Math.round(Math.abs(homePct - 33) + 50),
      value: calcValue(homePct, odds.home),
      bookmakerOdds: odds.home,
      fairOdds: Math.round((100 / homePct) * 100) / 100,
    };
    
    const draw: PredictionOdds = {
      probability: Math.round(drawPct),
      confidence: Math.round(Math.abs(drawPct - 33) + 40),
      value: calcValue(drawPct, odds.draw),
      bookmakerOdds: odds.draw,
      fairOdds: Math.round((100 / drawPct) * 100) / 100,
    };
    
    const awayWin: PredictionOdds = {
      probability: Math.round(awayPct),
      confidence: Math.round(Math.abs(awayPct - 33) + 50),
      value: calcValue(awayPct, odds.away),
      bookmakerOdds: odds.away,
      fairOdds: Math.round((100 / awayPct) * 100) / 100,
    };
    
    // Öneri
    let recommended: '1' | 'X' | '2' | null = null;
    const minValue = this.settings.minValueThreshold;
    
    if (homeWin.value >= minValue && homeWin.probability >= 40) recommended = '1';
    else if (awayWin.value >= minValue && awayWin.probability >= 35) recommended = '2';
    else if (draw.value >= minValue && drawPct >= 28) recommended = 'X';
    
    return { homeWin, draw, awayWin, recommended };
  }
  
  /**
   * Gol tahmini (Poisson Dağılımı ile)
   */
  private predictGoals(
    factors: PredictionFactors,
    odds: { over25: number }
  ): GoalsPrediction {
    const { stats, h2h } = factors;
    
    // Gerçek Poisson analizi kullan
    const poissonResult = analyzePoissonPrediction({
      homeGoalsScored: stats.homeGoalsScored,
      awayGoalsScored: stats.awayGoalsScored,
      homeGoalsConceded: stats.homeGoalsConceded,
      awayGoalsConceded: stats.awayGoalsConceded,
      homeAdvantage: 1.1,
    });

    // xG değerleri
    const homeExpected = poissonResult.xg.homeXG;
    const awayExpected = poissonResult.xg.awayXG;
    let totalExpected = poissonResult.xg.totalXG;
    
    // H2H'dan düzeltme
    if (h2h.totalMatches >= 3) {
      totalExpected = (totalExpected + h2h.avgGoals) / 2;
    }
    
    // Poisson olasılıkları
    const over15Prob = poissonResult.probabilities.over15;
    const over25Prob = poissonResult.probabilities.over25;
    const over35Prob = poissonResult.probabilities.over35;
    const under25Prob = 100 - over25Prob;
    
    const calcValue = (prob: number, marketOdds: number): number => {
      const fairOdds = 100 / prob;
      return Math.round(((marketOdds / fairOdds) - 1) * 100);
    };
    
    const over25: PredictionOdds = {
      probability: Math.round(over25Prob),
      confidence: Math.round(Math.abs(over25Prob - 50) + 50),
      value: calcValue(over25Prob, odds.over25 || 1.85),
      bookmakerOdds: odds.over25 || 1.85,
      fairOdds: Math.round((100 / over25Prob) * 100) / 100,
    };
    
    // Öneri
    let recommended: string | null = null;
    if (over25.value >= 5 && over25Prob >= 55) recommended = 'Üst 2.5';
    else if (under25Prob >= 55) recommended = 'Alt 2.5';
    
    return {
      expectedGoals: {
        home: Math.round(homeExpected * 10) / 10,
        away: Math.round(awayExpected * 10) / 10,
        total: Math.round(totalExpected * 10) / 10,
      },
      over15: {
        probability: Math.round(over15Prob),
        confidence: Math.round(Math.abs(over15Prob - 50) + 50),
        value: 0,
      },
      over25,
      over35: {
        probability: Math.round(over35Prob),
        confidence: Math.round(Math.abs(over35Prob - 50) + 40),
        value: 0,
      },
      under25: {
        probability: Math.round(under25Prob),
        confidence: Math.round(Math.abs(under25Prob - 50) + 50),
        value: 0,
      },
      recommended,
    };
  }
  
  /**
   * BTTS tahmini
   */
  private predictBTTS(
    factors: PredictionFactors,
    odds: { btts: number }
  ): BTTSPrediction {
    const { stats, h2h } = factors;
    
    // Her iki takımın gol atma olasılığı
    const homeScoreProb = Math.min(90, stats.homeGoalsScored * 50);
    const awayScoreProb = Math.min(90, stats.awayGoalsScored * 50);
    
    let bttsProb = (homeScoreProb * awayScoreProb) / 100;
    
    // H2H düzeltmesi
    if (h2h.totalMatches >= 3) {
      bttsProb = (bttsProb + h2h.bttsPercentage) / 2;
    }
    
    const calcValue = (prob: number, marketOdds: number): number => {
      const fairOdds = 100 / prob;
      return Math.round(((marketOdds / fairOdds) - 1) * 100);
    };
    
    const yes: PredictionOdds = {
      probability: Math.round(bttsProb),
      confidence: Math.round(Math.abs(bttsProb - 50) + 50),
      value: calcValue(bttsProb, odds.btts || 1.75),
      bookmakerOdds: odds.btts || 1.75,
      fairOdds: Math.round((100 / bttsProb) * 100) / 100,
    };
    
    const no: PredictionOdds = {
      probability: 100 - Math.round(bttsProb),
      confidence: Math.round(Math.abs(100 - bttsProb - 50) + 50),
      value: 0,
    };
    
    // Öneri
    let recommended: 'yes' | 'no' | null = null;
    if (yes.value >= 5 && bttsProb >= 55) recommended = 'yes';
    else if (bttsProb <= 40) recommended = 'no';
    
    return { yes, no, recommended };
  }
  
  /**
   * En iyi bahisi bul
   */
  private findBestBet(
    matchResult: MatchResultPrediction,
    goals: GoalsPrediction,
    btts: BTTSPrediction,
    factors: PredictionFactors
  ): BetSuggestion {
    const candidates: BetSuggestion[] = [];
    
    // MS 1
    if (matchResult.homeWin.value >= 5) {
      candidates.push({
        type: 'match_result',
        label: 'MS 1',
        probability: matchResult.homeWin.probability,
        confidence: matchResult.homeWin.confidence,
        value: matchResult.homeWin.value,
        odds: matchResult.homeWin.bookmakerOdds || 1.5,
        stake: this.getStakeLevel(matchResult.homeWin.confidence, matchResult.homeWin.value),
        reasoning: this.generateReasoning('home', factors),
      });
    }
    
    // MS 2
    if (matchResult.awayWin.value >= 5) {
      candidates.push({
        type: 'match_result',
        label: 'MS 2',
        probability: matchResult.awayWin.probability,
        confidence: matchResult.awayWin.confidence,
        value: matchResult.awayWin.value,
        odds: matchResult.awayWin.bookmakerOdds || 2.5,
        stake: this.getStakeLevel(matchResult.awayWin.confidence, matchResult.awayWin.value),
        reasoning: this.generateReasoning('away', factors),
      });
    }
    
    // Üst 2.5
    if (goals.over25.value >= 5) {
      candidates.push({
        type: 'goals',
        label: 'Üst 2.5 Gol',
        probability: goals.over25.probability,
        confidence: goals.over25.confidence,
        value: goals.over25.value,
        odds: goals.over25.bookmakerOdds || 1.85,
        stake: this.getStakeLevel(goals.over25.confidence, goals.over25.value),
        reasoning: this.generateReasoning('over25', factors),
      });
    }
    
    // KG Var
    if (btts.yes.value >= 5) {
      candidates.push({
        type: 'btts',
        label: 'KG Var',
        probability: btts.yes.probability,
        confidence: btts.yes.confidence,
        value: btts.yes.value,
        odds: btts.yes.bookmakerOdds || 1.75,
        stake: this.getStakeLevel(btts.yes.confidence, btts.yes.value),
        reasoning: this.generateReasoning('btts', factors),
      });
    }
    
    // En iyi value'yu seç
    if (candidates.length === 0) {
      // Varsayılan öneri
      return {
        type: 'none',
        label: 'Value Bahis Yok',
        probability: 0,
        confidence: 0,
        value: 0,
        odds: 0,
        stake: 'low',
        reasoning: ['Bu maç için güçlü bir value bahis bulunamadı.'],
      };
    }
    
    // Value * Confidence skoruna göre sırala
    candidates.sort((a, b) => (b.value * b.confidence) - (a.value * a.confidence));
    
    return candidates[0];
  }
  
  /**
   * Stake seviyesi belirle
   */
  private getStakeLevel(confidence: number, value: number): 'low' | 'medium' | 'high' {
    const score = (confidence + value) / 2;
    if (score >= 70) return 'high';
    if (score >= 55) return 'medium';
    return 'low';
  }
  
  /**
   * Tahmin gerekçeleri oluştur
   */
  private generateReasoning(type: string, factors: PredictionFactors): string[] {
    const reasons: string[] = [];
    
    if (type === 'home') {
      if (factors.form.homeForm >= 70) reasons.push('Ev sahibi formda');
      if (factors.form.homeHomeForm >= 70) reasons.push('Evinde güçlü');
      if (factors.standings.positionDifference > 5) reasons.push('Sıralama avantajı');
      if (factors.h2h.recentTrend === 'home') reasons.push('H2H trend ev sahibi lehine');
    } else if (type === 'away') {
      if (factors.form.awayForm >= 70) reasons.push('Deplasman takımı formda');
      if (factors.standings.positionDifference < -5) reasons.push('Deplasman sıralama avantajı');
      if (factors.h2h.recentTrend === 'away') reasons.push('H2H trend deplasman lehine');
    } else if (type === 'over25') {
      if (factors.stats.homeAttack >= 60) reasons.push('Ev sahibi hücum güçlü');
      if (factors.stats.awayAttack >= 60) reasons.push('Deplasman hücum güçlü');
      if (factors.h2h.avgGoals >= 2.8) reasons.push('H2H yüksek gol ortalaması');
    } else if (type === 'btts') {
      if (factors.h2h.bttsPercentage >= 60) reasons.push('H2H BTTS yüksek');
      if (factors.stats.homeGoalsScored >= 1.5 && factors.stats.awayGoalsScored >= 1.2) {
        reasons.push('Her iki takım da gol yollarında etkili');
      }
    }
    
    if (reasons.length === 0) {
      reasons.push('İstatistiksel analiz sonucu');
    }
    
    return reasons;
  }
  
  /**
   * Genel güven skoru
   */
  private calculateOverallConfidence(factors: PredictionFactors): number {
    // Veri kalitesine göre güven
    let confidence = 50;
    
    // H2H verisi varsa
    if (factors.h2h.totalMatches >= 5) confidence += 10;
    else if (factors.h2h.totalMatches >= 3) confidence += 5;
    
    // Form farkı net ise
    if (Math.abs(factors.form.formDifference) >= 20) confidence += 10;
    
    // Sıralama farkı net ise
    if (Math.abs(factors.standings.positionDifference) >= 8) confidence += 10;
    
    // Motivasyon yüksek ise
    if (factors.motivation.importanceLevel === 'critical') confidence += 10;
    else if (factors.motivation.importanceLevel === 'high') confidence += 5;
    
    return Math.min(95, confidence);
  }
}

// Singleton instance
export const predictionEngine = new PredictionEngine();
