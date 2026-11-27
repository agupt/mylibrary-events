import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { entrySourceOf, firstActionOf, isEngaged, parseS12 } from "../lib/engagement.mjs";

function fixture(name) {
  return JSON.parse(
    readFileSync(path.join(import.meta.dirname, "fixtures/posthog", name), "utf8"),
  );
}

const LIVE = () => ({
  coverage: fixture("s12-coverage-on.json"),
  sessions: fixture("s12-sessions.json"),
  actions: fixture("s12-actions.json"),
});

describe("entrySourceOf", () => {
  test.each([
    [{ referringDomain: "$direct" }, "direct"],
    [{ referringDomain: null }, "direct"],
    [{ referringDomain: "" }, "direct"],
    [{ referringDomain: "www.google.com" }, "search"],
    [{ referringDomain: "www.google.co.uk" }, "search"],
    [{ referringDomain: "duckduckgo.com" }, "search"],
    [{ referringDomain: "www.bing.com" }, "search"],
    [{ referringDomain: "search.yahoo.com" }, "search"],
    [{ referringDomain: "chatgpt.com" }, "ai"],
    [{ referringDomain: "www.reddit.com" }, "social"],
    [{ referringDomain: "l.facebook.com" }, "social"],
    [{ referringDomain: "t.co" }, "social"],
    [{ referringDomain: "mylibrary-events.com" }, "internal"],
    [{ referringDomain: "www.mylibrary-events.com" }, "internal"],
    [{ referringDomain: "oaklandlibrary.org" }, "referral"],
    [{ referringDomain: "www.google.com", hasCampaign: 1 }, "campaign"],
  ])("%o → %s", (input, source) => {
    expect(entrySourceOf(input)).toBe(source);
  });
});

describe("engaged-visit definition (§1a)", () => {
  test.each([
    [{ pageviews: 1, engaged_actions: 0 }, false],
    [{ pageviews: 2, engaged_actions: 0 }, true],
    [{ pageviews: 1, engaged_actions: 1 }, true],
    [{ pageviews: null, engaged_actions: null }, false],
  ])("%o → %s", (row, engaged) => {
    expect(isEngaged(row)).toBe(engaged);
  });

  test("first action: the engaged action, else browse (≥2 pageviews), else none", () => {
    expect(firstActionOf({ first_action: "outbound_click", pageviews: 1 })).toBe("outbound_click");
    expect(firstActionOf({ first_action: "", pageviews: 3 })).toBe("browse");
    expect(firstActionOf({ first_action: null, pageviews: 1 })).toBe("none");
    expect(firstActionOf({ first_action: "event open!", pageviews: 1 })).toBe("$other");
  });
});

describe("parseS12", () => {
  test("reads not-configured until WS-D's page_type reaches pageviews", () => {
    const block = parseS12({ ...LIVE(), coverage: fixture("s12-coverage-off.json") });
    expect(block).toEqual({ status: "not-configured" });
  });

  test("reads not-configured when visits carry no $session_id (assumption 8)", () => {
    const coverage = { columns: ["typed_pageviews", "session_pageviews"], results: [[150, 0]] };
    expect(parseS12({ ...LIVE(), coverage })).toEqual({ status: "not-configured" });
  });

  test("entry source → landing page type, engaged rate, actions, funnel", () => {
    const block = parseS12(LIVE());
    expect(block.status).toBe("ok");
    expect(block.visitsByEntry).toEqual({
      search: { city: 2, library: 1 },
      direct: { home: 1, privacy: 1 },
      ai: { city: 1 },
      social: { city: 1 },
      campaign: { home: 1 },
      internal: { state: 1 },
      referral: { library: 1 },
    });
    expect(block.engagedRateByPageType).toEqual({
      city: 0.5,
      library: 1,
      home: 0.5,
      state: 0,
      privacy: 0,
    });
    expect(block.actionsByPageType).toEqual({
      city: { widget_loaded: 40, outbound_click: 4 },
      home: { search_performed: 7, filter_changed: 6 },
      library: { nav_click: 3, $other: 1 },
    });
    expect(block.funnel).toHaveLength(10);
    expect(block.funnel).toContainEqual({ source: "search", pageType: "library", action: "browse", visits: 1 });
    expect(block.funnel).toContainEqual({ source: "referral", pageType: "library", action: "$other", visits: 1 });
    const result = signalSchemas.S12.safeParse(block);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  test("never carries paths into the block", () => {
    const text = JSON.stringify(parseS12(LIVE()));
    expect(text).not.toMatch(/\/storytimes|\/library\//);
  });

  test("funnel is sorted by visits and capped at 50 rows", () => {
    const results = Array.from({ length: 80 }, (_, i) => [
      `site${i % 60}.example`, 0, "city", "/", 1, 1, `action_${i % 60}`,
    ]);
    const sessions = { columns: fixture("s12-sessions.json").columns, results };
    const block = parseS12({ ...LIVE(), sessions });
    expect(block.funnel).toHaveLength(50);
    expect(block.funnel[0].visits).toBeGreaterThanOrEqual(block.funnel[49].visits);
    expect(signalSchemas.S12.safeParse(block).success).toBe(true);
  });

  test("configured but no visits → zero-rows with empty maps", () => {
    const empty = fixture("empty.json");
    expect(parseS12({ ...LIVE(), sessions: empty, actions: empty })).toEqual({
      status: "zero-rows",
      visitsByEntry: {},
      actionsByPageType: {},
      engagedRateByPageType: {},
      funnel: [],
    });
  });
});
