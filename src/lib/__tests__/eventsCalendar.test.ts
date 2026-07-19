import { describe, expect, test, vi } from "vitest";
import {
  createEventsCalendarProvider,
  parseEventsCalendarResponse,
} from "../events/custom/eventsCalendarProvider";
import type { Library } from "../types";

// Shape mirrors the live broker.eventscalendar.co payload for Tulare County
// (visaliaref@gmail.com Google Calendar). Audience is encoded in `color`:
// #fbd75b (yellow) = "Children, Tweens, and Family"; other colors are the
// adult literacy (#ff887c) and teen (#7ae7bf) tracks, which we drop.
const RESPONSE = JSON.stringify({
  result: true,
  events: [
    {
      id: "kid-timed",
      title: "Sensory Play Day",
      description: "<p>Ages 0-5 explore &amp; play.</p>",
      location: "Visalia Library-Homework Center",
      color: "#fbd75b",
      allday: false,
      start_time: "2026-08-06T09:30:00-07:00",
      end_time: "2026-08-06T10:30:00-07:00",
      startHour: 9,
      startMinutes: 30,
      endHour: 10,
      endMinutes: 30,
    },
    {
      id: "kid-allday",
      title: "Children's Bookwalk",
      description: "Target audience is ages 0-12.",
      location: "Visalia Library-Childrens' Wing",
      color: "#fbd75b",
      allday: true,
      start_time: "2026-07-21",
      end_time: "2026-07-26",
      startHour: 0,
      startMinutes: 0,
      endHour: 0,
      endMinutes: 0,
    },
    {
      id: "adult-literacy",
      title: "English Conversation Circle",
      description: "Practice your English conversational skills.",
      location: "Read To Succeed Literacy Program, Visalia, CA",
      color: "#ff887c",
      allday: true,
      start_time: "2026-07-20",
      end_time: "2026-07-21",
      startHour: 0,
      startMinutes: 0,
      endHour: 0,
      endMinutes: 0,
    },
    {
      id: "teen-track",
      title: "Teen Gaming",
      description: "For teens.",
      location: "Visalia Library-Homework Center",
      color: "#7ae7bf",
      allday: false,
      start_time: "2026-08-10T16:00:00-07:00",
      end_time: "2026-08-10T17:00:00-07:00",
      startHour: 16,
      startMinutes: 0,
      endHour: 17,
      endMinutes: 0,
    },
  ],
});

const KID_COLORS = new Set(["#fbd75b"]);

const VISALIA: Library = {
  id: "CA0148-002",
  name: "Visalia Branch Library",
  system: "Tulare County Free Library",
  address: "200 W Oak Ave",
  city: "Visalia",
  state: "CA",
  zipCode: "93291",
  coordinates: { latitude: 36.3302, longitude: -119.2921 },
};

const DINUBA: Library = {
  id: "CA0148-005",
  name: "Dinuba Branch Library",
  system: "Tulare County Free Library",
  address: "150 S H St",
  city: "Dinuba",
  state: "CA",
  zipCode: "93618",
  coordinates: { latitude: 36.5433, longitude: -119.3873 },
};

const LIBRARIES: Record<string, Library> = {
  [VISALIA.id]: VISALIA,
  [DINUBA.id]: DINUBA,
};

const FEED_URL =
  "https://broker.eventscalendar.co/api/google/events?user=u&project=p&calendar=visaliaref%40gmail.com&kidColors=%23fbd75b";

const RANGE = {
  start: new Date("2026-07-18T00:00:00"),
  end: new Date("2026-09-16T00:00:00"),
};

describe("parseEventsCalendarResponse", () => {
  test("keeps only kid-colored events, floats wall-clock time, strips HTML", () => {
    const events = parseEventsCalendarResponse(RESPONSE, KID_COLORS);
    expect(events.map((e) => e.id)).toEqual(["kid-timed", "kid-allday"]);
    expect(events[0]).toMatchObject({
      title: "Sensory Play Day",
      startTime: "2026-08-06T09:30:00",
      endTime: "2026-08-06T10:30:00",
      description: "Ages 0-5 explore & play.",
      isAllDay: false,
    });
    expect(events[1]).toMatchObject({
      title: "Children's Bookwalk",
      startTime: "2026-07-21T00:00:00",
      isAllDay: true,
    });
  });

  test("returns [] when no colors match", () => {
    expect(parseEventsCalendarResponse(RESPONSE, new Set(["#000000"]))).toEqual(
      [],
    );
  });

  test("returns [] for a payload without an events array", () => {
    expect(
      parseEventsCalendarResponse(JSON.stringify({ result: false }), KID_COLORS),
    ).toEqual([]);
  });
});

describe("createEventsCalendarProvider", () => {
  test("keeps kid events, drops adult/teen colors, attributes to the branch", async () => {
    const fetchText = vi.fn(async () => RESPONSE);
    const provider = createEventsCalendarProvider({
      feeds: { CA0148: FEED_URL },
      fetchText,
      findLibraryById: (id) => LIBRARIES[id],
    });

    const events = await provider.getEvents([VISALIA.id, DINUBA.id], RANGE);

    // adult literacy (#ff887c) and teen (#7ae7bf) are dropped by color
    expect(events.map((e) => e.title)).toEqual([
      "Children's Bookwalk",
      "Sensory Play Day",
    ]);
    // location "Visalia Library-*" → the Visalia branch, not Dinuba
    for (const event of events) {
      expect(event.libraryId).toBe(VISALIA.id);
    }
  });

  test("splits kidColors out of the registry URL and sends a from/to window", async () => {
    const fetchText = vi.fn(async () => RESPONSE);
    const provider = createEventsCalendarProvider({
      feeds: { CA0148: FEED_URL },
      fetchText,
      findLibraryById: (id) => LIBRARIES[id],
    });

    await provider.getEvents([VISALIA.id], RANGE);

    expect(fetchText).toHaveBeenCalledTimes(1);
    const url = fetchText.mock.calls[0][0] as string;
    expect(url).not.toContain("kidColors");
    expect(url).toContain(`from=${RANGE.start.getTime()}`);
    expect(url).toContain(`to=${RANGE.end.getTime()}`);
  });

  test("returns [] and swallows a fetch failure", async () => {
    const fetchText = vi.fn(async () => {
      throw new Error("network down");
    });
    const provider = createEventsCalendarProvider({
      feeds: { CA0148: FEED_URL },
      fetchText,
      findLibraryById: (id) => LIBRARIES[id],
    });

    await expect(provider.getEvents([VISALIA.id], RANGE)).resolves.toEqual([]);
  });
});
