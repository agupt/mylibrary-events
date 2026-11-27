import { describe, expect, test } from "vitest";
import {
  buildPageContext,
  buildWidgetLoadedEvent,
  NAV_SLOTS,
  withPageContext,
} from "../analytics/pageEvents";
import { resolveLinkClick } from "../analytics/linkClicks";
import { buildOutboundClickEvent } from "../analytics/events";

const ORIGIN = "https://mylibrary-events.com";
const LIBRARY_PATH = "/library/ca/oakland/oakland-main-library";

describe("buildPageContext", () => {
  test("carries the classification of the current path", () => {
    expect(buildPageContext("/storytimes/ca/oakland")).toEqual({
      page_type: "city",
      page_state: "CA",
      page_city: "oakland",
    });
  });

  test("adds the IMLS outlet id on a library page when the marker matches the path", () => {
    expect(buildPageContext(LIBRARY_PATH, { path: LIBRARY_PATH, libraryId: "CA0081-002" })).toEqual({
      page_type: "library",
      page_state: "CA",
      page_city: "oakland",
      page_library: "CA0081-002",
    });
  });

  test("ignores a stale marker left from another page", () => {
    expect(
      buildPageContext(LIBRARY_PATH, { path: "/library/ca/oakland/other", libraryId: "CA0081-003" }),
    ).not.toHaveProperty("page_library");
  });

  test("ignores a marker that is not an IMLS outlet id", () => {
    expect(
      buildPageContext(LIBRARY_PATH, { path: LIBRARY_PATH, libraryId: "<script>" }),
    ).not.toHaveProperty("page_library");
  });

  test("never attaches page_library to a non-library page", () => {
    expect(buildPageContext("/", { path: "/", libraryId: "CA0081-002" })).toEqual({ page_type: "home" });
  });
});

describe("withPageContext", () => {
  test("returns a new event with context merged under the event's own properties", () => {
    const event = { name: "page_action", properties: { action: "nav_click", page_type: "city" } } as const;
    const enriched = withPageContext(event, { page_type: "home", page_state: "CA" });
    expect(enriched).toEqual({
      name: "page_action",
      properties: { page_type: "city", page_state: "CA", action: "nav_click" },
    });
    expect(event.properties).toEqual({ action: "nav_click", page_type: "city" });
  });
});

describe("buildWidgetLoadedEvent", () => {
  test.each([
    ["ready", 12, "ready"],
    ["ready", 0, "empty"],
    ["error", 0, "error"],
  ] as const)("status %s with %i events → outcome %s", (status, count, outcome) => {
    expect(
      buildWidgetLoadedEvent({ pagePath: "/storytimes/ca/oakland", status, eventCount: count, libraryCount: 3 }),
    ).toEqual({
      name: "page_action",
      properties: {
        action: "widget_loaded",
        page_type: "city",
        outcome,
        event_count: count,
        library_count: 3,
      },
    });
  });
});

