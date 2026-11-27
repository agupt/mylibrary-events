import { describe, expect, test } from "vitest";
import {
  assembleSnapshot,
  backfillRunDates,
  backfillSnapshot,
  demandSystemsFrom,
  errorSignalIds,
  latestBlockBefore,
  normalizeBlock,
  withIndexedShareEstimate,
} from "../lib/assemble.mjs";
import { SIGNAL_IDS, validateSnapshot } from "../lib/snapshotSchema.mjs";
import { f4, makeSnapshot, s1 } from "./helpers/snapshots.mjs";

const GENERATED_AT = "2026-11-30T11:23:00.000Z";

describe("normalizeBlock", () => {
  test("passes a valid block through", () => {
    expect(normalizeBlock("S1", s1(10))).toEqual(s1(10));
  });

  test("turns an invalid block into an error block naming the problem", () => {
    const block = normalizeBlock("S1", { status: "ok", pageviews: 3 });
    expect(block.status).toBe("error");
    expect(block.error).toMatch(/invalid S1 block/);
  });

  test("a missing block is an error, never silently absent", () => {
    expect(normalizeBlock("S8", undefined)).toEqual({ status: "error", error: "no source produced S8" });
  });

  test("S11 is always not-applicable", () => {
    expect(normalizeBlock("S11", undefined)).toEqual({ status: "not-applicable" });
  });
});

describe("assembleSnapshot", () => {
  test("builds a schema-valid snapshot with every signal block", () => {
    const snapshot = assembleSnapshot({ date: "2026-11-30", generatedAt: GENERATED_AT, blocks: { S1: s1(5) } });
    expect(validateSnapshot(snapshot).success).toBe(true);
    expect(Object.keys(snapshot)).toEqual(expect.arrayContaining(SIGNAL_IDS));
    expect(snapshot.S1).toEqual(s1(5));
    expect(snapshot.S2.status).toBe("error");
    expect(snapshot.backfill).toBeUndefined();
  });

  test("drops keys that are not signal IDs", () => {
    const snapshot = assembleSnapshot({ date: "2026-11-30", generatedAt: GENERATED_AT, blocks: { X9: { a: 1 } } });
    expect(snapshot.X9).toBeUndefined();
  });

  test("errorSignalIds lists blocks reading error", () => {
    const snapshot = assembleSnapshot({ date: "2026-11-30", generatedAt: GENERATED_AT, blocks: {} });
    expect(errorSignalIds(snapshot)).toEqual(SIGNAL_IDS.filter((id) => id !== "S11"));
  });
});

describe("withIndexedShareEstimate (weekly F4)", () => {
  const history = [
    makeSnapshot("2026-11-23", { F4: f4(100, 100) }), // 7 days before: outside the window
    makeSnapshot("2026-11-25", { F4: f4(100, 60) }),
    makeSnapshot("2026-11-28", { F4: { status: "error", error: "quota" } }),
  ];

  test("pools today plus the prior 6 days of daily samples", () => {
    const block = withIndexedShareEstimate(f4(100, 80), history, "2026-11-30");
    expect(block.indexedShareEstimate.value).toBe(0.7);
    expect(block.indexedShareEstimate.ci95.low).toBeLessThan(0.7);
    expect(block.indexedShareEstimate.ci95.high).toBeGreaterThan(0.7);
  });

  test("leaves a non-data F4 block untouched", () => {
    const error = { status: "error", error: "boom" };
    expect(withIndexedShareEstimate(error, history, "2026-11-30")).toEqual(error);
  });

  test("adds nothing when nothing was sampled", () => {
    const empty = { status: "zero-rows", sampled: 0, indexedByType: {}, coverageStates: {} };
    expect(withIndexedShareEstimate(empty, [], "2026-11-30").indexedShareEstimate).toBeUndefined();
  });
});

describe("demandSystemsFrom", () => {
  test("collects S4 systems seen in the 7 days before the run date", () => {
    const history = [
      makeSnapshot("2026-11-22", { S4: { status: "ok", zeroEventBySystem: [{ system: "TX0001", count: 1 }] } }),
      makeSnapshot("2026-11-25", { S4: { status: "ok", zeroEventBySystem: [{ system: "CA0114", count: 2 }] } }),
      makeSnapshot("2026-11-29", {
        S4: { status: "ok", zeroEventBySystem: [{ system: "CA0114", count: 1 }, { system: "NY0004", count: 1 }] },
      }),
      makeSnapshot("2026-11-30", { S4: { status: "ok", zeroEventBySystem: [{ system: "WA0001", count: 1 }] } }),
    ];
    expect(demandSystemsFrom(history, "2026-11-30")).toEqual(["CA0114", "NY0004"]);
  });
});

describe("latestBlockBefore", () => {
  test("returns the newest earlier snapshot's block, or null", () => {
    const history = [
      makeSnapshot("2026-11-28", { S1: s1(1) }),
      makeSnapshot("2026-11-29", { S1: s1(2) }),
      makeSnapshot("2026-11-30", { S1: s1(3) }),
    ];
    expect(latestBlockBefore(history, "2026-11-30", "S1")).toEqual(s1(2));
    expect(latestBlockBefore(history, "2026-11-28", "S1")).toBeNull();
  });
});

describe("backfill", () => {
  test("run dates are data date + 3, up to the day before the run date", () => {
    // Run 2026-11-05 collects data date 11-02; backfill covers 10-30, 10-31, 11-01.
    expect(backfillRunDates("2026-10-30", "2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(backfillRunDates("2026-11-03", "2026-11-05")).toEqual([]);
  });

  test("rejects a bad start date", () => {
    expect(() => backfillRunDates("2026-13-01", "2026-11-05")).toThrow(/ISO date/);
  });

  test("a backfill snapshot holds F1 only and is marked backfill", () => {
    const F1 = {
      status: "ok",
      dataDate: "2026-10-30",
      clicks: 100,
      impressions: 4000,
      ctr: 0.025,
      position: 9.1,
      byPageGroup: {},
    };
    const snapshot = backfillSnapshot({ runDate: "2026-11-02", generatedAt: GENERATED_AT, F1 });
    expect(validateSnapshot(snapshot).success).toBe(true);
    expect(snapshot.backfill).toBe(true);
    expect(snapshot.F1).toEqual(F1);
    expect(snapshot.S1).toEqual({ status: "not-due" });
    expect(snapshot.S11).toEqual({ status: "not-applicable" });
  });
});
