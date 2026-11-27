import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import {
  formatPhase0,
  hogqlRows,
  pageTypeOf,
  parseF10,
  parseF6,
  parsePhase0,
  parseReferrers,
  parseS1,
  parseS2,
  parseS9,
  parseSystemCounts,
  toDomain,
  toKey,
} from "../lib/parsePosthog.mjs";

function fixture(name) {
  return JSON.parse(
    readFileSync(path.join(import.meta.dirname, "fixtures/posthog", name), "utf8"),
  );
}

function expectValid(id, block) {
  const result = signalSchemas[id].safeParse(block);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
}

describe("hogqlRows", () => {
  test("zips columns with result rows", () => {
    expect(hogqlRows(fixture("s1-totals.json"))).toEqual([{ pageviews: 148, visitors: 121 }]);
  });

  test("returns [] for an empty result", () => {
    expect(hogqlRows(fixture("empty.json"))).toEqual([]);
  });

  test.each([[null], [{}], [{ columns: ["a"] }], [{ columns: "a", results: [] }], [{ columns: ["a"], results: [1] }]])(
    "rejects a malformed response %#",
    (response) => {
      expect(() => hogqlRows(response)).toThrow(/unexpected PostHog response/);
    },
  );
});

describe("toKey / toDomain / pageTypeOf", () => {
  test("keeps id-like tokens and maps the rest", () => {
    expect(toKey("ageGroup")).toBe("ageGroup");
    expect(toKey("OAI-SearchBot")).toBe("OAI-SearchBot");
    expect(toKey("has space")).toBe("$other");
    expect(toKey("x".repeat(65))).toBe("$other");
    expect(toKey(null)).toBe("$none");
    expect(toKey("")).toBe("$none");
  });

  test("keeps bare hosts and maps anything else to $other", () => {
    expect(toDomain("www.google.com")).toBe("www.google.com");
    expect(toDomain("WWW.Bing.com")).toBe("www.bing.com");
    expect(toDomain("$direct")).toBe("$direct");
    expect(toDomain("localhost:3000")).toBe("localhost:3000");
    expect(toDomain("https://evil.example/path?q=1")).toBe("$other");
    expect(toDomain("Bad Domain!")).toBe("$other");
    expect(toDomain(null)).toBe("$other");
  });

  test("trusts a known page_type property, else classifies the path", () => {
    expect(pageTypeOf("city", "/")).toBe("city");
    expect(pageTypeOf(null, "/storytimes/ca/oakland")).toBe("city");
    expect(pageTypeOf("not-a-type", "/privacy")).toBe("privacy");
    expect(pageTypeOf(undefined, undefined)).toBe("other");
  });
});

describe("parseS1", () => {
  test("totals plus page groups via the shared classifier", () => {
    const block = parseS1({ totals: fixture("s1-totals.json"), byPage: fixture("s1-by-page.json") });
    expect(block).toEqual({
      status: "ok",
      pageviews: 148,
      visitors: 121,
      byPageGroup: { home: 20, city: 80, library: 40, state: 5, other: 2, privacy: 1 },
    });
    expectValid("S1", block);
  });

  test("no pageviews is a zero-rows reading, not an error", () => {
    const block = parseS1({ totals: fixture("empty.json"), byPage: fixture("empty.json") });
    expect(block).toEqual({ status: "zero-rows", pageviews: 0, visitors: 0, byPageGroup: {} });
    expectValid("S1", block);
  });
});

describe("parseS2", () => {
  test("counts every search, buckets only known kinds and outcomes", () => {
    const block = parseS2(fixture("s2.json"));
    expect(block).toEqual({
      status: "ok",
      searches: 11,
      byKind: { zip: 7, city: 3 },
      byOutcome: { ok: 7, ambiguous: 2, "not-found": 1, error: 0 },
    });
    expectValid("S2", block);
  });

  test("zero searches", () => {
    const block = parseS2(fixture("empty.json"));
    expect(block.status).toBe("zero-rows");
    expect(block.searches).toBe(0);
    expectValid("S2", block);
  });
});

describe("parseSystemCounts (S3/S4)", () => {
  test("unquotes JSON array items, drops non-FSCSKEYs, sorts by count", () => {
    const block = parseSystemCounts(fixture("s3.json"), "missesBySystem");
    expect(block).toEqual({
      status: "ok",
      missesBySystem: [
        { system: "NY0778", count: 2 },
        { system: "CA0114", count: 1 },
        { system: "IL0432", count: 1 },
      ],
    });
    expectValid("S3", block);
  });

  test("S4 shape", () => {
    const block = parseSystemCounts(fixture("s4.json"), "zeroEventBySystem");
    expect(block).toEqual({ status: "ok", zeroEventBySystem: [{ system: "CA0114", count: 3 }] });
    expectValid("S4", block);
  });

  test("merges duplicate systems and caps at 500 rows", () => {
    const rows = Array.from({ length: 600 }, (_, i) => [`"CA${String(i).padStart(4, "0")}"`, 1]);
    const response = { columns: ["system", "n"], results: [...rows, ['"CA0000"', 2]] };
    const block = parseSystemCounts(response, "missesBySystem");
    expect(block.missesBySystem).toHaveLength(500);
    expect(block.missesBySystem[0]).toEqual({ system: "CA0000", count: 3 });
    expectValid("S3", block);
  });

  test("empty → zero-rows with an empty list", () => {
    expect(parseSystemCounts(fixture("empty.json"), "missesBySystem")).toEqual({
      status: "zero-rows",
      missesBySystem: [],
    });
  });
});

