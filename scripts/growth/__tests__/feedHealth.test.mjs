import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import {
  activeSystemsFrom,
  collectS13,
  collectS5,
  loadPageManifest,
  parseAnalysisResponse,
  probeSystems,
  validateManifest,
} from "../sources/feedHealth.mjs";

const fixture = (name) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/analysis", name), "utf8"));

const response = (status, body) => ({ status, json: async () => body });
const noSleep = async () => {};
const fast = { sleep: noSleep, pauseMs: () => 0 };

describe("parseAnalysisResponse (recorded /analysis responses)", () => {
  const ids = { system: "CA0114", outlet: "CA0114-002" };

  test("active + reachable → eventCount30d from the probe", () => {
    expect(parseAnalysisResponse({ ...ids, httpStatus: 200, body: fixture("active-ok.json") })).toEqual({
      ...ids,
      feedReachable: true,
      httpStatus: 200,
      eventCount30d: 14,
    });
  });

  test("blocked feed → unreachable with the feed status; count null, not 0", () => {
    const row = parseAnalysisResponse({
      system: "PA0385",
      outlet: "PA0385-002",
      httpStatus: 200,
      body: fixture("feed-blocked.json"),
    });
    expect(row).toMatchObject({ feedReachable: false, httpStatus: 403, eventCount30d: null });
    expect(row.error).toBe("feed unreachable (HTTP 403)");
  });

  test("probe error, inactive system, 404 and malformed bodies are failures", () => {
    const probeError = parseAnalysisResponse({ ...ids, httpStatus: 200, body: fixture("probe-error.json") });
    expect(probeError).toMatchObject({ feedReachable: true, eventCount30d: null, error: "feed probe failed" });

    const inactive = parseAnalysisResponse({ ...ids, httpStatus: 200, body: fixture("not-active.json") });
    expect(inactive.error).toBe("system not active in the deployed registry");

    const notFound = parseAnalysisResponse({ ...ids, httpStatus: 404, body: fixture("not-found.json") });
    expect(notFound).toMatchObject({ feedReachable: null, httpStatus: null, error: "analysis HTTP 404" });

    const noStatus = parseAnalysisResponse({
      ...ids,
      httpStatus: 200,
      body: { success: true, data: { coverage: { status: "active" }, probe: { feedReachable: false, feedHttpStatus: null } } },
    });
    expect(noStatus.error).toBe("feed unreachable");
    expect(parseAnalysisResponse({ ...ids, httpStatus: 200, body: null }).error).toBe("analysis HTTP 200");
  });
});

describe("activeSystemsFrom", () => {
  test("active registry systems with their main outlet; others skipped", () => {
    const registry = {
      CA0114: { status: "active" },
      AK0094: { status: "active" },
      NY0562: { status: "detected" },
      TX0120: { status: "active" }, // no outlets in the directory
      bad: { status: "active" },
    };
    const libraries = [
      { id: "CA0114-005" },
      { id: "CA0114-002" },
      { id: "AK0094-004" },
      { id: "AK0094-003" },
      { id: "NY0562-002" },
      { id: "garbage" },
      null,
    ];
    expect(activeSystemsFrom(registry, libraries)).toEqual([
      { system: "AK0094", outlet: "AK0094-003" },
      { system: "CA0114", outlet: "CA0114-002" },
    ]);
    expect(activeSystemsFrom(null, null)).toEqual([]);
  });
});

describe("probeSystems", () => {
  const targets = ["CA0001", "CA0002", "CA0003"].map((system) => ({ system, outlet: `${system}-002` }));

  test("uses a per-day cache-buster, a non-browser UA, and keeps order", async () => {
    const fetch = vi.fn(async () => response(200, fixture("active-ok.json")));
    const { probes, breakerOpen } = await probeSystems(targets, {
      baseUrl: "https://example.test",
      date: "2026-11-27",
      fetch,
      ...fast,
    });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://example.test/api/libraries/CA0001-002/analysis?observer=2026-11-27",
    );
    expect(fetch.mock.calls[0][1].headers["user-agent"]).toMatch(/growth-observer/);
    expect(probes.map((p) => p.system)).toEqual(["CA0001", "CA0002", "CA0003"]);
    expect(breakerOpen).toBe(false);
  });

  test("never more than 2 in flight by default, with pauses between requests", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return response(200, fixture("active-ok.json"));
    });
    const sleep = vi.fn(noSleep);
    const many = Array.from({ length: 8 }, (_, i) => ({ system: `CA000${i}`, outlet: `CA000${i}-002` }));
    await probeSystems(many, { date: "2026-11-27", fetch, sleep, pauseMs: () => 5 });
    expect(peak).toBe(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  test("circuit breaker: 5 consecutive 403s stop probing; the rest are skipped errors", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ system: `CA000${i}`, outlet: `CA000${i}-002` }));
    const fetch = vi.fn(async () => response(200, fixture("feed-blocked.json")));
    const { probes, breakerOpen } = await probeSystems(many, {
      date: "2026-11-27",
      fetch,
      concurrency: 1,
      ...fast,
    });
    expect(breakerOpen).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(probes.slice(5).every((p) => p.error === "skipped: circuit breaker open")).toBe(true);
    expect(probes).toHaveLength(9);
  });

  test("a thrown fetch or non-JSON body becomes a failed row, never a throw", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("The operation was aborted due to timeout"))
      .mockResolvedValueOnce({ status: 502, json: async () => { throw new SyntaxError("bad json"); } });
    const { probes } = await probeSystems(targets.slice(0, 2), {
      date: "2026-11-27",
      fetch,
      concurrency: 1,
      ...fast,
    });
    expect(probes[0].error).toBe("The operation was aborted due to timeout");
    expect(probes[1].error).toBe("analysis HTTP 502");
  });
});

