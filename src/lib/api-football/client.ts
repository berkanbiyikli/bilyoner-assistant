/**
 * API-Football v3 Base Client
 * Rate-limit aware fetcher with error handling
 * 
 * Günlük 7500 istek limiti koruması:
 * - Kalan istek < 100: tüm istekler engellenir
 * - Kalan istek < 500: sadece kritik istekler (fixtures) geçer
 * - Dakikalık limit aşımı: 60 saniye beklenir
 */

import { ApiResponse, RateLimitInfo } from '@/types/api-football';

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

// =====================================
// 🛡️ Rate Limit Koruma Sistemi
// =====================================

// Günlük limit sabitleri
const DAILY_LIMIT = 7500;
const DAILY_HARD_STOP = 100;       // Bu sayının altında tüm istekler durur
const DAILY_SOFT_STOP = 500;       // Bu sayının altında sadece kritik istekler geçer
const MINUTE_COOLDOWN_MS = 65000;  // Dakikalık limit aşımında bekleme süresi (65s)

// Kritik endpoint'ler (soft-stop'ta bile çalışır)
const CRITICAL_ENDPOINTS = ['/fixtures'];

// Rate limit durumu (sunucu memory'sinde tutulur)
let lastRateLimitInfo: RateLimitInfo | null = null;
let dailyRequestsRemaining: number = DAILY_LIMIT;
let minuteRateLimitHit = false;
let minuteRateLimitResetTime = 0;
let totalRequestsMade = 0;

export function getLastRateLimitInfo(): RateLimitInfo | null {
  return lastRateLimitInfo;
}

/**
 * Rate limit durumu hakkında bilgi al
 */
export function getRateLimitStatus() {
  return {
    dailyRemaining: dailyRequestsRemaining,
    dailyLimit: DAILY_LIMIT,
    dailyUsed: DAILY_LIMIT - dailyRequestsRemaining,
    totalRequestsMade,
    minuteBlocked: minuteRateLimitHit && Date.now() < minuteRateLimitResetTime,
    isHardStopped: dailyRequestsRemaining <= DAILY_HARD_STOP,
    isSoftStopped: dailyRequestsRemaining <= DAILY_SOFT_STOP,
  };
}

/**
 * Rate limit kontrolü - istek yapılabilir mi?
 */
function checkRateLimit(endpoint: string): { allowed: boolean; reason?: string } {
  // Dakikalık limit aşımı kontrolü
  if (minuteRateLimitHit && Date.now() < minuteRateLimitResetTime) {
    return { 
      allowed: false, 
      reason: `Dakikalık rate limit aşıldı. ${Math.ceil((minuteRateLimitResetTime - Date.now()) / 1000)}s sonra tekrar deneyin.` 
    };
  } else if (minuteRateLimitHit && Date.now() >= minuteRateLimitResetTime) {
    minuteRateLimitHit = false; // Cooldown bitti
  }

  // Günlük hard stop (hiçbir istek geçmez)
  if (dailyRequestsRemaining <= DAILY_HARD_STOP) {
    return { 
      allowed: false, 
      reason: `Günlük API limiti kritik seviyede! Kalan: ${dailyRequestsRemaining}/${DAILY_LIMIT}. Tüm istekler durduruldu.` 
    };
  }

  // Günlük soft stop (sadece kritik endpoint'ler geçer)
  if (dailyRequestsRemaining <= DAILY_SOFT_STOP) {
    const isCritical = CRITICAL_ENDPOINTS.some(ep => endpoint.startsWith(ep));
    if (!isCritical) {
      return { 
        allowed: false, 
        reason: `Günlük API limiti düşük! Kalan: ${dailyRequestsRemaining}/${DAILY_LIMIT}. Sadece kritik istekler (maç listesi) kabul ediliyor.` 
      };
    }
    console.warn(`[API-Football] ⚠️ Soft-stop modunda kritik istek geçiyor: ${endpoint} | Kalan: ${dailyRequestsRemaining}`);
  }

  return { allowed: true };
}

/**
 * API-Football'a istek atan temel fonksiyon
 * @param noCache - true ise Next.js cache devre dışı (canlı veriler için)
 */
