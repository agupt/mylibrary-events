import { describe, expect, test } from "vitest";
import { dump } from "js-yaml";
import { evaluateTriggers, readKeyValue } from "../lib/evaluateTriggers.mjs";
import { loadSignalsConfig, parseSignalsConfig } from "../lib/loadSignalsConfig.mjs";

const TODAY = "2026-12-20";

/** ISO date `offset` days before TODAY. */
function ago(offset) {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** Builds a validated config from plain entries (defaults applied). */
function config(...signals) {
  const result = parseSignalsConfig(dump({ version: 1, signals }));
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/** Snapshots for days `offset..0`, each built by `blocks(offset)`. */
function history(days, blocks) {
  return Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    return { date: ago(offset), ...blocks(offset) };
  });
}

const base = { name: "Test", status: "draft", severity: "info" };

function only(result) {
  return {
    fired: result.fired.map(({ signalId, trigger, key }) => ({ signalId, trigger, key })),
    notEvaluated: result.notEvaluated.map(({ signalId, reason }) => ({ signalId, reason })),
    quiet: result.quiet.map(({ signalId }) => signalId),
  };
}

describe("result shape", () => {
  test("carries the evaluation date and the three lists", () => {
    const result = evaluateTriggers(config(), [], TODAY);
    expect(result).toEqual({ date: TODAY, fired: [], notEvaluated: [], quiet: [] });
  });

  test("rejects a malformed today", () => {
    expect(() => evaluateTriggers(config(), [], "12/20/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => evaluateTriggers(config(), [], "2026-13-01")).toThrow(/YYYY-MM-DD/);
    expect(() => evaluateTriggers(config(), [], "2026-02-30")).toThrow(/YYYY-MM-DD/);
  });

  test("ignores snapshots after today (no peeking at the future)", () => {
    const cfg = config({ ...base, id: "S8", metric: "S8.rate5xx", rule: { kind: "threshold", gt: 0.01 } });
    const snaps = [
      { date: ago(0), S8: { status: "ok", rate5xx: 0 } },
      { date: "2026-12-21", S8: { status: "ok", rate5xx: 0.5 } },
    ];
    expect(only(evaluateTriggers(cfg, snaps, TODAY)).fired).toEqual([]);
  });
});

describe("threshold", () => {
  const cfg = config({ ...base, id: "S8", metric: "S8.rate5xx", rule: { kind: "threshold", gt: 0.01 } });

  test("fires when the latest reading crosses", () => {
    const result = evaluateTriggers(cfg, [{ date: TODAY, S8: { status: "ok", rate5xx: 0.02 } }], TODAY);
    expect(result.fired).toEqual([
      expect.objectContaining({
        signalId: "S8",
        trigger: "default",
        name: "Test",
        severity: "info",
        status: "draft",
        rule: "threshold",
        value: 0.02,
        threshold: { gt: 0.01 },
        evidence: { dates: [TODAY], values: [0.02] },
      }),
    ]);
    expect(result.fired[0]).not.toHaveProperty("key");
  });

  test("is quiet when below", () => {
    const result = evaluateTriggers(cfg, [{ date: TODAY, S8: { status: "ok", rate5xx: 0 } }], TODAY);
    expect(only(result)).toEqual({ fired: [], notEvaluated: [], quiet: ["S8"] });
  });

  test("0 with status ok satisfies a rule; null never does", () => {
    const zeroCfg = config({ ...base, id: "S9", metric: "S9.outboundClicks", rule: { kind: "threshold", lte: 0 } });
    const zero = evaluateTriggers(zeroCfg, [{ date: TODAY, S9: { status: "ok", outboundClicks: 0 } }], TODAY);
    expect(only(zero).fired).toEqual([{ signalId: "S9", trigger: "default", key: undefined }]);

    const nul = evaluateTriggers(zeroCfg, [{ date: TODAY, S9: { status: "ok", outboundClicks: null } }], TODAY);
    expect(only(nul)).toEqual({ fired: [], notEvaluated: [{ signalId: "S9", reason: "not-collected" }], quiet: [] });
  });

  test.each([
    ["error", "source-error"],
    ["not-configured", "not-configured"],
    ["not-applicable", "not-applicable"],
    ["not-due", "not-due"],
    ["insufficient-volume", "insufficient-volume"],
  ])("block status %s is reported as %s, never fired", (status, reason) => {
    const snaps = [{ date: TODAY, S8: { status, rate5xx: 0.9, error: "boom" } }];
    const result = evaluateTriggers(cfg, snaps, TODAY);
    expect(result.fired).toEqual([]);
    expect(result.notEvaluated).toEqual([
      expect.objectContaining({ signalId: "S8", trigger: "default", reason }),
    ]);
  });

  test("a missing snapshot or block is not-collected", () => {
    expect(only(evaluateTriggers(cfg, [], TODAY)).notEvaluated).toEqual([
      { signalId: "S8", reason: "not-collected" },
    ]);
    expect(only(evaluateTriggers(cfg, [{ date: TODAY }], TODAY)).notEvaluated).toEqual([
      { signalId: "S8", reason: "not-collected" },
    ]);
  });

  test("a null metric under a sub-status reports that sub-status (CrUX)", () => {
    const inp = config({ ...base, id: "S6", cadence: "weekly", metric: "S6.desktop.inpP75", rule: { kind: "threshold", gt: 200 } });
    const snaps = [{ date: TODAY, S6: { status: "ok", desktop: { status: "insufficient-field-data", inpP75: null } } }];
    expect(only(evaluateTriggers(inp, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "S6", reason: "insufficient-field-data" },
    ]);
  });

  test("summed metric paths and a denominator", () => {
    const ratio = config({
      ...base,
      id: "S2",
      metric: ["S2.byOutcome.ambiguous", "S2.byOutcome.not-found"],
      denominator: "S2.searches",
      rule: { kind: "threshold", gt: 0.15 },
    });
    const snaps = [{ date: TODAY, S2: { status: "ok", searches: 10, byOutcome: { ambiguous: 1, "not-found": 1 } } }];
    expect(evaluateTriggers(ratio, snaps, TODAY).fired[0].value).toBeCloseTo(0.2);

    const zeroDen = [{ date: TODAY, S2: { status: "ok", searches: 0, byOutcome: { ambiguous: 0, "not-found": 0 } } }];
    expect(only(evaluateTriggers(ratio, zeroDen, TODAY)).notEvaluated).toEqual([
      { signalId: "S2", reason: "not-collected" },
    ]);
  });

  test("disabled and not-applicable entries are reported, never evaluated", () => {
    const cfgs = config(
      { id: "F7", name: "AI referrals", status: "disabled" },
      { id: "S11", name: "Revenue", status: "not-applicable" },
    );
    expect(only(evaluateTriggers(cfgs, [], TODAY)).notEvaluated).toEqual([
      { signalId: "F7", reason: "disabled" },
      { signalId: "S11", reason: "not-applicable" },
    ]);
  });
});

describe("per-key evaluation", () => {
  test("array items with where filters and a value ratio (F3)", () => {
    const cfg = config({
      ...base,
      id: "F3",
      metric: "F3.anomalies",
      per: "page",
      value: "ctr",
      valueDenominator: "expectedCtr",
      where: { position: { lte: 5 }, impressions: { gte: 100 } },
      rule: { kind: "threshold", lt: 0.5 },
    });
    const anomalies = [
      { page: "/a", position: 4, ctr: 0.01, expectedCtr: 0.06, impressions: 240 },
      { page: "/b", position: 9, ctr: 0.01, expectedCtr: 0.06, impressions: 240 },
      { page: "/c", position: 2, ctr: 0.01, expectedCtr: 0.06, impressions: 20 },
      { page: "/d", position: 2, ctr: 0.05, expectedCtr: 0.06, impressions: 500 },
    ];
    const result = evaluateTriggers(cfg, [{ date: TODAY, F3: { status: "ok", anomalies } }], TODAY);
    expect(result.fired.map((f) => f.key)).toEqual(["/a"]);
    expect(result.fired[0].value).toBeCloseTo(1 / 6);
  });

  test("composite keys and map keys with a value field", () => {
    const cfg = config({
      ...base,
      id: "F1",
      metric: "F1.byPageGroup",
      per: "$key",
      value: "clicks",
      rule: { kind: "threshold", gte: 5 },
    });
    const snaps = [{ date: TODAY, F1: { status: "ok", byPageGroup: { city: { clicks: 9 }, home: { clicks: 1 } } } }];
    expect(evaluateTriggers(cfg, snaps, TODAY).fired.map((f) => f.key)).toEqual(["city"]);

    const runs = config({
      ...base,
      id: "S7",
      metric: "S7.runs",
      per: ["url", "strategy"],
      value: "performance",
      rule: { kind: "threshold", lt: 90 },
    });
    const runSnaps = [{ date: TODAY, S7: { status: "ok", runs: [{ url: "/", strategy: "mobile", performance: 80 }] } }];
    expect(evaluateTriggers(runs, runSnaps, TODAY).fired.map((f) => f.key)).toEqual(["/ mobile"]);
  });

  test("excludeKeys are never evaluated", () => {
    const cfg = config({
      ...base,
      id: "F8",
      metric: "F8.topReferrers",
      per: "domain",
      value: "pageviews",
      excludeKeys: ["$direct"],
      rule: { kind: "threshold", gte: 1 },
    });
    const snaps = [{ date: TODAY, F8: { status: "ok", topReferrers: [{ domain: "$direct", pageviews: 9 }] } }];
    expect(only(evaluateTriggers(cfg, snaps, TODAY))).toEqual({ fired: [], notEvaluated: [], quiet: ["F8"] });
  });

  test("an empty list with a data status is quiet, not missing", () => {
    const cfg = config({ ...base, id: "S4", metric: "S4.zeroEventBySystem", per: "system", rule: { kind: "threshold", gte: 1 } });
    const snaps = [{ date: TODAY, S4: { status: "zero-rows", zeroEventBySystem: [] } }];
    expect(only(evaluateTriggers(cfg, snaps, TODAY)).quiet).toEqual(["S4"]);
  });

  test("a non-collection value at the metric path is not-collected", () => {
    const cfg = config({ ...base, id: "S4", metric: "S4.zeroEventBySystem", per: "system", rule: { kind: "threshold", gte: 1 } });
    const snaps = [{ date: TODAY, S4: { status: "ok", zeroEventBySystem: null } }];
    expect(only(evaluateTriggers(cfg, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "S4", reason: "not-collected" },
    ]);
  });

  test("readKeyValue reads one key (used by needs-data evidence)", () => {
    const [entry] = config({ ...base, id: "S4", metric: "S4.zeroEventBySystem", per: "system", absentKey: "zero", rule: { kind: "threshold", gte: 1 } }).signals;
    const snapshot = { date: TODAY, S4: { status: "ok", zeroEventBySystem: [{ system: "CA0114", count: 2 }] } };
    expect(readKeyValue(entry, snapshot, "CA0114")).toBe(2);
    expect(readKeyValue(entry, snapshot, "NY0778")).toBe(0);
    expect(readKeyValue(entry, { date: TODAY }, "CA0114")).toBeNull();
    expect(readKeyValue(entry, undefined, "CA0114")).toBeNull();
  });
});

describe("rollingSum", () => {
  const s3 = config({
    ...base,
    id: "S3",
    metric: "S3.missesBySystem",
    per: "system",
    absentKey: "zero",
    rule: { kind: "rollingSum", windowDays: 14, gte: 20 },
    minVolume: { metric: "S2.searches", windowDays: 14, gte: 50 },
  });

  const misses = (count, searches) => (offset) => ({
    S2: { status: "ok", searches },
    S3: { status: "ok", missesBySystem: offset % 2 === 0 ? [{ system: "CA0114", count }] : [] },
  });

  test("fires per system when the 14-day sum crosses", () => {
    const result = evaluateTriggers(s3, history(14, misses(3, 10)), TODAY);
    expect(result.fired).toEqual([
      expect.objectContaining({ signalId: "S3", key: "CA0114", value: 21, threshold: { gte: 20 } }),
    ]);
    expect(result.fired[0].evidence.dates).toHaveLength(14);
  });

  test("days outside the window do not count", () => {
    const longAgo = history(30, (offset) => ({
      S2: { status: "ok", searches: 10 },
      S3: { status: "ok", missesBySystem: offset >= 14 ? [{ system: "CA0114", count: 50 }] : [] },
    }));
    expect(only(evaluateTriggers(s3, longAgo, TODAY)).quiet).toEqual(["S3"]);
  });

  test("tiny traffic never fires: 7 searches in 3 days is insufficient-volume", () => {
    const tiny = history(3, (offset) => ({
      S2: { status: "ok", searches: offset === 0 ? 1 : 3 },
      S3: { status: "ok", missesBySystem: [{ system: "CA0114", count: 30 }] },
    }));
    expect(only(evaluateTriggers(s3, tiny, TODAY))).toEqual({
      fired: [],
      notEvaluated: [{ signalId: "S3", reason: "insufficient-volume" }],
      quiet: [],
    });
  });

  test("a guard with no readings at all is insufficient-volume", () => {
    const noSearches = history(14, () => ({
      S2: { status: "not-configured" },
      S3: { status: "ok", missesBySystem: [{ system: "CA0114", count: 30 }] },
    }));
    expect(only(evaluateTriggers(s3, noSearches, TODAY)).notEvaluated).toEqual([
      { signalId: "S3", reason: "insufficient-volume" },
    ]);
  });

  test("pooled ratio over the window (S2)", () => {
    const s2 = config({
      ...base,
      id: "S2",
      metric: ["S2.byOutcome.ambiguous", "S2.byOutcome.not-found"],
      denominator: "S2.searches",
      rule: { kind: "rollingSum", windowDays: 7, gt: 0.15 },
    });
    const snaps = history(7, (offset) => ({
      S2: { status: "ok", searches: 10, byOutcome: { ambiguous: offset === 0 ? 14 : 0, "not-found": 0 } },
    }));
    expect(evaluateTriggers(s2, snaps, TODAY).fired[0].value).toBeCloseTo(0.2);
  });

  test("requireFullWindow: a gap makes '0 for 14 days' unprovable (F6)", () => {
    const f6 = config({
      ...base,
      id: "F6",
      metric: "F6.hitsByBot",
      per: "$key",
      absentKey: "zero",
      rule: { kind: "rollingSum", windowDays: 14, requireFullWindow: true, lte: 0 },
      minVolume: { metric: "F6.hitsByBot", perKey: true, windowDays: 7, offsetDays: 14, gte: 100 },
    });
    const silent = (gapAt) =>
      history(21, (offset) => {
        if (offset === gapAt) return { F6: { status: "error", error: "x" } };
        return { F6: { status: "ok", hitsByBot: offset >= 14 ? { GPTBot: 30, Amazonbot: 5 } : {} } };
      });

    const fired = evaluateTriggers(f6, silent(-1), TODAY);
    expect(fired.fired.map((f) => f.key)).toEqual(["GPTBot"]); // Amazonbot under the 100/wk baseline
    expect(fired.notEvaluated).toEqual([]);

    const gap = evaluateTriggers(f6, silent(5), TODAY);
    expect(only(gap)).toEqual({
      fired: [],
      notEvaluated: [{ signalId: "F6", reason: "insufficient-history" }],
      quiet: [],
    });
  });
});

describe("wowChange", () => {
  const s1 = config({
    ...base,
    id: "S1",
    metric: "S1.visitors",
    rule: { kind: "wowChange", aggregate: "mean", change: "pct", lte: -25 },
    minVolume: { metric: "S1.pageviews", windowDays: 7, offsetDays: 7, gte: 200 },
    minHistoryDays: 14,
  });
  const traffic = (prior, recent, pageviews = 100) => (offset) => ({
    S1: { status: "ok", visitors: offset < 7 ? recent : prior, pageviews },
  });

  test("fires on a drop guarded by the baseline week (a collapse still fires)", () => {
    const result = evaluateTriggers(s1, history(14, traffic(100, 10)), TODAY);
    expect(result.fired).toEqual([expect.objectContaining({ signalId: "S1", value: -90 })]);
  });

  test("a gap day does not fake a drop (means, not sums)", () => {
    const snaps = history(14, traffic(100, 100)).filter((s) => s.date !== ago(2));
    expect(only(evaluateTriggers(s1, snaps, TODAY)).quiet).toEqual(["S1"]);
  });

  test("a sparse recent week (< 4 daily readings) cannot fake a drop", () => {
    const sparse = history(14, traffic(100, 10)).filter((s) => !["0", "1", "2", "3"].some((o) => s.date === ago(Number(o))));
    expect(only(evaluateTriggers(s1, sparse, TODAY)).notEvaluated).toEqual([
      { signalId: "S1", reason: "not-collected" }, // today itself is missing
    ]);
    const gappy = history(14, traffic(100, 10)).filter((s) => ![1, 2, 3, 4].some((o) => s.date === ago(o)));
    expect(only(evaluateTriggers(s1, gappy, TODAY)).notEvaluated).toEqual([
      { signalId: "S1", reason: "insufficient-history" },
    ]);
  });

  test("min-history guard: 13 days is insufficient-history", () => {
    expect(only(evaluateTriggers(s1, history(13, traffic(100, 10)), TODAY)).notEvaluated).toEqual([
      { signalId: "S1", reason: "insufficient-history" },
    ]);
  });

  test("an empty comparison week is insufficient-history", () => {
    const cfg = config({ ...base, id: "S1", metric: "S1.visitors", rule: { kind: "wowChange", lte: -25 } });
    expect(only(evaluateTriggers(cfg, history(7, traffic(100, 10)), TODAY)).notEvaluated).toEqual([
      { signalId: "S1", reason: "insufficient-history" },
    ]);
  });

  test("low pageviews are insufficient-volume", () => {
    expect(only(evaluateTriggers(s1, history(14, traffic(100, 10, 20)), TODAY)).notEvaluated).toEqual([
      { signalId: "S1", reason: "insufficient-volume" },
    ]);
  });

  test("a zero baseline cannot give a percentage", () => {
    const cfg = config({ ...base, id: "S1", metric: "S1.visitors", rule: { kind: "wowChange", gte: 25 } });
    expect(only(evaluateTriggers(cfg, history(14, traffic(0, 10)), TODAY)).notEvaluated).toEqual([
      { signalId: "S1", reason: "insufficient-volume" },
    ]);
  });

  test("aggregate last + change delta (S10 ZIP reach)", () => {
    const cfg = config({
      ...base,
      id: "S10",
      metric: "S10.zipReachPct",
      rule: { kind: "wowChange", aggregate: "last", change: "delta", lt: -0.5 },
    });
    const snaps = history(14, (offset) => ({ S10: { status: "ok", zipReachPct: offset < 3 ? 60 : 61.4 } }));
    expect(evaluateTriggers(cfg, snaps, TODAY).fired[0].value).toBeCloseTo(-1.4);
  });

  test("per-key guard on the same key (S12 by page type)", () => {
    const cfg = config({
      ...base,
      id: "S12",
      metric: "S12.engagedRateByPageType",
      per: "$key",
      rule: { kind: "wowChange", aggregate: "mean", change: "pct", lte: -30 },
      minVolume: { metric: "S1.byPageGroup", perKey: true, windowDays: 7, offsetDays: 7, gte: 200 },
    });
    const snaps = history(14, (offset) => ({
      S1: { status: "ok", byPageGroup: { city: 50, home: 5 } },
      S12: { status: "ok", engagedRateByPageType: { city: offset < 7 ? 0.1 : 0.4, home: offset < 7 ? 0.1 : 0.4 } },
    }));
    const result = evaluateTriggers(cfg, snaps, TODAY);
    expect(result.fired.map((f) => f.key)).toEqual(["city"]);
  });

  test("S12 before WS-D deploys reads not-configured, never fires", () => {
    const cfg = loadSignalsConfig();
    const snaps = history(14, () => ({ S12: { status: "not-configured" } }));
    const result = evaluateTriggers(cfg, snaps, TODAY);
    expect(result.fired.filter((f) => f.signalId === "S12")).toEqual([]);
    expect(result.notEvaluated.find((n) => n.signalId === "S12").reason).toBe("not-configured");
  });
});

describe("vsTrailingMedian (S5 rotating probes)", () => {
  const s5 = config({
    ...base,
    id: "S5",
    metric: "S5.probes",
    per: "system",
    value: "eventCount30d",
    rule: { kind: "vsTrailingMedian", window: 4, minPrior: 3, compare: "ratio", lte: 0.3 },
  });
  const probe = (system, eventCount30d) => ({
    system,
    outlet: `${system}-002`,
    feedReachable: eventCount30d !== null,
    httpStatus: 200,
    eventCount30d,
  });

  test("uses that system's last probes, not calendar days", () => {
    // CA0114 probed weekly (days 21, 14, 7, 0); other days probe others.
    const snaps = history(22, (offset) => ({
      S5: {
        status: "ok",
        probes: offset % 7 === 0 ? [probe("CA0114", offset === 0 ? 50 : 400)] : [probe("NY0004", 100)],
      },
    }));
    const result = evaluateTriggers(s5, snaps, TODAY);
    expect(result.fired).toEqual([
      expect.objectContaining({ key: "CA0114", value: 0.125 }),
    ]);
    expect(result.fired[0].evidence.dates).toEqual([ago(21), ago(14), ago(7), ago(0)]);
  });

  test("fewer than minPrior probes is insufficient-history", () => {
    const snaps = history(15, (offset) => ({
      S5: { status: "ok", probes: offset % 7 === 0 ? [probe("CA0114", offset === 0 ? 5 : 400)] : [] },
    }));
    expect(only(evaluateTriggers(s5, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "S5", reason: "insufficient-history" },
    ]);
  });

  test("a system not probed today is not evaluated; the trigger is quiet if others were", () => {
    const snaps = history(4, (offset) => ({
      S5: {
        status: "ok",
        probes: offset === 0 ? [probe("NY0004", 100)] : [probe("CA0114", 400), probe("NY0004", 100)],
      },
    }));
    expect(only(evaluateTriggers(s5, snaps, TODAY))).toEqual({ fired: [], notEvaluated: [], quiet: ["S5"] });
  });

  test("a null count (unreachable) is skipped in the median, never counted as 0", () => {
    const snaps = history(5, (offset) => ({
      S5: { status: "ok", probes: [probe("CA0114", offset === 1 ? null : 400)] },
    }));
    expect(only(evaluateTriggers(s5, snaps, TODAY)).quiet).toEqual(["S5"]);
  });

  test("minBaseline: a tiny median (2 → 0 events) is noise, not a drop", () => {
    const floored = config({
      ...base,
      id: "S5",
      metric: "S5.probes",
      per: "system",
      value: "eventCount30d",
      rule: { kind: "vsTrailingMedian", window: 4, minPrior: 3, compare: "ratio", minBaseline: 10, lte: 0.3 },
    });
    const snaps = history(4, (offset) => ({ S5: { status: "ok", probes: [probe("CA0114", offset === 0 ? 0 : 2)] } }));
    expect(only(evaluateTriggers(s5, snaps, TODAY)).fired).toHaveLength(1); // unfloored would fire
    expect(only(evaluateTriggers(floored, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "S5", reason: "insufficient-volume" },
    ]);
  });

  test("a zero median cannot give a ratio", () => {
    const snaps = history(4, () => ({ S5: { status: "ok", probes: [probe("CA0114", 0)] } }));
    expect(only(evaluateTriggers(s5, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "S5", reason: "insufficient-volume" },
    ]);
  });

  test("compare delta uses the median of an even window", () => {
    const cfg = config({
      ...base,
      id: "S7",
      metric: "S7.runs",
      per: "url",
      value: "seo",
      rule: { kind: "vsTrailingMedian", window: 2, minPrior: 2, compare: "delta", lte: -10 },
    });
    const snaps = history(3, (offset) => ({
      S7: { status: "ok", runs: [{ url: "/", seo: [100, 90, 80][2 - offset] }] },
    }));
    // priors 100, 90 → median 95; latest 80 → delta -15
    expect(evaluateTriggers(cfg, snaps, TODAY).fired[0].value).toBe(-15);
  });
});

describe("consecutive", () => {
  const s4 = config({
    ...base,
    id: "S4",
    metric: "S4.zeroEventBySystem",
    per: "system",
    absentKey: "zero",
    rule: { kind: "consecutive", n: 3, over: "days", gte: 1 },
    minHistoryDays: 3,
  });
  const zero = (systems) => ({ S4: { status: "ok", zeroEventBySystem: systems.map((system) => ({ system, count: 1 })) } });

  test("fires after 3 consecutive days, on a single search per day", () => {
    const result = evaluateTriggers(s4, history(3, () => zero(["CA0114"])), TODAY);
    expect(result.fired).toEqual([
      expect.objectContaining({ key: "CA0114", value: 1, evidence: { dates: [ago(2), ago(1), ago(0)], values: [1, 1, 1] } }),
    ]);
  });

  test("a missing day breaks the streak: never fired, and unprovable rather than quiet", () => {
    const snaps = history(4, () => zero(["CA0114"])).filter((s) => s.date !== ago(1));
    // Not quiet: an unprovable streak must not post "cleared" on an open issue.
    expect(only(evaluateTriggers(s4, snaps, TODAY))).toEqual({
      fired: [],
      notEvaluated: [{ signalId: "S4", reason: "insufficient-history" }],
      quiet: [],
    });
  });

  test("quiet lists the evaluated keys of a per-key trigger", () => {
    const snaps = history(3, (offset) => zero(offset === 1 ? [] : ["CA0114"]));
    expect(evaluateTriggers(s4, snaps, TODAY).quiet).toEqual([
      { signalId: "S4", trigger: "default", keys: ["CA0114"] },
    ]);
  });

  test("an error day breaks the streak", () => {
    const snaps = history(3, (offset) => (offset === 1 ? { S4: { status: "error", error: "x" } } : zero(["CA0114"])));
    expect(only(evaluateTriggers(s4, snaps, TODAY)).fired).toEqual([]);
  });

  test("a day where the key is absent (0) breaks the streak", () => {
    const snaps = history(3, (offset) => zero(offset === 1 ? [] : ["CA0114"]));
    expect(only(evaluateTriggers(s4, snaps, TODAY)).fired).toEqual([]);
  });

  test("min-history: 2 days is insufficient-history", () => {
    expect(only(evaluateTriggers(s4, history(2, () => zero(["CA0114"])), TODAY)).notEvaluated).toEqual([
      { signalId: "S4", reason: "insufficient-history" },
    ]);
  });

  test("over observations: 2 consecutive unreachable probes, days apart (S5)", () => {
    const cfg = config({
      ...base,
      id: "S5",
      severity: "warn",
      metric: "S5.probes",
      per: "system",
      value: "feedReachable",
      rule: { kind: "consecutive", n: 2, over: "observations", eq: false },
    });
    const snaps = history(8, (offset) => ({
      S5: {
        status: "ok",
        probes: offset === 7 || offset === 0 ? [{ system: "PA0385", feedReachable: false }] : [],
      },
    }));
    const result = evaluateTriggers(cfg, snaps, TODAY);
    expect(result.fired).toEqual([
      expect.objectContaining({ key: "PA0385", severity: "warn", value: false, evidence: { dates: [ago(7), ago(0)], values: [false, false] } }),
    ]);

    const once = snaps.map((s) => (s.date === ago(7) ? { ...s, S5: { status: "ok", probes: [] } } : s));
    expect(only(evaluateTriggers(cfg, once, TODAY)).notEvaluated).toEqual([
      { signalId: "S5", reason: "insufficient-history" },
    ]);
  });
});

describe("newKey", () => {
  const f8 = config({
    ...base,
    id: "F8",
    metric: "F8.topReferrers",
    per: "domain",
    value: "pageviews",
    rule: { kind: "newKey", windowDays: 7, lookbackDays: 28, gte: 20 },
  });
  const referrers = (fn) => (offset) => ({ F8: { status: "ok", topReferrers: fn(offset) } });

  test("fires for a domain unseen in the lookback that crosses the weekly floor", () => {
    const snaps = history(35, referrers((offset) => [
      { domain: "www.google.com", pageviews: 50 },
      ...(offset < 3 ? [{ domain: "reddit.com", pageviews: 8 }] : []),
    ]));
    const result = evaluateTriggers(f8, snaps, TODAY);
    expect(result.fired).toEqual([expect.objectContaining({ key: "reddit.com", value: 24 })]);
  });

  test("a domain seen in the lookback is not new", () => {
    const snaps = history(35, referrers((offset) => (offset === 20 || offset < 3 ? [{ domain: "reddit.com", pageviews: 8 }] : [])));
    expect(only(evaluateTriggers(f8, snaps, TODAY)).quiet).toEqual(["F8"]);
  });

  test("below the floor is quiet", () => {
    const snaps = history(35, referrers((offset) => (offset < 1 ? [{ domain: "reddit.com", pageviews: 5 }] : [])));
    expect(only(evaluateTriggers(f8, snaps, TODAY)).quiet).toEqual(["F8"]);
  });

  test("no lookback history: everything would look new, so insufficient-history", () => {
    const snaps = history(5, referrers(() => [{ domain: "reddit.com", pageviews: 30 }]));
    expect(only(evaluateTriggers(f8, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "F8", reason: "insufficient-history" },
    ]);
  });
});

describe("weekly cadence", () => {
  const f5 = config({
    ...base,
    id: "F5",
    cadence: "weekly",
    metric: "F5.clicks",
    rule: { kind: "wowChange", aggregate: "mean", change: "pct", lte: -25 },
    minVolume: { metric: "F5.clicks", windowDays: 7, offsetDays: 7, gte: 50 },
    minHistoryDays: 8,
  });
  const weekly = (fn) => (offset) =>
    offset % 7 === 2 ? { F5: fn(offset) } : { F5: { status: "not-due" } };

  test("evaluates the latest weekly reading on not-due days", () => {
    const snaps = history(10, weekly((offset) => ({ status: "ok", weekOf: ago(offset), clicks: offset === 2 ? 10 : 100, impressions: 1 })));
    const result = evaluateTriggers(f5, snaps, TODAY);
    expect(result.fired).toEqual([expect.objectContaining({ signalId: "F5", value: -90 })]);
    expect(result.fired[0].evidence.dates.at(-1)).toBe(ago(2));
  });

  test("Bing zero-rows never fires", () => {
    const snaps = history(30, weekly(() => ({ status: "zero-rows", weekOf: null, clicks: 0, impressions: 0 })));
    const result = evaluateTriggers(f5, snaps, TODAY);
    expect(result.fired).toEqual([]);
    expect(only(result).notEvaluated).toEqual([{ signalId: "F5", reason: "insufficient-volume" }]);
  });

  test("no reading in the last 7 days reports today's reason", () => {
    const snaps = history(3, () => ({ F5: { status: "not-due" } }));
    expect(only(evaluateTriggers(f5, snaps, TODAY)).notEvaluated).toEqual([
      { signalId: "F5", reason: "not-due" },
    ]);
    const errored = [
      { date: ago(1), F5: { status: "not-due" } },
      { date: TODAY, F5: { status: "error", error: "x" } },
    ];
    expect(only(evaluateTriggers(f5, errored, TODAY)).notEvaluated).toEqual([
      { signalId: "F5", reason: "source-error" },
    ]);
  });

  test("F4: the weekly-only estimate is read from Monday's snapshot all week", () => {
    const f4 = config({
      ...base,
      id: "F4",
      cadence: "weekly",
      metric: "F4.indexedShareEstimate.ci95.high",
      rule: { kind: "threshold", lt: 0.7 },
      minVolume: { metric: "F4.sampled", windowDays: 7, gte: 300 },
    });
    const snaps = history(7, (offset) => ({
      F4: {
        status: "ok",
        sampled: 100,
        ...(offset === 3 ? { indexedShareEstimate: { value: 0.31, ci95: { low: 0.27, high: 0.35 } } } : {}),
      },
    }));
    const result = evaluateTriggers(f4, snaps, TODAY);
    expect(result.fired).toEqual([expect.objectContaining({ signalId: "F4", value: 0.35 })]);
  });
});

describe("the committed signals.yml at today's volume", () => {
  const cfg = loadSignalsConfig();

  /** A realistic quiet day: ~3 searches, Bing empty, no Fly token, AdSense N/A. */
  const quietDay = () => ({
    S1: { status: "ok", pageviews: 140, visitors: 120, byPageGroup: { city: 80, library: 50, home: 10 } },
    S2: { status: "insufficient-volume", searches: 3, byKind: { zip: 2, city: 1 }, byOutcome: { ok: 1, ambiguous: 1, "not-found": 1, error: 0 } },
    S3: { status: "ok", missesBySystem: [{ system: "NY0778", count: 3 }] },
    S4: { status: "zero-rows", zeroEventBySystem: [] },
    S6: { status: "not-due" },
    S7: { status: "not-due" },
    S8: { status: "not-configured", requests: null, rate5xx: null, p95Seconds: null },
    S9: { status: "insufficient-volume", outboundClicks: 0, filterChanges: {} },
    S11: { status: "not-applicable" },
    S12: { status: "not-configured" },
    F5: { status: "zero-rows", weekOf: null, clicks: 0, impressions: 0 },
    F6: { status: "ok", hitsByBot: { "OAI-SearchBot": 300 }, llmsTxtHits: 1 },
  });

  test("nothing fires on 3 weeks of tiny traffic; S8/S11/F5 are reported, not fired", () => {
    const result = evaluateTriggers(cfg, history(21, quietDay), TODAY);
    expect(result.fired).toEqual([]);
    const reasons = Object.fromEntries(result.notEvaluated.map((n) => [`${n.signalId}/${n.trigger}`, n.reason]));
    expect(reasons).toMatchObject({
      "S2/default": "insufficient-volume",
      "S3/default": "insufficient-volume",
      "S8/error-rate": "not-configured",
      "S8/latency": "not-configured",
      "S9/default": "insufficient-volume",
      "S11/default": "not-applicable",
      "F5/default": "insufficient-volume",
      "F7/default": "disabled",
      "F10/default": "disabled",
    });
  });
});
