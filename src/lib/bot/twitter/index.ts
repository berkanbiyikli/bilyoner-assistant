/**
 * Twitter Module — Ana Barrel Export
 *
 * Eski `@/lib/bot/twitter` import'larıyla 100% geriye uyumlu.
 * Yeni modüler yapıyı tek bir import noktasından sunar.
 *
 * Mimari:
 *   twitter/
 *   ├── client.ts        → OAuth 1.0a/2.0 auth yönetimi
 *   ├── sender.ts        → Tweet gönderimi, reply, quote, thread, media upload, retry
 *   ├── validator.ts     → 280 char yönetimi, thread bölme, sanitization
 *   └── formatters/
 *       ├── helpers.ts   → Ortak yardımcılar (predictionShort, emoji maps, terminoloji)
 *       ├── coupon.ts    → Kupon/sonuç/Z raporu formatları
 *       ├── live.ts      → Canlı fırsat/bahis/snowball formatları
 *       ├── bulletin.ts  → Zamanlı içerik (sabah bülteni, gece raporu, önizleme)
 *       ├── stats.ts     → İstatistik/milestone/kasa formatları
 *       └── index.ts     → Formatter barrel
 */

// ============ CLIENT ============
export {
  getClient,
  getOAuth1Client,
  getOAuth2Client,
  generateAuthUrl,
  getAccessToken,
  testConnection,
} from './client';

// testConnection'ı eski ismiyle de dışa aç
export { testConnection as testTwitterConnection } from './client';

// ============ SENDER ============
export {
  sendTweet,
  tweet,
  sendReplyTweet,
  sendQuoteTweet,
  sendThread,
  sendLongTweet,
  mockTweet,
} from './sender';

// ============ VALIDATOR ============
export {
  TWEET_MAX_LENGTH,
  validateTweet,
  truncateTweet as truncateTweetText,
  sanitizeTweet,
  splitIntoThread,
  safeTweet,
} from './validator';

// ============ ALL FORMATTERS ============
export * from './formatters';

// ============ BACKWARD COMPAT — eski API fonksiyon adları ============

import type { BotCoupon } from '../types';

// tweetNewCoupon: Eski fonksiyon — sendTweet + formatNewCouponTweet
import { sendTweet as _sendTweet } from './sender';
import {
  formatNewCouponTweet as _formatNew,
  formatShortTweet as _formatShort,
  formatResultTweet as _formatResult,
} from './formatters';
import { sendQuoteTweet as _sendQuote } from './sender';
import type { TweetResponse } from '../types';

/**
 * @deprecated Yeni kodda `sendTweet(formatNewCouponTweet(...), { imageUrl })` kullanın
 */
export async function tweetNewCoupon(
  coupon: BotCoupon,
  bankroll: number,
  imageUrl?: string
): Promise<TweetResponse> {
  const text = _formatNew(coupon, bankroll);
  const finalText =
    text.length > 280 ? _formatShort(coupon, bankroll, false) : text;
  return _sendTweet(finalText, { imageUrl });
}

/**
 * @deprecated Yeni kodda `sendQuoteTweet(formatResultTweet(...), quoteTweetId)` kullanın
 */
export async function tweetResult(
  coupon: BotCoupon,
  newBankroll: number,
  imageUrl?: string
): Promise<TweetResponse> {
  const text = _formatResult(coupon, newBankroll);
  const finalText =
    text.length > 280 ? _formatShort(coupon, newBankroll, true) : text;

  if (coupon.tweetId) {
    return _sendQuote(finalText, coupon.tweetId);
  }
  return _sendTweet(finalText, { imageUrl });
}

/**
 * @deprecated Yeni kodda `sendTweet(formatLiveScoreUpdateTweet(...)...)` kullanın
 */
export async function tweetLiveUpdate(
  coupon: BotCoupon,
  liveScores: {
    fixtureId: number;
    homeScore: number;
    awayScore: number;
    minute: number;
  }[]
): Promise<TweetResponse> {
  const { formatLiveScoreUpdateTweet, checkLivePrediction, formatPredictionShort } = await import('./formatters');

  const matches = coupon.matches.map((match) => {
    const live = liveScores.find((s) => s.fixtureId === match.fixtureId);
    if (!live) return null;
    return {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      predictionLabel: formatPredictionShort(match.prediction.label),
      homeScore: live.homeScore,
      awayScore: live.awayScore,
      minute: live.minute,
      status: checkLivePrediction(
        match.prediction.label,
        live.homeScore,
        live.awayScore
      ),
    };
  }).filter(Boolean) as Parameters<typeof formatLiveScoreUpdateTweet>[0];

  const text = formatLiveScoreUpdateTweet(matches);

  if (coupon.tweetId) {
    return _sendQuote(text, coupon.tweetId);
  }
  return _sendTweet(text);
}
