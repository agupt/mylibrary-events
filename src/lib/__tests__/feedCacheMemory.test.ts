import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFeedCache } from "../events/feedCache";
import { createMemoryBudget, estimateSizeBytes } from "../events/feedCacheMemory";

const dirs: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "feedcache-mem-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const payload = (url: string) => ({ url, items: "x".repeat(1000) });
const PAYLOAD_BYTES = estimateSizeBytes(payload("https://example.org/feed/0"));

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

  test("keeps the entry just touched even when it alone exceeds the budget", () => {
    const budget = createMemoryBudget(10);
    const evict = vi.fn();
    budget.touch("big", 50, evict);

    expect(evict).not.toHaveBeenCalled();
    expect(budget.totalBytes()).toBe(50);
  });

  test("re-touching a key replaces its size instead of adding to it", () => {
    const budget = createMemoryBudget(1000);
    budget.touch("a", 40, () => {});
    budget.touch("a", 60, () => {});
    expect(budget.totalBytes()).toBe(60);
    budget.release("a");
    expect(budget.totalBytes()).toBe(0);
  });
});

describe("createFeedCache memory bound", () => {
  test("memory stays within budget as distinct feeds accumulate", async () => {
    const budget = createMemoryBudget(PAYLOAD_BYTES * 5);
    const load = vi.fn(async (url: string) => payload(url));
    const get = createFeedCache({ load, memoryBudget: budget });

    for (let i = 0; i < 200; i += 1) await get(`https://example.org/feed/${i}`);
    expect(budget.totalBytes()).toBeLessThanOrEqual(PAYLOAD_BYTES * 5);

    // The oldest feed really left memory (no disk here): it is refetched,
    // where the old cache kept all 200 values alive forever.
    await get("https://example.org/feed/0");
    expect(load).toHaveBeenCalledTimes(201);
  });

  test("one budget bounds several caches together", async () => {
    const budget = createMemoryBudget(PAYLOAD_BYTES * 4);
    const first = createFeedCache({ load: async (url) => payload(url), memoryBudget: budget });
    const second = createFeedCache({ load: async (url) => payload(url), memoryBudget: budget });

    for (let i = 0; i < 50; i += 1) {
      await first(`https://a.example.org/${i}`);
      await second(`https://b.example.org/${i}`);
    }

    expect(budget.totalBytes()).toBeLessThanOrEqual(PAYLOAD_BYTES * 4);
  });

  test("an evicted entry is served from its fresh disk copy without refetching", async () => {
    const budget = createMemoryBudget(PAYLOAD_BYTES * 2);
    const load = vi.fn(async (url: string) => payload(url));
    const get = createFeedCache({ load, memoryBudget: budget, persistDir: makeDir() });

    await get("https://example.org/feed/0");
    for (let i = 1; i <= 5; i += 1) await get(`https://example.org/feed/${i}`); // evicts feed/0
    const again = await get("https://example.org/feed/0");

    expect(again).toEqual(payload("https://example.org/feed/0"));
    expect(load).toHaveBeenCalledTimes(6);
  });

  test("an evicted stale entry still serves stale from disk while refreshing", async () => {
    let clock = 0;
    const budget = createMemoryBudget(PAYLOAD_BYTES * 2);
    let version = 1;
    const load = vi.fn(async (url: string) => ({ ...payload(url), version }));
    const get = createFeedCache({
      load,
      ttlMs: 1000,
      now: () => clock,
      memoryBudget: budget,
      persistDir: makeDir(),
    });

    await get("https://example.org/feed/0");
    for (let i = 1; i <= 5; i += 1) await get(`https://example.org/feed/${i}`);
    // Disk mtime is wall-clock, so make every disk copy "stale" via the clock.
    clock = Date.now() + 10_000;
    version = 2;

    const stale = await get("https://example.org/feed/0");
    expect(stale.version).toBe(1); // served immediately, not awaited on load
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(7));
  });

  test("concurrent first fetches still share one in-flight load", async () => {
    const budget = createMemoryBudget(1); // everything settled is over budget
    const load = vi.fn(async (url: string) => payload(url));
    const get = createFeedCache({ load, memoryBudget: budget });

    await Promise.all([get("https://example.org/x"), get("https://example.org/x")]);

    expect(load).toHaveBeenCalledTimes(1);
  });
});