describe("resolveLinkClick", () => {
  const base = { origin: ORIGIN, currentPath: "/storytimes/ca/oakland" };

  test("internal link → nav_click with target page type and slot", () => {
    expect(resolveLinkClick({ ...base, href: `${ORIGIN}${LIBRARY_PATH}`, slot: "branch" })).toEqual({
      name: "page_action",
      properties: { action: "nav_click", page_type: "city", target_page_type: "library", slot: "branch" },
    });
  });

  test("relative hrefs resolve against the origin", () => {
    expect(resolveLinkClick({ ...base, href: "/storytimes/ca", slot: "state" })?.properties).toMatchObject({
      target_page_type: "state",
      slot: "state",
    });
  });

  test("unknown or missing slot → other", () => {
    expect(resolveLinkClick({ ...base, href: "/", slot: "made-up" })?.properties).toMatchObject({ slot: "other" });
    expect(resolveLinkClick({ ...base, href: "/" })?.properties).toMatchObject({ slot: "other", target_page_type: "home" });
  });

  test("library website link on a landing page → outbound_click landing_library", () => {
    expect(
      resolveLinkClick({
        origin: ORIGIN,
        currentPath: LIBRARY_PATH,
        href: "https://oaklandlibrary.org/?ref=abc",
        kind: "outbound",
        libraryId: "CA0081-002",
      }),
    ).toEqual({
      name: "outbound_click",
      properties: {
        link: "library_website",
        library_id: "CA0081-002",
        system: "CA0081",
        placement: "landing_library",
        page_type: "library",
      },
    });
  });

  test("outbound link with an invalid library id falls back to external_click", () => {
    expect(
      resolveLinkClick({ ...base, href: "https://x.org/", kind: "outbound", libraryId: "nope" }),
    ).toEqual({
      name: "page_action",
      properties: { action: "external_click", page_type: "city", slot: "other", target_domain: "x.org" },
    });
  });

  test("other external link → external_click with the domain only", () => {
    expect(
      resolveLinkClick({ ...base, href: "https://www.IMLS.gov/research?x=1#y", slot: "footer" }),
    ).toEqual({
      name: "page_action",
      properties: { action: "external_click", page_type: "city", slot: "footer", target_domain: "www.imls.gov" },
    });
  });

  test.each([
    ["already tracked by its component", { href: "https://x.org", kind: "manual" }],
    ["mailto", { href: "mailto:privacy@mylibrary-events.com" }],
    ["tel", { href: "tel:5551234567" }],
    ["javascript", { href: "javascript:void(0)" }],
    ["same-page anchor", { href: "#faq" }],
    ["unparseable", { href: "http://[" }],
  ])("ignores %s links", (_label, input) => {
    expect(resolveLinkClick({ ...base, ...input })).toBeNull();
  });
});

// ---- Privacy deny-list: every builder's output keys are on an allowlist and
// no value carries a URL, query, email, or IP-ish string. ----

const ALLOWED_KEYS = new Set([
  "action",
  "page_type",
  "page_state",
  "page_city",
  "page_library",
  "target_page_type",
  "slot",
  "outcome",
  "event_count",
  "library_count",
  "target_domain",
  "link",
  "library_id",
  "system",
  "placement",
]);

function assertPrivate(properties: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(properties)) {
    expect(ALLOWED_KEYS.has(key), `unexpected key ${key}`).toBe(true);
    expect(key).not.toMatch(/ip|query|message|url|href|referrer/i);
    if (typeof value === "string") {
      expect(value, `${key} looks like a URL/query`).not.toMatch(/[/?#=@:]|https?|\s/);
    } else {
      expect(["number", "boolean"]).toContain(typeof value);
    }
  }
}

describe("privacy deny-list", () => {
  const outputs: Record<string, unknown>[] = [
    buildPageContext(LIBRARY_PATH, { path: LIBRARY_PATH, libraryId: "CA0081-002" }),
    buildPageContext("/storytimes/ca/oakland?q=94110&email=a@b.co"),
    buildWidgetLoadedEvent({ pagePath: LIBRARY_PATH, status: "ready", eventCount: 4, libraryCount: 1 }).properties,
    buildOutboundClickEvent({ libraryId: "CA0081-002", placement: "landing_library", pageType: "library" }).properties,
    ...[
      { href: `${ORIGIN}/storytimes/ca?q=secret`, slot: "breadcrumb" },
      { href: "https://user:pw@evil.example.com/path?q=secret", slot: "footer" },
      { href: "https://oaklandlibrary.org/?q=secret", kind: "outbound", libraryId: "CA0081-002" },
    ].map((input) => resolveLinkClick({ origin: ORIGIN, currentPath: "/?q=secret", ...input })?.properties ?? {}),
  ];

  test.each(outputs.map((o, i) => [i, o]))("output %i only carries allowlisted, non-free-text values", (_i, props) => {
    assertPrivate(props as Record<string, unknown>);
  });

  test("every declared nav slot is a plain token", () => {
    NAV_SLOTS.forEach((slot) => expect(slot).toMatch(/^[a-z_]+$/));
  });
});
