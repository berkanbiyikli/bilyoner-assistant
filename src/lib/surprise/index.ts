/**
 * Surprise Module — Public Exports
 */

// Types
export type {
  OddsSnapshot,
  OddsMovement,
  AntiPublicSignal,
  ExactScorePrediction,
  ScorePredictionSet,
  SurpriseCategory,
  SurpriseLevel,
  ListCategory,
  SurpriseMatch,
  SurprisePick,
  SeriesType,
  SeriesContent,
  SurpriseRadarSummary,
} from './types';

// Detector
export {
  analyzeSurprise,
  analyzeAllSurprises,
  generateSeriesContent,
  buildSurpriseRadarSummary,
} from './detector';

// Odds tracker
export {
  saveOddsSnapshot,
  getOddsHistory,
  clearOddsHistory,
  detectOddsMovements,
  serializeOddsHistory,
  loadOddsHistory,
} from './odds-tracker';

// Anti-public
export {
  detectAntiPublicSignal,
  analyzeAntiPublicBatch,
} from './anti-public';
