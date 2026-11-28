import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FEED_CACHE_EVICTION_INTERVAL_MS,
  TMP_SUFFIX,
  createEvictionScheduler,
  evictFeedCacheDir,
} from "./feedCacheEviction";
import { serialize, sharedFeedCacheBudget, type MemoryBudget } from "./feedCacheMemory";

export const DEFAULT_FEED_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Disk entries store PARSED values, so parser changes must invalidate
 * them — bump this whenever any feed parser's output shape changes.
 */
export const FEED_CACHE_VERSION = "v6-ics-utc";

// One eviction scheduler per directory: every provider's cache shares the
// same dir, so they must share one schedule rather than each sweeping it.
const evictionByDir = new Map<string, () => void>();

function scheduleEviction(dir: string): void {
  if (!evictionByDir.has(dir)) {
    evictionByDir.set(
      dir,
      createEvictionScheduler({
        intervalMs: FEED_CACHE_EVICTION_INTERVAL_MS,
        run: async () => {
          const result = await evictFeedCacheDir(dir);
          console.info(
            `feed cache: eviction removed ${result.deleted}/${result.scanned} files (${Math.round(result.freedBytes / 1024)} KiB) from ${dir}`,
          );
        },
      }),
    );
  }
  evictionByDir.get(dir)?.();
}

/**
 * Write-then-rename in the same directory: a reader sees either the old
 * complete file or the new complete file, never a truncated one (a full
 * disk used to leave 0-byte entries behind).
 */
