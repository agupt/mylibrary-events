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
  /** True once `value` has resolved; only settled entries are budgeted/evictable. */
  settled: boolean;
  sizeBytes: number;
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
 * share one fetch instead of stampeding. Failures are evicted so the next
 * call retries. Settled entries count against a shared LRU memory budget;
 * an evicted entry falls back to the disk copy (fresh or stale).
 */
export function createFeedCache<T>(options: FeedCacheOptions<T>): (url: string) => Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_FEED_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const budget = options.memoryBudget ?? sharedFeedCacheBudget;
  const budgetPrefix = `${nextCacheId++}:`;
  const cache = new Map<string, CacheEntry<T>>();

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

  function writeDisk(url: string, json: string): void {
    if (!options.persistDir) return;
    try {
      mkdirSync(options.persistDir, { recursive: true });
      writeFileAtomic(diskPath(url), json);
    } catch (error: unknown) {
      console.warn(`feed cache: could not persist ${url}`, error);
    } finally {
      // Runs even when the write failed: a full disk is exactly when
      // eviction is needed most.
      scheduleEviction(options.persistDir);
    }
  }

  /** Stores a settled value and charges it to the shared memory budget. */
  function touch(url: string, sizeBytes: number): void {
    budget.touch(budgetPrefix + url, sizeBytes, () => {
      // Never drop an in-flight promise: that would re-open the stampede.
      if (cache.get(url)?.settled) cache.delete(url);
    });
  }

  function remember(url: string, fetchedAt: number, value: Promise<T>, sizeBytes: number): void {
    cache.set(url, { fetchedAt, value, settled: true, sizeBytes });
    touch(url, sizeBytes);
  }

  const refreshing = new Set<string>();

  function startRefresh(url: string): Promise<T> {
    refreshing.add(url);
    const value = options
      .load(url)
      .then((loaded) => {
        const json = serialize(loaded);
        if (json !== null) writeDisk(url, json);
        // Keep a JSON round-tripped copy, not `loaded` itself: parsers return
        // substrings of the raw response (V8 sliced strings), which pin the
        // whole response text — ~3x the parsed size per cached feed.
        const stored = json !== null ? (JSON.parse(json) as T) : loaded;
        remember(url, now(), Promise.resolve(stored), json?.length ?? 0);
        return stored;
      })
      .finally(() => refreshing.delete(url));
    return value;
  }

  function serveStale(url: string, cached: CacheEntry<T> | undefined): Promise<T> | null {
    const staleDisk = cached ? null : readDisk(url, null);
    if (!cached && !staleDisk) return null;
    if (!refreshing.has(url)) {
      startRefresh(url).catch((error: unknown) => {
        console.warn(`feed cache: background refresh of ${url} failed`, error);
      });
    }
    // Don't bump fetchedAt to now — a completed refresh overwrites this
    // entry; until then, keep serving stale without re-triggering.
    const staleAt = now() - ttlMs + 60_000;
    if (cached) {
      if (cached.settled) remember(url, staleAt, cached.value, cached.sizeBytes);
      else cache.set(url, { ...cached, fetchedAt: staleAt });
      return cached.value;
    }
    const value = Promise.resolve((staleDisk as DiskHit<T>).value);
    remember(url, staleAt, value, (staleDisk as DiskHit<T>).sizeBytes);
    return value;
  }

  function firstFetch(url: string): Promise<T> {
    const value = startRefresh(url).catch((error: unknown) => {
      const recovered = readDisk(url, null);
      if (recovered !== null) {
        console.warn(`feed cache: serving stale copy of ${url} after fetch failure`, error);
        remember(url, now(), Promise.resolve(recovered.value), recovered.sizeBytes);
        return recovered.value;
      }
      cache.delete(url);
      throw error;
    });
    cache.set(url, { fetchedAt: now(), value, settled: false, sizeBytes: 0 });
    return value;
  }

  return (url: string) => {
    const cached = cache.get(url);
    if (cached && now() - cached.fetchedAt < ttlMs) {
      if (cached.settled) touch(url, cached.sizeBytes);
      return cached.value;
    }

    // Cold start (or evicted from memory): a fresh disk copy substitutes for a fetch
    const fromDisk = readDisk(url, ttlMs);
    if (fromDisk !== null) {
      const value = Promise.resolve(fromDisk.value);
      remember(url, now(), value, fromDisk.sizeBytes);
      return value;
    }

    // Stale-while-revalidate: some vendor feeds take 45s+ to generate
    // (Dallas's LibraryCalendar). If ANY previous copy exists — expired
    // memory or any-age disk — serve it immediately and refresh in the
    // background; a user request never waits on a slow vendor.
    return serveStale(url, cached) ?? firstFetch(url);
  };
}
