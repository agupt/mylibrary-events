import { describe, expect, test } from "vitest";
import { filterEvents } from "../filterEvents";
import type { StorytimeEvent } from "../types";

const EVENTS: StorytimeEvent[] = [
  {
    id: "1",
    libraryId: "sfpl-main",
    title: "Baby Rhyme Time",
    eventType: "storytime",
    ageGroups: ["baby"],
    startTime: "2026-07-14T17:30:00.000Z",
    endTime: "2026-07-14T18:00:00.000Z",
    description: "",
  },
  {
    id: "2",
    libraryId: "opl-main",
    title: "LEGO Builders Club",
    eventType: "stem",
    ageGroups: ["school-age"],
    startTime: "2026-07-15T22:00:00.000Z",
    endTime: "2026-07-15T23:00:00.000Z",
    description: "",
  },
  {
    id: "3",
    libraryId: "sfpl-main",
    title: "Family Music & Movement",
    eventType: "music-movement",
    ageGroups: ["toddler", "preschool", "all-ages"],
    startTime: "2026-07-16T17:00:00.000Z",
    endTime: "2026-07-16T17:45:00.000Z",
    description: "",
  },
];

describe("filterEvents", () => {
  test("returns all events when no filters are set", () => {
    expect(filterEvents(EVENTS, {})).toEqual(EVENTS);
  });

  test("filters by age group", () => {
    const result = filterEvents(EVENTS, { ageGroup: "toddler" });
    expect(result.map((e) => e.id)).toEqual(["3"]);
  });

  test("filters by event type", () => {
    const result = filterEvents(EVENTS, { eventType: "stem" });
    expect(result.map((e) => e.id)).toEqual(["2"]);
  });

  test("filters by library location", () => {
    const result = filterEvents(EVENTS, { libraryIds: ["sfpl-main"] });
    expect(result.map((e) => e.id)).toEqual(["1", "3"]);
  });

  test("combines all filters with AND semantics", () => {
    const result = filterEvents(EVENTS, {
      ageGroup: "preschool",
      eventType: "music-movement",
      libraryIds: ["sfpl-main"],
    });
    expect(result.map((e) => e.id)).toEqual(["3"]);
  });

  test("returns empty array when nothing matches", () => {
    const result = filterEvents(EVENTS, {
      ageGroup: "baby",
      eventType: "stem",
    });
    expect(result).toEqual([]);
  });

  test("does not mutate the input array", () => {
    const copy = [...EVENTS];
    filterEvents(EVENTS, { ageGroup: "baby" });
    expect(EVENTS).toEqual(copy);
  });

  test("filters by inclusive date range on the event's start day", () => {
    expect(
      filterEvents(EVENTS, { dateStart: "2026-07-15", dateEnd: "2026-07-15" }).map((e) => e.id),
    ).toEqual(["2"]);
    expect(
      filterEvents(EVENTS, { dateStart: "2026-07-15" }).map((e) => e.id),
    ).toEqual(["2", "3"]);
    expect(
      filterEvents(EVENTS, { dateEnd: "2026-07-14" }).map((e) => e.id),
    ).toEqual(["1"]);
  });
});
