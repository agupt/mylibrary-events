import { describe, expect, test } from "vitest";
import {
  buildFeedbackEvent,
  buildFilterChangedEvents,
  buildOutboundClickEvent,
  buildSearchPerformedEvent,
  buildSearchResultsEvent,
  classifyQuery,
  outcomeFromHttpStatus,
} from "../analytics/events";
import { systemKeyOf } from "../libraryId";
import type { Library, StorytimeEvent } from "../types";

function lib(id: string): Library {
  return {
    id,
    name: `Library ${id}`,
    system: "Sys",
    address: "1 Main St",
    city: "Town",
    state: "CA",
    zipCode: "94000",
    coordinates: { latitude: 0, longitude: 0 },
  };
}

function evt(libraryId: string): StorytimeEvent {
  return {
    id: `e-${libraryId}`,
    libraryId,
    title: "Storytime",
    eventType: "storytime",
    ageGroups: ["toddler"],
    startTime: "2026-11-25T10:00:00",
    endTime: "2026-11-25T10:30:00",
    description: "",
  };
}

describe("systemKeyOf", () => {
  test("returns the FSCSKEY part of an outlet id", () => {
    expect(systemKeyOf("CA0081-002")).toBe("CA0081");
  });

  test("returns the whole id when there is no sequence", () => {
    expect(systemKeyOf("CA0081")).toBe("CA0081");
  });
});

describe("classifyQuery", () => {
  test("treats a 5-digit string as a zip", () => {
    expect(classifyQuery(" 94110 ")).toBe("zip");
  });

  test("treats anything else as a city", () => {
    expect(classifyQuery("Oakland, CA")).toBe("city");
    expect(classifyQuery("9411")).toBe("city");
  });
});

describe("outcomeFromHttpStatus", () => {
  test("maps 404 to not-found and 400 to ambiguous", () => {
    expect(outcomeFromHttpStatus(404)).toBe("not-found");
    expect(outcomeFromHttpStatus(400)).toBe("ambiguous");
  });

  test("maps anything else (or unknown) to error", () => {
    expect(outcomeFromHttpStatus(500)).toBe("error");
    expect(outcomeFromHttpStatus(undefined)).toBe("error");
  });
});

describe("buildSearchPerformedEvent", () => {
  test("never includes the raw query text", () => {
    const event = buildSearchPerformedEvent({
      query: "Springfield",
      outcome: "ambiguous",
    });
    expect(event).toEqual({
      name: "search_performed",
      properties: { query_kind: "city", outcome: "ambiguous" },
    });
    expect(JSON.stringify(event)).not.toContain("Springfield");
  });

  test("adds home system and state on success", () => {
    const event = buildSearchPerformedEvent({
      query: "94607",
      outcome: "ok",
      homeLibrary: lib("CA0081-002"),
    });
    expect(event.properties).toEqual({
      query_kind: "zip",
      outcome: "ok",
      home_system: "CA0081",
      matched_state: "CA",
    });
  });
});

describe("buildSearchResultsEvent", () => {
  test("reports systems without feed (S3) and feed systems with zero events (S4)", () => {
    const scope = [lib("CA0081-002"), lib("CA0081-003"), lib("CA0002-002"), lib("CA0044-002")];
    const event = buildSearchResultsEvent({
      homeLibrary: scope[0],
      scopeLibraries: scope,
      events: [evt("CA0081-003")],
      libraryIdsWithoutFeed: ["CA0002-002"],
      radiusMiles: 10,
    });
    expect(event).toEqual({
      name: "search_results",
      properties: {
        home_system: "CA0081",
        home_has_feed: true,
        systems_without_feed: ["CA0002"],
        zero_event_systems: ["CA0044"],
        event_count: 1,
        library_count: 4,
        system_count: 3,
        radius_miles: 10,
      },
    });
  });

  test("flags a home system with no feed and ignores out-of-scope ids", () => {
    const scope = [lib("TX0001-002")];
    const event = buildSearchResultsEvent({
      homeLibrary: scope[0],
      scopeLibraries: scope,
      events: [],
      libraryIdsWithoutFeed: ["TX0001-002", "ZZ9999-002"],
      radiusMiles: 5,
    });
    expect(event.properties.home_has_feed).toBe(false);
    expect(event.properties.systems_without_feed).toEqual(["TX0001"]);
    expect(event.properties.zero_event_systems).toEqual([]);
  });

  test("marks a failed events fetch without guessing per-system state", () => {
    const scope = [lib("CA0081-002")];
    const event = buildSearchResultsEvent({
      homeLibrary: scope[0],
      scopeLibraries: scope,
      events: [],
      libraryIdsWithoutFeed: [],
      radiusMiles: 10,
      fetchFailed: true,
    });
    expect(event.properties).toMatchObject({
      fetch_failed: true,
      systems_without_feed: [],
      zero_event_systems: [],
    });
  });
});

describe("buildFilterChangedEvents", () => {
  const base = { ageGroup: "", eventType: "", libraryId: "", datePreset: "any" };

  test("emits one event per changed filter", () => {
    const events = buildFilterChangedEvents(base, {
      ...base,
      ageGroup: "toddler",
      datePreset: "week",
    });
    expect(events).toEqual([
      { name: "filter_changed", properties: { filter: "ageGroup", value: "toddler" } },
      { name: "filter_changed", properties: { filter: "datePreset", value: "week" } },
    ]);
  });

  test("emits nothing when filters are unchanged and reports cleared filters as empty", () => {
    expect(buildFilterChangedEvents(base, { ...base })).toEqual([]);
    expect(
      buildFilterChangedEvents({ ...base, eventType: "craft" }, base),
    ).toEqual([{ name: "filter_changed", properties: { filter: "eventType", value: "" } }]);
  });
});

describe("buildOutboundClickEvent", () => {
  test("records the library, its system, and where the link sat", () => {
    expect(buildOutboundClickEvent({ libraryId: "CA0081-002", placement: "home" })).toEqual({
      name: "outbound_click",
      properties: {
        link: "library_website",
        library_id: "CA0081-002",
        system: "CA0081",
        placement: "home",
      },
    });
  });
});

describe("buildFeedbackEvent", () => {
  test("scrubs the message and carries context", () => {
    const event = buildFeedbackEvent({
      message: "  Please add Fremont! mail me at a@b.com  ",
      context: "no-feed",
      homeLibraryId: "CA0045-002",
    });
    expect(event).toEqual({
      name: "feedback_submitted",
      properties: {
        message: "Please add Fremont! mail me at [email]",
        context: "no-feed",
        home_system: "CA0045",
      },
    });
  });

  test("returns null for an empty message", () => {
    expect(buildFeedbackEvent({ message: "   ", context: "no-location" })).toBeNull();
  });
});
