import { describe, expect, test } from "vitest";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { classifyPage, computeThinPages, latestCountsBySystem } from "../lib/thinPages.mjs";

const probe = (system, eventCount30d, extra = {}) => ({
  system,
  outlet: `${system}-002`,
  feedReachable: eventCount30d !== null,
  httpStatus: 200,
  eventCount30d,
  ...extra,
});

const snapshot = (date, probes) => ({ date, S5: { status: "ok", probes } });

describe("latestCountsBySystem", () => {
  test("latest date wins regardless of input order", () => {
    const counts = latestCountsBySystem(
      [snapshot("2026-11-26", [probe("CA0114", 5)]), snapshot("2026-11-20", [probe("CA0114", 40)])],
      { today: "2026-11-27" },
    );
    expect(counts.get("CA0114")).toEqual({ eventCount30d: 5, date: "2026-11-26" });
  });

  test("a failed probe never erases an earlier good reading", () => {
    const counts = latestCountsBySystem(
      [
        snapshot("2026-11-20", [probe("PA0385", 12)]),
        snapshot("2026-11-27", [probe("PA0385", null, { error: "feed unreachable" })]),
      ],
      { today: "2026-11-27" },
    );
    expect(counts.get("PA0385").eventCount30d).toBe(12);
  });

  test("readings older than 14 days are stale; malformed snapshots are skipped", () => {
    const counts = latestCountsBySystem(
      [
        snapshot("2026-11-01", [probe("TX0120", 9)]),
        { date: "2026-11-25", S5: { status: "error", error: "x" } },
        { S5: { probes: [probe("NY0004", 3)] } },
        null,
      ],
      { today: "2026-11-27" },
    );
    expect(counts.size).toBe(0);
  });
});

describe("classifyPage", () => {
  const counts = new Map([
    ["CA0001", { eventCount30d: 0 }],
    ["CA0002", { eventCount30d: 7 }],
  ]);
  test("library pages follow their system", () => {
    expect(classifyPage({ systems: ["CA0001"] }, counts)).toBe("zero");
    expect(classifyPage({ systems: ["CA0002"] }, counts)).toBe("nonzero");
    expect(classifyPage({ systems: ["CA0003"] }, counts)).toBe("unknown");
  });
  test("city pages: any events → nonzero; all known 0 → zero; else unknown", () => {
    expect(classifyPage({ systems: ["CA0001", "CA0002"] }, counts)).toBe("nonzero");
    expect(classifyPage({ systems: ["CA0001", "CA0003"] }, counts)).toBe("unknown");
    expect(classifyPage({ systems: ["CA0002", "CA0003"] }, counts)).toBe("nonzero");
  });
});

describe("computeThinPages", () => {
  const manifest = [
    { path: "/library/ca/a/main", type: "library", systems: ["CA0001"] },
    { path: "/library/ca/b/main", type: "library", systems: ["CA0002"] },
    { path: "/library/ca/c/main", type: "library", systems: ["CA0003"] },
    { path: "/library/ca/c/branch", type: "library", systems: ["CA0003"] },
    { path: "/storytimes/ca/a", type: "city", systems: ["CA0001"] },
  ];
  const counts = new Map([
    ["CA0001", { eventCount30d: 0 }],
    ["CA0002", { eventCount30d: 7 }],
  ]);

  test("unprobed pages are unknown, not 0: the share is over probed pages", () => {
    const block = computeThinPages(manifest, counts);
    expect(block).toEqual({
      status: "ok",
      pages: 5,
      zeroEventPages: 2,
      zeroEventShare: 2 / 3,
      indexedZeroEventShare: null,
      unprobedPages: 2,
    });
    expect(signalSchemas.S13.safeParse(block).success).toBe(true);
  });

  test("nothing probed → null share (never 0)", () => {
    const block = computeThinPages(manifest, new Map());
    expect(block.zeroEventShare).toBeNull();
    expect(block.zeroEventPages).toBe(0);
    expect(block.unprobedPages).toBe(5);
    expect(signalSchemas.S13.safeParse(block).success).toBe(true);
  });

  test("indexed share uses only the indexed paths that were probed", () => {
    const indexedPaths = new Set(["/library/ca/a/main", "/library/ca/b/main", "/library/ca/c/main"]);
    expect(computeThinPages(manifest, counts, { indexedPaths }).indexedZeroEventShare).toBe(0.5);
    expect(computeThinPages(manifest, counts, { indexedPaths: new Set() }).indexedZeroEventShare).toBeNull();
  });
});
