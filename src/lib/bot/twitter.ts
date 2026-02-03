/**
 * Twitter Service - X/Twitter API Entegrasyonu
 * 
 * OAuth 1.0a ve OAuth 2.0 desteği ile kupon ve sonuç tweetleri
 */

import { TwitterApi } from 'twitter-api-v2';
import type { BotCoupon, TweetResponse } from './types';

// ============ TWITTER CLIENT (OAuth 1.0a + OAuth 2.0) ============

/**
 * OAuth 1.0a Client oluştur (daha güvenilir, media upload destekler)
 */
const getOAuth1Client = () => {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    console.log('[Twitter] OAuth 1.0a credentials eksik');
    return null;
  }

  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });
};

/**
 * OAuth 2.0 Access Token ile authenticated client oluştur
 */
const getOAuth2Client = () => {
  const accessToken = process.env.TWITTER_ACCESS_TOKEN_V2;
  
  if (!accessToken) {
    console.log('[Twitter] OAuth 2.0 Access Token eksik');
    return null;
  }
  
  return new TwitterApi(accessToken);
};

/**
 * En uygun Twitter client'ı al (OAuth 1.0a öncelikli)
 */
const getAuthenticatedClient = () => {
  // Önce OAuth 1.0a dene (daha güvenilir ve media upload destekler)
  const oauth1Client = getOAuth1Client();
  if (oauth1Client) {
    console.log('[Twitter] OAuth 1.0a kullanılıyor');
    return oauth1Client;
  }

  // OAuth 2.0'a fallback
  const oauth2Client = getOAuth2Client();
  if (oauth2Client) {
    console.log('[Twitter] OAuth 2.0 kullanılıyor');
    return oauth2Client;
  }

  console.error('[Twitter] Hiçbir auth yöntemi mevcut değil!');
  return null;
};

/**
 * OAuth 2.0 Client oluştur (PKCE için)
 */
const getOAuth2BaseClient = () => {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  
  if (!clientId) {
    console.error('[Twitter] Client ID eksik!');
    return null;
  }
  
  return new TwitterApi({
    clientId,
    clientSecret,
  });
};

/**
 * OAuth 2.0 PKCE Authorization URL oluştur
 */
export function generateAuthUrl(): { url: string; codeVerifier: string; state: string } | null {
  const client = getOAuth2BaseClient();
  if (!client) return null;
  
  const callbackUrl = process.env.TWITTER_CALLBACK_URL || 'http://localhost:3000/api/bot/twitter-callback';
  
  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });
  
  return { url, codeVerifier, state };
}

/**
 * Authorization code ile access token al
 */
