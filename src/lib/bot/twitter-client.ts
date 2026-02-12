// ============================================
// Twitter V2 Client — Media Upload Support
// OAuth 1.0a ile görsel (simülasyon grafik, ROI kart) yükleme
// Twitter Media Upload API → V1.1 endpoint (media/upload)
// Tweet with media → V2 endpoint
// ============================================

import crypto from "crypto";
import { buildAuthHeader } from "./twitter-auth";

const TWITTER_API_URL = "https://api.twitter.com/2/tweets";
const TWITTER_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

function getConfig(): TwitterConfig {
  return {
    apiKey: process.env.TWITTER_API_KEY || "",
    apiSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
  };
}

function isMockMode(): boolean {
  return process.env.TWITTER_MOCK === "true";
}

// ---- Media Upload (Twitter V1.1 chunked) ----

/**
 * Base64 image verisini Twitter'a yükle
 * Twitter Media Upload API (v1.1) kullanır
 * @param imageBase64 - Base64 encoded image data (PNG/JPEG)
 * @returns media_id_string
 */
export async function uploadMedia(imageBase64: string): Promise<string | null> {
  if (isMockMode()) {
    console.log("[TWITTER MOCK] Media upload (base64 length:", imageBase64.length, ")");
    return `mock-media-${Date.now()}`;
  }

  const config = getConfig();
  if (!config.apiKey || !config.accessToken) {
    console.error("[TWITTER] API credentials missing for media upload");
    return null;
  }

  try {
    // OAuth 1.0a for multipart upload requires special handling
    // Use simple (non-chunked) upload for images < 5MB
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: config.apiKey,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: config.accessToken,
      oauth_version: "1.0",
    };

    // Generate signature (without body params for multipart)
    const sortedKeys = Object.keys(oauthParams).sort();
    const paramString = sortedKeys.map((k) =>
      `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`
    ).join("&");

    const signatureBase = `POST&${encodeURIComponent(TWITTER_UPLOAD_URL)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(config.apiSecret)}&${encodeURIComponent(config.accessSecret)}`;
    const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
    oauthParams.oauth_signature = signature;

    const authHeaderParts = Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(", ");

    const authHeader = `OAuth ${authHeaderParts}`;

    // Multipart form data
    const boundary = `----TwitterBoundary${Date.now()}`;
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="media_data"',
      "",
      imageBase64,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await fetch(TWITTER_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[TWITTER] Media upload error:", res.status, errText);
      return null;
    }

    const data = await res.json();
    const mediaId = data.media_id_string;
    console.log("[TWITTER] Media uploaded:", mediaId);
    return mediaId;
  } catch (error) {
    console.error("[TWITTER] Media upload error:", error);
    return null;
  }
}

// ---- Tweet with Media ----

export interface TweetWithMediaResult {
  success: boolean;
  tweetId?: string;
  error?: string;
  mock?: boolean;
}

/**
 * Görselli tweet gönder
 * @param text - Tweet metni
 * @param mediaIds - Yüklenmiş media ID'leri (max 4)
 * @param replyToTweetId - Reply olarak gönderilecekse parent tweet ID
 */
export async function sendTweetWithMedia(
  text: string,
  mediaIds: string[],
  replyToTweetId?: string
): Promise<TweetWithMediaResult> {
  if (isMockMode()) {
    console.log("[TWITTER MOCK] Tweet with media:", text, "media:", mediaIds);
    return { success: true, tweetId: `mock-media-tweet-${Date.now()}`, mock: true };
  }

  const config = getConfig();
  if (!config.apiKey || !config.accessToken) {
    return { success: false, error: "Twitter API credentials not configured" };
  }

  try {
    const authHeader = buildAuthHeader("POST", TWITTER_API_URL, config);

    const body: Record<string, unknown> = {
      text,
      media: { media_ids: mediaIds },
    };

    if (replyToTweetId) {
      body.reply = { in_reply_to_tweet_id: replyToTweetId };
    }

    const res = await fetch(TWITTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("[TWITTER] Tweet with media error:", res.status, errorData);
      return { success: false, error: `Twitter API ${res.status}: ${errorData}` };
    }

    const data = await res.json();
    return { success: true, tweetId: data.data?.id };
  } catch (error) {
    console.error("[TWITTER] Tweet with media error:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Thread içinde görselli reply at
 */
export async function replyWithMedia(
  replyToTweetId: string,
  text: string,
  mediaIds: string[]
): Promise<TweetWithMediaResult> {
  return sendTweetWithMedia(text, mediaIds, replyToTweetId);
}
