/**
 * Process-wide memory budget for the in-memory feed caches.
 *
 * Every vendor provider owns its own createFeedCache map, and each map used
 * to keep every URL it had ever loaded — expired entries were replaced, never
 * deleted, because they double as the stale-while-revalidate copy. With
 * ~800 active systems (~250 MB of parsed feeds on the Fly volume) a process
 * that served enough distinct systems exhausted the 256 MB V8 heap and
 * crashed (2026-11-28). One shared least-recently-used budget across all
 * caches bounds the total; an evicted entry is not lost, because the disk
 * layer still holds it (fresh → cold-start read, stale → SWR from disk).
 */

/** Serialized-JSON bytes kept in memory across all feed caches (~1.3x on heap). */
export const FEED_CACHE_MEMORY_BUDGET_BYTES = 64 * 1024 * 1024;

export interface MemoryBudget {
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
    touch(key, sizeBytes, evict) {
      release(key);
      entries.set(key, { sizeBytes, evict });
      total += sizeBytes;
      // Never evict the entry just touched, even if it alone is over budget.
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

/** Approximate retained size of a cached value: its JSON length (0 if not serializable). */
export function estimateSizeBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}
