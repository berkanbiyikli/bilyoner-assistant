/**
 * Redis Cache - Upstash Redis ile Kalıcı Cache
 * Vercel serverless ortamında çalışır
 * 
 * Memory cache ile birlikte hibrit kullanım:
 * 1. Önce memory cache kontrol et (ultra hızlı)
 * 2. Memory'de yoksa Redis'e bak
 * 3. Redis'te de yoksa API'den çek
 */

import { Redis } from '@upstash/redis';

// Singleton Redis instance
let redis: Redis | null = null;

/**
 * Redis client'ı al veya oluştur
 */
function getRedis(): Redis | null {
  if (redis) return redis;
  
  // Vercel KV (Upstash) veya doğrudan Upstash env var'larını kontrol et
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    // Redis yoksa sessizce null dön (fallback to memory cache)
    console.warn('[Redis] UYARI: Redis bağlantı bilgileri bulunamadı! KV_REST_API_URL/KV_REST_API_TOKEN veya UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN tanımlı olmalı.');
    return null;
  }
  
  redis = new Redis({ url, token });
  return redis;
}

// Cache TTL sabitleri (saniye - Redis için)
export const REDIS_TTL = {
  DAILY_MATCHES: 60,              // 1 dakika (canlı veri)
  TEAM_STATS: 30 * 60,            // 30 dakika
  SEASON_STATS: 60 * 60,          // 1 saat
  REFEREE_STATS: 12 * 60 * 60,    // 12 saat
  PLAYER_CARDS: 30 * 60,          // 30 dakika
  FIXTURES: 60,                   // 1 dakika (canlı veri)
  H2H: 24 * 60 * 60,              // 24 saat
  STANDINGS: 60 * 60,             // 1 saat
  ODDS: 5 * 60,                   // 5 dakika
  PREDICTIONS: 15 * 60,           // 15 dakika
  MATCH_DETAIL: 10 * 60,          // 10 dakika
};

// Cache key prefix (namespace)
const CACHE_PREFIX = 'bilyoner:';

/**
 * Cache'den değer al
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis();
    if (!client) return null;
    
    const fullKey = CACHE_PREFIX + key;
    const value = await client.get<T>(fullKey);
    
    if (value !== null) {
      console.log(`[Redis Cache] HIT: ${key}`);
    }
    
    return value;
  } catch (error) {
    console.error('[Redis Cache] Get error:', error);
    return null;
  }
}

/**
 * Cache'e değer kaydet
 */
export async function cacheSet<T>(
  key: string, 
  value: T, 
  ttlSeconds: number
): Promise<boolean> {
  try {
    const client = getRedis();
    if (!client) return false;
    
    const fullKey = CACHE_PREFIX + key;
    await client.set(fullKey, value, { ex: ttlSeconds });
    
    console.log(`[Redis Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error('[Redis Cache] Set error:', error);
    return false;
  }
}

/**
 * Cache'den değer sil
 */
export async function cacheDelete(key: string): Promise<boolean> {
  try {
    const client = getRedis();
    if (!client) return false;
    
    const fullKey = CACHE_PREFIX + key;
    await client.del(fullKey);
    return true;
  } catch (error) {
    console.error('[Redis Cache] Delete error:', error);
    return false;
  }
}

/**
 * Pattern ile cache temizle (örn: "daily-matches:*")
 */
export async function cacheClearPattern(pattern: string): Promise<number> {
  try {
    const client = getRedis();
    if (!client) return 0;
    
    const fullPattern = CACHE_PREFIX + pattern;
    const keys = await client.keys(fullPattern);
    
    if (keys.length === 0) return 0;
    
    await client.del(...keys);
    console.log(`[Redis Cache] Cleared ${keys.length} keys matching: ${pattern}`);
    return keys.length;
  } catch (error) {
    console.error('[Redis Cache] Clear pattern error:', error);
    return 0;
  }
}

/**
 * Get or Fetch pattern - Cache yoksa API'den çek
 */
export async function cacheGetOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // Önce cache'e bak
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  console.log(`[Redis Cache] MISS: ${key} - Fetching...`);
  
  // API'den çek
  const value = await fetcher();
  
  // Cache'e kaydet (async, beklemeden devam et)
  cacheSet(key, value, ttlSeconds).catch(() => {});
  
  return value;
}

/**
 * Cache istatistikleri al
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  keyCount: number;
} | null> {
  try {
    const client = getRedis();
    if (!client) {
      return { connected: false, keyCount: 0 };
    }
    
    const keys = await client.keys(CACHE_PREFIX + '*');
    return {
      connected: true,
      keyCount: keys.length,
    };
  } catch {
    return { connected: false, keyCount: 0 };
  }
}

/**
 * Redis bağlantı durumu
 */
export function isRedisAvailable(): boolean {
  return getRedis() !== null;
}

// Cache key generators (Redis için)
export const redisCacheKeys = {
  dailyMatches: (date: string) => `daily-matches:${date}`,
  matchDetail: (fixtureId: number) => `match-detail:${fixtureId}`,
  teamStats: (teamId: number, last: number) => `team-stats:${teamId}:${last}`,
  seasonStats: (teamId: number, leagueId: number, season: number) => 
    `season-stats:${teamId}:${leagueId}:${season}`,
  referee: (name: string) => `referee:${name.toLowerCase().replace(/\s+/g, '-')}`,
  playerCards: (teamId: number, season: number) => `player-cards:${teamId}:${season}`,
  h2h: (team1: number, team2: number) => 
    `h2h:${Math.min(team1, team2)}:${Math.max(team1, team2)}`,
  standings: (leagueId: number, season: number) => `standings:${leagueId}:${season}`,
  odds: (fixtureId: number) => `odds:${fixtureId}`,
  predictions: (fixtureId: number) => `predictions:${fixtureId}`,
  injuries: (teamId: number) => `injuries:${teamId}`,
  poisson: (fixtureId: number) => `poisson:${fixtureId}`,
  valueBets: (fixtureId: number) => `value-bets:${fixtureId}`,
};
