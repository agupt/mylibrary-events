import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_FEED_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Disk entries store PARSED values, so parser changes must invalidate
 * them — bump this whenever any feed parser's output shape changes.
 */
export const FEED_CACHE_VERSION = "v2-local-wallclock";

export interface FeedCacheOptions<T> {
  load: (url: string) => Promise<T>;
  ttlMs?: number;
  now?: () => number;
  /**
   * Optional disk persistence directory. Values must be JSON-serializable.
   * Adds two behaviors:
   *  - cold start: a fresh-enough disk copy is served without refetching
   *    (a restarted server or new serverless instance doesn't hammer feeds)
   *  - resilience: if the live fetch fails, the last-known-good disk copy
   *    is served regardless of age (stale beats empty for event listings)
   */
  persistDir?: string;
}

/**
 * Promise-level TTL cache for feed fetches. Caching the in-flight promise
 * (not the resolved value) means concurrent requests for the same feed
 * share one fetch instead of stampeding. Failures are evicted so the next
 * call retries.
 */
export function createFeedCache<T>(options: FeedCacheOptions<T>): (url: string) => Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_FEED_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { fetchedAt: number; value: Promise<T> }>();

  const diskPath = (url: string) =>
    path.join(
      options.persistDir as string,
      `${createHash("sha256").update(`${FEED_CACHE_VERSION}:${url}`).digest("hex").slice(0, 24)}.json`,
    );

  function readDisk(url: string, maxAgeMs: number | null): T | null {
    if (!options.persistDir) return null;
    try {
      const file = diskPath(url);
      if (!existsSync(file)) return null;
      if (maxAgeMs !== null && now() - statSync(file).mtimeMs > maxAgeMs) return null;
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  function writeDisk(url: string, value: T): void {
    if (!options.persistDir) return;
    try {
      mkdirSync(options.persistDir, { recursive: true });
      writeFileSync(diskPath(url), JSON.stringify(value));
    } catch (error: unknown) {
      console.warn(`feed cache: could not persist ${url}`, error);
    }
  }

  const refreshing = new Set<string>();

  function startRefresh(url: string): Promise<T> {
    refreshing.add(url);
    const value = options
      .load(url)
      .then((loaded) => {
        writeDisk(url, loaded);
        cache.set(url, { fetchedAt: now(), value: Promise.resolve(loaded) });
        return loaded;
      })
      .finally(() => refreshing.delete(url));
    return value;
  }

  return (url: string) => {
    const cached = cache.get(url);
    if (cached && now() - cached.fetchedAt < ttlMs) {
      return cached.value;
    }

    // Cold start: a fresh disk copy substitutes for a fetch entirely
    const fromDisk = readDisk(url, ttlMs);
    if (fromDisk !== null) {
      const value = Promise.resolve(fromDisk);
      cache.set(url, { fetchedAt: now(), value });
      return value;
    }

    // Stale-while-revalidate: some vendor feeds take 45s+ to generate
    // (Dallas's LibraryCalendar). If ANY previous copy exists — expired
    // memory or any-age disk — serve it immediately and refresh in the
    // background; a user request never waits on a slow vendor.
    const stale = cached?.value ?? null;
    const staleDisk = stale === null ? readDisk(url, null) : null;
    if (stale !== null || staleDisk !== null) {
      if (!refreshing.has(url)) {
        startRefresh(url).catch((error: unknown) => {
          console.warn(`feed cache: background refresh of ${url} failed`, error);
        });
      }
      const value = stale ?? Promise.resolve(staleDisk as T);
      // Don't bump fetchedAt to now — a completed refresh overwrites this
      // entry; until then, keep serving stale without re-triggering.
      cache.set(url, { fetchedAt: now() - ttlMs + 60_000, value });
      return value;
    }

    // First-ever fetch: nothing to serve, must block
    const value = startRefresh(url).catch((error: unknown) => {
      const recovered = readDisk(url, null);
      if (recovered !== null) {
        console.warn(`feed cache: serving stale copy of ${url} after fetch failure`, error);
        return recovered;
      }
      cache.delete(url);
      throw error;
    });
    cache.set(url, { fetchedAt: now(), value });
    return value;
  };
}
