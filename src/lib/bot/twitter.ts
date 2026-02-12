// ============================================
// Twitter Bot Client
// OAuth 1.0a ile tweet gönderimi
// ============================================

import crypto from "crypto";

const TWITTER_API_URL = "https://api.twitter.com/2/tweets";

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

// ---- OAuth 1.0a Signature ----
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  config: TwitterConfig
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");

  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(config.apiSecret)}&${percentEncode(config.accessSecret)}`;

  return crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
}

function buildAuthHeader(method: string, url: string, config: TwitterConfig): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.apiKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.accessToken,
    oauth_version: "1.0",
  };

  const signature = generateSignature(method, url, oauthParams, config);
  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// ---- Tweet Functions ----
export interface TweetResult {
  success: boolean;
  tweetId?: string;
  error?: string;
  mock?: boolean;
}

export async function sendTweet(text: string): Promise<TweetResult> {
  if (isMockMode()) {
    console.log("[TWITTER MOCK] Tweet:", text);
    return { success: true, tweetId: `mock-${Date.now()}`, mock: true };
  }

  const config = getConfig();
  if (!config.apiKey || !config.accessToken) {
    console.error("[TWITTER] API credentials missing");
    return { success: false, error: "Twitter API credentials not configured" };
  }

  try {
    const authHeader = buildAuthHeader("POST", TWITTER_API_URL, config);

    const res = await fetch(TWITTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("[TWITTER] API error:", res.status, errorData);
      return { success: false, error: `Twitter API ${res.status}: ${errorData}` };
    }

    const data = await res.json();
    const tweetId = data.data?.id;
    console.log("[TWITTER] Tweet sent:", tweetId);
    return { success: true, tweetId };
  } catch (error) {
    console.error("[TWITTER] Send error:", error);
    return { success: false, error: String(error) };
  }
}

export async function sendThread(tweets: string[]): Promise<TweetResult[]> {
  const results: TweetResult[] = [];
  let replyToId: string | undefined;

  for (const text of tweets) {
    if (isMockMode()) {
      console.log("[TWITTER MOCK] Thread tweet:", text);
      const mockId = `mock-${Date.now()}-${results.length}`;
      results.push({ success: true, tweetId: mockId, mock: true });
      replyToId = mockId;
      continue;
    }

    const config = getConfig();
    const authHeader = buildAuthHeader("POST", TWITTER_API_URL, config);

    const body: Record<string, unknown> = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    try {
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
        results.push({ success: false, error: `Twitter API ${res.status}: ${errorData}` });
        break;
      }

      const data = await res.json();
      const tweetId = data.data?.id;
      results.push({ success: true, tweetId });
      replyToId = tweetId;
    } catch (error) {
      results.push({ success: false, error: String(error) });
      break;
    }

    // Rate limit arası bekleme
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
