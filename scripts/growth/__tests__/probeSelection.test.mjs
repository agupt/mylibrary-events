import { describe, expect, test } from "vitest";
import {
  BREAKER_THRESHOLD,
  ROTATION_DAYS,
  SKIPPED_ERROR,
  bucketForDate,
  failedSystemsFrom,
  initialBreakerState,
  isBlockedStatus,
  mainOutletOf,
  nextBreakerState,
  rotationBucket,
  selectProbes,
} from "../lib/probeSelection.mjs";

/** ~900 synthetic active systems, the production order of magnitude. */
function makeActive(count = 900) {
  return Array.from({ length: count }, (_, i) => {
    const system = `CA${String(i).padStart(4, "0")}`;
    return { system, outlet: `${system}-002` };
  });
}

function datesFrom(start, days) {
  const base = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) =>
    new Date(base + i * 86_400_000).toISOString().slice(0, 10),
  );
}

describe("rotation", () => {
  test("any 7 consecutive days probe every active system exactly once", () => {
    const active = makeActive();
    for (const start of ["2026-11-27", "2027-02-26"]) {
      const probed = datesFrom(start, ROTATION_DAYS).flatMap((date) =>
        selectProbes({ activeSystems: active, date }).map((p) => p.system),
      );
      expect(new Set(probed).size).toBe(active.length);
      expect(probed).toHaveLength(active.length);
    }
  });

  test("daily load stays near activeTotal / 7 (gentle on production)", () => {
    const active = makeActive();
    const sizes = datesFrom("2026-11-27", ROTATION_DAYS).map(
      (date) => selectProbes({ activeSystems: active, date }).length,
    );
    for (const size of sizes) {
      expect(size).toBeGreaterThan(100);
      expect(size).toBeLessThan(160);
    }
  });

  test("buckets are stable when systems are added or removed", () => {
    const active = makeActive();
    const before = new Map(active.map((s) => [s.system, rotationBucket(s.system)]));
    const shrunk = active.filter((_, i) => i % 3 !== 0);
    const date = "2026-11-30";
    const todays = selectProbes({ activeSystems: shrunk, date });
    for (const probe of todays) {
      expect(before.get(probe.system)).toBe(bucketForDate(date));
    }
  });

  test("bucketForDate cycles through 0..6 and rejects bad input", () => {
    const buckets = datesFrom("2026-11-27", 14).map(bucketForDate);
    expect(new Set(buckets).size).toBe(ROTATION_DAYS);
    expect(buckets[0]).toBe(buckets[7]);
    expect(() => bucketForDate("11/27/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => bucketForDate("2026-13-45")).toThrow(/invalid/);
    expect(() => bucketForDate(undefined)).toThrow();
  });
});

describe("extras: failures re-queued, demand weighted", () => {
  const active = makeActive();
  const date = "2026-11-27";
  const bucket = bucketForDate(date);
  const offBucket = active
    .map((s) => s.system)
    .filter((s) => rotationBucket(s) !== bucket);

  test("yesterday's failures are re-probed today, after the rotation", () => {
    const failed = offBucket.slice(0, 3);
    const probes = selectProbes({ activeSystems: active, date, failedSystems: failed });
    const extras = probes.slice(-3);
    expect(extras.map((p) => p.system)).toEqual(failed);
    expect(extras.every((p) => p.reason === "failure")).toBe(true);
    expect(extras[0].outlet).toBe(`${failed[0]}-002`);
    // The rotation comes first so a breaker trip can only skip extras.
    expect(probes.slice(0, -3).every((p) => p.reason === "rotation")).toBe(true);
  });

  test("searched systems are probed daily, even off their rotation day", () => {
    const demand = offBucket.slice(10, 12);
    const probes = selectProbes({ activeSystems: active, date, demandSystems: demand });
    const reasons = Object.fromEntries(probes.map((p) => [p.system, p.reason]));
    expect(reasons[demand[0]]).toBe("demand");
    expect(reasons[demand[1]]).toBe("demand");
  });

  test("no duplicates: a failure that is also demand, or in today's rotation, appears once", () => {
    const inBucket = active.map((s) => s.system).find((s) => rotationBucket(s) === bucket);
    const both = offBucket[20];
    const probes = selectProbes({
      activeSystems: active,
      date,
      failedSystems: [both, inBucket],
      demandSystems: [both, inBucket],
    });
    const systems = probes.map((p) => p.system);
    expect(new Set(systems).size).toBe(systems.length);
    expect(probes.find((p) => p.system === both).reason).toBe("failure");
    expect(probes.find((p) => p.system === inBucket).reason).toBe("rotation");
  });

  test("systems no longer active are not probed", () => {
    const probes = selectProbes({
      activeSystems: active,
      date,
      failedSystems: ["ZZ9999"],
      demandSystems: ["NY0562"],
    });
    expect(probes.some((p) => ["ZZ9999", "NY0562"].includes(p.system))).toBe(false);
  });

  test("extras are capped but the rotation never is", () => {
    const base = selectProbes({ activeSystems: active, date }).length;
    const probes = selectProbes({
      activeSystems: active,
      date,
      demandSystems: offBucket.slice(0, 200),
      maxExtra: 5,
    });
    expect(probes).toHaveLength(base + 5);
    expect(selectProbes({ activeSystems: active, date, demandSystems: offBucket, maxExtra: -1 }))
      .toHaveLength(base);
  });
});

describe("failedSystemsFrom", () => {
  test("re-queues transient failures only; tolerates missing blocks", () => {
    const previous = {
      status: "ok",
      probes: [
        { system: "CA0114", feedReachable: true, eventCount30d: 12 },
        { system: "PA0385", feedReachable: false, httpStatus: null, error: "feed unreachable" },
        { system: "NY0004", feedReachable: null, error: "analysis HTTP 500" },
        { system: "TX0120", feedReachable: true, error: "feed probe failed" },
        { system: "PA0385", feedReachable: false },
        // A WAF block waits for its rotation day (retrying daily provokes it).
        { system: "NY0778", feedReachable: false, httpStatus: 403, error: "feed unreachable (HTTP 403)" },
        { system: "NY0562", feedReachable: false, httpStatus: 429, error: "feed unreachable (HTTP 429)" },
        // Never probed: also waits for the rotation, so it can't fill the cap.
        { system: "CA0063", feedReachable: null, httpStatus: null, error: SKIPPED_ERROR },
      ],
    };
    expect(failedSystemsFrom(previous)).toEqual(["PA0385", "NY0004", "TX0120"]);
    expect(failedSystemsFrom(null)).toEqual([]);
    expect(failedSystemsFrom({ status: "error", error: "x" })).toEqual([]);
  });
});

describe("mainOutletOf", () => {
  test("prefers the -002 central outlet, else the lowest id", () => {
    expect(mainOutletOf("CA0114", ["CA0114-005", "CA0114-002"])).toBe("CA0114-002");
    expect(mainOutletOf("AK0094", ["AK0094-005", "AK0094-003"])).toBe("AK0094-003");
  });
});

describe("circuit breaker", () => {
  test(`opens after ${BREAKER_THRESHOLD} consecutive blocks and stays open`, () => {
    const blocked = { blocked: true };
    const states = Array.from({ length: BREAKER_THRESHOLD }).reduce(
      (acc) => [...acc, nextBreakerState(acc.at(-1), blocked)],
      [initialBreakerState()],
    );
    expect(states.at(-2).open).toBe(false);
    expect(states.at(-1).open).toBe(true);
    expect(nextBreakerState(states.at(-1), { blocked: false }).open).toBe(true);
  });

  test("a success resets the streak and the state is not mutated", () => {
    const start = initialBreakerState(2);
    const one = nextBreakerState(start, { blocked: true });
    const reset = nextBreakerState(one, { blocked: false });
    expect(start.consecutive).toBe(0);
    expect(one.consecutive).toBe(1);
    expect(reset).toEqual({ consecutive: 0, open: false, threshold: 2 });
  });

  test("403 and 429 count as blocked", () => {
    expect(isBlockedStatus(403)).toBe(true);
    expect(isBlockedStatus(429)).toBe(true);
    expect(isBlockedStatus(200)).toBe(false);
    expect(isBlockedStatus(null)).toBe(false);
  });
});
