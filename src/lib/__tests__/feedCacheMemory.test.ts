import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFeedCache } from "../events/feedCache";
import { createMemoryBudget, serialize } from "../events/feedCacheMemory";

const dirs: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "feedcache-mem-"));
  dirs.push(dir);
  return dir;
};
const clearDir = (dir: string) => {
  for (const name of readdirSync(dir)) rmSync(path.join(dir, name), { force: true });
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const payload = (url: string, extra: { version?: number } = {}) => ({
  url,
  items: "x".repeat(1000),
  ...extra,
});
function sizeOf(value: unknown): number {
  const json = serialize(value);
  if (json === null) throw new Error("test payload must be JSON-serializable");
  return json.length;
}
const PAYLOAD_BYTES = sizeOf(payload("https://example.org/feed/0"));
const url = (i: number) => `https://example.org/feed/${i}`;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Fills the budget with fresh keys so older entries get evicted. */
async function applyPressure(get: (u: string) => Promise<unknown>, from: number, count: number) {
  for (let i = from; i < from + count; i += 1) await get(url(i));
}

describe("createMemoryBudget", () => {
  test("evicts least-recently-used keys once over budget", () => {
    const budget = createMemoryBudget(100);
    const evicted: string[] = [];
    budget.touch("a", 40, () => evicted.push("a"));
    budget.touch("b", 40, () => evicted.push("b"));
    budget.touch("a", 40, () => evicted.push("a")); // a is now most recent
    budget.touch("c", 40, () => evicted.push("c"));

    expect(evicted).toEqual(["b"]);
    expect(budget.totalBytes()).toBe(80);
  });

  test("re-touching a key replaces its size instead of adding to it", () => {
    const budget = createMemoryBudget(1000);
    budget.touch("a", 40, () => {});
    budget.touch("a", 60, () => {});
    expect(budget.totalBytes()).toBe(60);
    budget.release("a");
    expect(budget.totalBytes()).toBe(0);
  });

  test("exposes its limit", () => {
    expect(createMemoryBudget(123).maxBytes).toBe(123);
  });
});

describe("createFeedCache memory bound", () => {
  test("memory stays within budget as distinct feeds accumulate", async () => {
    const persistDir = makeDir();
    const budget = createMemoryBudget(PAYLOAD_BYTES * 5);
    const load = vi.fn(async (u: string) => payload(u));
    const get = createFeedCache({ load, memoryBudget: budget, persistDir });

    await applyPressure(get, 0, 200);
    expect(budget.totalBytes()).toBeLessThanOrEqual(PAYLOAD_BYTES * 5);

    // feed/0 really left memory: with its disk copy gone too, it is refetched.
    clearDir(persistDir);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await get(url(0));
    expect(load).toHaveBeenCalledTimes(201);
  });

  test("one budget bounds several caches together", async () => {
    const budget = createMemoryBudget(PAYLOAD_BYTES * 4);
    const persistDir = makeDir();
    const first = createFeedCache({ load: async (u) => payload(u), memoryBudget: budget, persistDir });
    const second = createFeedCache({ load: async (u) => payload(u), memoryBudget: budget, persistDir });

    for (let i = 0; i < 50; i += 1) {
      await first(`https://a.example.org/${i}`);
      await second(`https://b.example.org/${i}`);
    }

    expect(budget.totalBytes()).toBeLessThanOrEqual(PAYLOAD_BYTES * 4);
  });

  test("an evicted entry is served from its fresh disk copy without refetching", async () => {
    const budget = createMemoryBudget(PAYLOAD_BYTES * 2);
    const load = vi.fn(async (u: string) => payload(u));
    const get = createFeedCache({ load, memoryBudget: budget, persistDir: makeDir() });

    await get(url(0));
    await applyPressure(get, 1, 5); // evicts feed/0
    const again = await get(url(0));

    expect(again).toEqual(payload(url(0)));
    expect(load).toHaveBeenCalledTimes(6);
  });

  test("an evicted stale entry still serves stale from disk while refreshing", async () => {
    let clock = Date.now();
    const budget = createMemoryBudget(PAYLOAD_BYTES * 2);
    let version = 1;
    const load = vi.fn(async (u: string) => payload(u, { version }));
    const get = createFeedCache({ load, ttlMs: 1000, now: () => clock, memoryBudget: budget, persistDir: makeDir() });

    await get(url(0));
    await applyPressure(get, 1, 5);
    clock += 10_000; // every disk copy is now stale
    version = 2;

    const stale = await get(url(0));
    expect(stale.version).toBe(1); // served immediately, not awaited on load
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(7));
  });

  test("caches a JSON round-tripped copy, not the loader's object", async () => {
    const loaded = { items: ["a"] };
    const get = createFeedCache({ load: async () => loaded, memoryBudget: createMemoryBudget(1e6) });

    const first = await get("https://example.org/x");
    const second = await get("https://example.org/x");

    expect(first).toEqual(loaded);
    expect(first).not.toBe(loaded); // raw-response substrings are not retained
    expect(second).toBe(first);
  });

  test("concurrent first fetches still share one in-flight load", async () => {
    const load = vi.fn(async (u: string) => payload(u));
    const get = createFeedCache({ load, memoryBudget: createMemoryBudget(1), persistDir: makeDir() });

    await Promise.all([get("https://example.org/x"), get("https://example.org/x")]);

    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("createFeedCache refresh coalescing under eviction", () => {
  async function evictDuringRefresh(persistDir: string | undefined, sweepDisk = false) {
    let clock = Date.now();
    const budget = createMemoryBudget(PAYLOAD_BYTES * 2);
    const pending = deferred<ReturnType<typeof payload>>();
    let loadsOfTarget = 0;
    const load = vi.fn(async (u: string) => {
      if (u !== url(0)) return payload(u);
      loadsOfTarget += 1;
      return loadsOfTarget === 1 ? payload(u, { version: 1 }) : pending.promise;
    });
    const get = createFeedCache({ load, ttlMs: 1000, now: () => clock, memoryBudget: budget, persistDir });

    await get(url(0));
    clock += 10_000; // feed/0 is stale everywhere
    expect((await get(url(0))).version).toBe(1); // starts the background refresh
    await applyPressure(get, 1, 5); // evicts feed/0 while its refresh is in flight
    if (sweepDisk && persistDir) clearDir(persistDir);
    // Not awaited yet: a miss that joins the in-flight refresh settles only
    // once that refresh does.
    const duringPromise = get(url(0));
    pending.resolve(payload(url(0), { version: 2 }));
    const during = await duringPromise;
    await vi.waitFor(async () => expect((await get(url(0))).version).toBe(2));
    return { during, loadsOfTarget };
  }

  test("with disk: a miss during the refresh joins it (exactly one refresh load)", async () => {
    const { during, loadsOfTarget } = await evictDuringRefresh(makeDir());
    expect(during.version).toBe(1);
    expect(loadsOfTarget).toBe(2); // initial + one refresh
  });

  test("with its disk copy swept: the blocking miss joins the in-flight refresh", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { during, loadsOfTarget } = await evictDuringRefresh(makeDir(), true);
    expect(during.version).toBe(2); // waited on the same refresh, not a new load
    expect(loadsOfTarget).toBe(2);
  });

  test("without disk: the entry is not evictable, so it is never reloaded twice", async () => {
    const { during, loadsOfTarget } = await evictDuringRefresh(undefined);
    expect(during.version).toBe(1);
    expect(loadsOfTarget).toBe(2);
  });

  test("concurrent misses after eviction coalesce into one load", async () => {
    const persistDir = makeDir();
    const load = vi.fn(async (u: string) => payload(u));
    const get = createFeedCache({ load, memoryBudget: createMemoryBudget(PAYLOAD_BYTES * 2), persistDir });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await get(url(0));
    await applyPressure(get, 1, 5);
    clearDir(persistDir); // disk sweep removed the evicted entry's copy
    await Promise.all([get(url(0)), get(url(0)), get(url(0))]);

    expect(load.mock.calls.filter(([u]) => u === url(0))).toHaveLength(2);
  });

  test("a synchronous throw from load does not wedge later refreshes", async () => {
    let shouldThrow = true;
    const load = vi.fn((u: string) => {
      if (shouldThrow) throw new Error("sync boom");
      return Promise.resolve(payload(u));
    });
    const get = createFeedCache({ load, memoryBudget: createMemoryBudget(1e6) });

    await expect(get(url(0))).rejects.toThrow("sync boom");
    shouldThrow = false;
    await expect(get(url(0))).resolves.toEqual(payload(url(0)));
  });
});

describe("createFeedCache last-known-good under eviction", () => {
  test("a failed refresh keeps the stale value and leaves accounting unchanged", async () => {
    let clock = Date.now();
    const budget = createMemoryBudget(PAYLOAD_BYTES * 10);
    let fail = false;
    const load = vi.fn(async (u: string) => {
      if (fail) throw new Error("HTTP 403");
      return payload(u);
    });
    const get = createFeedCache({ load, ttlMs: 1000, now: () => clock, memoryBudget: budget, persistDir: makeDir() });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await get(url(0));
    const before = budget.totalBytes();
    clock += 10_000;
    fail = true;

    expect(await get(url(0))).toEqual(payload(url(0)));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(budget.totalBytes()).toBe(before);
    expect(await get(url(0))).toEqual(payload(url(0)));
  });

  test("failed disk write + eviction pressure + failed fetch still serves the stale value", async () => {
    let clock = Date.now();
    const notADir = path.join(makeDir(), "file");
    writeFileSync(notADir, "x"); // mkdir under a file fails → every write fails
    const budget = createMemoryBudget(PAYLOAD_BYTES * 2);
    let fail = false;
    const load = vi.fn(async (u: string) => {
      if (fail) throw new Error("HTTP 403");
      return payload(u);
    });
    const get = createFeedCache({ load, ttlMs: 1000, now: () => clock, memoryBudget: budget, persistDir: notADir });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await get(url(0));
    await applyPressure(get, 1, 5); // unpersisted entries must not be evicted
    clock += 10_000;
    fail = true;

    await expect(get(url(0))).resolves.toEqual(payload(url(0)));
  });

  test("logs once per URL when an evicted entry has no disk copy", async () => {
    const persistDir = makeDir();
    const get = createFeedCache({
      load: async (u: string) => payload(u),
      memoryBudget: createMemoryBudget(PAYLOAD_BYTES * 2),
      persistDir,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let round = 0; round < 2; round += 1) {
      await get(url(0));
      await applyPressure(get, 1 + round * 10, 5);
      clearDir(persistDir);
      await get(url(0));
    }

    const missing = warn.mock.calls.filter(([message]) => String(message).includes("no disk copy"));
    expect(missing).toHaveLength(1);
  });
});

describe("createFeedCache oversized entries", () => {
  test("an entry larger than the whole budget is served from disk, not kept in memory", async () => {
    const budget = createMemoryBudget(PAYLOAD_BYTES * 3);
    const big = { items: "y".repeat(PAYLOAD_BYTES * 10) };
    const load = vi.fn(async (u: string) => (u.endsWith("big") ? big : payload(u)));
    const get = createFeedCache({ load, memoryBudget: budget, persistDir: makeDir() });

    await get(url(0)); // a small entry that must survive
    await get("https://example.org/big");
    const again = await get("https://example.org/big");

    expect(again).toEqual(big);
    expect(load).toHaveBeenCalledTimes(2); // second hit came from disk
    expect(budget.totalBytes()).toBe(PAYLOAD_BYTES); // small entry not flushed
  });
});

describe("createFeedCache heap", () => {
  test("heapUsed stays flat across many distinct URLs", async () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const persistDir = makeDir();
    const get = createFeedCache({
      load: async (u: string) => ({ u, items: Array.from({ length: 2000 }, (_, i) => `event-${i}-${u}`) }),
      memoryBudget: createMemoryBudget(1024 * 1024),
      persistDir,
    });

    await applyPressure(get, 0, 50);
    gc();
    const warm = process.memoryUsage().heapUsed;
    await applyPressure(get, 50, 400); // ~25 MB of values if all were retained
    gc();
    const grown = process.memoryUsage().heapUsed - warm;

    expect(grown).toBeLessThan(8 * 1024 * 1024);
  });
});
