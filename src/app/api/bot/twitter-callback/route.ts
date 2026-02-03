/**
 * Twitter OAuth 2.0 Callback
 * 
 * Twitter'dan gelen authorization code'u access token'a çevirir
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  if (error) {
    return NextResponse.json({ 
      error: 'Twitter authorization hatası',
      details: error,
    }, { status: 400 });
  }
  
  if (!code) {
    return NextResponse.json({ error: 'Authorization code eksik' }, { status: 400 });
  }
  
  // Cookie'den code verifier al
  const codeVerifier = request.cookies.get('twitter_code_verifier')?.value;
  const storedState = request.cookies.get('twitter_state')?.value;
  
  if (!codeVerifier) {
    return NextResponse.json({ error: 'Code verifier bulunamadı. Lütfen tekrar deneyin.' }, { status: 400 });
  }
  
  // State kontrolü
  if (state !== storedState) {
    return NextResponse.json({ error: 'State uyuşmuyor. CSRF koruması.' }, { status: 400 });
  }
  
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
  
  try {
    const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: callbackUrl,
    });
    
    // Kullanıcı bilgisini al
    const loggedClient = new TwitterApi(accessToken);
    const me = await loggedClient.v2.me();
    
    // HTML yanıt - token'ları göster ve .env.local'a eklemesini söyle
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Twitter Bağlantısı Başarılı!</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; background: #1a1a1a; color: #fff; }
    h1 { color: #1DA1F2; }
    .success { background: #22c55e; color: white; padding: 10px 20px; border-radius: 8px; display: inline-block; }
    .token-box { background: #333; padding: 20px; border-radius: 8px; margin: 20px 0; font-family: monospace; word-break: break-all; }
    .warning { background: #f59e0b; color: black; padding: 15px; border-radius: 8px; margin: 20px 0; }
    code { background: #444; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🎉 Twitter Bağlantısı Başarılı!</h1>
  <p class="success">✓ @${me.data.username} hesabına bağlandı</p>
  
  <div class="warning">
    <strong>⚠️ ÖNEMLİ:</strong> Aşağıdaki token'ı <code>.env.local</code> dosyasına ekle!
  </div>
  
  <h2>Access Token:</h2>
  <div class="token-box">${accessToken}</div>
  
  <h2>.env.local'a ekle:</h2>
  <div class="token-box">
TWITTER_CLIENT_ID=${clientId}
TWITTER_CLIENT_SECRET=${clientSecret || 'YOUR_CLIENT_SECRET'}
TWITTER_ACCESS_TOKEN_V2=${accessToken}
${refreshToken ? `TWITTER_REFRESH_TOKEN=${refreshToken}` : '# Refresh token yok'}
  </div>
  
  <p>Token süresi: ${expiresIn ? `${Math.round(expiresIn / 3600)} saat` : 'Belirtilmedi'}</p>
  ${refreshToken ? '<p>✓ Refresh token var - otomatik yenilenebilir</p>' : '<p>⚠️ Refresh token yok - süresi dolunca tekrar auth gerekir</p>'}
  
  <p><a href="/bot" style="color: #1DA1F2;">← Bot Dashboard'a dön</a></p>
</body>
</html>
    `;
    
    // Cookie'leri temizle
    const response = new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
    response.cookies.delete('twitter_code_verifier');
    response.cookies.delete('twitter_state');
    
    return response;
    
  } catch (err) {
    console.error('[Twitter Callback] Hata:', err);
    return NextResponse.json({ 
      error: 'Access token alınamadı',
      details: err instanceof Error ? err.message : 'Bilinmeyen hata',
    }, { status: 500 });
  }
}
