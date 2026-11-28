/**
 * Process-wide memory budget for the in-memory feed caches.
 *
 * Every vendor provider owns its own createFeedCache map, and each map used
 * to keep every URL it had ever loaded — expired entries were replaced, never
 * deleted, because they double as the stale-while-revalidate copy. With
 * ~800 active systems (~250 MB of parsed feeds on the Fly volume) a process
 * that served enough distinct systems exhausted the V8 heap and crashed
 * (2026-11-28). One shared least-recently-used budget across all caches
 * bounds the total; only entries that have a disk copy are evictable, so an
 * evicted entry is never lost (fresh → cold-start read, stale → SWR from disk).
 */

/**
 * Serialized-JSON characters kept in memory across all feed caches.
 *
 * Measured (2026-11-28 repro: production build, --max-old-space-size=256,
 * /api/events across 320 distinct ICS systems): heap plateaued at 149.4 MB
 * from a 47.9 MB baseline, i.e. ~101 MB of heap for this 64 MiB budget —
 * ~1.5x heap per budgeted byte. Fly runs 512 MB RAM with no NODE_OPTIONS, so
 * V8 picks a ~256 MB heap limit (the OOM log shows Mark-Compact at
 * 252 → 251.5 MB of ~259 MB); ~80 MB page-serving baseline + ~100 MB of feeds
 * leaves ~75 MB headroom. Lower this (48 MiB) if the ratio is ever above 2x.
 */
export const FEED_CACHE_MEMORY_BUDGET_BYTES = 64 * 1024 * 1024;

export interface MemoryBudget {
  /** The budget's limit in bytes; entries bigger than this are not kept in memory. */
  readonly maxBytes: number;
  /** Records `key` as most recently used with `sizeBytes`; may evict older keys. */
  touch(key: string, sizeBytes: number, evict: () => void): void;
  /** Forgets `key` without calling its evict callback. */
  release(key: string): void;
  /** Bytes currently accounted for. */
  totalBytes(): number;
}

interface BudgetEntry {
  sizeBytes: number;
  evict: () => void;
}

export function createMemoryBudget(maxBytes: number): MemoryBudget {
  // Map iteration order is insertion order: delete + set moves a key to the
  // most-recently-used end, so the first key is always the LRU victim.
  const entries = new Map<string, BudgetEntry>();
  let total = 0;

  const release = (key: string): void => {
    const existing = entries.get(key);
    if (!existing) return;
    total -= existing.sizeBytes;
    entries.delete(key);
  };

  return {
    maxBytes,
    touch(key, sizeBytes, evict) {
      release(key);
      entries.set(key, { sizeBytes, evict });
      total += sizeBytes;
      // Never evict the entry just touched (callers keep oversized ones out).
      for (const [victimKey, victim] of entries) {
        if (total <= maxBytes || victimKey === key) break;
        release(victimKey);
        victim.evict();
      }
    },
    release,
    totalBytes: () => total,
  };
}

/** The one budget every feed cache in this process shares by default. */
export const sharedFeedCacheBudget: MemoryBudget = createMemoryBudget(
  FEED_CACHE_MEMORY_BUDGET_BYTES,
);

/** JSON text of a cached value (its disk form and budget size), or null if not serializable. */
export function serialize(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}
