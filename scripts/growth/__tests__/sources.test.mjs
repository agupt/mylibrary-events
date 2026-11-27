/**
 * Source wiring with an injected fetch (offline: data-refresh runs
 * `npm test`). Proves the collectors route each response to the right
 * parser, never leak credentials into blocks or errors, and always return
 * schema-valid blocks.
 */
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { POSTHOG_QUERIES, dayWindow } from "../sources/posthogQueries.mjs";
import { POSTHOG_SIGNAL_IDS, collectPosthog, phase0Check } from "../sources/posthog.mjs";
import { GSC_SIGNAL_IDS, collectGsc } from "../sources/gsc.mjs";
import { collectBing } from "../sources/bing.mjs";
import { generateKeyPairSync } from "node:crypto";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const read = (dir, name) => readFileSync(path.join(FIXTURES, dir, name), "utf8");
const json = (body, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const PH_KEY = "phx_SECRET_personal_key_123";
const PH_ENV = { POSTHOG_PERSONAL_API_KEY: PH_KEY, POSTHOG_PROJECT_ID: "764013" };

function expectAllValid(blocks) {
  for (const [id, block] of Object.entries(blocks)) {
    const result = signalSchemas[id].safeParse(block);
    expect(result.success, `${id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
  }
}

// ---- PostHog --------------------------------------------------------------

const PH_FIXTURE_BY_QUERY = {
  s1Totals: "s1-totals.json",
  s1ByPage: "s1-by-page.json",
  s2: "s2.json",
  s3: "s3.json",
  s4: "s4.json",
  s9: "s9.json",
  f6: "f6.json",
  referrers: "referrers.json",
  f10: "f10.json",
  s12Coverage: "s12-coverage-on.json",
  s12Sessions: "s12-sessions.json",
  s12Actions: "s12-actions.json",
};

function posthogFetch({ failing = [] } = {}) {
  const window = dayWindow("2026-11-27");
  const byQuery = new Map(
    Object.entries(POSTHOG_QUERIES).map(([name, build]) => [build(window), name]),
  );
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const name = byQuery.get(body.query.query) ?? (body.query.query.includes("s1_first") ? "phase0" : null);
    calls.push({ url, init, name });
    if (failing.includes(name)) return json({ type: "server_error", detail: `boom token=${PH_KEY}` }, 500);
    if (name === "phase0") return json(read("posthog", "phase0.json"));
    if (!name) return json({ detail: "unknown query" }, 400);
    return json(read("posthog", PH_FIXTURE_BY_QUERY[name]));
  };
  return { fetchImpl, calls };
}

describe("collectPosthog", () => {
  test("collects every PostHog signal into schema-valid blocks", async () => {
    const { fetchImpl, calls } = posthogFetch();
    const blocks = await collectPosthog({ date: "2026-11-27", env: PH_ENV, fetchImpl });
    expect(Object.keys(blocks).sort()).toEqual([...POSTHOG_SIGNAL_IDS].sort());
    expectAllValid(blocks);
    expect(blocks.S1.pageviews).toBe(148);
    expect(blocks.S12.status).toBe("ok");
    expect(blocks.F7.visitsByEngine).toEqual({ chatgpt: 2, perplexity: 1 });
    expect(calls.every(({ name }) => name)).toBe(true);
    expect(calls[0].url).toBe("https://us.posthog.com/api/projects/764013/query/");
    expect(calls[0].init.headers.authorization).toBe(`Bearer ${PH_KEY}`);
  });

  test("missing credentials → not-configured, no network", async () => {
    const { fetchImpl, calls } = posthogFetch();
    const blocks = await collectPosthog({ date: "2026-11-27", env: {}, fetchImpl });
    expect(new Set(Object.values(blocks).map((b) => b.status))).toEqual(new Set(["not-configured"]));
    expect(calls).toHaveLength(0);
  });

  test("a failing query errors only its own signal, and never echoes the key", async () => {
    const { fetchImpl } = posthogFetch({ failing: ["s2"] });
    const blocks = await collectPosthog({ date: "2026-11-27", env: PH_ENV, fetchImpl });
    expect(blocks.S2.status).toBe("error");
    expect(blocks.S2.error).toMatch(/PostHog query failed: HTTP 500/);
    expect(blocks.S1.status).toBe("ok");
    expect(JSON.stringify(blocks)).not.toContain(PH_KEY);
    expectAllValid(blocks);
  });

  test("rejects a project id that is not numeric", async () => {
    const { fetchImpl } = posthogFetch();
    const blocks = await collectPosthog({
      date: "2026-11-27",
      env: { ...PH_ENV, POSTHOG_PROJECT_ID: "../../admin" },
      fetchImpl,
    });
    expect(blocks.S1).toEqual({ status: "error", error: "POSTHOG_PROJECT_ID must be numeric" });
  });
});

describe("phase0Check", () => {
  test("prints per-signal first-seen dates", async () => {
    const { fetchImpl } = posthogFetch();
    const { rows, text } = await phase0Check({ env: PH_ENV, fetchImpl, until: "2026-11-28" });
    expect(rows).toHaveLength(10);
    expect(text).toContain("first-seen 2026-11-24");
    expect(text).not.toContain(PH_KEY);
  });

  test("needs credentials", async () => {
    await expect(phase0Check({ env: {}, fetchImpl: async () => json({}) })).rejects.toThrow(/not configured/);
  });
});

// ---- GSC ------------------------------------------------------------------

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const GSC_ENV = {
  GSC_SITE_URL: "sc-domain:mylibrary-events.com",
  GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "observer@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }),
};

function gscFetch({ inspectStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body && typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : null;
    calls.push({ url, init, body });
    if (url === "https://oauth2.googleapis.com/token") return json(read("gsc", "token.json"));
    if (url === "https://mylibrary-events.com/sitemap.xml") return json(read("gsc", "sitemap.xml"));
    if (url.includes("urlInspection")) {
      if (inspectStatus !== 200) return json({ error: { code: inspectStatus, status: "RESOURCE_EXHAUSTED" } }, inspectStatus);
      return json(read("gsc", body.inspectionUrl.includes("/library/") ? "inspect-discovered.json" : "inspect-indexed.json"));
    }
    if (url.includes("searchAnalytics")) {
      const dims = (body.dimensions ?? []).join(",");
      if (dims === "date") return json(read("gsc", "f1-totals.json"));
      if (dims === "query,page") return json(read("gsc", "f2-query-page.json"));
      if (dims === "page" && body.startDate === body.endDate) return json(read("gsc", "f1-pages.json"));
      if (dims === "page") {
        const days = (Date.parse(body.endDate) - Date.parse(body.startDate)) / 86_400_000 + 1;
        return json(read("gsc", days === 7 ? "f3-week-pages.json" : "f3-curve-pages.json"));
      }
    }
    return json({ error: "unexpected" }, 404);
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

describe("collectGsc", () => {
  test("a non-Monday run collects F1 and F4; F2/F3 are not-due", async () => {
    const { fetchImpl, calls } = gscFetch();
    const blocks = await collectGsc({ date: "2026-11-27", env: GSC_ENV, fetchImpl, sleep: noSleep, inspectPerDay: 10 });
    expect(Object.keys(blocks).sort()).toEqual([...GSC_SIGNAL_IDS].sort());
    expectAllValid(blocks);
    expect(blocks.F1).toMatchObject({ status: "ok", dataDate: "2026-11-24", clicks: 120 });
    expect(blocks.F2).toEqual({ status: "not-due" });
    expect(blocks.F3).toEqual({ status: "not-due" });
    expect(blocks.F4).toMatchObject({ status: "ok", sampled: 10, indexedByType: { library: 0 } });
    const inspections = calls.filter(({ url }) => url.includes("urlInspection"));
    expect(inspections).toHaveLength(10);
    expect(inspections[0].body.siteUrl).toBe("sc-domain:mylibrary-events.com");
    const analytics = calls.find(({ url }) => url.includes("searchAnalytics"));
    expect(analytics.url).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Amylibrary-events.com/searchAnalytics/query",
    );
    expect(analytics.init.headers.authorization).toBe("Bearer ya29.fixture-token");
  });

  test("a Monday run adds F2 and F3 and keeps no query strings", async () => {
    const { fetchImpl } = gscFetch();
    const blocks = await collectGsc({ date: "2026-11-30", env: GSC_ENV, fetchImpl, sleep: noSleep, inspectPerDay: 5 });
    expectAllValid(blocks);
    expect(blocks.F2.status).toBe("ok");
    expect(blocks.F3.status).toBe("ok");
    expect(JSON.stringify(blocks)).not.toContain("storytime oakland");
  });

  test("throttles URL inspection to one request per second", async () => {
    const { fetchImpl } = gscFetch();
    const waits = [];
    await collectGsc({
      date: "2026-11-27",
      env: GSC_ENV,
      fetchImpl,
      sleep: async (ms) => waits.push(ms),
      inspectPerDay: 4,
    });
    expect(waits).toEqual([1000, 1000, 1000]);
  });

  test("a quota rejection stops inspecting and reports an error", async () => {
    const { fetchImpl, calls } = gscFetch({ inspectStatus: 429 });
    const blocks = await collectGsc({ date: "2026-11-27", env: GSC_ENV, fetchImpl, sleep: noSleep, inspectPerDay: 10 });
    expect(blocks.F4).toEqual({ status: "error", error: "URL Inspection failed: HTTP 429 RESOURCE_EXHAUSTED" });
    expect(calls.filter(({ url }) => url.includes("urlInspection"))).toHaveLength(1);
    expect(blocks.F1.status).toBe("ok");
  });

  test("missing secrets → not-configured", async () => {
    const blocks = await collectGsc({ date: "2026-11-27", env: {}, fetchImpl: async () => json({}), sleep: noSleep });
    expect(blocks).toEqual({
      F1: { status: "not-configured" },
      F2: { status: "not-configured" },
      F3: { status: "not-configured" },
      F4: { status: "not-configured" },
    });
  });

  test("a failed token exchange errors every GSC signal without leaking the key", async () => {
    const fetchImpl = async () => json({ error: "invalid_grant", error_description: "bad" }, 400);
    const blocks = await collectGsc({ date: "2026-11-30", env: GSC_ENV, fetchImpl, sleep: noSleep });
    for (const block of Object.values(blocks)) {
      expect(block).toEqual({ status: "error", error: "GSC token exchange failed: HTTP 400 invalid_grant" });
    }
    expect(JSON.stringify(blocks)).not.toContain("PRIVATE KEY");
  });
});

// ---- Bing -----------------------------------------------------------------

const BING_KEY = "bingSECRETkey0123456789";

describe("collectBing", () => {
  test("Monday: latest weekly bucket; key sent, never stored", async () => {
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return json(read("bing", "rank-traffic-zero.json"));
    };
    const blocks = await collectBing({ date: "2026-11-30", env: { BING_WEBMASTER_API_KEY: BING_KEY }, fetchImpl });
    expect(blocks).toEqual({ F5: { status: "zero-rows", weekOf: "2026-11-23", clicks: 0, impressions: 0 } });
    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe(
      "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats",
    );
    expect(url.searchParams.get("siteUrl")).toBe("https://mylibrary-events.com/");
    expect(url.searchParams.get("apikey")).toBe(BING_KEY);
  });

  test("not Monday → not-due, no network", async () => {
    const fetchImpl = async () => {
      throw new Error("should not be called");
    };
    expect(await collectBing({ date: "2026-11-27", env: { BING_WEBMASTER_API_KEY: BING_KEY }, fetchImpl })).toEqual({
      F5: { status: "not-due" },
    });
  });

  test("no key → not-configured", async () => {
    expect(await collectBing({ date: "2026-11-30", env: {}, fetchImpl: async () => json({}) })).toEqual({
      F5: { status: "not-configured" },
    });
  });

  test("HTTP errors and network errors never leak the key (it rides in the URL)", async () => {
    const httpError = await collectBing({
      date: "2026-11-30",
      env: { BING_WEBMASTER_API_KEY: BING_KEY },
      fetchImpl: async () => json(read("bing", "error.json"), 400),
    });
    expect(httpError.F5).toEqual({ status: "error", error: "Bing GetRankAndTrafficStats failed: HTTP 400 InvalidApiKey" });

    const networkError = await collectBing({
      date: "2026-11-30",
      env: { BING_WEBMASTER_API_KEY: BING_KEY },
      fetchImpl: async (url) => {
        throw new TypeError(`fetch failed for ${url} apikey ${BING_KEY}`);
      },
    });
    expect(networkError.F5.status).toBe("error");
    expect(networkError.F5.error).not.toContain(BING_KEY);
  });
});
