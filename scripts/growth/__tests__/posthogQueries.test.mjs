import { describe, expect, test } from "vitest";
import {
  ALLOWED_PROPERTIES,
  PHASE0_SIGNALS,
  POSTHOG_QUERIES,
  checkQueryPrivacy,
  dayWindow,
  phase0Query,
} from "../sources/posthogQueries.mjs";

const WINDOW = dayWindow("2026-11-27");

/** Every HogQL string the observer can send, built for a sample window. */
function allQueries() {
  return [
    ...Object.entries(POSTHOG_QUERIES).map(([name, build]) => [name, build(WINDOW)]),
    ["phase0", phase0Query("2026-11-24", "2026-11-28")],
  ];
}

describe("dayWindow", () => {
  test("covers the UTC day before the run date", () => {
    expect(dayWindow("2026-11-27")).toEqual({ from: "2026-11-26", to: "2026-11-27" });
  });

  test("crosses month and year boundaries", () => {
    expect(dayWindow("2027-01-01")).toEqual({ from: "2026-12-31", to: "2027-01-01" });
  });

  test("rejects anything that is not an ISO date", () => {
    expect(() => dayWindow("2026-11-27' OR 1=1")).toThrow(/ISO date/);
    expect(() => dayWindow("2026-13-01")).toThrow(/ISO date/);
  });
});

describe("privacy deny-list (assumption 9: public repo)", () => {
  test.each(allQueries())("%s never selects $ip, message, free text or SELECT *", (_name, sql) => {
    expect(checkQueryPrivacy(sql)).toEqual([]);
  });

  test("every query reads only allow-listed properties", () => {
    for (const [, sql] of allQueries()) {
      const used = [...sql.matchAll(/properties\.(\$?[A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
      for (const name of used) expect(ALLOWED_PROPERTIES).toContain(name);
    }
  });

  test.each([
    ["$ip", "SELECT properties.$ip FROM events"],
    ["message", "SELECT properties.message FROM events"],
    ["JSON message", "SELECT JSONExtractString(properties, 'message') FROM events"],
    ["SELECT *", "SELECT * FROM events"],
    ["select star spaced", "select\n  *\nfrom events"],
    ["full URL", "SELECT properties.$current_url FROM events"],
    ["full referrer", "SELECT properties.$referrer FROM events"],
    ["filter value", "SELECT properties.value FROM events"],
    ["whole properties blob", "SELECT event, properties FROM events"],
    ["user agent", "SELECT properties.$raw_user_agent FROM events"],
    ["unlisted property", "SELECT properties.home_city FROM events"],
  ])("flags %s", (_label, sql) => {
    expect(checkQueryPrivacy(sql).length).toBeGreaterThan(0);
  });

  test("does not flag $referring_domain (a domain, not a URL)", () => {
    expect(checkQueryPrivacy("SELECT properties.$referring_domain AS d FROM events")).toEqual([]);
  });
});

describe("query shape", () => {
  test("every query is bounded by the window and a LIMIT", () => {
    for (const [name, build] of Object.entries(POSTHOG_QUERIES)) {
      const sql = build(WINDOW);
      expect(sql, name).toContain("toDateTime('2026-11-26 00:00:00', 'UTC')");
      expect(sql, name).toContain("toDateTime('2026-11-27 00:00:00', 'UTC')");
      expect(sql, name).toMatch(/\bLIMIT \d+\s*$/);
    }
  });

  test("the phase-0 check names every Phase 0 signal once", () => {
    const ids = PHASE0_SIGNALS.map((signal) => signal.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining(["S1", "S2", "S3", "S4", "S9_outbound", "S9_filter", "F6", "F7", "F8", "F10"]),
    );
    const sql = phase0Query("2026-11-24", "2026-11-28");
    for (const id of ids) expect(sql).toContain(`${id.toLowerCase()}_first`);
  });

  test("the F7 condition lists the AI referrer domains", () => {
    const sql = phase0Query("2026-11-24", "2026-11-28");
    expect(sql).toContain("'chatgpt.com'");
    expect(sql).toContain("'perplexity.ai'");
  });
});