describe("parseS9", () => {
  test("outbound clicks and filter changes by filter name (never values)", () => {
    const block = parseS9(fixture("s9.json"));
    expect(block).toEqual({
      status: "ok",
      outboundClicks: 3,
      filterChanges: { radius: 2, ageGroup: 1, $other: 1, $none: 1 },
    });
    expectValid("S9", block);
  });

  test("nothing happened", () => {
    const block = parseS9(fixture("empty.json"));
    expect(block).toEqual({ status: "zero-rows", outboundClicks: 0, filterChanges: {} });
  });
});

describe("parseF6", () => {
  test("hits by bot plus llms.txt hits", () => {
    const block = parseF6(fixture("f6.json"));
    expect(block).toEqual({
      status: "ok",
      hitsByBot: { "OAI-SearchBot": 2097, Amazonbot: 618, "meta-externalagent": 415, $none: 5 },
      llmsTxtHits: 4,
    });
    expectValid("F6", block);
  });

  test("no bot traffic", () => {
    expect(parseF6(fixture("empty.json"))).toEqual({ status: "zero-rows", hitsByBot: {}, llmsTxtHits: 0 });
  });
});

describe("parseReferrers (F7 + F8)", () => {
  test("F7 counts AI engines; F8 keeps top domains, self excluded, junk → $other", () => {
    const { F7, F8 } = parseReferrers(fixture("referrers.json"));
    expect(F7).toEqual({ status: "ok", visitsByEngine: { chatgpt: 2, perplexity: 1 } });
    expect(F8).toEqual({
      status: "ok",
      topReferrers: [
        { domain: "www.google.com", pageviews: 349 },
        { domain: "$direct", pageviews: 234 },
        { domain: "www.bing.com", pageviews: 5 },
        { domain: "duckduckgo.com", pageviews: 3 },
        { domain: "$other", pageviews: 2 },
        { domain: "chatgpt.com", pageviews: 2 },
        { domain: "www.perplexity.ai", pageviews: 1 },
      ],
    });
    expectValid("F7", F7);
    expectValid("F8", F8);
  });

  test("F7 = 0 with traffic is a real ok reading", () => {
    const response = { columns: ["domain", "n"], results: [["www.google.com", 10]] };
    expect(parseReferrers(response).F7).toEqual({ status: "ok", visitsByEngine: {} });
  });

  test("caps F8 at 25 domains", () => {
    const results = Array.from({ length: 40 }, (_, i) => [`site${i}.example`, 100 - i]);
    const { F8 } = parseReferrers({ columns: ["domain", "n"], results });
    expect(F8.topReferrers).toHaveLength(25);
    expectValid("F8", F8);
  });

  test("no pageviews → zero-rows for both", () => {
    const { F7, F8 } = parseReferrers(fixture("empty.json"));
    expect(F7.status).toBe("zero-rows");
    expect(F8).toEqual({ status: "zero-rows", topReferrers: [] });
  });
});

describe("parseF10", () => {
  test("counts by context only", () => {
    const block = parseF10(fixture("f10.json"));
    expect(block).toEqual({ status: "ok", submissions: 3, byContext: { "no-location": 1, "no-events": 2 } });
    expectValid("F10", block);
  });

  test("no feedback", () => {
    expect(parseF10(fixture("empty.json"))).toEqual({ status: "zero-rows", submissions: 0, byContext: {} });
  });
});

describe("phase-0 check", () => {
  test("first/last seen per signal; never-seen signals read null", () => {
    const rows = parsePhase0(fixture("phase0.json"));
    expect(rows.find((row) => row.id === "S1")).toEqual({
      id: "S1",
      label: "$pageview",
      firstSeen: "2026-11-24",
      lastSeen: "2026-11-27",
      count: 592,
    });
    expect(rows.find((row) => row.id === "F7")).toMatchObject({ firstSeen: null, lastSeen: null, count: 0 });
    expect(rows).toHaveLength(10);
  });

  test("formats a readable report with an arrived summary", () => {
    const text = formatPhase0(parsePhase0(fixture("phase0.json")), { since: "2026-11-24" });
    expect(text).toMatch(/S1\s+\$pageview\s+first-seen 2026-11-24\s+last-seen 2026-11-27\s+events 592/);
    expect(text).toMatch(/F7 .*never/);
    expect(text).toContain("arrived: 9/10");
  });

  test("rejects a response with no row", () => {
    expect(() => parsePhase0(fixture("empty.json"))).toThrow(/no row/);
  });
});
