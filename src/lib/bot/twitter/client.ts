/**
 * Twitter Client - OAuth 1.0a + OAuth 2.0 Auth Management
 * 
 * Tek sorumluluk: Twitter API client oluşturmak ve auth yönetmek.
 * Singleton pattern ile gereksiz client oluşturma önlenir.
 */

import { TwitterApi } from 'twitter-api-v2';

// ============ OAUTH 1.0A CLIENT ============

/**
 * OAuth 1.0a Client - Media upload destekler, daha güvenilir
 */
export function getOAuth1Client(): TwitterApi | null {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return null;
  }

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });
}

// ============ OAUTH 2.0 CLIENT ============

/**
 * OAuth 2.0 Bearer Token Client
 */
export function getOAuth2Client(): TwitterApi | null {
  const accessToken = process.env.TWITTER_ACCESS_TOKEN_V2;
  if (!accessToken) return null;
  return new TwitterApi(accessToken);
}

/**
 * OAuth 2.0 PKCE Base Client (auth flow başlatmak için)
 */
export function getOAuth2BaseClient(): TwitterApi | null {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId) return null;
  return new TwitterApi({ clientId, clientSecret });
}

// ============ AUTHENTICATED CLIENT ============

/**
 * En uygun Twitter client'ı al
 * Öncelik: OAuth 1.0a > OAuth 2.0
 */
export function getClient(): TwitterApi | null {
  const oauth1 = getOAuth1Client();
  if (oauth1) return oauth1;

  const oauth2 = getOAuth2Client();
  if (oauth2) return oauth2;

  console.error('[Twitter] Hiçbir auth yöntemi mevcut değil');
  return null;
}

// ============ AUTH FLOWS ============

/**
 * OAuth 2.0 PKCE Authorization URL oluştur
 */
export function generateAuthUrl(): {
  url: string;
  codeVerifier: string;
  state: string;
} | null {
  const client = getOAuth2BaseClient();
  if (!client) return null;

  const callbackUrl =
    process.env.TWITTER_CALLBACK_URL ||
    'http://localhost:3000/api/bot/twitter-callback';

  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(
    callbackUrl,
    { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
  );

  return { url, codeVerifier, state };
}

/**
 * Authorization code ile access token al
 */
export async function getAccessToken(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  const client = getOAuth2BaseClient();
  if (!client) return null;

  const callbackUrl =
    process.env.TWITTER_CALLBACK_URL ||
    'http://localhost:3000/api/bot/twitter-callback';

  try {
    const { accessToken, refreshToken } = await client.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: callbackUrl,
    });
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('[Twitter] Access token alınamadı:', error);
    return null;
  }
}

// ============ CONNECTION TEST ============

/**
 * Twitter API bağlantısını test et
 */
export async function testConnection(): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  const client = getClient();
  if (!client) {
    return { ok: false, error: 'Client oluşturulamadı' };
  }

  try {
    const me = await client.v2.me();
    return { ok: true, username: me.data.username };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
    };
  }
}
