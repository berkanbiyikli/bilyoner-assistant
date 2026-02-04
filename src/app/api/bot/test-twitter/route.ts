/**
 * Twitter Bağlantı Testi (OAuth 1.0a + OAuth 2.0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';

// OAuth 1.0a client oluştur
function getOAuth1Client() {
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
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
}

// OAuth 2.0 client oluştur
function getOAuth2Client() {
  const accessToken = process.env.TWITTER_ACCESS_TOKEN_V2;
  if (!accessToken) return null;
  return new TwitterApi(accessToken);
}

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    env: {
      // OAuth 1.0a
      TWITTER_API_KEY: process.env.TWITTER_API_KEY ? '✓ Set' : '✗ Missing',
      TWITTER_API_SECRET: process.env.TWITTER_API_SECRET ? '✓ Set' : '✗ Missing',
      TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN ? '✓ Set' : '✗ Missing',
      TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET ? '✓ Set' : '✗ Missing',
      // OAuth 2.0
      TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID ? '✓ Set' : '✗ Missing',
      TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
      TWITTER_ACCESS_TOKEN_V2: process.env.TWITTER_ACCESS_TOKEN_V2 ? '✓ Set' : '✗ Missing',
      TWITTER_MOCK: process.env.TWITTER_MOCK,
    },
  };

  // Önce OAuth 1.0a dene (daha güvenilir)
  const oauth1Client = getOAuth1Client();
  if (oauth1Client) {
    try {
      const me = await oauth1Client.v2.me();
      results.user = {
        id: me.data.id,
        username: me.data.username,
        name: me.data.name,
      };
      results.success = true;
      results.authMethod = 'OAuth 1.0a';
      results.message = `Twitter bağlantısı başarılı! @${me.data.username} (OAuth 1.0a)`;
      return NextResponse.json(results);
    } catch (error) {
      results.oauth1Error = error instanceof Error ? error.message : 'OAuth 1.0a hatası';
    }
  }

  // OAuth 2.0 dene
  const oauth2Client = getOAuth2Client();
  if (oauth2Client) {
    try {
      const me = await oauth2Client.v2.me();
      results.user = {
        id: me.data.id,
        username: me.data.username,
        name: me.data.name,
      };
      results.success = true;
      results.authMethod = 'OAuth 2.0';
      results.message = `Twitter bağlantısı başarılı! @${me.data.username} (OAuth 2.0)`;
      return NextResponse.json(results);
    } catch (error) {
      results.oauth2Error = error instanceof Error ? error.message : 'OAuth 2.0 hatası';
    }
  }

  // Hiçbiri çalışmadı
  results.success = false;
  results.error = 'Hiçbir auth yöntemi çalışmadı';
  results.authUrl = '/api/bot/twitter-auth';
  return NextResponse.json(results, { status: 400 });
}

export async function POST(request: NextRequest) {
  // Body'den text ve quoteTweetId al
  let body: { text?: string; quoteTweetId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body boşsa default test tweet at
  }
  
  // Önce OAuth 1.0a dene
  const oauth1Client = getOAuth1Client();
  if (oauth1Client) {
    try {
      const tweetText = body.text || `🧪 Bilyoner Bot Test Tweet\n⏰ ${new Date().toLocaleString('tr-TR')}\n#test #BilyonerBot`;
      
      // Quote tweet mi normal tweet mi?
      const tweetPayload: { text: string; quote_tweet_id?: string } = { text: tweetText };
      if (body.quoteTweetId) {
        tweetPayload.quote_tweet_id = body.quoteTweetId;
      }
      
      const tweet = await oauth1Client.v2.tweet(tweetPayload);
      
      return NextResponse.json({
        success: true,
        authMethod: 'OAuth 1.0a',
        message: body.quoteTweetId ? 'Quote tweet başarıyla atıldı!' : 'Tweet başarıyla atıldı!',
        tweetId: tweet.data.id,
        tweetUrl: `https://twitter.com/i/status/${tweet.data.id}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OAuth 1.0a hatası';
      // OAuth 1.0a başarısız, OAuth 2.0 dene
      console.log('[Twitter] OAuth 1.0a failed:', errorMessage);
    }
  }

  // OAuth 2.0 dene
  const oauth2Client = getOAuth2Client();
  if (oauth2Client) {
    try {
      const tweetText = body.text || `🧪 Bilyoner Bot Test Tweet\n⏰ ${new Date().toLocaleString('tr-TR')}\n#test #BilyonerBot`;
      
      const tweetPayload: { text: string; quote_tweet_id?: string } = { text: tweetText };
      if (body.quoteTweetId) {
        tweetPayload.quote_tweet_id = body.quoteTweetId;
      }
      
      const tweet = await oauth2Client.v2.tweet(tweetPayload);
      
      return NextResponse.json({
        success: true,
        authMethod: 'OAuth 2.0',
        message: body.quoteTweetId ? 'Quote tweet başarıyla atıldı!' : 'Tweet başarıyla atıldı!',
        tweetId: tweet.data.id,
        tweetUrl: `https://twitter.com/i/status/${tweet.data.id}`,
      });
    } catch (error) {
      const result: Record<string, unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      };
      
      if (error && typeof error === 'object' && 'data' in error) {
        result.twitterError = (error as { data: unknown }).data;
      }
      
      return NextResponse.json(result, { status: 500 });
    }
  }

  return NextResponse.json({ 
    error: 'Twitter credentials eksik!',
    authUrl: '/api/bot/twitter-auth',
  }, { status: 400 });
}
