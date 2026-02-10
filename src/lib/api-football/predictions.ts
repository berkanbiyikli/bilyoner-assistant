/**
 * Predictions & Odds API Endpoint Functions
 */

import { apiFootballFetch } from './client';
import { PredictionResponse, OddsResponse } from '@/types/api-football';

/**
 * API-Football'un kendi tahminlerini getir
 */
export async function getPrediction(fixtureId: number): Promise<PredictionResponse | null> {
  const response = await apiFootballFetch<PredictionResponse[]>('/predictions', {
    fixture: fixtureId,
  });

  if (response.response.length === 0) {
    return null;
  }

  return response.response[0];
}

/**
 * Maç oranlarını getir
 */
export async function getOdds(fixtureId: number): Promise<OddsResponse | null> {
  const response = await apiFootballFetch<OddsResponse[]>('/odds', {
    fixture: fixtureId,
  });

  if (response.response.length === 0) {
    return null;
  }

  return response.response[0];
}

/**
 * Canlı oranları getir (sadece /odds/live - canlı oran yoksa null döner)
 */
export async function getLiveOdds(fixtureId: number): Promise<OddsResponse | null> {
  const response = await apiFootballFetch<OddsResponse[]>('/odds/live', {
    fixture: fixtureId,
  });

  if (response.response.length === 0) {
    return null;
  }

  return response.response[0];
}

// === Processed Types ===

export interface ProcessedPrediction {
  fixtureId: number;
  winner: {
    teamId: number | null;
    teamName: string | null;
    comment: string | null;
  };
  winOrDraw: boolean;
  advice: string | null;
  underOver: string | null;
  goalPrediction: {
    home: string;
    away: string;
  };
  percentages: {
    home: number;
    draw: number;
    away: number;
  };
  comparison: {
    form: { home: number; away: number };
    attack: { home: number; away: number };
    defense: { home: number; away: number };
    h2h: { home: number; away: number };
    total: { home: number; away: number };
  };
  teamInfo: {
    home: {
      form: string;
      attackStrength: string;
      defenseStrength: string;
      goalsFor: number;
      goalsAgainst: number;
      cleanSheets: number;
      failedToScore: number;
    };
    away: {
      form: string;
      attackStrength: string;
      defenseStrength: string;
      goalsFor: number;
      goalsAgainst: number;
      cleanSheets: number;
      failedToScore: number;
    };
  };
}

/**
 * Tahmin verisini işle
 */
export function processPrediction(prediction: PredictionResponse, fixtureId: number): ProcessedPrediction {
  const parsePercent = (str: string): number => parseFloat(str.replace('%', '')) || 0;

  return {
    fixtureId,
    winner: {
      teamId: prediction.predictions.winner.id,
      teamName: prediction.predictions.winner.name,
      comment: prediction.predictions.winner.comment,
    },
    winOrDraw: prediction.predictions.win_or_draw,
    advice: prediction.predictions.advice,
    underOver: prediction.predictions.under_over,
    goalPrediction: prediction.predictions.goals,
    percentages: {
      home: parsePercent(prediction.predictions.percent.home),
      draw: parsePercent(prediction.predictions.percent.draw),
      away: parsePercent(prediction.predictions.percent.away),
    },
    comparison: {
      form: {
        home: parsePercent(prediction.comparison.form.home),
        away: parsePercent(prediction.comparison.form.away),
      },
      attack: {
        home: parsePercent(prediction.comparison.att.home),
        away: parsePercent(prediction.comparison.att.away),
      },
      defense: {
        home: parsePercent(prediction.comparison.def.home),
        away: parsePercent(prediction.comparison.def.away),
      },
      h2h: {
        home: parsePercent(prediction.comparison.h2h.home),
        away: parsePercent(prediction.comparison.h2h.away),
      },
      total: {
        home: parsePercent(prediction.comparison.total.home),
        away: parsePercent(prediction.comparison.total.away),
      },
    },
    teamInfo: {
      home: {
        form: prediction.teams.home.last_5.form,
        attackStrength: prediction.teams.home.last_5.att,
        defenseStrength: prediction.teams.home.last_5.def,
        goalsFor: prediction.teams.home.league.goals.for.total.total,
        goalsAgainst: prediction.teams.home.league.goals.against.total.total,
        cleanSheets: prediction.teams.home.league.clean_sheet.total,
        failedToScore: prediction.teams.home.league.failed_to_score.total,
      },
      away: {
        form: prediction.teams.away.last_5.form,
        attackStrength: prediction.teams.away.last_5.att,
        defenseStrength: prediction.teams.away.last_5.def,
        goalsFor: prediction.teams.away.league.goals.for.total.total,
        goalsAgainst: prediction.teams.away.league.goals.against.total.total,
        cleanSheets: prediction.teams.away.league.clean_sheet.total,
        failedToScore: prediction.teams.away.league.failed_to_score.total,
      },
    },
  };
}

