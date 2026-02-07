/**
 * In-Play Probability Model
 * 
 * Calculates live betting market probabilities using Poisson distribution
 * adjusted for current match state:
 * - Current score (already happened goals)
 * - Remaining minutes
 * - Shot-based xG estimation
 * - Possession, corners, red cards adjustments
 * - Late-game intensity & score pressure factors
 * 
 * Architecture:
 * LiveMatch → calculateRemainingXG() → Poisson convolution → InPlayProbabilities
 * 
 * Output probabilities (0-100) for:
 * Over 1.5/2.5/3.5/4.5, BTTS, Match Winner, Double Chance
 */

import type { LiveMatch } from './live-types';

// ============ TYPES ============

export interface InPlayProbabilities {
  // Over/Under Goals (0-100 %)
  over15: number;
  over25: number;
  over35: number;
  over45: number;
  under15: number;
  under25: number;

  // BTTS (0-100 %)
  btts: number;
  bttsNo: number;

  // Match Winner (0-100 %)
  homeWin: number;
  draw: number;
  awayWin: number;

  // Double Chance (0-100 %)
  homeOrDraw: number;
  awayOrDraw: number;

  // Model metadata
  remainingHomeXG: number;
  remainingAwayXG: number;
  modelConfidence: 'high' | 'medium' | 'low';
}

// ============ POISSON MATH ============

/**
 * Poisson probability mass function
 * P(X = k) = (λ^k × e^-λ) / k!
 * Uses log-space for numerical stability
 */
function poissonPMF(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logProb = k * Math.log(lambda) - lambda;
  for (let i = 2; i <= k; i++) {
    logProb -= Math.log(i);
  }
  return Math.exp(logProb);
}

// ============ XG MODEL ============

/**
 * Calculate remaining expected goals from live match statistics.
 * 
 * Base: Shots-based xG rate (ShotsOnTarget × 0.32 + TotalShots × 0.06)
 * Adjustments:
 * - Possession (dampened, √ scale)
 * - Corner pressure (+1.2% per corner)
 * - Red card advantage (+12% per card diff)
 * - Late game intensity (+8-15% after 65')
 * - Score pressure (+6-12% for losing team)
 * - Floor: league average base rate (0.010 × remainingMin per team)
 */
function calculateRemainingXG(match: LiveMatch): { homeXG: number; awayXG: number } {
  const { stats, minute, homeScore, awayScore } = match;
  const remainingMin = Math.max(1, 90 - minute);
  const playedMin = Math.max(5, minute); // Avoid dividing by tiny numbers

  // ---- Base xG rate from shot data ----
  const homeXGRate = (
    (stats.homeShotsOnTarget * 0.32) +
    (stats.homeShotsTotal * 0.06)
  ) / playedMin;

  const awayXGRate = (
    (stats.awayShotsOnTarget * 0.32) +
    (stats.awayShotsTotal * 0.06)
  ) / playedMin;

  // ---- Adjustment factors ----

  // 1. Possession (dampened with power 0.25 → minimal effect)
  const homePossAdj = Math.pow((stats.homePossession || 50) / 50, 0.25);
  const awayPossAdj = Math.pow((stats.awayPossession || 50) / 50, 0.25);

  // 2. Corner pressure (+1.2% per corner)
  const homeCornerAdj = 1 + ((stats.homeCorners || 0) * 0.012);
  const awayCornerAdj = 1 + ((stats.awayCorners || 0) * 0.012);

  // 3. Red card advantage (+12% per card difference)
  const homeReds = stats.homeRedCards || 0;
  const awayReds = stats.awayRedCards || 0;
  const homeRedAdj = awayReds > homeReds
    ? 1 + ((awayReds - homeReds) * 0.12)
    : homeReds > awayReds ? 0.88 : 1;
  const awayRedAdj = homeReds > awayReds
    ? 1 + ((homeReds - awayReds) * 0.12)
    : awayReds > homeReds ? 0.88 : 1;

  // 4. Late game intensity
  const lateAdj = minute >= 78 ? 1.15
    : minute >= 68 ? 1.08
    : minute >= 55 ? 1.03
    : 1.0;

  // 5. Score pressure (losing team pushes harder)
  const scoreDiff = homeScore - awayScore;
  const homeScoreAdj = scoreDiff < -1 ? 1.12
    : scoreDiff < 0 ? 1.06
    : scoreDiff > 1 ? 0.92
    : scoreDiff > 0 ? 0.96
    : 1.0;
  const awayScoreAdj = scoreDiff > 1 ? 1.12
    : scoreDiff > 0 ? 1.06
    : scoreDiff < -1 ? 0.92
    : scoreDiff < 0 ? 0.96
    : 1.0;

  // ---- Calculate final xG ----
  // Floor: league average ≈ 2.6 goals/90 = 0.0144/min per team → conservative 0.010
  const baseFloor = 0.010 * remainingMin;

  const homeXG = Math.max(baseFloor,
    homeXGRate * remainingMin * homePossAdj * homeCornerAdj * homeRedAdj * lateAdj * homeScoreAdj
  );
  const awayXG = Math.max(baseFloor,
    awayXGRate * remainingMin * awayPossAdj * awayCornerAdj * awayRedAdj * lateAdj * awayScoreAdj
  );

  return { homeXG: round2(homeXG), awayXG: round2(awayXG) };
}

