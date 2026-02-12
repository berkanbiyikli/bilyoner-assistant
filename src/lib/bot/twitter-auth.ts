// ============================================
// Twitter OAuth Helper (shared auth builder)
// twitter.ts'den re-export edilen auth fonksiyonları
// ============================================

import crypto from "crypto";

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
  config: { apiSecret: string; accessSecret: string }
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join("&");

  const signatureBase = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(config.apiSecret)}&${percentEncode(config.accessSecret)}`;

  return crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
}

export function buildAuthHeader(
  method: string,
  url: string,
  config: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }
): string {
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
