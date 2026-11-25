import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Entries untouched this long are evicted. Live feeds are rewritten on
 * every refresh (≤ TTL while requested), so only dead keys age out: URLs
 * embedding a past date (SFPL `date-end-after=`, Communico `"date":`),
 * keys orphaned by a FEED_CACHE_VERSION bump, and feeds nobody asked for
 * in a week. Trade-off: a stable feed whose vendor has failed every
 * refresh for this long loses its last-known-good fallback.
 */
export const FEED_CACHE_MAX_AGE_MS = 7 * DAY_MS;

/** Hard cap on the cache dir, well under the 1 GB Fly volume. */
export const FEED_CACHE_MAX_TOTAL_BYTES = 500 * 1024 * 1024;

/** Temp files older than this are orphans of a crashed write. */
export const FEED_CACHE_TMP_MAX_AGE_MS = HOUR_MS;

/** Eviction runs on the first cache write after startup, then at most this often. */
export const FEED_CACHE_EVICTION_INTERVAL_MS = 6 * HOUR_MS;

/** After a failed sweep, try again this soon instead of a full interval. */
export const FEED_CACHE_EVICTION_RETRY_MS = 10 * 60 * 1000;

const ENTRY_SUFFIX = ".json";
export const TMP_SUFFIX = ".tmp";

export interface CacheFileInfo {
  name: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface EvictionPolicy {
  now: number;
  maxAgeMs: number;
  maxTotalBytes: number;
  tmpMaxAgeMs: number;
}

export interface EvictionResult {
  scanned: number;
  deleted: number;
  freedBytes: number;
}

const isEntry = (file: CacheFileInfo) => file.name.endsWith(ENTRY_SUFFIX);
const isTmp = (file: CacheFileInfo) => file.name.endsWith(TMP_SUFFIX);

function isExpired(file: CacheFileInfo, policy: EvictionPolicy): boolean {
  const ageMs = policy.now - file.mtimeMs;
  if (isTmp(file)) return ageMs > policy.tmpMaxAgeMs;
  return file.sizeBytes === 0 || ageMs > policy.maxAgeMs;
}

/** Oldest-first names to drop so the surviving entries fit under the cap. */
function overCapNames(survivors: readonly CacheFileInfo[], maxTotalBytes: number): string[] {
  const oldestFirst = [...survivors].sort((a, b) => a.mtimeMs - b.mtimeMs);
  // Local accumulator (never escapes): a spread-per-step reduce is O(n²),
  // which blocks the event loop on a dir of tens of thousands of entries.
  const names: string[] = [];
  let remaining = survivors.reduce((sum, file) => sum + file.sizeBytes, 0);
  for (const file of oldestFirst) {
    if (remaining <= maxTotalBytes) break;
    names.push(file.name);
    remaining -= file.sizeBytes;
  }
  return names;
}

/**
 * Pure eviction plan: expired entries (old or 0-byte), orphaned temp
 * files, then oldest-first entries until the total fits the size cap.
 * Files that are neither cache entries nor temp files are never touched.
 */
export function planEviction(
  files: readonly CacheFileInfo[],
  policy: EvictionPolicy,
): string[] {
  const managed = files.filter((file) => isEntry(file) || isTmp(file));
  const expired = managed.filter((file) => isExpired(file, policy));
  const expiredNames = new Set(expired.map((file) => file.name));
  const survivors = managed.filter((file) => isEntry(file) && !expiredNames.has(file.name));
  return [...expired.map((file) => file.name), ...overCapNames(survivors, policy.maxTotalBytes)];
}

export interface EvictionFs {
  unlink: (filePath: string) => Promise<void>;
}

const isNotFound = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";

async function listCacheFiles(dir: string): Promise<CacheFileInfo[]> {
  const names = await readdir(dir).catch((error: unknown) => {
    if (isNotFound(error)) return [] as string[];
    throw error;
  });
  const infos = await Promise.all(
    names.map(async (name) => {
      const info = await stat(path.join(dir, name)).catch(() => null);
      return info?.isFile()
        ? { name, mtimeMs: info.mtimeMs, sizeBytes: info.size }
        : null;
    }),
  );
  return infos.filter((info): info is CacheFileInfo => info !== null);
}

/** Applies `planEviction` to a cache directory. Missing files are skipped. */
export async function evictFeedCacheDir(
  dir: string,
  fs: EvictionFs = { unlink },
  policy: EvictionPolicy = {
    now: Date.now(),
    maxAgeMs: FEED_CACHE_MAX_AGE_MS,
    maxTotalBytes: FEED_CACHE_MAX_TOTAL_BYTES,
    tmpMaxAgeMs: FEED_CACHE_TMP_MAX_AGE_MS,
  },
): Promise<EvictionResult> {
  const files = await listCacheFiles(dir);
  const sizeByName = new Map(files.map((file) => [file.name, file.sizeBytes]));
  const outcomes = await Promise.allSettled(
    planEviction(files, policy).map(async (name) => {
      await fs.unlink(path.join(dir, name));
      return sizeByName.get(name) ?? 0;
    }),
  );
  const failures = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected" && !isNotFound(outcome.reason),
  );
  if (failures.length > 0) {
    console.warn(`feed cache: ${failures.length} evictions failed in ${dir}`, failures[0].reason);
  }
  const freed = outcomes.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );
  return {
    scanned: files.length,
    deleted: freed.length,
    freedBytes: freed.reduce((sum, bytes) => sum + bytes, 0),
  };
}

/** Starts `run` now, turning a synchronous throw into a rejection. */
function startSafely(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return Promise.resolve(run());
  } catch (error: unknown) {
    return Promise.reject(error);
  }
}

export interface EvictionSchedulerOptions {
  run: () => Promise<unknown>;
  intervalMs: number;
  /** Delay before retrying after a failed run (capped at `intervalMs`). */
  retryMs?: number;
  now?: () => number;
}

/**
 * Returns a fire-and-forget trigger: the first call runs `run`, later
 * calls run it again only once `intervalMs` has passed and no run is in
 * flight. Never throws and never blocks the caller; failures are logged.
 */
export function createEvictionScheduler(options: EvictionSchedulerOptions): () => void {
  const now = options.now ?? Date.now;
  const retryMs = Math.min(options.retryMs ?? FEED_CACHE_EVICTION_RETRY_MS, options.intervalMs);
  let lastStartedAt: number | null = null;
  let isRunning = false;

  return () => {
    const current = now();
    if (isRunning) return;
    if (lastStartedAt !== null && current - lastStartedAt < options.intervalMs) return;
    lastStartedAt = current;
    isRunning = true;
    startSafely(options.run)
      .catch((error: unknown) => {
        console.warn("feed cache: eviction failed", error);
        // Retry sooner than a full interval: a failed sweep may leave a full disk.
        lastStartedAt = current - options.intervalMs + retryMs;
      })
      .finally(() => {
        isRunning = false;
      });
  };
}
