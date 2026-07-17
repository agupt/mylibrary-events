import { describe, expect, test, vi } from "vitest";
import {
  createOpenCitiesProvider,
  parseOpenCitiesResponse,
} from "../events/custom/openCitiesProvider";
import type { Library } from "../types";

const RESPONSE = JSON.stringify({
  success: true,
  data: [
    {
      Date: "22/07/2026",
      Items: [
        { Id: "a1", Name: "Storytime", DateTime: "7/22/2026 10:30:00 AM", CalendarId: "kids" },
        { Id: "a2", Name: "Adult Book Club", DateTime: "7/22/2026 6:00:00 PM", CalendarId: "kids" },
      ],
    },
    {
      Date: "23/07/2026",
      Items: [
        { Id: "a3", Name: "Village Rhythms", DateTime: "7/23/2026 11:00:00 AM", CalendarId: "kids" },
      ],
    },
  ],
});

const MENLO: Library = {
  id: "CA0067-002",
  name: "Menlo Park Public Library",
  system: "Menlo Park Public Library",
  address: "800 Alma St",
  city: "Menlo Park",
  state: "CA",
  zipCode: "94025",
  coordinates: { latitude: 37.45, longitude: -122.18 },
};

const RANGE = {
  start: new Date("2026-07-20T00:00:00"),
  end: new Date("2026-08-03T00:00:00"),
};

describe("openCities parsing", () => {
  test("flattens day-grouped items and parses AM/PM datetimes", () => {
    const events = parseOpenCitiesResponse(RESPONSE);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ name: "Storytime", startTime: "2026-07-22T10:30:00" });
    expect(events[2].startTime).toBe("2026-07-23T11:00:00");
  });

  test("returns empty on a malformed payload", () => {
    expect(parseOpenCitiesResponse('{"success":false}')).toEqual([]);
  });
});

describe("createOpenCitiesProvider", () => {
  test("POSTs the calendar ids/date range, infers ages, drops adult-only", async () => {
    const postJson = vi.fn(async (_url: string, _body: unknown) => RESPONSE);
    const provider = createOpenCitiesProvider({
      feeds: {
        CA0067:
          "https://www.menlopark.gov/ocapi/calendars/getcalendaritems?calendars=kids",
      },
      postJson,
      findLibraryById: (id) => (id === MENLO.id ? MENLO : undefined),
    });

    const events = await provider.getEvents([MENLO.id], RANGE);

    expect(postJson).toHaveBeenCalledWith(
      "https://www.menlopark.gov/ocapi/calendars/getcalendaritems",
      { LanguageCode: "en-US", Ids: ["kids"], StartDate: "2026-07-20", EndDate: "2026-08-03" },
    );
    expect(events).toHaveLength(2); // adult book club dropped
    expect(events.map((e) => e.title)).toEqual(["Storytime", "Village Rhythms"]);
    expect(events[0]).toMatchObject({
      libraryId: MENLO.id,
      eventType: "storytime",
      startTime: "2026-07-22T10:30:00",
    });
    expect(events[1].eventType).toBe("music-movement"); // "Rhythms"
  });
});