export async function apiFootballFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
  options?: { noCache?: boolean }
): Promise<ApiResponse<T>> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('API_FOOTBALL_KEY is not configured. Please add your API key to .env.local');
  }

  // 🛡️ Rate limit kontrolü
  const rateLimitCheck = checkRateLimit(endpoint);
  if (!rateLimitCheck.allowed) {
    console.error(`[API-Football] 🚫 İstek engellendi: ${endpoint} - ${rateLimitCheck.reason}`);
    throw new Error(`Rate limit: ${rateLimitCheck.reason}`);
  }

  // Query string oluştur
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    });
  }

  const url = `${API_BASE_URL}${endpoint}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  console.log(`[API-Football] Fetching: ${endpoint}`, params || '');

  const fetchOptions: RequestInit & { next?: { revalidate: number } } = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  };

  // Canlı veriler için cache devre dışı, diğerleri 60 saniye cache
  if (options?.noCache) {
    fetchOptions.cache = 'no-store';
  } else {
    fetchOptions.next = { revalidate: 60 };
  }

  const response = await fetch(url, fetchOptions);
  totalRequestsMade++;

  // Rate limit bilgilerini oku
  const rateLimitInfo: RateLimitInfo = {
    requestsLimit: parseInt(response.headers.get('x-ratelimit-requests-limit') || '0'),
    requestsRemaining: parseInt(response.headers.get('x-ratelimit-requests-remaining') || '0'),
    minuteLimit: parseInt(response.headers.get('X-RateLimit-Limit') || '0'),
    minuteRemaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
  };

  lastRateLimitInfo = rateLimitInfo;

  // 🛡️ Günlük kalan istek sayısını güncelle (API'den gelen gerçek değer)
  if (rateLimitInfo.requestsRemaining > 0 || rateLimitInfo.requestsLimit > 0) {
    dailyRequestsRemaining = rateLimitInfo.requestsRemaining;
  }

  // 🛡️ Dakikalık rate limit kontrolü
  if (rateLimitInfo.minuteRemaining <= 0 && rateLimitInfo.minuteLimit > 0) {
    minuteRateLimitHit = true;
    minuteRateLimitResetTime = Date.now() + MINUTE_COOLDOWN_MS;
    console.error(`[API-Football] 🚫 Dakikalık rate limit aşıldı! ${MINUTE_COOLDOWN_MS / 1000}s bekleniyor.`);
  }

  // Rate limit uyarıları (kademeli)
  if (rateLimitInfo.requestsRemaining <= DAILY_HARD_STOP) {
    console.error(`[API-Football] 🔴 KRİTİK: Günlük limit neredeyse bitti! Kalan: ${rateLimitInfo.requestsRemaining}/${rateLimitInfo.requestsLimit}`);
  } else if (rateLimitInfo.requestsRemaining <= DAILY_SOFT_STOP) {
    console.warn(`[API-Football] 🟡 UYARI: Günlük limit düşük! Kalan: ${rateLimitInfo.requestsRemaining}/${rateLimitInfo.requestsLimit}`);
  } else if (rateLimitInfo.requestsRemaining < 1000) {
    console.warn(`[API-Football] ⚠️ Günlük limit azalıyor: ${rateLimitInfo.requestsRemaining}/${rateLimitInfo.requestsLimit}`);
  }

  if (!response.ok) {
    // 429 Too Many Requests - dakikalık limit aşımı
    if (response.status === 429) {
      minuteRateLimitHit = true;
      minuteRateLimitResetTime = Date.now() + MINUTE_COOLDOWN_MS;
      console.error(`[API-Football] 🚫 429 Too Many Requests! ${MINUTE_COOLDOWN_MS / 1000}s bekleniyor.`);
    }
    throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
  }

  const data: ApiResponse<T> = await response.json();

  // API hata kontrolü (rate limit hatası dahil)
  if (data.errors && Object.keys(data.errors).length > 0) {
    const errorMsg = typeof data.errors === 'object' 
      ? Object.values(data.errors).join(', ')
      : String(data.errors);
    
    // "Too many requests" hata mesajı kontrolü
    if (errorMsg.toLowerCase().includes('too many requests') || errorMsg.toLowerCase().includes('rate limit')) {
      minuteRateLimitHit = true;
      minuteRateLimitResetTime = Date.now() + MINUTE_COOLDOWN_MS;
      console.error(`[API-Football] 🚫 API rate limit hatası: ${errorMsg}`);
    }
    
    throw new Error(`API-Football API Error: ${errorMsg}`);
  }

  console.log(`[API-Football] ✓ ${endpoint} - ${data.results} results | Kalan: ${rateLimitInfo.requestsRemaining}/${rateLimitInfo.requestsLimit} günlük, ${rateLimitInfo.minuteRemaining}/${rateLimitInfo.minuteLimit} dakikalık`);

  return data;
}

/**
 * Rate limit güvenli mi kontrol et (diğer modüller için)
 * match-detail gibi doğrudan fetch kullanan yerler için
 */
export function isApiCallAllowed(endpoint: string = '/other'): boolean {
  return checkRateLimit(endpoint).allowed;
}

/**
 * Rate limit bilgilerini doğrudan fetch response headerlarından güncelle
 * match-detail gibi apiFootballFetch kullanmayan yerler için
 */
export function updateRateLimitFromHeaders(headers: Headers): void {
  const remaining = parseInt(headers.get('x-ratelimit-requests-remaining') || '-1');
  const minuteRemaining = parseInt(headers.get('X-RateLimit-Remaining') || '-1');
  
  if (remaining >= 0) {
    dailyRequestsRemaining = remaining;
    totalRequestsMade++;
  }
  
  if (minuteRemaining <= 0 && parseInt(headers.get('X-RateLimit-Limit') || '0') > 0) {
    minuteRateLimitHit = true;
    minuteRateLimitResetTime = Date.now() + MINUTE_COOLDOWN_MS;
  }
}

/**
 * Tarihi API formatına çevir (YYYY-MM-DD) - Türkiye saat dilimine göre
 */
export function formatDateForApi(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(date);
}

/**
 * Bugünün tarihini API formatında al (Türkiye saatine göre)
 */
export function getTodayForApi(): string {
  return formatDateForApi(new Date());
}
