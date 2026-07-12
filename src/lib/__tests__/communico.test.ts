import { describe, expect, test, vi } from "vitest";
import {
  createCommunicoProvider,
  eventDataUrl,
  mapCommunicoEvent,
  type CommunicoRawEvent,
} from "../events/communico/provider";
import type { Library } from "../types";

const RAW: CommunicoRawEvent = {
  id: "14123119",
  title: "Family Storytime",
  sub_title: "All ages with caregiver",
  description: "Join us for stories, songs and fingerplays.",
  event_start: "2026-07-13 10:00:00",
  event_end: "2026-07-13 10:30:00",
  ages: "Preschool, Families",
  tagsArray: ["Storytimes"],
  location: "Bay Village Branch",
  library: "Bay Village Branch",
};

const BAY_VILLAGE: Library = {
  id: "OH0052-004",
  name: "Bay Village Branch Library",
  system: "Cuyahoga County Public Library",
  address: "1 Main St",
  city: "Bay Village",
  state: "OH",
  zipCode: "44140",
  coordinates: { latitude: 41.48, longitude: -81.92 },
};

const RANGE = {
  start: new Date("2026-07-12T00:00:00"),
  end: new Date("2026-07-26T00:00:00"),
};

describe("mapCommunicoEvent", () => {
  test("maps structured ages, tags, and wall-clock times", () => {
    const event = mapCommunicoEvent(RAW, BAY_VILLAGE.id);

    expect(event).toMatchObject({
      id: "14123119",
      libraryId: BAY_VILLAGE.id,
      title: "Family Storytime",
      eventType: "storytime",
      startTime: "2026-07-13T10:00:00",
      endTime: "2026-07-13T10:30:00",
    });
    expect(event?.ageGroups).toEqual(["all-ages", "preschool"]);
  });

  test("drops adult-only and cancelled events", () => {
    expect(
      mapCommunicoEvent({ ...RAW, ages: "Adults, Seniors" }, BAY_VILLAGE.id),
    ).toBeNull();
    expect(
      mapCommunicoEvent({ ...RAW, changed_reason: "Cancelled" }, BAY_VILLAGE.id),
    ).toBeNull();
  });

  test("infers age groups from title when ages are missing", () => {
    const event = mapCommunicoEvent(
      { ...RAW, ages: "", title: "Toddler Dance Party", sub_title: "" },
      BAY_VILLAGE.id,
    );
    expect(event?.ageGroups).toEqual(["toddler"]);
  });
});

describe("createCommunicoProvider", () => {
  test("requests the eeventcaldata endpoint and attributes by branch", async () => {
    const fetchText = vi.fn(async (_url: string) =>
      JSON.stringify([
        RAW,
        { ...RAW, id: "2", location: "Parma Branch", library: "Parma Branch" },
      ]),
    );
    const provider = createCommunicoProvider({
      feeds: { OH0052: "https://attend.cuyahogalibrary.org" },
      fetchText,
      findLibraryById: (id) => (id === BAY_VILLAGE.id ? BAY_VILLAGE : undefined),
    });

    const events = await provider.getEvents([BAY_VILLAGE.id], RANGE);

    expect(fetchText.mock.calls[0][0]).toContain("/eeventcaldata?event_type=0&req=");
    expect(events).toHaveLength(1); // Parma Branch event excluded
    expect(events[0].libraryId).toBe(BAY_VILLAGE.id);
  });

  test("eventDataUrl clamps the day window", () => {
    const url = eventDataUrl("https://attend.example.org", {
      start: new Date("2026-07-12T00:00:00Z"),
      end: new Date("2027-07-12T00:00:00Z"),
    });
    expect(decodeURIComponent(url)).toContain('"days":60');
  });
});
