import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildBreadcrumbList,
  buildEventItemList,
  buildEventNode,
  buildFaqPage,
  buildLibraryItemList,
  buildLibraryNode,
  buildWebsiteNode,
  SITE_URL,
} from "@/lib/seo/jsonLd";
import type { Library, StorytimeEvent } from "@/lib/types";

const library: Library = {
  id: "CA0081-002",
  name: "Oakland Main Library",
  system: "Oakland Public Library",
  address: "125 14th St.",
  city: "Oakland",
  state: "CA",
  zipCode: "94612",
  coordinates: { latitude: 37.8013084, longitude: -122.263615 },
  websiteUrl: "https://oaklandlibrary.org",
};

const event: StorytimeEvent = {
  id: "evt-1",
  libraryId: "CA0081-002",
  title: "Toddler Storytime",
  eventType: "storytime",
  ageGroups: ["toddler"],
  startTime: "2026-07-22T10:30:00",
  endTime: "2026-07-22T11:00:00",
  description: "Songs and stories for toddlers.",
};

describe("absoluteUrl", () => {
  it("prefixes root-relative paths with SITE_URL", () => {
    expect(absoluteUrl("/storytimes/ca")).toBe(`${SITE_URL}/storytimes/ca`);
    expect(absoluteUrl("storytimes/ca")).toBe(`${SITE_URL}/storytimes/ca`);
  });

  it("passes through absolute URLs unchanged", () => {
    expect(absoluteUrl("https://example.com/x")).toBe("https://example.com/x");
  });
});

describe("buildBreadcrumbList", () => {
  it("emits 1-based positions and absolute item URLs", () => {
    const node = buildBreadcrumbList([
      { name: "Home", path: "/" },
      { name: "California", path: "/storytimes/ca" },
    ]);
    const items = node.itemListElement as Array<Record<string, unknown>>;
    expect(items[0].position).toBe(1);
    expect(items[1].item).toBe(`${SITE_URL}/storytimes/ca`);
  });
});

describe("buildLibraryNode", () => {
  it("uses a #library @id, absolute mainEntityOfPage, and the website url", () => {
    const node = buildLibraryNode(library, "/library/ca/oakland/oakland-main-library");
    expect(node["@type"]).toBe("Library");
    expect(node["@id"]).toBe(
      `${SITE_URL}/library/ca/oakland/oakland-main-library#library`,
    );
    expect(node.url).toBe("https://oaklandlibrary.org");
    expect((node.address as Record<string, unknown>).postalCode).toBe("94612");
  });

  it("omits url entirely when the library has no website", () => {
    const { websiteUrl: _omit, ...noSite } = library;
    const node = buildLibraryNode(noSite as Library, "/library/ca/oakland/x");
    expect("url" in node).toBe(false);
  });
});

describe("buildLibraryItemList", () => {
  it("lists URL-only items with contiguous positions", () => {
    const node = buildLibraryItemList("Cities", [
      { name: "A", path: "/storytimes/ca/a" },
      { name: "B", path: "/storytimes/ca/b" },
    ]);
    const items = node.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items[0].url).toBe(`${SITE_URL}/storytimes/ca/a`);
  });
});

describe("buildEventNode / buildEventItemList", () => {
  it("marks the event free and offline with audience ages", () => {
    const node = buildEventNode(event, library, "/library/ca/oakland/x");
    expect(node["@type"]).toBe("Event");
    expect(node.startDate).toBe("2026-07-22T10:30:00");
    expect(node.isAccessibleForFree).toBe(true);
    expect((node.offers as Record<string, unknown>).price).toBe("0");
    const audience = node.audience as Record<string, unknown>;
    expect(audience.suggestedMinAge).toBe(1);
    expect(audience.suggestedMaxAge).toBe(3);
  });

  it("caps the ItemList and references the location node", () => {
    const map = new Map([[library.id, library]]);
    const node = buildEventItemList([event, event, event], map, "/x", 2);
    const items = node.itemListElement as unknown[];
    expect(items.length).toBe(2);
  });

  it("falls back to the library id and omits organizer when no library is known", () => {
    const node = buildEventNode(event, undefined, "/x");
    expect((node.location as Record<string, unknown>).name).toBe("CA0081-002");
    expect("organizer" in node).toBe(false);
    expect("audience" in node).toBe(true);
  });

  it("synthesizes a description and omits audience for eventless age data", () => {
    const bare: StorytimeEvent = {
      ...event,
      description: "",
      ageGroups: [],
    };
    const node = buildEventNode(bare, library, "/x");
    expect(typeof node.description).toBe("string");
    expect((node.description as string).length).toBeGreaterThan(0);
    expect("audience" in node).toBe(false);
  });

  it("emits an all-ages audience without numeric bounds", () => {
    const allAges: StorytimeEvent = { ...event, ageGroups: ["all-ages"] };
    const node = buildEventNode(allAges, library, "/x");
    const audience = node.audience as Record<string, unknown>;
    expect(audience).toBeDefined();
    expect("suggestedMinAge" in audience).toBe(false);
    expect("suggestedMaxAge" in audience).toBe(false);
  });

  it("omits the organizer url when the library has no website", () => {
    const { websiteUrl: _drop, ...noSite } = library;
    const node = buildEventNode(event, noSite as Library, "/x");
    const organizer = node.organizer as Record<string, unknown>;
    expect("url" in organizer).toBe(false);
  });
});

describe("buildFaqPage / buildWebsiteNode", () => {
  it("wraps questions with accepted answers", () => {
    const node = buildFaqPage([{ question: "Q?", answer: "A." }]);
    const main = node.mainEntity as Array<Record<string, unknown>>;
    expect(main[0]["@type"]).toBe("Question");
    expect((main[0].acceptedAnswer as Record<string, unknown>).text).toBe("A.");
  });

  it("builds a WebSite node without a SearchAction", () => {
    const node = buildWebsiteNode();
    expect(node["@type"]).toBe("WebSite");
    expect("potentialAction" in node).toBe(false);
  });
});