describe("collectS5", () => {
  const activeSystems = Array.from({ length: 70 }, (_, i) => {
    const system = `CA${String(i).padStart(4, "0")}`;
    return { system, outlet: `${system}-002` };
  });

  test("probes today's set and returns a schema-valid block", async () => {
    const fetch = vi.fn(async () => response(200, fixture("active-ok.json")));
    const block = await collectS5({
      date: "2026-11-27",
      activeSystems,
      demandSystems: ["CA0069", "not-an-id"],
      previousS5: { status: "ok", probes: [{ system: "CA0068", feedReachable: false }] },
      fetch,
      ...fast,
    });
    expect(block.status).toBe("ok");
    expect(block.activeTotal).toBe(70);
    expect(block.probed).toBe(block.probes.length);
    expect(block.probes.map((p) => p.system)).toEqual(expect.arrayContaining(["CA0068", "CA0069"]));
    expect(signalSchemas.S5.safeParse(block).success).toBe(true);
  });

  test("failure to load the active set → error block", async () => {
    const block = await collectS5({ date: "2026-11-27", cwd: "/nonexistent-dir", fetch: vi.fn() });
    expect(block.status).toBe("error");
    expect(signalSchemas.S5.safeParse(block).success).toBe(true);
  });

  test("a bad date → error block", async () => {
    const block = await collectS5({ date: "yesterday", activeSystems, fetch: vi.fn() });
    expect(block.status).toBe("error");
  });
});

describe("S13 manifest + collectS13", () => {
  const manifest = [
    { path: "/library/ca/a/main", type: "library", systems: ["CA0001"] },
    { path: "/storytimes/ca/a", type: "city", systems: ["CA0001", "CA0002"] },
  ];

  test("validateManifest rejects empty or malformed output", () => {
    expect(validateManifest(manifest)).toBe(manifest);
    expect(() => validateManifest([])).toThrow(/empty/);
    expect(() => validateManifest({})).toThrow(/empty/);
    expect(() => validateManifest([{ path: "x", type: "library", systems: ["CA0001"] }])).toThrow(/malformed/);
    expect(() => validateManifest([{ path: "/x", type: "state", systems: ["CA0001"] }])).toThrow(/malformed/);
    expect(() => validateManifest([{ path: "/x", type: "city", systems: [] }])).toThrow(/malformed/);
  });

  test("loadPageManifest runs pageManifest.ts with tsx and validates stdout", async () => {
    const execFile = vi.fn(async () => ({ stdout: JSON.stringify(manifest) }));
    const result = await loadPageManifest({ cwd: "/repo", execFile });
    expect(result).toEqual(manifest);
    const [bin, args, opts] = execFile.mock.calls[0];
    expect(bin).toBe("/repo/node_modules/.bin/tsx");
    expect(args).toEqual(["/repo/scripts/growth/sources/pageManifest.ts"]);
    expect(opts.cwd).toBe("/repo");
  });

  test("joins the manifest with probe history", async () => {
    const block = await collectS13({
      date: "2026-11-27",
      snapshots: [{ date: "2026-11-27", S5: { status: "ok", probes: [{ system: "CA0001", eventCount30d: 0 }] } }],
      loadManifest: async () => manifest,
    });
    expect(block).toEqual({
      status: "ok",
      pages: 2,
      zeroEventPages: 1,
      zeroEventShare: 1,
      indexedZeroEventShare: null,
      unprobedPages: 1,
    });
    expect(signalSchemas.S13.safeParse(block).success).toBe(true);
  });

  test("a manifest failure → error block", async () => {
    const block = await collectS13({
      date: "2026-11-27",
      snapshots: [],
      loadManifest: async () => { throw new Error("tsx exited 1"); },
    });
    expect(block).toEqual({ status: "error", error: "tsx exited 1" });
  });
});
