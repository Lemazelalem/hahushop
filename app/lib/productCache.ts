// lib/productCache.ts
// In-memory product cache. Survives navigation within the same browser session.
// Products are cached for 5 minutes then re-fetched in the background.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, cachedAt: Date.now() });
}

export function productCacheKey(id: string) {
  return `product:${id}`;
}