export async function getAccessToken(code: string, codeVerifier: string): Promise<{
  accessToken: string;
  refreshToken?: string;
} | null> {
  const client = getOAuth2BaseClient();
  if (!client) return null;
  
  const callbackUrl = process.env.TWITTER_CALLBACK_URL || 'http://localhost:3000/api/bot/twitter-callback';
  
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

// ============ TWEET FORMATTERS ============

/**
 * Tahmin tipini kısa ve anlaşılır formata çevirir
 */
function formatPredictionShort(label: string): string {
  const map: Record<string, string> = {
    'Ev Sahibi': 'MS 1',
    'Beraberlik': 'MS X',
    'Deplasman': 'MS 2',
    'Üst 2.5': 'Üst 2.5',
    'Alt 2.5': 'Alt 2.5',
    'KG Var': 'KG Var',
    'KG Yok': 'KG Yok',
  };
  return map[label] || label;
}

/**
 * Yeni kupon tweet metni oluşturur (Thread için ana tweet)
 */
export function formatNewCouponTweet(coupon: BotCoupon, bankroll: number): string {
  const lines: string[] = [];
  
  // Header
  lines.push('🎯 GÜNÜN KUPONU');
  lines.push('');
  
  // Maçlar - her biri bir satırda
  coupon.matches.forEach((match, i) => {
    const time = new Date(match.kickoff).toLocaleTimeString('tr-TR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const pred = formatPredictionShort(match.prediction.label);
    lines.push(`${i + 1}. ${match.homeTeam} - ${match.awayTeam}`);
    lines.push(`   ⏰ ${time} | ${pred} @${match.prediction.odds.toFixed(2)}`);
  });
  
  lines.push('');
  lines.push(`📊 Oran: ${coupon.totalOdds.toFixed(2)} | 💰 ${coupon.stake.toFixed(0)}₺ → ${coupon.potentialWin.toFixed(0)}₺`);
  lines.push('');
  lines.push('#Bahis #Kupon #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Sonuç tweet metni oluşturur
 */
export function formatResultTweet(coupon: BotCoupon, newBankroll: number): string {
  const lines: string[] = [];
  
  const isWon = coupon.status === 'won';
  const profit = coupon.result?.profit || -coupon.stake;
  
  // Header
  lines.push(isWon ? '✅ KUPON KAZANDI!' : '❌ KUPON KAYBETTİ');
  lines.push('');
  
  // Maç sonuçları
  coupon.matches.forEach((match) => {
    const result = coupon.result?.matchResults.find(r => r.fixtureId === match.fixtureId);
    const won = result?.predictionWon;
    const emoji = won ? '✅' : '❌';
    const score = result ? `${result.homeScore}-${result.awayScore}` : '?-?';
    const pred = formatPredictionShort(match.prediction.label);
    
    lines.push(`${emoji} ${match.homeTeam} ${score} ${match.awayTeam} (${pred})`);
  });
  
  lines.push('');
  lines.push(isWon 
    ? `🎉 Kar: +${profit.toFixed(0)}₺`
    : `💸 Kayıp: ${Math.abs(profit).toFixed(0)}₺`
  );
  lines.push('');
  lines.push('#Bahis #Kupon #BilyonerBot');
  
  return lines.join('\n');
}

// ============ CANLI MAÇ TWEET FORMATLARI ============

import type { LiveOpportunity } from './live-types';

/**
 * Fırsat tipini emoji ve açıklamaya çevirir
 */
function formatOpportunityType(type: string): { emoji: string; label: string } {
  const map: Record<string, { emoji: string; label: string }> = {
    'goal_imminent': { emoji: '⚡', label: 'Gol Yaklaşıyor!' },
    'next_goal_home': { emoji: '⚽', label: 'Sıradaki Gol: Ev' },
    'next_goal_away': { emoji: '⚽', label: 'Sıradaki Gol: Dep' },
    'over_15': { emoji: '📈', label: '1.5 Üst' },
    'over_25': { emoji: '📈', label: '2.5 Üst' },
    'corner_over': { emoji: '🚩', label: 'Korner Üstü' },
    'card_coming': { emoji: '🟨', label: 'Kart Geliyor' },
    'btts_yes': { emoji: '🔄', label: 'Karşılıklı Gol' },
    'comeback': { emoji: '🔥', label: 'Comeback!' },
    'momentum_shift': { emoji: '💫', label: 'Momentum' },
  };
  return map[type] || { emoji: '🎯', label: 'Fırsat' };
}

/**
 * Canlı fırsat tweet metni oluşturur
 */
export function formatLiveOpportunityTweet(opportunity: LiveOpportunity): string {
  const lines: string[] = [];
  const { emoji, label } = formatOpportunityType(opportunity.type);
  
  // Header - Canlı maç vurgusu
  lines.push(`🔴 CANLI | ${emoji} ${label.toUpperCase()}`);
  lines.push('');
  
  // Maç bilgisi
  lines.push(`⚽ ${opportunity.match.homeTeam} vs ${opportunity.match.awayTeam}`);
  lines.push(`📍 ${opportunity.match.minute}' | Skor: ${opportunity.match.score}`);
  lines.push('');
  
  // Bahis önerisi
  lines.push(`🎯 ${opportunity.market}: ${opportunity.pick}`);
  lines.push(`📊 Oran: ~${opportunity.estimatedOdds.toFixed(2)} | Güven: %${opportunity.confidence}`);
  lines.push('');
  
  // Gerekçe
  if (opportunity.reasoning) {
    lines.push(`💡 ${opportunity.reasoning}`);
    lines.push('');
  }
  
  // Aciliyet göstergesi
  if (opportunity.urgency === 'critical') {
    lines.push('🚨 ACİL - Hemen oyna!');
  } else if (opportunity.urgency === 'high') {
    lines.push('⏰ Yüksek öncelik');
  }
  
  // Value göstergesi
  if (opportunity.value >= 15) {
    lines.push('🔥 YÜKSEK DEĞER!');
  } else if (opportunity.value >= 10) {
    lines.push('✨ İyi Değer');
  }
  
  lines.push('');
  lines.push('#CanlıBahis #LiveBet #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Çoklu canlı fırsat özet tweet'i
 */
export function formatLiveSummaryTweet(opportunities: LiveOpportunity[]): string {
  const lines: string[] = [];
  
  lines.push(`🔴 CANLI FIRSATLAR (${opportunities.length} adet)`);
  lines.push('');
  
  opportunities.slice(0, 3).forEach((opp, i) => {
    const { emoji } = formatOpportunityType(opp.type);
    lines.push(`${i + 1}. ${emoji} ${opp.match.homeTeam} vs ${opp.match.awayTeam}`);
    lines.push(`   ${opp.match.minute}' | ${opp.market} @${opp.estimatedOdds.toFixed(2)}`);
  });
  
  if (opportunities.length > 3) {
    lines.push(`   ...ve ${opportunities.length - 3} fırsat daha`);
  }
  
  lines.push('');
  lines.push('#CanlıBahis #LiveBet #BilyonerBot');
  
  return lines.join('\n');
}

// ============ CANLI BAHİS SONUÇ FORMATLARI ============

import type { LiveBet } from './live-types';

/**
 * Canlı bahis yerleştirildi tweet'i
 */
export function formatLiveBetPlacedTweet(bet: LiveBet): string {
  const lines: string[] = [];
  
  lines.push('🔴 CANLI BAHİS YERLEŞTİRİLDİ!');
  lines.push('');
  lines.push(`⚽ ${bet.match.homeTeam} vs ${bet.match.awayTeam}`);
  lines.push(`📍 ${bet.match.minuteAtBet}' | Skor: ${bet.match.scoreAtBet}`);
  lines.push('');
  lines.push(`🎯 ${bet.market}: ${bet.pick}`);
  lines.push(`📊 Oran: ${bet.odds.toFixed(2)}`);
  lines.push(`💰 Stake: ${bet.stake.toFixed(0)}₺ → Potansiyel: ${(bet.stake * bet.odds).toFixed(0)}₺`);
  lines.push('');
  lines.push('⏳ Sonuç bekleniyor...');
  lines.push('');
  lines.push('#CanlıBahis #LiveBet #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Canlı bahis sonuç tweet'i - KAZANDI
 */
export function formatLiveBetWonTweet(bet: LiveBet): string {
  const lines: string[] = [];
  const profit = bet.result ? bet.result.payout - bet.stake : 0;
  
  lines.push('✅ CANLI BAHİS KAZANDI! 🎉');
  lines.push('');
  lines.push(`⚽ ${bet.match.homeTeam} vs ${bet.match.awayTeam}`);
  lines.push(`📍 Final: ${bet.result?.finalScore || '?-?'}`);
  lines.push('');
  lines.push(`🎯 ${bet.market}: ${bet.pick} ✓`);
  lines.push(`📊 Oran: ${bet.odds.toFixed(2)}`);
  lines.push('');
  lines.push(`💰 Stake: ${bet.stake.toFixed(0)}₺`);
  lines.push(`🎉 Kazanç: ${bet.result?.payout.toFixed(0) || 0}₺`);
  lines.push(`📈 Kar: +${profit.toFixed(0)}₺`);
  lines.push('');
  lines.push('#CanlıBahis #Kazandık #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Canlı bahis sonuç tweet'i - KAYBETTİ
 */
export function formatLiveBetLostTweet(bet: LiveBet): string {
  const lines: string[] = [];
  
  lines.push('❌ CANLI BAHİS KAYBETTİ');
  lines.push('');
  lines.push(`⚽ ${bet.match.homeTeam} vs ${bet.match.awayTeam}`);
  lines.push(`📍 Final: ${bet.result?.finalScore || '?-?'}`);
  lines.push('');
  lines.push(`🎯 ${bet.market}: ${bet.pick} ✗`);
  lines.push('');
  lines.push(`💸 Kayıp: -${bet.stake.toFixed(0)}₺`);
  lines.push('');
  lines.push('Bir sonraki fırsatta görüşürüz! 💪');
  lines.push('');
  lines.push('#CanlıBahis #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Günlük canlı bahis özeti
 */
export function formatLiveDailySummaryTweet(
  bets: LiveBet[],
  stats: { won: number; lost: number; profit: number }
): string {
  const lines: string[] = [];
  
  const isProfit = stats.profit >= 0;
  
  lines.push('📊 GÜNLÜK CANLI BAHİS ÖZETİ');
  lines.push('');
  lines.push(`✅ Kazanan: ${stats.won}`);
  lines.push(`❌ Kaybeden: ${stats.lost}`);
  lines.push(`📈 Başarı: %${stats.won + stats.lost > 0 ? ((stats.won / (stats.won + stats.lost)) * 100).toFixed(0) : 0}`);
  lines.push('');
  
  if (isProfit) {
    lines.push(`💰 Günlük Kar: +${stats.profit.toFixed(0)}₺ 🎉`);
  } else {
    lines.push(`💸 Günlük Zarar: ${stats.profit.toFixed(0)}₺`);
  }
  
  lines.push('');
  
  // En iyi bahis
  const bestWin = bets
    .filter(b => b.status === 'won' && b.result)
    .sort((a, b) => (b.result?.payout || 0) - (a.result?.payout || 0))[0];
  
  if (bestWin) {
    lines.push(`🏆 En iyi: ${bestWin.match.homeTeam} vs ${bestWin.match.awayTeam}`);
    lines.push(`   ${bestWin.pick} @${bestWin.odds.toFixed(2)} → +${((bestWin.result?.payout || 0) - bestWin.stake).toFixed(0)}₺`);
  }
  
  lines.push('');
  lines.push('#CanlıBahis #GünlükÖzet #BilyonerBot');
  
  return lines.join('\n');
}

/**
 * Kısa tweet formatı - artık kullanılmıyor, ana format yeterince kısa
 */
export function formatShortTweet(coupon: BotCoupon, bankroll: number, isResult: boolean): string {
  // Ana formatı döndür
  if (isResult) {
    return formatResultTweet(coupon, bankroll);
  }
  return formatNewCouponTweet(coupon, bankroll);
}

// ============ TWEET FUNCTIONS ============

/**
 * Tweet gönderir (metin + opsiyonel görsel) - OAuth 2.0
 */
export async function sendTweet(
  text: string, 
  imageUrl?: string
): Promise<TweetResponse> {
  const client = getAuthenticatedClient();
  
  if (!client) {
    return { success: false, error: 'Twitter client oluşturulamadı - Access Token eksik' };
  }
  
  try {
    // Tweet gönder (OAuth 2.0 ile media upload desteklenmiyor, sadece text)
    const tweet = await client.v2.tweet({
      text,
    });
    
    console.log('[Twitter] Tweet gönderildi:', tweet.data.id);
    
    return { success: true, tweetId: tweet.data.id };
  } catch (error) {
    console.error('[Twitter] Tweet gönderilemedi:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    };
  }
}

/**
 * Yeni kupon tweeti gönderir
 */
export async function tweetNewCoupon(
  coupon: BotCoupon, 
  bankroll: number,
  imageUrl?: string
): Promise<TweetResponse> {
  const text = formatNewCouponTweet(coupon, bankroll);
  
  // 280 karakter kontrolü
  const finalText = text.length > 280 
    ? formatShortTweet(coupon, bankroll, false) 
    : text;
  
  return sendTweet(finalText, imageUrl);
}

/**
 * Sonuç tweeti gönderir (quote tweet olarak)
 */
export async function tweetResult(
  coupon: BotCoupon, 
  newBankroll: number,
  imageUrl?: string
): Promise<TweetResponse> {
  const text = formatResultTweet(coupon, newBankroll);
  
  // 280 karakter kontrolü
  const finalText = text.length > 280 
    ? formatShortTweet(coupon, newBankroll, true) 
    : text;
  
  // Eğer orijinal tweet ID varsa, quote tweet olarak gönder
  if (coupon.tweetId) {
    return sendQuoteTweet(finalText, coupon.tweetId);
  }
  
  return sendTweet(finalText, imageUrl);
}

/**
 * Quote tweet gönderir (orijinal tweeti alıntılayarak)
 */
export async function sendQuoteTweet(
  text: string,
  quoteTweetId: string
): Promise<TweetResponse> {
  const client = getAuthenticatedClient();
  
  if (!client) {
    return { success: false, error: 'Twitter client oluşturulamadı - Access Token eksik' };
  }
  
  try {
    const tweet = await client.v2.tweet({
      text,
      quote_tweet_id: quoteTweetId,
    });
    
    console.log('[Twitter] Quote tweet gönderildi:', tweet.data.id);
    
    return { success: true, tweetId: tweet.data.id };
  } catch (error) {
    console.error('[Twitter] Quote tweet gönderilemedi:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Bilinmeyen hata' 
    };
  }
}

/**
 * Canlı skor güncellemesi gönderir (quote tweet olarak)
 */
export async function tweetLiveUpdate(
  coupon: BotCoupon,
  liveScores: { fixtureId: number; homeScore: number; awayScore: number; minute: number }[]
): Promise<TweetResponse> {
  const lines: string[] = [];
  
  lines.push('⚽ CANLI SKOR GÜNCELLEMESİ');
  lines.push('');
  
  let allCorrect = true;
  
  coupon.matches.forEach((match) => {
    const live = liveScores.find(s => s.fixtureId === match.fixtureId);
    if (live) {
      const pred = formatPredictionShort(match.prediction.label);
      const status = checkLivePrediction(match.prediction.label, live.homeScore, live.awayScore);
      const emoji = status === 'winning' ? '✅' : status === 'losing' ? '⚠️' : '🔄';
      if (status !== 'winning') allCorrect = false;
      
      lines.push(`${emoji} ${match.homeTeam} ${live.homeScore}-${live.awayScore} ${match.awayTeam}`);
      lines.push(`   ${live.minute}' | ${pred}`);
    }
  });
  
  lines.push('');
  lines.push(allCorrect ? '🔥 Şu an hepsi tutuyor!' : '⏳ Maçlar devam ediyor...');
  lines.push('');
  lines.push('#Bahis #Canlı #BilyonerBot');
  
  const text = lines.join('\n');
  
  if (coupon.tweetId) {
    return sendQuoteTweet(text, coupon.tweetId);
  }
  
  return sendTweet(text);
}

/**
 * Canlı tahmin durumunu kontrol eder
 */
function checkLivePrediction(label: string, homeScore: number, awayScore: number): 'winning' | 'losing' | 'pending' {
  const totalGoals = homeScore + awayScore;
  
  switch (label) {
    case 'Ev Sahibi':
      return homeScore > awayScore ? 'winning' : homeScore < awayScore ? 'losing' : 'pending';
    case 'Beraberlik':
      return homeScore === awayScore ? 'winning' : 'losing';
    case 'Deplasman':
      return awayScore > homeScore ? 'winning' : awayScore < homeScore ? 'losing' : 'pending';
    case 'Üst 2.5':
      return totalGoals > 2 ? 'winning' : 'pending';
    case 'Alt 2.5':
      return totalGoals < 3 ? 'winning' : 'losing';
    case 'KG Var':
      return homeScore > 0 && awayScore > 0 ? 'winning' : 'pending';
    case 'KG Yok':
      return homeScore === 0 || awayScore === 0 ? 'winning' : 'losing';
    default:
      return 'pending';
  }
}

// ============ MOCK FUNCTIONS (TEST İÇİN) ============

/**
 * Test modu - gerçek tweet atmaz, sadece log'lar
 */
export async function mockTweet(text: string): Promise<TweetResponse> {
  console.log('========== MOCK TWEET ==========');
  console.log(text);
  console.log('================================');
  
  return { 
    success: true, 
    tweetId: `mock-${Date.now()}` 
  };
}

/**
 * Twitter API bağlantısını test eder (OAuth 2.0)
 */
export async function testTwitterConnection(): Promise<boolean> {
  const client = getAuthenticatedClient();
  
  if (!client) {
    console.error('[Twitter] Client oluşturulamadı - Access Token eksik');
    return false;
  }
  
  try {
    const me = await client.v2.me();
    console.log('[Twitter] Bağlantı başarılı:', me.data.username);
    return true;
  } catch (error) {
    console.error('[Twitter] Bağlantı hatası:', error);
    return false;
  }
}
