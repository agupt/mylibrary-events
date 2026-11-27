import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CLEAN_STATUSES,
  DATA_STATUSES,
  PAGE_TYPES,
  SIGNAL_IDS,
  SIGNAL_STATUSES,
  sanitizeError,
  signalStatusSchema,
  snapshotSchema,
  validateSnapshot,
} from "../lib/snapshotSchema.mjs";

const FIXTURE_PATH = path.join(
  import.meta.dirname,
  "fixtures/snapshot/full.json",
);

/** Fresh deep copy per test so no test can leak mutations into another. */
function loadFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

/** Returns a copy of the fixture with one signal block replaced. */
function withSignal(id, block) {
  return { ...loadFixture(), [id]: block };
}

function issuePaths(result) {
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("status enum", () => {
  test("is exactly the §1 set", () => {
    expect(SIGNAL_STATUSES).toEqual([
      "ok",
      "zero-rows",
      "insufficient-field-data",
      "insufficient-volume",
      "not-configured",
      "not-applicable",
      "not-due",
      "error",
    ]);
  });

  test("rejects an unknown status", () => {
    expect(signalStatusSchema.safeParse("missing").success).toBe(false);
    expect(signalStatusSchema.safeParse("OK").success).toBe(false);
  });

  test("data statuses are a subset; clean statuses exclude error", () => {
    expect(DATA_STATUSES.every((s) => SIGNAL_STATUSES.includes(s))).toBe(true);
    expect(CLEAN_STATUSES).not.toContain("error");
    expect(CLEAN_STATUSES).toHaveLength(SIGNAL_STATUSES.length - 1);
  });
});

describe("snapshotSchema", () => {
  test("accepts the full fixture", () => {
    // Arrange
    const snapshot = loadFixture();

    // Act
    const result = snapshotSchema.safeParse(snapshot);

    // Assert
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test("the fixture covers every signal id", () => {
    const snapshot = loadFixture();
    expect(SIGNAL_IDS.every((id) => id in snapshot)).toBe(true);
  });

  test("rejects a signal block missing status", () => {
    const { status: _dropped, ...s1 } = loadFixture().S1;
    const result = snapshotSchema.safeParse(withSignal("S1", s1));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("S1.status");
  });

  test("rejects a snapshot missing a whole signal", () => {
    const { F7: _dropped, ...rest } = loadFixture();
    const result = snapshotSchema.safeParse(rest);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("F7");
  });

  test("rejects an unknown status on a signal", () => {
    const block = { ...loadFixture().S2, status: "stale" };
    const result = snapshotSchema.safeParse(withSignal("S2", block));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("S2.status");
  });

  test("rejects unknown top-level keys and unknown signal fields", () => {
    const extraTop = { ...loadFixture(), S99: { status: "ok" } };
    expect(snapshotSchema.safeParse(extraTop).success).toBe(false);

    const extraField = withSignal("S1", { ...loadFixture().S1, ip: "1.2.3.4" });
    expect(snapshotSchema.safeParse(extraField).success).toBe(false);
  });

  test("rejects a malformed date", () => {
    const snapshot = { ...loadFixture(), date: "2026-11-30T00:00:00Z" };
    expect(snapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});

describe("null vs 0", () => {
  test("0 with status ok is a valid reading", () => {
    const block = { ...loadFixture().S1, pageviews: 0, visitors: 0 };
    expect(snapshotSchema.safeParse(withSignal("S1", block)).success).toBe(true);
  });

  test("null (not collected) is allowed and kept distinct from 0", () => {
    const block = { ...loadFixture().S1, visitors: null };
    const result = snapshotSchema.safeParse(withSignal("S1", block));
    expect(result.success).toBe(true);
    expect(result.data.S1.visitors).toBeNull();
    expect(result.data.S1.pageviews).toBe(212);
  });

  test("a data status requires every field to be present (null, not absent)", () => {
    const { visitors: _dropped, ...s1 } = loadFixture().S1;
    const result = snapshotSchema.safeParse(withSignal("S1", s1));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("S1.visitors");
  });

  test("a non-data status may omit fields", () => {
    for (const status of ["not-due", "not-configured", "error"]) {
      const block =
        status === "error" ? { status, error: "HTTP 500" } : { status };
      const result = snapshotSchema.safeParse(withSignal("S7", block));
      expect(result.success, status).toBe(true);
    }
  });

  test("negative counts are rejected", () => {
    const block = { ...loadFixture().S1, pageviews: -1 };
    expect(snapshotSchema.safeParse(withSignal("S1", block)).success).toBe(false);
  });
});

describe("status-specific rules", () => {
  test("error status requires an error message", () => {
    const result = snapshotSchema.safeParse(
      withSignal("F1", { status: "error" }),
    );
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("F1.error");
  });

  test("error message is only allowed with error status", () => {
    const block = { ...loadFixture().S1, error: "stray" };
    const result = snapshotSchema.safeParse(withSignal("S1", block));
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContain("S1.error");
  });

  test("S11 only accepts not-applicable", () => {
    const result = snapshotSchema.safeParse(withSignal("S11", { status: "ok" }));
    expect(result.success).toBe(false);
  });

  test("S12 reads not-configured before WS-D, and full fields after", () => {
    const configured = {
      status: "ok",
      visitsByEntry: { "www.google.com": { city: 12 } },
      actionsByPageType: { city: { widget_loaded: 10, nav_click: 2 } },
      engagedRateByPageType: { city: 0.25 },
      funnel: [
        { source: "www.google.com", pageType: "city", action: "nav_click", visits: 2 },
      ],
    };
    expect(
      snapshotSchema.safeParse(withSignal("S12", configured)).success,
    ).toBe(true);

    const badRate = {
      ...configured,
      engagedRateByPageType: { city: 1.5 },
    };
    expect(snapshotSchema.safeParse(withSignal("S12", badRate)).success).toBe(
      false,
    );
  });

  test("S6 per-form-factor status records insufficient field data", () => {
    const s6 = loadFixture().S6;
    const block = {
      ...s6,
      phone: { ...s6.phone, status: "not-due" },
    };
    expect(snapshotSchema.safeParse(withSignal("S6", block)).success).toBe(
      false,
    );
  });

  test("F4 weekly estimate is optional on non-Monday runs", () => {
    const { indexedShareEstimate: _dropped, ...f4 } = loadFixture().F4;
    expect(snapshotSchema.safeParse(withSignal("F4", f4)).success).toBe(true);
  });
});

describe("privacy guards (public repo)", () => {
  test("referrers must be bare domains, never full URLs", () => {
    const block = {
      status: "ok",
      topReferrers: [{ domain: "https://www.google.com/search?q=x", pageviews: 1 }],
    };
    const result = snapshotSchema.safeParse(withSignal("F8", block));
    expect(result.success).toBe(false);
  });

  test("S3 list is capped at 500 systems", () => {
    const missesBySystem = Array.from({ length: 501 }, (_, i) => ({
      system: `CA${String(i).padStart(4, "0")}`,
      count: 1,
    }));
    const result = snapshotSchema.safeParse(
      withSignal("S3", { status: "ok", missesBySystem }),
    );
    expect(result.success).toBe(false);
  });
});

describe("validateSnapshot", () => {
  test("returns the envelope with data on success", () => {
    const result = validateSnapshot(loadFixture());
    expect(result.success).toBe(true);
    expect(result.data.date).toBe("2026-11-30");
    expect(result.error).toBeNull();
  });

  test("returns a readable error string on failure", () => {
    const { status: _dropped, ...s1 } = loadFixture().S1;
    const result = validateSnapshot(withSignal("S1", s1));
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toContain("S1.status");
  });
});

describe("page types stay in sync with WS-D's classifier", () => {
  test("PAGE_TYPES equals src/lib/analytics/pageType.ts (one source of truth)", async () => {
    // Plain node can't import .ts at runtime, so the .mjs keeps a copy;
    // this test fails the moment the two diverge.
    const classifier = await import("../../../src/lib/analytics/pageType.ts");
    expect(PAGE_TYPES).toEqual(classifier.PAGE_TYPES);
  });
});

describe("free-text channels are closed", () => {
  test("map keys reject sentences of free text", () => {
    const block = {
      ...loadFixture().S9,
      filterChanges: { "hello world, my phone is 555": 1 },
    };
    expect(snapshotSchema.safeParse(withSignal("S9", block)).success).toBe(
      false,
    );
  });

  test("page-type maps reject unknown page types", () => {
    const block = { ...loadFixture().S1, byPageGroup: { blog: 3 } };
    expect(snapshotSchema.safeParse(withSignal("S1", block)).success).toBe(
      false,
    );
  });

  test.each([
    "https://www.googleapis.com/x?key=AIzaSECRET",
    "HTTP 401 Bearer abc.def",
    "Authorization: Basic Zm9v",
    "token=abc",
  ])("error messages carrying secrets are rejected: %s", (error) => {
    const result = snapshotSchema.safeParse(
      withSignal("S6", { status: "error", error }),
    );
    expect(result.success).toBe(false);
  });

  test("ordinary error text is allowed", () => {
    const result = snapshotSchema.safeParse(
      withSignal("S6", { status: "error", error: "Unexpected token < in JSON" }),
    );
    expect(result.success).toBe(true);
  });

  test.each(["localhost", "10.0.0.1", "a_b.example.com:8080", "$direct", "$other"])(
    "referrer host %s is accepted",
    (domain) => {
      const block = { status: "ok", topReferrers: [{ domain, pageviews: 1 }] };
      expect(snapshotSchema.safeParse(withSignal("F8", block)).success).toBe(
        true,
      );
    },
  );

  test.each([
    "https://evil.example.com/storytimes/ca/oakland",
    "https://mylibrary-events.com/storytimes?q=x",
  ])("page URL %s is rejected (foreign origin or query)", (page) => {
    const f2 = loadFixture().F2;
    const block = { ...f2, topPages: [{ ...f2.topPages[0], page }] };
    expect(snapshotSchema.safeParse(withSignal("F2", block)).success).toBe(
      false,
    );
  });

  test("site-relative page URLs are accepted", () => {
    const f2 = loadFixture().F2;
    const block = { ...f2, topPages: [{ ...f2.topPages[0], page: "/" }] };
    expect(snapshotSchema.safeParse(withSignal("F2", block)).success).toBe(
      true,
    );
  });
});

describe("sanitizeError", () => {
  test("drops query strings and redacts credentials so the result validates", () => {
    const raw = new Error(
      "fetch failed: https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=AIzaSECRET Bearer abc api_key=zzz",
    );
    const message = sanitizeError(raw);
    expect(message).not.toMatch(/AIzaSECRET|abc|zzz/);
    expect(message).toContain(
      "https://chromeuxreport.googleapis.com/v1/records:queryRecord",
    );
    const result = snapshotSchema.safeParse(
      withSignal("S6", { status: "error", error: message }),
    );
    expect(result.success).toBe(true);
  });

  test("truncates, collapses whitespace and handles non-Error input", () => {
    expect(sanitizeError("x".repeat(1000))).toHaveLength(200);
    expect(sanitizeError(undefined)).toBe("unknown error");
    expect(sanitizeError("  a \n b  ")).toBe("a b");
  });
});

describe("empty readings on data statuses (contract for collectors)", () => {
  test.each([
    ["S5", { status: "zero-rows", probes: [], probed: 0, activeTotal: 927 }],
    [
      "F2",
      {
        status: "zero-rows",
        strikingQueryCount: 0,
        strikingImpressions: 0,
        topPages: [],
      },
    ],
    ["F3", { status: "insufficient-volume", anomalies: [] }],
    [
      "S12",
      {
        status: "insufficient-volume",
        visitsByEntry: {},
        actionsByPageType: {},
        engagedRateByPageType: {},
        funnel: [],
      },
    ],
  ])("%s accepts empty collections", (id, block) => {
    expect(snapshotSchema.safeParse(withSignal(id, block)).success).toBe(true);
  });
});
