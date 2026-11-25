import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFeedCache } from "../events/feedCache";

const dirs: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "feedcache-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("createFeedCache disk persistence", () => {
  test("a fresh disk copy substitutes for a fetch on cold start", async () => {
    const persistDir = makeDir();
    const load = vi.fn(async () => ({ items: [1, 2, 3] }));

    const warm = createFeedCache({ load, persistDir });
    await warm("https://example.org/feed");
    expect(load).toHaveBeenCalledTimes(1);

    // Simulate a restart: new cache instance, same disk
    const cold = createFeedCache({ load, persistDir });
    const value = await cold("https://example.org/feed");
    expect(value).toEqual({ items: [1, 2, 3] });
    expect(load).toHaveBeenCalledTimes(1); // no refetch
  });

  test("serves the stale disk copy when the live fetch fails", async () => {
    const persistDir = makeDir();
    let fail = false;
    const load = vi.fn(async () => {
      if (fail) throw new Error("vendor down");
      return { items: ["good"] };
    });
    // ttl 0 forces a refetch on every call
    const cache = createFeedCache({ load, persistDir, ttlMs: 0 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await cache("https://example.org/feed");
    fail = true;
    const value = await cache("https://example.org/feed");

    expect(value).toEqual({ items: ["good"] });
    warnSpy.mockRestore();
  });

  test("still throws when there is no disk copy to fall back to", async () => {
    const cache = createFeedCache({
      load: async () => {
        throw new Error("down");
      },
      persistDir: makeDir(),
    });
    await expect(cache("https://example.org/never-fetched")).rejects.toThrow("down");
  });
});

describe("createFeedCache disk integrity", () => {
  test("treats a 0-byte or corrupt disk entry as a miss and refetches", async () => {
    const persistDir = makeDir();
    const load = vi.fn(async () => ({ items: ["fresh"] }));
    await createFeedCache({ load, persistDir })("https://example.org/feed");
    const [entry] = readdirSync(persistDir);
    writeFileSync(path.join(persistDir, entry), "");

    const value = await createFeedCache({ load, persistDir })("https://example.org/feed");

    expect(value).toEqual({ items: ["fresh"] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  test("writes atomically: no temp files are left behind after a write", async () => {
    const persistDir = makeDir();
    await createFeedCache({ load: async () => ({ ok: true }), persistDir })("https://example.org/a");
    const files = readdirSync(persistDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{24}\.json$/);
  });

  test("a failed write leaves no partial file and does not throw", async () => {
    const persistDir = makeDir();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // BigInt is not JSON-serializable, so the write fails before rename
    const cache = createFeedCache({ load: async () => ({ n: BigInt(1) }), persistDir });
    await expect(cache("https://example.org/b")).resolves.toEqual({ n: BigInt(1) });
    expect(readdirSync(persistDir)).toEqual([]);
    warn.mockRestore();
  });
});
