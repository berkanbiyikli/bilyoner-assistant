/**
 * API-Football v3 Base Client
 * Rate-limit aware fetcher with error handling
 */

import { ApiResponse, RateLimitInfo } from '@/types/api-football';

const API_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || '';

// Son rate limit bilgisi (loglama için)
let lastRateLimitInfo: RateLimitInfo | null = null;

export function getLastRateLimitInfo(): RateLimitInfo | null {
  return lastRateLimitInfo;
}

/**
 * API-Football'a istek atan temel fonksiyon
 */
export async function apiFootballFetch<T>(
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<ApiResponse<T>> {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('API_FOOTBALL_KEY is not configured. Please add your API key to .env.local');
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

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
    next: { revalidate: 60 }, // Next.js cache - 60 saniye
  });

  // Rate limit bilgilerini oku
  const rateLimitInfo: RateLimitInfo = {
    requestsLimit: parseInt(response.headers.get('x-ratelimit-requests-limit') || '0'),
    requestsRemaining: parseInt(response.headers.get('x-ratelimit-requests-remaining') || '0'),
    minuteLimit: parseInt(response.headers.get('X-RateLimit-Limit') || '0'),
    minuteRemaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '0'),
  };

  lastRateLimitInfo = rateLimitInfo;

  // Rate limit uyarısı
  if (rateLimitInfo.requestsRemaining < 1000) {
    console.warn(`[API-Football] ⚠️ Low daily requests remaining: ${rateLimitInfo.requestsRemaining}/${rateLimitInfo.requestsLimit}`);
  }

  if (!response.ok) {
    throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
  }

  const data: ApiResponse<T> = await response.json();

  // API hata kontrolü
  if (data.errors && Object.keys(data.errors).length > 0) {
    const errorMsg = typeof data.errors === 'object' 
      ? Object.values(data.errors).join(', ')
      : String(data.errors);
    throw new Error(`API-Football API Error: ${errorMsg}`);
  }

  console.log(`[API-Football] ✓ ${endpoint} - ${data.results} results | Remaining: ${rateLimitInfo.requestsRemaining}`);

  return data;
}

/**
 * Tarihi API formatına çevir (YYYY-MM-DD)
 */
export function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Bugünün tarihini API formatında al
 */
export function getTodayForApi(): string {
  return formatDateForApi(new Date());
}
