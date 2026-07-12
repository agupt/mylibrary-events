export const DEFAULT_FEED_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Promise-level TTL cache for feed fetches. Caching the in-flight promise
 * (not the resolved value) means concurrent requests for the same feed
 * share one fetch instead of stampeding. Failures are evicted so the next
 * call retries.
 */
export function createFeedCache<T>(options: {
  load: (url: string) => Promise<T>;
  ttlMs?: number;
  now?: () => number;
}): (url: string) => Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_FEED_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { fetchedAt: number; value: Promise<T> }>();

  return (url: string) => {
    const cached = cache.get(url);
    if (cached && now() - cached.fetchedAt < ttlMs) {
      return cached.value;
    }
    const value = options.load(url).catch((error: unknown) => {
      cache.delete(url);
      throw error;
    });
    cache.set(url, { fetchedAt: now(), value });
    return value;
  };
}
