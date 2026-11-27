import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { buildS7Block, medianOf, medianRun, parsePsiRun } from "../lib/parsePsi.mjs";
import { DEFAULT_PSI_URLS, PSI_ENDPOINT, collectS7 } from "../sources/psi.mjs";

const fixture = (name) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/psi", name), "utf8"));

/** A copy of the home fixture with a different performance score and LCP. */
function variant(score, lcp) {
  const body = fixture("mobile-home.json");
  return {
    ...body,
    lighthouseResult: {
      ...body.lighthouseResult,
      categories: {
        ...body.lighthouseResult.categories,
        performance: { id: "performance", score },
      },
      audits: {
        ...body.lighthouseResult.audits,
        "largest-contentful-paint": { numericValue: lcp },
      },
    },
  };
}

describe("parsePsiRun", () => {
  test("reads category scores (×100) and lab metrics", () => {
    expect(parsePsiRun(fixture("mobile-home.json"))).toEqual({
      ok: true,
      metrics: {
        performance: 98,
        seo: 100,
        accessibility: 96,
        bestPractices: 100,
        lcpMs: 1802.4,
        tbtMs: 10,
        cls: 0,
      },
    });
  });

  test("a Lighthouse runtime error or missing result is a failed run", () => {
    expect(parsePsiRun(fixture("runtime-error.json"))).toEqual({
      ok: false,
      error: "Lighthouse runtime error FAILED_DOCUMENT_REQUEST",
    });
    expect(parsePsiRun({}).ok).toBe(false);
  });

  test("null or out-of-range scores read null", () => {
    const parsed = parsePsiRun({
      lighthouseResult: { categories: { performance: { score: null }, seo: { score: 7 } } },
    });
    expect(parsed.metrics.performance).toBeNull();
    expect(parsed.metrics.seo).toBeNull();
    expect(parsed.metrics.lcpMs).toBeNull();
  });
});

describe("median of 3", () => {
  test("medianOf handles odd, even, empty and nulls", () => {
    expect(medianOf([3, 1, 2])).toBe(2);
    expect(medianOf([4, 1, null, 2])).toBe(2);
    expect(medianOf([1, 4])).toBe(2.5);
    expect(medianOf([null, undefined])).toBeNull();
  });

  test("each field is the median of its runs, ignoring failed runs", () => {
    const runs = [
      parsePsiRun(variant(0.9, 2400)),
      parsePsiRun(variant(0.99, 1500)),
      parsePsiRun(variant(0.95, 1900)),
    ];
    const entry = medianRun("https://mylibrary-events.com/", "mobile", runs);
    expect(entry.performance).toBe(95);
    expect(entry.lcpMs).toBe(1900);

    const withFailure = medianRun("https://mylibrary-events.com/", "mobile", [
      runs[0],
      { ok: false, error: "x" },
      runs[1],
    ]);
    expect(withFailure.performance).toBe(94.5);
  });

  test("all runs failed → every field null; all combos null → error block", () => {
    const entry = medianRun("https://mylibrary-events.com/status", "desktop", [
      { ok: false, error: "x" },
    ]);
    expect(entry.performance).toBeNull();
    expect(buildS7Block([entry], "PSI HTTP 500")).toEqual({ status: "error", error: "PSI HTTP 500" });
    expect(buildS7Block([entry]).error).toBe("no successful PSI run");
  });
});

describe("collectS7", () => {
  test("no key → not-configured", async () => {
    const fetch = vi.fn();
    const block = await collectS7({ env: {}, fetch });
    expect(block).toEqual({ status: "not-configured", runs: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(signalSchemas.S7.safeParse(block).success).toBe(true);
  });

  test("5 URLs × 2 strategies × 3 runs = 30 calls; key only in a header", async () => {
    const fetch = vi.fn(async () => ({ status: 200, json: async () => fixture("mobile-home.json") }));
    const block = await collectS7({ env: { CRUX_API_KEY: "test-key-123" }, fetch });

    expect(fetch).toHaveBeenCalledTimes(30);
    const [url, init] = fetch.mock.calls[0];
    expect(url.startsWith(PSI_ENDPOINT)).toBe(true);
    expect(url).not.toContain("test-key-123");
    expect(url).toContain("category=best-practices");
    expect(init.headers["x-goog-api-key"]).toBe("test-key-123");

    expect(block.status).toBe("ok");
    expect(block.runs).toHaveLength(DEFAULT_PSI_URLS.length * 2);
    expect(block.runs.map((r) => r.strategy).slice(0, 2)).toEqual(["mobile", "desktop"]);
    expect(signalSchemas.S7.safeParse(block).success).toBe(true);
  });

  test("one URL failing everywhere keeps the others, with nulls for it", async () => {
    const fetch = vi.fn(async (url) =>
      url.includes("status")
        ? { status: 500, json: async () => ({}) }
        : { status: 200, json: async () => fixture("mobile-home.json") },
    );
    const block = await collectS7({ env: { CRUX_API_KEY: "k" }, fetch, concurrency: 3 });
    expect(block.status).toBe("ok");
    const statusRuns = block.runs.filter((r) => r.url.endsWith("/status"));
    expect(statusRuns.every((r) => r.performance === null)).toBe(true);
    expect(signalSchemas.S7.safeParse(block).success).toBe(true);
  });

  test("everything failing → sanitized error block", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("connect ETIMEDOUT https://www.googleapis.com/x?key=SECRET999");
    });
    const block = await collectS7({ env: { CRUX_API_KEY: "k" }, fetch, urls: [DEFAULT_PSI_URLS[0]], runs: 1 });
    expect(block.status).toBe("error");
    expect(block.error).not.toContain("SECRET999");
    expect(signalSchemas.S7.safeParse(block).success).toBe(true);
  });
});