function writeFileAtomic(file: string, contents: string): void {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}${TMP_SUFFIX}`;
  try {
    writeFileSync(tmp, contents);
    renameSync(tmp, file);
  } catch (error: unknown) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Best effort: an orphaned temp file is swept by eviction later.
    }
    throw error;
  }
}

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
  /**
   * Shared LRU byte budget for settled in-memory entries. Defaults to the
   * process-wide budget so all provider caches together stay bounded.
   */
  memoryBudget?: MemoryBudget;
}

interface CacheEntry<T> {
  fetchedAt: number;
  value: Promise<T>;
  /** True once `value` has resolved; in-flight promises are never evicted. */
  settled: boolean;
  sizeBytes: number;
  /**
   * True only when this exact value was written to disk. Only persisted
   * entries are budgeted and evictable, so eviction never loses the
   * last-known-good copy (a failed write keeps the value in memory).
   */
  persisted: boolean;
}

interface DiskHit<T> {
  value: T;
  sizeBytes: number;
}

// Distinguishes caches in the shared budget (two providers may cache one URL).
let nextCacheId = 0;

/**
 * Promise-level TTL cache for feed fetches. Caching the in-flight promise
 * (not the resolved value) means concurrent requests for the same feed
 * share one fetch instead of stampeding; every path that needs a load joins
 * the URL's in-flight refresh if there is one. Failures are evicted so the
 * next call retries. Settled, persisted entries count against a shared LRU
 * memory budget; an evicted entry falls back to its disk copy (fresh or stale).
 */
export function createFeedCache<T>(options: FeedCacheOptions<T>): (url: string) => Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_FEED_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const budget = options.memoryBudget ?? sharedFeedCacheBudget;
  const budgetPrefix = `${nextCacheId++}:`;
  const cache = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();
  // URLs evicted from memory (for the missing-disk-copy warning), and the
  // ones already warned about so the log stays once per URL.
  const evictedUrls = new Set<string>();
  const warnedMissing = new Set<string>();

  const diskPath = (url: string) =>
    path.join(
      options.persistDir as string,
      `${createHash("sha256").update(`${FEED_CACHE_VERSION}:${url}`).digest("hex").slice(0, 24)}.json`,
    );

  function readDisk(url: string, maxAgeMs: number | null): DiskHit<T> | null {
    if (!options.persistDir) return null;
    try {
      const file = diskPath(url);
      if (!existsSync(file)) return null;
      if (maxAgeMs !== null && now() - statSync(file).mtimeMs > maxAgeMs) return null;
      const text = readFileSync(file, "utf8");
      return { value: JSON.parse(text) as T, sizeBytes: text.length };
    } catch {
      return null;
    }
  }

  /** Returns true only when the value is now on disk. */
  function writeDisk(url: string, json: string): boolean {
    if (!options.persistDir) return false;
    try {
      mkdirSync(options.persistDir, { recursive: true });
      writeFileAtomic(diskPath(url), json);
      return true;
    } catch (error: unknown) {
      console.warn(`feed cache: could not persist ${url}`, error);
      return false;
    } finally {
      // Runs even when the write failed: a full disk is exactly when
      // eviction is needed most.
      scheduleEviction(options.persistDir);
    }
  }

  function touch(url: string, sizeBytes: number): void {
    budget.touch(budgetPrefix + url, sizeBytes, () => {
      const entry = cache.get(url);
      if (!entry?.settled || !entry.persisted) return;
      cache.delete(url);
      evictedUrls.add(url);
    });
  }

  /** Stores a settled value; persisted values are charged to the memory budget. */
  function remember(
    url: string,
    fetchedAt: number,
    value: Promise<T>,
    sizeBytes: number,
    persisted: boolean,
  ): void {
    evictedUrls.delete(url);
    if (!persisted) {
      budget.release(budgetPrefix + url);
      cache.set(url, { fetchedAt, value, settled: true, sizeBytes, persisted });
      return;
    }
    if (sizeBytes > budget.maxBytes) {
      // Bigger than the whole budget: keeping it would flush every other
      // entry on each hit. Its disk copy serves it instead.
      budget.release(budgetPrefix + url);
      cache.delete(url);
      return;
    }
    cache.set(url, { fetchedAt, value, settled: true, sizeBytes, persisted });
    touch(url, sizeBytes);
  }

  /** Loads `url`, or joins the load already in flight for it. */
  function startRefresh(url: string): Promise<T> {
    const existing = inflight.get(url);
    if (existing) return existing;
    const refresh: Promise<T> = Promise.resolve()
      // Inside .then so a synchronous throw from load becomes a rejection
      // and the inflight entry is still cleared.
      .then(() => options.load(url))
      .then((loaded) => {
        const json = serialize(loaded);
        const persisted = json !== null && writeDisk(url, json);
        // Keep a JSON round-tripped copy, not `loaded` itself: parsers return
        // substrings of the raw response (V8 sliced strings), which pin the
        // whole response text — ~3x the parsed size per cached feed.
        const stored = json !== null ? (JSON.parse(json) as T) : loaded;
        remember(url, now(), Promise.resolve(stored), json?.length ?? 0, persisted);
        return stored;
      })
      .finally(() => {
        if (inflight.get(url) === refresh) inflight.delete(url);
      });
    inflight.set(url, refresh);
    return refresh;
  }

  function refreshInBackground(url: string): void {
    if (inflight.has(url)) return;
    startRefresh(url).catch((error: unknown) => {
      console.warn(`feed cache: background refresh of ${url} failed`, error);
    });
  }

  function serveStale(url: string, cached: CacheEntry<T> | undefined): Promise<T> | null {
    // Don't bump fetchedAt to now — a completed refresh overwrites this
    // entry; until then, keep serving stale without re-triggering.
    const staleAt = now() - ttlMs + 60_000;
    if (cached) {
      refreshInBackground(url);
      if (cached.settled) {
        remember(url, staleAt, cached.value, cached.sizeBytes, cached.persisted);
      } else {
        cache.set(url, { ...cached, fetchedAt: staleAt });
      }
      return cached.value;
    }
    const staleDisk = readDisk(url, null);
    if (staleDisk === null) return null;
    refreshInBackground(url);
    const value = Promise.resolve(staleDisk.value);
    remember(url, staleAt, value, staleDisk.sizeBytes, true);
    return value;
  }

  function firstFetch(url: string): Promise<T> {
    if (evictedUrls.has(url) && !warnedMissing.has(url)) {
      warnedMissing.add(url);
      console.warn(`feed cache: ${url} was evicted from memory and has no disk copy; refetching`);
    }
    const value: Promise<T> = startRefresh(url).catch((error: unknown) => {
      const recovered = readDisk(url, null);
      if (recovered !== null) {
        console.warn(`feed cache: serving stale copy of ${url} after fetch failure`, error);
        remember(url, now(), Promise.resolve(recovered.value), recovered.sizeBytes, true);
        return recovered.value;
      }
      if (cache.get(url)?.value === value) cache.delete(url);
      throw error;
    });
    cache.set(url, { fetchedAt: now(), value, settled: false, sizeBytes: 0, persisted: false });
    return value;
  }

  return (url: string) => {
    const cached = cache.get(url);
    if (cached && now() - cached.fetchedAt < ttlMs) {
      if (cached.settled && cached.persisted) touch(url, cached.sizeBytes);
      return cached.value;
    }

    // Cold start (or evicted from memory): a fresh disk copy substitutes for a fetch
    const fromDisk = readDisk(url, ttlMs);
    if (fromDisk !== null) {
      const value = Promise.resolve(fromDisk.value);
      remember(url, now(), value, fromDisk.sizeBytes, true);
      return value;
    }

    // Stale-while-revalidate: some vendor feeds take 45s+ to generate
    // (Dallas's LibraryCalendar). If ANY previous copy exists — expired
    // memory or any-age disk — serve it immediately and refresh in the
    // background; a user request never waits on a slow vendor.
    return serveStale(url, cached) ?? firstFetch(url);
  };
}