// ============ PROBABILITY CALCULATION ============

/**
 * Calculate all market probabilities using Poisson convolution.
 * 
 * Method:
 * 1. Estimate remaining xG for each team
 * 2. For each possible remaining score (hg, ag):
 *    P(hg, ag) = Poisson(hg | homeXG) × Poisson(ag | awayXG)
 * 3. Final score = current score + remaining goals
 * 4. Sum probabilities that satisfy each market condition
 */
export function calculateInPlayProbabilities(match: LiveMatch): InPlayProbabilities {
  const { homeXG, awayXG } = calculateRemainingXG(match);
  const { homeScore, awayScore, minute, stats } = match;

  const MAX_REMAINING = 7; // Max remaining goals to consider per team

  let over15 = 0, over25 = 0, over35 = 0, over45 = 0;
  let btts = 0;
  let homeWin = 0, draw = 0, awayWin = 0;

  for (let hg = 0; hg <= MAX_REMAINING; hg++) {
    const pHome = poissonPMF(hg, homeXG);
    for (let ag = 0; ag <= MAX_REMAINING; ag++) {
      const pAway = poissonPMF(ag, awayXG);
      const prob = pHome * pAway;

      const finalHome = homeScore + hg;
      const finalAway = awayScore + ag;
      const totalGoals = finalHome + finalAway;

      // Over/Under
      if (totalGoals > 1.5) over15 += prob;
      if (totalGoals > 2.5) over25 += prob;
      if (totalGoals > 3.5) over35 += prob;
      if (totalGoals > 4.5) over45 += prob;

      // BTTS
      if (finalHome > 0 && finalAway > 0) btts += prob;

      // Match Winner
      if (finalHome > finalAway) homeWin += prob;
      else if (finalHome < finalAway) awayWin += prob;
      else draw += prob;
    }
  }

  // Model confidence based on data quality
  const totalShots = (stats.homeShotsTotal || 0) + (stats.awayShotsTotal || 0);
  let modelConfidence: 'high' | 'medium' | 'low' = 'low';
  if (minute >= 30 && totalShots >= 10) modelConfidence = 'high';
  else if (minute >= 20 && totalShots >= 5) modelConfidence = 'medium';

  return {
    over15: round2(over15 * 100),
    over25: round2(over25 * 100),
    over35: round2(over35 * 100),
    over45: round2(over45 * 100),
    under15: round2((1 - over15) * 100),
    under25: round2((1 - over25) * 100),

    btts: round2(btts * 100),
    bttsNo: round2((1 - btts) * 100),

    homeWin: round2(homeWin * 100),
    draw: round2(draw * 100),
    awayWin: round2(awayWin * 100),
    homeOrDraw: round2((homeWin + draw) * 100),
    awayOrDraw: round2((awayWin + draw) * 100),

    remainingHomeXG: homeXG,
    remainingAwayXG: awayXG,
    modelConfidence,
  };
}

// ============ HELPERS ============

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Get a human-readable summary of model probabilities
 */
export function summarizeProbabilities(probs: InPlayProbabilities): string {
  const lines: string[] = [];

  if (probs.over25 >= 60) lines.push(`Üst 2.5: %${probs.over25.toFixed(0)}`);
  if (probs.over35 >= 50) lines.push(`Üst 3.5: %${probs.over35.toFixed(0)}`);
  if (probs.btts >= 55) lines.push(`KG Var: %${probs.btts.toFixed(0)}`);
  if (probs.homeWin >= 55) lines.push(`Ev Galibi: %${probs.homeWin.toFixed(0)}`);
  if (probs.awayWin >= 55) lines.push(`Dep Galibi: %${probs.awayWin.toFixed(0)}`);

  lines.push(`Kalan xG: ${probs.remainingHomeXG.toFixed(2)} - ${probs.remainingAwayXG.toFixed(2)}`);
  lines.push(`Model: ${probs.modelConfidence}`);

  return lines.join(' | ');
}
