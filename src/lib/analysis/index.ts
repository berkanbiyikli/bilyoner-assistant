/**
 * Analysis Module - Gelişmiş Analiz Araçları
 * 
 * 1. Cluster Analysis: Takım stili kümeleme ve stil eşleşmesi
 * 2. Brier Score: Algoritma kalibrasyonu ve doğruluk ölçümü
 * 3. Monte Carlo: Simülasyon tabanlı olasılık hesaplama
 */

// Cluster Analysis
export {
  type PlayStyle,
  type TeamProfile,
  type StyleMatchup,
  classifyTeamStyle,
  analyzeStyleMatchup,
  createTeamProfile,
  STYLE_DESCRIPTIONS
} from './cluster-analysis';

// Brier Score
export {
  type PredictionRecord,
  type BrierAnalysis,
  type CalibrationConfig,
  calculateBrierScore,
  analyzeBrierScore,
  calibrateProbability,
  createPredictionRecord,
  loadPredictionHistory,
  savePredictionRecord,
  getCalibrationEmoji,
  DEFAULT_CALIBRATION_CONFIG
} from './brier-score';

// Monte Carlo
export {
  type TeamSimStats,
  type SimulationResult,
  type SimulationConfig,
  runMonteCarloSimulation,
  createSimStats,
  interpretSimulation,
  getConfidenceEmoji
} from './monte-carlo';

/**
 * Tüm analiz modüllerini birleştiren yardımcı fonksiyon
 */
import { createTeamProfile, analyzeStyleMatchup, type TeamProfile } from './cluster-analysis';
import { runMonteCarloSimulation, createSimStats, interpretSimulation, type SimulationResult } from './monte-carlo';
import { calibrateProbability, type BrierAnalysis } from './brier-score';

export interface ComprehensiveAnalysis {
  homeProfile: TeamProfile;
  awayProfile: TeamProfile;
  styleMatchup: ReturnType<typeof analyzeStyleMatchup>;
  simulation: SimulationResult;
  insights: string[];
  
  // Final olasılıklar (tüm faktörler dahil)
  finalProbabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    btts: number;
  };
  
  // Önerilen bahisler
  recommendations: {
    market: string;
    pick: string;
    confidence: number;
    reasoning: string;
  }[];
}

/**
 * Kapsamlı maç analizi yap
 */
