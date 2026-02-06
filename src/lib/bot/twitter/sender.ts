/**
 * Tweet Sender - Gönderim, Reply, Quote Tweet, Media Upload & Retry
 *
 * Tüm tweet gönderme işlemleri bu modülden geçer.
 * Rate limit retry, media upload, thread gönderimi dahil.
 */

import { getClient, getOAuth1Client } from './client';
import { safeTweet, splitIntoThread, validateTweet } from './validator';
import type { TweetResponse } from '../types';

// ============ SEND OPTIONS ============

export interface SendOptions {
  /** OG görsel URL'si (otomatik media upload yapılır) */
  imageUrl?: string;
  /** Quote tweet ID */
  quoteTweetId?: string;
  /** Reply tweet ID */
  replyToTweetId?: string;
  /** Retry count (default: 1) */
  maxRetries?: number;
  /** Test mode - gerçek tweet atmaz */
  mock?: boolean;
}

// ============ CORE SEND ============

/**
 * Tek tweet gönder (tüm opsiyonlarla)
 */
export async function sendTweet(
  text: string,
  options: SendOptions = {}
): Promise<TweetResponse> {
  const {
    imageUrl,
    quoteTweetId,
    replyToTweetId,
    maxRetries = 1,
    mock,
  } = options;

  // Mock mode
  const useMock = mock ?? process.env.TWITTER_MOCK === 'true';
  if (useMock) {
    return mockTweet(text);
  }

  const client = getClient();
  if (!client) {
    return {
      success: false,
      error: 'Twitter client oluşturulamadı - credentials eksik',
    };
  }

  // Tweet'i güvenli hale getir
  const safeText = safeTweet(text);
  const validation = validateTweet(safeText);
  if (!validation.valid) {
    console.warn(
      `[Twitter] Tweet ${validation.length} karakter, truncate edildi`
    );
  }

  // Media upload (varsa)
  let mediaIds: string[] | undefined;
  if (imageUrl) {
    mediaIds = await uploadMedia(imageUrl);
  }

  // Retry loop
  let lastError = '';
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Tweet payload oluştur
      const payload: Record<string, unknown> = { text: safeText };

      if (mediaIds && mediaIds.length > 0) {
        payload.media = { media_ids: mediaIds };
      }
      if (quoteTweetId) {
        payload.quote_tweet_id = quoteTweetId;
      }
      if (replyToTweetId) {
        payload.reply = { in_reply_to_tweet_id: replyToTweetId };
      }

      const tweet = await client.v2.tweet(
        payload as Parameters<typeof client.v2.tweet>[0]
      );

      console.log(`[Twitter] Tweet gönderildi: ${tweet.data.id}`);
      return { success: true, tweetId: tweet.data.id };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : 'Bilinmeyen hata';
      const isRateLimit =
        lastError.includes('429') ||
        lastError.toLowerCase().includes('rate');

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 5s, 15s, 45s...
        const delay = 5000 * Math.pow(3, attempt);
        console.warn(
          `[Twitter] Rate limit, ${delay / 1000}s sonra tekrar denenecek (${attempt + 1}/${maxRetries + 1})`
        );
        await sleep(delay);
        continue;
      }

      console.error(`[Twitter] Tweet gönderilemedi:`, error);
    }
  }

  return {
    success: false,
    error: lastError.includes('429')
      ? 'Rate limit aşıldı - daha sonra tekrar deneyin'
      : lastError,
  };
}

// ============ CONVENIENCE METHODS ============

/**
 * Basit tweet gönder (sadece metin)
 */
export async function tweet(text: string, imageUrl?: string): Promise<TweetResponse> {
  return sendTweet(text, { imageUrl });
}

/**
 * Reply tweet gönder (thread için)
 */
export async function sendReplyTweet(
  text: string,
  replyToTweetId: string
): Promise<TweetResponse> {
  return sendTweet(text, { replyToTweetId });
}

/**
 * Quote tweet gönder
 */
export async function sendQuoteTweet(
  text: string,
  quoteTweetId: string
): Promise<TweetResponse> {
  return sendTweet(text, { quoteTweetId });
}

// ============ THREAD ============

/**
 * Thread gönder - ilk tweet + reply'lar
 *
 * @param tweets - Her biri 280 karaktere sığan tweet dizisi
 * @returns İlk tweet'in ID'si ve tüm thread ID'leri
 */
export async function sendThread(
  tweets: string[]
): Promise<{ mainTweetId?: string; tweetIds: string[]; errors: string[] }> {
  if (tweets.length === 0) {
    return { tweetIds: [], errors: ['Boş thread'] };
  }

  const tweetIds: string[] = [];
  const errors: string[] = [];

  // İlk tweet
  const first = await sendTweet(tweets[0]);
  if (!first.success || !first.tweetId) {
    return {
      tweetIds: [],
      errors: [first.error || 'İlk tweet gönderilemedi'],
    };
  }
  tweetIds.push(first.tweetId);

  // Reply'lar
  let lastId = first.tweetId;
  for (let i = 1; i < tweets.length; i++) {
    // Rate limit koruması
    await sleep(1500);

    const reply = await sendReplyTweet(tweets[i], lastId);
    if (reply.success && reply.tweetId) {
      tweetIds.push(reply.tweetId);
      lastId = reply.tweetId;
    } else {
      errors.push(`Tweet ${i + 1} gönderilemedi: ${reply.error}`);
    }
  }

  return { mainTweetId: first.tweetId, tweetIds, errors };
}

/**
 * Uzun metni otomatik thread'e böl ve gönder
 */
export async function sendLongTweet(
  text: string
): Promise<{ mainTweetId?: string; tweetIds: string[]; errors: string[] }> {
  const tweets = splitIntoThread(text);
  if (tweets.length === 1) {
    const result = await sendTweet(tweets[0]);
    return {
      mainTweetId: result.tweetId,
      tweetIds: result.tweetId ? [result.tweetId] : [],
      errors: result.success ? [] : [result.error || 'Hata'],
    };
  }
  return sendThread(tweets);
}

// ============ MEDIA UPLOAD ============

/**
 * URL'den görsel indir ve Twitter'a yükle
 * OAuth 1.0a gerektirir (v1 media upload)
 */
async function uploadMedia(imageUrl: string): Promise<string[] | undefined> {
  try {
    const oauth1Client = getOAuth1Client();
    if (!oauth1Client) {
      console.log('[Twitter] OAuth 1.0a yok, görsel atlanacak');
      return undefined;
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.warn('[Twitter] Görsel indirilemedi:', imageResponse.status);
      return undefined;
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const mediaId = await oauth1Client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/png',
    });

    console.log('[Twitter] Görsel yüklendi:', mediaId);
    return [mediaId];
  } catch (error) {
    console.warn('[Twitter] Görsel yüklenemedi:', error);
    return undefined;
  }
}

// ============ MOCK ============

/**
 * Mock tweet - test modu
 */
export async function mockTweet(text: string): Promise<TweetResponse> {
  console.log('========== MOCK TWEET ==========');
  console.log(text);
  console.log(`[${text.length} karakter]`);
  console.log('================================');
  return { success: true, tweetId: `mock-${Date.now()}` };
}

// ============ UTILS ============

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
