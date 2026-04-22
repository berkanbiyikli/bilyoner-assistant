// ============================================
// Simple In-Memory Cache
// API çağrılarını azaltmak için
// ============================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function clearCache(): void {
  cache.clear();
}

/**
 * Belirli bir prefix ile başlayan tüm cache key'lerini sil.
 * Örn: optimizer kalibre ettikten sonra `clearCacheByPrefix("prediction-v")` →
 * stale lambda ile cache'lenmiş tahminler temizlenir, bir sonraki istek taze hesaplama yapar.
 */
export function clearCacheByPrefix(prefix: string): number {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      count++;
    }
  }
  return count;
}

// Otomatik temizlik (her 5 dakikada)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiresAt) {
        cache.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}
