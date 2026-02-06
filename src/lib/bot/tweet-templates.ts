/**
 * Tweet Templates — Backward Compatibility Re-exports
 *
 * Bu dosya artık tüm fonksiyonlarını `twitter/formatters` modülünden alır.
 * Eski import'lar (`@/lib/bot/tweet-templates`) çalışmaya devam eder.
 *
 * Yeni kodda doğrudan `@/lib/bot/twitter` kullanın.
 *
 * @deprecated Doğrudan `@/lib/bot/twitter` import edin.
 */

// ============ RE-EXPORTS FROM NEW MODULE ============

// Bulletin formatters
export {
  formatMorningBulletinThread,
  formatDailyCouponLaunch,
  formatNightReportThread,
  formatNightSessionTweet,
  formatWeeklyPerformanceReport,
  formatPreMatchAnalysisTweet,
} from './twitter/formatters/bulletin';

export type {
  MorningBulletinData,
  DailyCouponLaunchData,
  NightReportData,
  NightSessionData,
  WeeklyPerformanceData,
  PreMatchAnalysisData,
} from './twitter/formatters/bulletin';

// Coupon formatters
export {
  formatProjectValidatedTweet,
  formatErrorAnalysisTweet,
  formatCouponStatusReport,
  formatMainCouponThread,
} from './twitter/formatters/coupon';

export type {
  ProjectValidatedData,
  ErrorAnalysisData,
  CouponStatusData,
  MainCouponData,
} from './twitter/formatters/coupon';

// Live formatters
export {
  formatLiveGoalTweet,
  formatLiveRadarTweet,
  formatLiveTrackingTweet,
} from './twitter/formatters/live';

export type {
  LiveRadarData,
  LiveTrackingData,
  LiveMomentData,
} from './twitter/formatters/live';

// Stats formatters
export {
  formatDeepStatsTweet,
  generateDynamicStat,
  formatMilestoneTweet,
  formatBankrollIntroTweet,
  formatROITweet,
  validateTweetLength,
  truncateTweet,
} from './twitter/formatters/stats';

export type {
  DeepStatsData,
  DynamicStat,
} from './twitter/formatters/stats';

// Helpers
export {
  TERMINOLOGY,
  getConfidenceInfo,
  ERROR_REASONS,
  getBatchNumber,
} from './twitter/formatters/helpers';

export type {
  ConfidenceClass,
  ConfidenceInfo,
} from './twitter/formatters/helpers';

// ============ TWEET_TEMPLATES OBJECT (backward compat) ============

import { formatLiveRadarTweet } from './twitter/formatters/live';
import { formatCouponStatusReport } from './twitter/formatters/coupon';
import { formatDeepStatsTweet } from './twitter/formatters/stats';
import {
  formatMorningBulletinThread,
  formatDailyCouponLaunch,
  formatNightReportThread,
  formatNightSessionTweet,
  formatWeeklyPerformanceReport,
  formatPreMatchAnalysisTweet,
} from './twitter/formatters/bulletin';
import { formatLiveTrackingTweet } from './twitter/formatters/live';
import {
  formatProjectValidatedTweet,
  formatErrorAnalysisTweet,
  formatMainCouponThread,
} from './twitter/formatters/coupon';

export const TWEET_TEMPLATES = {
  liveRadar: formatLiveRadarTweet,
  couponStatus: formatCouponStatusReport,
  dailyCouponLaunch: formatDailyCouponLaunch,
  nightSession: formatNightSessionTweet,
  weeklyPerformance: formatWeeklyPerformanceReport,
  preMatchAnalysis: formatPreMatchAnalysisTweet,
  liveTracking: formatLiveTrackingTweet,
  projectValidated: formatProjectValidatedTweet,
  errorAnalysis: formatErrorAnalysisTweet,
  deepStats: formatDeepStatsTweet,
  morningBulletin: formatMorningBulletinThread,
  mainCoupon: formatMainCouponThread,
};
