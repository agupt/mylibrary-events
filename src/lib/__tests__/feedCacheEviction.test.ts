import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createEvictionScheduler,
  evictFeedCacheDir,
  planEviction,
  type CacheFileInfo,
} from "../events/feedCacheEviction";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 24);

const file = (name: string, ageMs: number, sizeBytes = 100): CacheFileInfo => ({
  name,
  mtimeMs: NOW - ageMs,
  sizeBytes,
});

const policy = { now: NOW, maxAgeMs: 7 * DAY_MS, maxTotalBytes: 1_000, tmpMaxAgeMs: 60 * 60 * 1000 };

describe("planEviction", () => {
  test("deletes cache entries older than the max age", () => {
    const files = [file("old.json", 8 * DAY_MS), file("new.json", 1 * DAY_MS)];
    expect(planEviction(files, policy)).toEqual(["old.json"]);
  });

  test("deletes 0-byte entries regardless of age (truncated writes)", () => {
    const files = [file("empty.json", 1000, 0), file("ok.json", 1000)];
    expect(planEviction(files, policy)).toEqual(["empty.json"]);
  });

  test("deletes orphaned temp files only once they are older than the temp max age", () => {
    const files = [
      file("a.json.123.tmp", 2 * 60 * 60 * 1000, 0),
      file("b.json.456.tmp", 1000, 0), // an in-flight write: keep
    ];
    expect(planEviction(files, policy)).toEqual(["a.json.123.tmp"]);
  });

  test("enforces the total size cap by deleting the oldest entries first", () => {
    const files = [
      file("newest.json", 1 * DAY_MS, 400),
      file("oldest.json", 3 * DAY_MS, 400),
      file("middle.json", 2 * DAY_MS, 400),
    ];
    // 1200 bytes > 1000 cap: dropping the oldest (400) brings it to 800
    expect(planEviction(files, policy)).toEqual(["oldest.json"]);
  });

  test("size cap counts only the survivors of age eviction", () => {
    const files = [file("ancient.json", 30 * DAY_MS, 900), file("fresh.json", 1000, 900)];
    expect(planEviction(files, policy)).toEqual(["ancient.json"]);
  });

  test("ignores files that are not cache entries or temp files", () => {
    const files = [file("README", 30 * DAY_MS), file("keep.json", 1000)];
    expect(planEviction(files, policy)).toEqual([]);
  });

  test("returns nothing when everything is fresh and under the cap", () => {
    expect(planEviction([file("a.json", 1000), file("b.json", 2000)], policy)).toEqual([]);
  });

  test("plans a large over-cap directory quickly (no quadratic blowup)", () => {
    const files = Array.from({ length: 50_000 }, (_, i) => file(`${i}.json`, i * 1000, 100));
    const started = performance.now();
    const plan = planEviction(files, { ...policy, maxTotalBytes: 100 });
    expect(plan).toHaveLength(49_999);
    expect(plan[0]).toBe("49999.json"); // oldest first
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("does not mutate its input", () => {
    const files = Object.freeze([file("b.json", 2 * DAY_MS, 600), file("a.json", 1 * DAY_MS, 600)]);
    planEviction(files, policy);
    expect(files.map((f) => f.name)).toEqual(["b.json", "a.json"]);
  });
});

const dirs: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "feedevict-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const writeAged = (dir: string, name: string, ageMs: number, content = "{}") => {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content);
  const seconds = (Date.now() - ageMs) / 1000;
  utimesSync(filePath, seconds, seconds);
};

describe("evictFeedCacheDir", () => {
  test("deletes stale and empty entries from disk and reports what it did", async () => {
    const dir = makeDir();
    writeAged(dir, "old.json", 8 * DAY_MS);
    writeAged(dir, "empty.json", 1000, "");
    writeAged(dir, "fresh.json", 1000);

    const result = await evictFeedCacheDir(dir);

    expect(readdirSync(dir)).toEqual(["fresh.json"]);
    expect(result).toMatchObject({ scanned: 3, deleted: 2 });
    expect(result.freedBytes).toBe(2); // "{}" + ""
  });

  test("a missing directory is a no-op, not an error", async () => {
    const result = await evictFeedCacheDir(path.join(makeDir(), "nope"));
    expect(result).toEqual({ scanned: 0, deleted: 0, freedBytes: 0 });
  });

  test("skips files that vanish between listing and deletion", async () => {
    const dir = makeDir();
    writeAged(dir, "old.json", 8 * DAY_MS);
    const unlink = vi.fn(async () => {
      throw Object.assign(new Error("gone"), { code: "ENOENT" });
    });
    const result = await evictFeedCacheDir(dir, { unlink });
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(result.deleted).toBe(0);
  });

  test("one failing unlink does not discard the rest of the sweep", async () => {
    const dir = makeDir();
    writeAged(dir, "a.json", 8 * DAY_MS);
    writeAged(dir, "b.json", 8 * DAY_MS);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unlink = vi.fn(async (filePath: string) => {
      if (filePath.endsWith("a.json")) throw Object.assign(new Error("perm"), { code: "EPERM" });
    });
    const result = await evictFeedCacheDir(dir, { unlink });
    expect(result.deleted).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("createEvictionScheduler", () => {
  test("runs on the first trigger, then at most once per interval", async () => {
    let clock = 0;
    const run = vi.fn(async () => {});
    const schedule = createEvictionScheduler({ run, intervalMs: 1000, now: () => clock });

    schedule();
    schedule();
    clock = 999;
    schedule();
    expect(run).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setImmediate(resolve)); // let the first run settle
    clock = 1000;
    schedule();
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("never throws when the run fails; logs a warning instead", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const schedule = createEvictionScheduler({
      run: async () => {
        throw new Error("disk exploded");
      },
      intervalMs: 1000,
      now: () => 0,
    });

    expect(() => schedule()).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  test("retries after retryMs (not a full interval) when a run fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let clock = 0;
    const run = vi.fn(async () => {
      throw new Error("EIO");
    });
    const schedule = createEvictionScheduler({ run, intervalMs: 1000, retryMs: 100, now: () => clock });

    schedule();
    await new Promise((resolve) => setImmediate(resolve));
    clock = 99;
    schedule();
    expect(run).toHaveBeenCalledTimes(1);
    clock = 100;
    schedule();
    expect(run).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test("does not overlap runs while one is still in flight", async () => {
    let clock = 0;
    let release: () => void = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const schedule = createEvictionScheduler({ run, intervalMs: 10, now: () => clock });

    schedule();
    clock = 100;
    schedule();
    expect(run).toHaveBeenCalledTimes(1);
    release();
  });
});
