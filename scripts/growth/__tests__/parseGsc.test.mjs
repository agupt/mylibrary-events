import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import {
  estimateIndexedShare,
  gscDataDate,
  gscRange,
  normalizePageUrl,
  parseF1,
  parseInspection,
  parseSitemap,
  sampleInspectionUrls,
  sanitizeLabel,
  summarizeF4,
} from "../lib/parseGsc.mjs";

function fixture(name) {
  const text = readFileSync(path.join(import.meta.dirname, "fixtures/gsc", name), "utf8");
  return name.endsWith(".json") ? JSON.parse(text) : text;
}

function expectValid(id, block) {
  const result = signalSchemas[id].safeParse(block);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
}

describe("dates", () => {
  test("F1 reads final data three days back (assumption 2)", () => {
    expect(gscDataDate("2026-11-27")).toBe("2026-11-24");
    expect(gscDataDate("2026-03-02")).toBe("2026-02-27");
  });

  test("an N-day range ends on the final-data date", () => {
    expect(gscRange("2026-11-30", 7)).toEqual({ startDate: "2026-11-21", endDate: "2026-11-27" });
    expect(gscRange("2026-11-30", 28)).toEqual({ startDate: "2026-10-31", endDate: "2026-11-27" });
  });
});

describe("normalizePageUrl", () => {
  test.each([
    ["https://mylibrary-events.com/storytimes/ca/oakland", "https://mylibrary-events.com/storytimes/ca/oakland"],
    ["https://www.mylibrary-events.com/storytimes/ca/oakland", "https://mylibrary-events.com/storytimes/ca/oakland"],
    ["http://mylibrary-events.com/x?utm_source=a#top", "https://mylibrary-events.com/x"],
    ["https://example.com/storytimes/ca/oakland", null],
    ["not a url", null],
  ])("%s → %s", (input, output) => {
    expect(normalizePageUrl(input)).toBe(output);
  });
});

describe("parseF1", () => {
  test("site totals plus impressions per page type", () => {
    const block = parseF1({
      dataDate: "2026-11-24",
      totals: fixture("f1-totals.json"),
      pages: fixture("f1-pages.json").rows,
    });
    expect(block).toEqual({
      status: "ok",
      dataDate: "2026-11-24",
      clicks: 120,
      impressions: 4100,
      ctr: 0.0293,
      position: 12.3,
      byPageGroup: {
        home: { clicks: 10, impressions: 300, pagesWithImpressions: 1 },
        city: { clicks: 65, impressions: 2500, pagesWithImpressions: 3 },
        library: { clicks: 30, impressions: 800, pagesWithImpressions: 2 },
        state: { clicks: 2, impressions: 50, pagesWithImpressions: 1 },
      },
    });
    expectValid("F1", block);
  });

  test("no rows → zero-rows with null ctr/position", () => {
    const block = parseF1({ dataDate: "2026-11-24", totals: fixture("f1-empty.json"), pages: [] });
    expect(block).toEqual({
      status: "zero-rows",
      dataDate: "2026-11-24",
      clicks: 0,
      impressions: 0,
      ctr: null,
      position: null,
      byPageGroup: {},
    });
    expectValid("F1", block);
  });
});

describe("parseSitemap", () => {
  test("reads <loc> entries of a urlset", () => {
    const { kind, locs } = parseSitemap(fixture("sitemap.xml"));
    expect(kind).toBe("urlset");
    expect(locs).toHaveLength(38);
    expect(locs[0]).toBe("https://mylibrary-events.com/");
  });

  test("recognises a sitemap index and decodes entities", () => {
    expect(parseSitemap(fixture("sitemap-index.xml"))).toEqual({
      kind: "sitemapindex",
      locs: ["https://mylibrary-events.com/sitemap/0.xml"],
    });
    expect(parseSitemap("<urlset><url><loc>https://mylibrary-events.com/a?b=1&amp;c=2</loc></url></urlset>").locs).toEqual([
      "https://mylibrary-events.com/a?b=1&c=2",
    ]);
  });

  test("rejects a document that is not a sitemap", () => {
    expect(() => parseSitemap("<html>nope</html>")).toThrow(/not a sitemap/);
  });
});

