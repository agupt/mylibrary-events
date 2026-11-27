import { describe, expect, test } from "vitest";
import {
  CLEAN_TARGET_DAYS,
  cleanDayStreak,
  falsePositiveStats,
  metricStats,
  percentile,
  statusTally,
} from "../lib/baselineStats.mjs";
import { makeSnapshot, s1 } from "./helpers/snapshots.mjs";

const days = (from, n) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

describe("cleanDayStreak", () => {
  test("counts consecutive error-free daily snapshots ending today", () => {
    const history = days("2026-11-20", 5).map((d) => makeSnapshot(d));
    expect(cleanDayStreak(history, "2026-11-24")).toEqual({ days: 5, target: CLEAN_TARGET_DAYS, brokenBy: null });
  });

  test("an error breaks the streak and names the signals", () => {
    const history = [
      makeSnapshot("2026-11-22"),
      makeSnapshot("2026-11-23", { S5: { status: "error", error: "x" }, F4: { status: "error", error: "y" } }),
      makeSnapshot("2026-11-24"),
    ];
    expect(cleanDayStreak(history, "2026-11-24")).toEqual({
      days: 1,
      target: CLEAN_TARGET_DAYS,
      brokenBy: { date: "2026-11-23", reason: "error: S5, F4" },
    });
  });

  test("a missing day and a backfill day both break the streak", () => {
    const gap = [makeSnapshot("2026-11-22"), makeSnapshot("2026-11-24")];
    expect(cleanDayStreak(gap, "2026-11-24").brokenBy).toEqual({ date: "2026-11-23", reason: "no snapshot" });
    const backfilled = [{ ...makeSnapshot("2026-11-23"), backfill: true }, makeSnapshot("2026-11-24")];
    expect(cleanDayStreak(backfilled, "2026-11-24")).toMatchObject({
      days: 1,
      brokenBy: { date: "2026-11-23", reason: "backfill only" },
    });
  });

  test("an empty history has no streak", () => {
    expect(cleanDayStreak([], "2026-11-24")).toMatchObject({ days: 0, brokenBy: { reason: "no snapshot" } });
  });
});

describe("statusTally", () => {
  test("counts each signal's statuses over the window", () => {
    const history = [
      makeSnapshot("2026-11-20", { S1: s1(1) }), // outside
      makeSnapshot("2026-11-23", { S1: s1(1) }),
      makeSnapshot("2026-11-24", { S1: { status: "error", error: "x" } }),
    ];
    const tally = statusTally(history, { from: "2026-11-21", to: "2026-11-24" });
    expect(tally.S1).toEqual({ ok: 1, error: 1 });
    expect(tally.S2).toEqual({ "not-configured": 2 });
  });
});

describe("percentile", () => {
  test("interpolates linearly and returns null for no data", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 0, 20], 0.95)).toBeCloseTo(19);
  });
});

describe("metricStats", () => {
  const config = {
    signals: [
      { id: "S1", name: "Traffic", status: "draft", metric: "S1.pageviews" },
      { id: "S2", trigger: "ratio", name: "Search", status: "draft", metric: ["S2.byOutcome.ambiguous", "S2.byOutcome.not-found"], denominator: "S2.searches" },
      { id: "S3", name: "Miss", status: "draft", metric: "S3.missesBySystem", per: "system" },
      { id: "F7", name: "AI referrals", status: "disabled" },
    ],
  };
  const s2 = (searches, ambiguous, notFound) => ({
    status: "ok",
    searches,
    byKind: { zip: searches, city: 0 },
    byOutcome: { ok: searches - ambiguous - notFound, ambiguous, "not-found": notFound, error: 0 },
  });
  const history = [
    makeSnapshot("2026-11-22", { S1: s1(100), S2: s2(10, 1, 1) }),
    makeSnapshot("2026-11-23", { S1: s1(200), S2: s2(0, 0, 0) }),
    makeSnapshot("2026-11-24", { S1: { status: "error", error: "x" }, S2: s2(4, 1, 0) }),
  ];

  test("p50/p95 per global metric over the data days in the window", () => {
    const stats = metricStats(config, history, "2026-11-24", 14);
    const traffic = stats.find((s) => s.signalId === "S1");
    expect(traffic).toMatchObject({ metric: "S1.pageviews", n: 2, p50: 150, p95: 195 });
    const ratio = stats.find((s) => s.signalId === "S2");
    // 0/0 is not a reading; 2/10 and 1/4.
    expect(ratio).toMatchObject({ n: 2, p50: 0.225 });
  });

  test("per-key and inactive entries are listed without numbers", () => {
    const stats = metricStats(config, history, "2026-11-24", 14);
    expect(stats.find((s) => s.signalId === "S3")).toMatchObject({ n: 0, p50: null, note: "per-key: see snapshots" });
    expect(stats.find((s) => s.signalId === "F7")).toBeUndefined();
  });
});

describe("falsePositiveStats", () => {
  test("counts judged closed signal issues and needs >= 4 judged for a rate", () => {
    const issue = (...labels) => ({ labels: labels.map((name) => ({ name })) });
    const few = falsePositiveStats([issue("signal", "signal-valid"), issue("signal", "false-positive"), issue("signal")]);
    expect(few).toEqual({ valid: 1, falsePositive: 1, unjudged: 1, rate: 0.5, hasEnoughEvidence: false });
    const enough = falsePositiveStats([
      issue("signal-valid"),
      issue("signal-valid"),
      issue("signal-valid"),
      issue("false-positive"),
    ]);
    expect(enough).toMatchObject({ rate: 0.25, hasEnoughEvidence: true });
    expect(falsePositiveStats([])).toMatchObject({ rate: null, hasEnoughEvidence: false });
  });
});
