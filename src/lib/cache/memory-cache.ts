/**
 * Memory Cache - LRU Cache with TTL
 * API isteklerini azaltmak için in-memory önbellekleme
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
}

export class MemoryCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number; // ms
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    evictions: 0,
  };

  /**
   * @param maxSize Maksimum cache boyutu (varsayılan: 1000)
   * @param defaultTTL Varsayılan TTL (ms) (varsayılan: 5 dakika)
   */
  constructor(maxSize: number = 1000, defaultTTL: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * Değer al
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // TTL kontrolü
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.size = this.cache.size;
      return null;
    }

    // LRU: Erişilen öğeyi sona taşı
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Değer kaydet
   */
  set(key: string, value: T, ttl?: number): void {
    // Boyut kontrolü - LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    const entry: CacheEntry<T> = {
      value,
      expiry: Date.now() + (ttl ?? this.defaultTTL),
      createdAt: Date.now(),
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  /**
   * Değer sil
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }

  /**
   * Anahtar var mı kontrol et
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // TTL kontrolü
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Tüm cache'i temizle
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Süresi dolmuş girişleri temizle
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        pruned++;
      }
    }

    this.stats.size = this.cache.size;
    return pruned;
  }

  /**
   * Cache istatistiklerini al
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
    };
  }

  /**
   * Get or fetch pattern
   * Cache'de varsa döndür, yoksa fetch et ve cache'e ekle
   */
  async getOrFetch(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }
}

// Cache TTL sabitleri (ms)
export const CACHE_TTL = {
  TEAM_STATS: 30 * 60 * 1000,      // 30 dakika
  SEASON_STATS: 60 * 60 * 1000,    // 1 saat
  REFEREE_STATS: 12 * 60 * 60 * 1000, // 12 saat
  PLAYER_CARDS: 30 * 60 * 1000,    // 30 dakika
  FIXTURES: 60 * 1000,             // 1 dakika (canlı veri)
  H2H: 24 * 60 * 60 * 1000,        // 24 saat
  STANDINGS: 60 * 60 * 1000,       // 1 saat
  ODDS: 5 * 60 * 1000,             // 5 dakika
  PREDICTIONS: 15 * 60 * 1000,     // 15 dakika
};

// Global cache instances
export const teamStatsCache = new MemoryCache(500, CACHE_TTL.TEAM_STATS);
export const seasonStatsCache = new MemoryCache(200, CACHE_TTL.SEASON_STATS);
export const refereeCache = new MemoryCache(100, CACHE_TTL.REFEREE_STATS);
export const playerCardsCache = new MemoryCache(300, CACHE_TTL.PLAYER_CARDS);
export const h2hCache = new MemoryCache(200, CACHE_TTL.H2H);
export const standingsCache = new MemoryCache(50, CACHE_TTL.STANDINGS);
export const oddsCache = new MemoryCache(500, CACHE_TTL.ODDS);

// Cache key generators
export const cacheKeys = {
  teamStats: (teamId: number, last: number) => `team_stats:${teamId}:${last}`,
  seasonStats: (teamId: number, leagueId: number, season: number) => 
    `season_stats:${teamId}:${leagueId}:${season}`,
  referee: (name: string) => `referee:${name.toLowerCase()}`,
  playerCards: (teamId: number, season: number) => `player_cards:${teamId}:${season}`,
  h2h: (team1: number, team2: number) => `h2h:${Math.min(team1, team2)}:${Math.max(team1, team2)}`,
  standings: (leagueId: number, season: number) => `standings:${leagueId}:${season}`,
  odds: (fixtureId: number) => `odds:${fixtureId}`,
};
