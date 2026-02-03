/**
 * API-Football Module Exports
 */

// Client
export { apiFootballFetch, getLastRateLimitInfo, formatDateForApi, getTodayForApi } from './client';

// Fixtures
export { 
  getFixturesByDate, 
  getLiveFixtures, 
  getFixtureById,
  getFixtureStatistics,
  getFixtureEvents,
  getHeadToHead
} from './fixtures';

// Predictions & Odds
export { 
  getPrediction, 
  processPrediction,
  getOdds,
  getLiveOdds,
  processOdds,
  type ProcessedPrediction,
  type ProcessedOdds
} from './predictions';
