import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { buildFlyQueries, buildS8Block, parsePromScalar } from "../lib/parseFly.mjs";
import { authorizationHeader, collectS8 } from "../sources/fly.mjs";

const fixture = (name) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/fly", name), "utf8"));

describe("buildFlyQueries", () => {
  test("scopes every query to the app over 24h", () => {
    const queries = buildFlyQueries("mylibrary-events");
    expect(queries.requests).toBe(
      'sum(increase(fly_app_http_responses_count{app="mylibrary-events"}[24h]))',
    );
    expect(queries.errors5xx).toContain('status=~"5.."');
    expect(queries.p95Seconds).toMatch(/^histogram_quantile\(0\.95, .* by \(le\)\)$/);
  });

  test("rejects app names that could break out of the label", () => {
    expect(() => buildFlyQueries('x"} or vector(1) #')).toThrow(/invalid Fly app name/);
  });
});

describe("parsePromScalar", () => {
  test("reads a one-series vector", () => {
    expect(parsePromScalar(fixture("requests.json"))).toEqual({ ok: true, value: 18234.57, empty: false });
  });

  test("an empty vector or NaN is empty, not an error", () => {
    expect(parsePromScalar(fixture("empty.json"))).toEqual({ ok: true, value: null, empty: true });
    const nan = { status: "success", data: { resultType: "vector", result: [{ metric: {}, value: [1, "NaN"] }] } };
    expect(parsePromScalar(nan).value).toBeNull();
  });

  test("reads a scalar result", () => {
    const scalar = { status: "success", data: { resultType: "scalar", result: [1, "3.5"] } };
    expect(parsePromScalar(scalar).value).toBe(3.5);
  });

  test("errors: failed query, odd result types, several series", () => {
    expect(parsePromScalar(fixture("bad-query.json"))).toEqual({
      ok: false,
      error: "Prometheus query failed (bad_data)",
    });
    expect(parsePromScalar(null).ok).toBe(false);
    expect(parsePromScalar({ status: "success", data: { resultType: "matrix", result: [] } }).ok).toBe(false);
    const two = { status: "success", data: { resultType: "vector", result: [{ value: [1, "1"] }, { value: [1, "2"] }] } };
    expect(parsePromScalar(two).error).toBe("expected one series, got 2");
  });
});

describe("buildS8Block", () => {
  test("computes the 5xx rate and p95", () => {
    const block = buildS8Block({
      requests: parsePromScalar(fixture("requests.json")),
      errors5xx: parsePromScalar(fixture("errors5xx.json")),
      p95Seconds: parsePromScalar(fixture("p95.json")),
    });
    expect(block.status).toBe("ok");
    expect(block.requests).toBe(18234.57);
    expect(block.rate5xx).toBeCloseTo(41.02 / 18234.57, 8);
    expect(block.p95Seconds).toBe(1.8375);
    expect(signalSchemas.S8.safeParse(block).success).toBe(true);
  });

  test("no 5xx series means a 0 rate; no requests → zero-rows", () => {
    const empty = parsePromScalar(fixture("empty.json"));
    const ok = buildS8Block({
      requests: parsePromScalar(fixture("requests.json")),
      errors5xx: empty,
      p95Seconds: empty,
    });
    expect(ok.rate5xx).toBe(0);
    expect(ok.p95Seconds).toBeNull();
    const zero = buildS8Block({ requests: empty, errors5xx: empty, p95Seconds: empty });
    expect(zero).toEqual({ status: "zero-rows", requests: 0, rate5xx: null, p95Seconds: null });
    expect(signalSchemas.S8.safeParse(zero).success).toBe(true);
  });

  test("any failed query → error", () => {
    const block = buildS8Block({
      requests: parsePromScalar(fixture("requests.json")),
      errors5xx: parsePromScalar(fixture("bad-query.json")),
      p95Seconds: parsePromScalar(fixture("p95.json")),
    });
    expect(block).toEqual({ status: "error", error: "Prometheus query failed (bad_data)" });
  });
});

describe("collectS8", () => {
  test("FLY_API_TOKEN absent (today) → not-configured, no network", async () => {
    const fetch = vi.fn();
    for (const env of [{}, { FLY_ORG_SLUG: "personal" }, { FLY_API_TOKEN: "t" }]) {
      const block = await collectS8({ env, fetch });
      expect(block).toEqual({ status: "not-configured", requests: null, rate5xx: null, p95Seconds: null });
      expect(signalSchemas.S8.safeParse(block).success).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  test("runs the three queries with the token in the header only", async () => {
    const bodies = [fixture("requests.json"), fixture("errors5xx.json"), fixture("p95.json")];
    const fetch = vi.fn(async () => ({ status: 200, json: async () => bodies.shift() }));
    const block = await collectS8({
      env: { FLY_API_TOKEN: "FlyV1 fm2_secret", FLY_ORG_SLUG: "personal" },
      fetch,
      now: 1_764_240_000_000,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.fly\.io\/prometheus\/personal\/api\/v1\/query\?/);
    expect(url).toContain("time=1764240000");
    expect(url).not.toContain("fm2_secret");
    expect(init.headers.authorization).toBe("FlyV1 fm2_secret");
    expect(block.status).toBe("ok");
    expect(signalSchemas.S8.safeParse(block).success).toBe(true);
  });

  test("HTTP errors, thrown errors and bad org slugs become error blocks", async () => {
    const env = { FLY_API_TOKEN: "t", FLY_ORG_SLUG: "personal" };
    const unauthorized = await collectS8({ env, fetch: async () => ({ status: 401, json: async () => ({}) }) });
    expect(unauthorized).toEqual({ status: "error", error: "Fly Prometheus HTTP 401" });
    const thrown = await collectS8({ env, fetch: async () => { throw new Error("socket hang up"); } });
    expect(thrown).toEqual({ status: "error", error: "socket hang up" });
    const badOrg = await collectS8({ env: { ...env, FLY_ORG_SLUG: "../x" }, fetch: vi.fn() });
    expect(badOrg.status).toBe("error");
    const badApp = await collectS8({ env, fetch: vi.fn(), app: "Bad App" });
    expect(badApp.status).toBe("error");
  });

  test("authorizationHeader keeps FlyV1 tokens and prefixes bare ones", () => {
    expect(authorizationHeader("FlyV1 abc")).toBe("FlyV1 abc");
    expect(authorizationHeader("abc")).toBe("Bearer abc");
  });
});