describe("sampleInspectionUrls (F4, deterministic per date)", () => {
  const urls = parseSitemap(fixture("sitemap.xml")).locs;

  test("same date → same sample; another date → a different one", () => {
    const a = sampleInspectionUrls(urls, "2026-11-27", { perDay: 10 });
    expect(sampleInspectionUrls(urls, "2026-11-27", { perDay: 10 })).toEqual(a);
    expect(sampleInspectionUrls(urls, "2026-11-28", { perDay: 10 })).not.toEqual(a);
  });

  test("allocates proportionally to page-type strata (largest remainder)", () => {
    const sample = sampleInspectionUrls(urls, "2026-11-27", { perDay: 10 });
    const byType = sample.reduce(
      (acc, { pageType }) => ({ ...acc, [pageType]: (acc[pageType] ?? 0) + 1 }),
      {},
    );
    expect(byType).toEqual({ state: 1, city: 3, library: 6 });
    expect(new Set(sample.map((s) => s.url)).size).toBe(10);
  });

  test("never samples a foreign URL and never exceeds the population", () => {
    const sample = sampleInspectionUrls(urls, "2026-11-27", { perDay: 100 });
    expect(sample).toHaveLength(37);
    expect(sample.every(({ url }) => url.startsWith("https://mylibrary-events.com/"))).toBe(true);
  });

  test("defaults to 100/day, well under the 2,000/day quota", () => {
    const many = Array.from({ length: 500 }, (_, i) => `https://mylibrary-events.com/storytimes/ca/c${i}`);
    expect(sampleInspectionUrls(many, "2026-11-27")).toHaveLength(100);
  });
});

describe("parseInspection / summarizeF4", () => {
  test("PASS is indexed; the coverage state is kept as a schema-safe label", () => {
    expect(parseInspection(fixture("inspect-indexed.json"))).toEqual({
      indexed: true,
      verdict: "PASS",
      coverageState: "Submitted and indexed",
    });
    expect(parseInspection(fixture("inspect-noindex.json"))).toEqual({
      indexed: false,
      verdict: "NEUTRAL",
      coverageState: "Excluded by noindex tag",
    });
  });

  test("a response without indexStatusResult is an error", () => {
    expect(() => parseInspection({ inspectionResult: {} })).toThrow(/indexStatusResult/);
  });

  test("sanitizeLabel", () => {
    expect(sanitizeLabel("  Crawled - currently not indexed ")).toBe("Crawled - currently not indexed");
    expect(sanitizeLabel("‘’")).toBe("unknown");
    expect(sanitizeLabel(undefined)).toBe("unknown");
    expect(sanitizeLabel("x".repeat(100))).toHaveLength(80);
  });

  test("summarizes a day's sample", () => {
    const block = summarizeF4([
      { pageType: "city", indexed: true, coverageState: "Submitted and indexed" },
      { pageType: "city", indexed: false, coverageState: "Discovered - currently not indexed" },
      { pageType: "library", indexed: false, coverageState: "Discovered - currently not indexed" },
    ]);
    expect(block).toEqual({
      status: "ok",
      sampled: 3,
      indexedByType: { city: 1, library: 0 },
      coverageStates: { "Submitted and indexed": 1, "Discovered - currently not indexed": 2 },
    });
    expectValid("F4", block);
  });

  test("an empty sample is zero-rows", () => {
    const block = summarizeF4([]);
    expect(block).toEqual({ status: "zero-rows", sampled: 0, indexedByType: {}, coverageStates: {} });
    expectValid("F4", block);
  });
});

describe("estimateIndexedShare (weekly pool)", () => {
  test("pools daily F4 blocks into a Wilson 95% interval", () => {
    const day = { status: "ok", sampled: 100, indexedByType: { city: 20, library: 10 }, coverageStates: {} };
    const estimate = estimateIndexedShare([day, day, { status: "error", error: "x" }]);
    expect(estimate.value).toBe(0.3);
    expect(estimate.ci95.low).toBeCloseTo(0.2405, 3);
    expect(estimate.ci95.high).toBeCloseTo(0.3671, 3);
  });

  test("no samples → null", () => {
    expect(estimateIndexedShare([])).toBeNull();
  });
});