// === Odds Processing ===

export interface ProcessedOdds {
  fixtureId: number;
  bookmaker: string;
  matchWinner: {
    home: number;
    draw: number;
    away: number;
  } | null;
  overUnder: {
    over15: number | null;
    under15: number | null;
    over25: number | null;
    under25: number | null;
    over35: number | null;
    under35: number | null;
  } | null;
  bothTeamsToScore: {
    yes: number | null;
    no: number | null;
  } | null;
  doubleChance: {
    homeOrDraw: number | null;
    awayOrDraw: number | null;
    homeOrAway: number | null;
  } | null;
  // İlk Yarı Alt/Üst
  firstHalfOverUnder: {
    over05: number | null;
    under05: number | null;
    over15: number | null;
    under15: number | null;
  } | null;
}

/**
 * Oran verisini işle
 */
export function processOdds(odds: OddsResponse, fixtureId: number): ProcessedOdds | null {
  if (!odds.bookmakers || odds.bookmakers.length === 0) {
    return null;
  }

  // İlk bookmaker'ı al (genelde en popüler)
  const bookmaker = odds.bookmakers[0];
  
  const findBet = (name: string) => bookmaker.bets.find(b => b.name === name);
  const getOddValue = (bet: typeof bookmaker.bets[0] | undefined, value: string): number | null => {
    if (!bet) return null;
    const found = bet.values.find(v => v.value === value);
    return found ? parseFloat(found.odd) : null;
  };

  const matchWinnerBet = findBet('Match Winner');
  const overUnder25 = findBet('Goals Over/Under') || findBet('Over/Under 2.5');
  const overUnder15 = findBet('Over/Under 1.5');
  const overUnder35 = findBet('Over/Under 3.5');
  const btts = findBet('Both Teams Score');
  const doubleChance = findBet('Double Chance');
  // İlk Yarı Alt/Üst oranları
  const htOverUnder05 = findBet('First Half Over/Under') || findBet('Over/Under First Half');
  const htOverUnder15 = findBet('First Half Goals Over/Under 1.5');

  return {
    fixtureId,
    bookmaker: bookmaker.name,
    matchWinner: matchWinnerBet ? {
      home: parseFloat(matchWinnerBet.values.find(v => v.value === 'Home')?.odd || '0'),
      draw: parseFloat(matchWinnerBet.values.find(v => v.value === 'Draw')?.odd || '0'),
      away: parseFloat(matchWinnerBet.values.find(v => v.value === 'Away')?.odd || '0'),
    } : null,
    overUnder: {
      over15: getOddValue(overUnder15, 'Over 1.5'),
      under15: getOddValue(overUnder15, 'Under 1.5'),
      over25: getOddValue(overUnder25, 'Over 2.5') || getOddValue(overUnder25, 'Over'),
      under25: getOddValue(overUnder25, 'Under 2.5') || getOddValue(overUnder25, 'Under'),
      over35: getOddValue(overUnder35, 'Over 3.5'),
      under35: getOddValue(overUnder35, 'Under 3.5'),
    },
    bothTeamsToScore: btts ? {
      yes: getOddValue(btts, 'Yes'),
      no: getOddValue(btts, 'No'),
    } : null,
    doubleChance: doubleChance ? {
      homeOrDraw: getOddValue(doubleChance, 'Home/Draw'),
      awayOrDraw: getOddValue(doubleChance, 'Draw/Away'),
      homeOrAway: getOddValue(doubleChance, 'Home/Away'),
    } : null,
    firstHalfOverUnder: {
      over05: getOddValue(htOverUnder05, 'Over 0.5') || getOddValue(htOverUnder05, 'Over'),
      under05: getOddValue(htOverUnder05, 'Under 0.5') || getOddValue(htOverUnder05, 'Under'),
      over15: getOddValue(htOverUnder15, 'Over 1.5') || getOddValue(htOverUnder15, 'Over'),
      under15: getOddValue(htOverUnder15, 'Under 1.5') || getOddValue(htOverUnder15, 'Under'),
    },
  };
}
