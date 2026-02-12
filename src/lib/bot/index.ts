export { sendTweet, sendThread } from "./twitter";
export type { TweetResult } from "./twitter";
export { buildAuthHeader } from "./twitter-auth";
export { formatDailyPicksTweet, formatCouponTweet, formatResultTweet, formatCrazyPickTweet } from "./formatter";
export {
  replyToTweet,
  processOutcomes,
  formatOutcomeReply,
  formatAnalyticTweet,
  formatValueBetAlert,
  formatWeeklyReport,
} from "./twitter-manager";

// V2 — Media uploads
export { uploadMedia, sendTweetWithMedia, replyWithMedia } from "./twitter-client";

// Tracker — Thread lifecycle
export {
  seedThread,
  seedThreadBulk,
  findThreadChain,
  getTrackedFixtures,
  recordThreadReply,
  getLiveAlertCount,
  hasRecentReply,
} from "./tracker";

// Prompts — Randomized persona templates
export {
  generateAnalyticTweet,
  generateAlertTweet,
  generateLiveUpdateTweet,
  generateOutcomeTweet,
  generateWeeklyReport as generateWeeklyReportTweet,
  generateDailyOpener,
  getRemainingBudget,
  TWEET_PRIORITIES,
} from "./prompts";

// Image Generator — Visual proof
export {
  generateSimulationCard,
  generateROICard,
  generateMatchCard,
} from "./image-generator";

