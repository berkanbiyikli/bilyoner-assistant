/**
 * Twitter OAuth 2.0 Authorization
 * 
 * GET: Authorization URL oluştur ve yönlendir
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';

// Code verifier'ı geçici olarak sakla (production'da Redis/KV kullan)
let storedCodeVerifier: string | null = null;
let storedState: string | null = null;

export async function GET(request: NextRequest) {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  
  if (!clientId) {
    return NextResponse.json({ error: 'TWITTER_CLIENT_ID eksik' }, { status: 400 });
  }
  
  const client = new TwitterApi({
    clientId,
    clientSecret,
  });
  
  const callbackUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/bot/twitter-callback`;
  
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });
  
  // Geçici olarak sakla
  storedCodeVerifier = codeVerifier;
  storedState = state;
  
  // Ayrıca cookie'ye de kaydet (daha güvenli)
  const response = NextResponse.redirect(url);
  response.cookies.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 dakika
  });
  response.cookies.set('twitter_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
  });
  
  return response;
}

export { storedCodeVerifier, storedState };