export function analyzeMatchComprehensive(
  homeTeam: {
    id: number;
    name: string;
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
    possession?: number;
    shots?: number;
  },
  awayTeam: {
    id: number;
    name: string;
    goalsScored: number;
    goalsConceded: number;
    matchesPlayed: number;
    possession?: number;
    shots?: number;
  },
  calibration?: BrierAnalysis
): ComprehensiveAnalysis {
  // 1. Takım profilleri oluştur
  const homeProfile = createTeamProfile(homeTeam.id, homeTeam.name, {
    goalsScored: homeTeam.goalsScored,
    goalsConceded: homeTeam.goalsConceded,
    matchesPlayed: homeTeam.matchesPlayed,
    possession: homeTeam.possession,
    shots: homeTeam.shots
  });
  
  const awayProfile = createTeamProfile(awayTeam.id, awayTeam.name, {
    goalsScored: awayTeam.goalsScored,
    goalsConceded: awayTeam.goalsConceded,
    matchesPlayed: awayTeam.matchesPlayed,
    possession: awayTeam.possession,
    shots: awayTeam.shots
  });
  
  // 2. Stil eşleşmesi analizi
  const styleMatchup = analyzeStyleMatchup(homeProfile, awayProfile);
  
  // 3. Monte Carlo simülasyonu
  const homeSimStats = createSimStats(
    homeTeam.goalsScored,
    homeTeam.goalsConceded,
    homeTeam.matchesPlayed,
    { isHome: true }
  );
  
  const awaySimStats = createSimStats(
    awayTeam.goalsScored,
    awayTeam.goalsConceded,
    awayTeam.matchesPlayed,
    { isHome: false }
  );
  
  const simulation = runMonteCarloSimulation(homeSimStats, awaySimStats, {
    iterations: 10000
  });
  
  // 4. Stil eşleşmesi boost'larını uygula
  let homeWinProb = simulation.homeWinProbability + styleMatchup.prediction.homeWinBoost;
  let drawProb = simulation.drawProbability + styleMatchup.prediction.drawBoost;
  let awayWinProb = simulation.awayWinProbability + styleMatchup.prediction.awayWinBoost;
  let over25Prob = simulation.over25Probability + styleMatchup.prediction.overBoost;
  let bttsProb = simulation.bttsProbability + styleMatchup.prediction.bttsBoost;
  
  // Normalize et (toplamı 1 yap)
  const totalResultProb = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= totalResultProb;
  drawProb /= totalResultProb;
  awayWinProb /= totalResultProb;
  
  // Sınırla
  over25Prob = Math.max(0.05, Math.min(0.95, over25Prob));
  bttsProb = Math.max(0.05, Math.min(0.95, bttsProb));
  
  // 5. Kalibrasyon uygula (varsa)
  if (calibration?.suggestedAdjustments) {
    homeWinProb = calibrateProbability(homeWinProb, 'home', calibration.suggestedAdjustments);
    drawProb = calibrateProbability(drawProb, 'draw', calibration.suggestedAdjustments);
    awayWinProb = calibrateProbability(awayWinProb, 'away', calibration.suggestedAdjustments);
    over25Prob = calibrateProbability(over25Prob, 'over25', calibration.suggestedAdjustments);
    bttsProb = calibrateProbability(bttsProb, 'btts', calibration.suggestedAdjustments);
  }
  
  // 6. Önerileri oluştur
  const recommendations: ComprehensiveAnalysis['recommendations'] = [];
  
  // Maç sonucu
  const maxResultProb = Math.max(homeWinProb, drawProb, awayWinProb);
  if (maxResultProb >= 0.45) {
    let pick: string, market: string;
    if (homeWinProb === maxResultProb) {
      pick = 'MS 1';
      market = 'Maç Sonucu';
    } else if (awayWinProb === maxResultProb) {
      pick = 'MS 2';
      market = 'Maç Sonucu';
    } else {
      pick = 'MS X';
      market = 'Maç Sonucu';
    }
    
    recommendations.push({
      market,
      pick,
      confidence: Math.round(maxResultProb * 100),
      reasoning: `Simülasyon + stil analizi sonucu`
    });
  }
  
  // Gol bahisleri
  if (over25Prob >= 0.60) {
    recommendations.push({
      market: 'Ü2.5',
      pick: 'Üst 2.5',
      confidence: Math.round(over25Prob * 100),
      reasoning: styleMatchup.reasoning
    });
  } else if (over25Prob <= 0.40) {
    recommendations.push({
      market: 'A2.5',
      pick: 'Alt 2.5',
      confidence: Math.round((1 - over25Prob) * 100),
      reasoning: styleMatchup.reasoning
    });
  }
  
  // BTTS
  if (bttsProb >= 0.60) {
    recommendations.push({
      market: 'KG',
      pick: 'Var',
      confidence: Math.round(bttsProb * 100),
      reasoning: styleMatchup.reasoning
    });
  } else if (bttsProb <= 0.35) {
    recommendations.push({
      market: 'KG',
      pick: 'Yok',
      confidence: Math.round((1 - bttsProb) * 100),
      reasoning: styleMatchup.reasoning
    });
  }
  
  // 7. Insights
  const insights = interpretSimulation(simulation);
  insights.push(`📊 Stil: ${homeProfile.teamName} (${homeProfile.style}) vs ${awayProfile.teamName} (${awayProfile.style})`);
  insights.push(`💡 ${styleMatchup.reasoning}`);
  
  return {
    homeProfile,
    awayProfile,
    styleMatchup,
    simulation,
    insights,
    finalProbabilities: {
      homeWin: Number(homeWinProb.toFixed(4)),
      draw: Number(drawProb.toFixed(4)),
      awayWin: Number(awayWinProb.toFixed(4)),
      over25: Number(over25Prob.toFixed(4)),
      btts: Number(bttsProb.toFixed(4))
    },
    recommendations
  };
}
