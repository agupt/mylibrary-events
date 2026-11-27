import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { ctrCurve, deriveF2, deriveF3 } from "../lib/f2f3.mjs";

function rows(name) {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/gsc", name), "utf8")).rows;
}

const QUERY_STRINGS = [
  "storytime oakland",
  "toddler storytime oakland",
  "baby storytime near me",
  "berkeley library kids events",
  "library events new york",
  "rockridge storytime",
  "offsite",
];

describe("deriveF2 (striking distance, decision 3: no query strings kept)", () => {
  const block = deriveF2(rows("f2-query-page.json"));

  test("counts query/page rows at position 8–30 with ≥10 impressions on our pages", () => {
    expect(block).toEqual({
      status: "ok",
      strikingQueryCount: 3,
      strikingImpressions: 235,
      topPages: [
        { page: "https://mylibrary-events.com/storytimes/ca/oakland", strikingImpressions: 160, queryCount: 2 },
        { page: "https://mylibrary-events.com/library/ca/oakland/main-library", strikingImpressions: 60, queryCount: 1 },
        { page: "https://mylibrary-events.com/library/ca/oakland/rockridge", strikingImpressions: 15, queryCount: 1 },
      ],
    });
    const result = signalSchemas.F2.safeParse(block);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  test("the derived block carries no query string", () => {
    const text = JSON.stringify(block);
    for (const query of QUERY_STRINGS) expect(text).not.toContain(query);
  });

  test("keeps the top 25 pages", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      keys: [`q${i}`, `https://mylibrary-events.com/storytimes/ca/c${i}`],
      clicks: 0,
      impressions: 100 + i,
      ctr: 0,
      position: 12,
    }));
    const derived = deriveF2(many);
    expect(derived.topPages).toHaveLength(25);
    expect(derived.topPages[0].strikingImpressions).toBe(139);
    expect(signalSchemas.F2.safeParse(derived).success).toBe(true);
  });

  test("no rows → zero-rows", () => {
    expect(deriveF2([])).toEqual({ status: "zero-rows", strikingQueryCount: 0, strikingImpressions: 0, topPages: [] });
  });
});

describe("ctrCurve (the site's own CTR by rounded position)", () => {
  test("pools clicks/impressions per position bucket", () => {
    const curve = ctrCurve(rows("f3-curve-pages.json"));
    expect(curve.get(4)).toBeCloseTo(0.1);
    expect(curve.get(2)).toBeCloseTo(0.03);
    expect(curve.get(15)).toBeCloseTo(0.01);
    expect(curve.has(1)).toBe(false); // 0 impressions
  });
});

describe("deriveF3 (CTR anomalies, page level)", () => {
  test("pages below their position's expected CTR", () => {
    const block = deriveF3({ weekPages: rows("f3-week-pages.json"), curvePages: rows("f3-curve-pages.json") });
    expect(block).toEqual({
      status: "ok",
      anomalies: [
        {
          page: "https://mylibrary-events.com/storytimes/ca/oakland",
          position: 3.6,
          ctr: 0.0067,
          expectedCtr: 0.1,
          impressions: 300,
        },
      ],
    });
    const result = signalSchemas.F3.safeParse(block);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  test("orders by missed clicks and caps the list", () => {
    const curvePages = [{ keys: ["https://mylibrary-events.com/x"], clicks: 100, impressions: 1000, ctr: 0.1, position: 3 }];
    const weekPages = Array.from({ length: 150 }, (_, i) => ({
      keys: [`https://mylibrary-events.com/storytimes/ca/c${i}`],
      clicks: 0,
      impressions: 20 + i,
      ctr: 0,
      position: 3,
    }));
    const block = deriveF3({ weekPages, curvePages });
    expect(block.anomalies).toHaveLength(100);
    expect(block.anomalies[0].impressions).toBe(169);
  });

  test("no week rows → zero-rows", () => {
    expect(deriveF3({ weekPages: [], curvePages: [] })).toEqual({ status: "zero-rows", anomalies: [] });
  });
});

describe("F2/F3 edge cases", () => {
  const page = "https://mylibrary-events.com/storytimes/ca/oakland";

  test("a query seen on the www and bare host counts once for its page", () => {
    const derived = deriveF2([
      { keys: ["q1", page], impressions: 20, position: 12 },
      { keys: ["q1", "https://www.mylibrary-events.com/storytimes/ca/oakland"], impressions: 30, position: 12 },
    ]);
    expect(derived.topPages).toEqual([{ page, strikingImpressions: 50, queryCount: 1 }]);
    expect(derived.strikingQueryCount).toBe(1);
  });

  test("rows without keys or off-site are ignored", () => {
    const derived = deriveF2([
      { impressions: 50, position: 12 },
      { keys: ["q", "https://example.com/x"], impressions: 50, position: 12 },
    ]);
    expect(derived.status).toBe("zero-rows");
  });

  test("ties order by page URL; keyless and zero-impression rows are skipped", () => {
    const curvePages = [{ keys: [page], clicks: 10, impressions: 100, position: 3 }];
    const weekPages = [
      { keys: ["https://mylibrary-events.com/storytimes/ca/b"], clicks: 0, impressions: 20, position: 3 },
      { keys: ["https://mylibrary-events.com/storytimes/ca/a"], clicks: 0, impressions: 20, position: 3 },
      { clicks: 0, impressions: 50, position: 3 },
      { keys: [page], clicks: 0, impressions: 0, position: 3 },
    ];
    const pages = deriveF3({ weekPages, curvePages }, { minImpressions: 0 }).anomalies.map((a) => a.page);
    expect(pages).toEqual([
      "https://mylibrary-events.com/storytimes/ca/a",
      "https://mylibrary-events.com/storytimes/ca/b",
      page,
    ]);
  });
});
