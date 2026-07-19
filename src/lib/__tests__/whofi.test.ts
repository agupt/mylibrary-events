import { describe, expect, test, vi } from "vitest";
import {
  createWhofiProvider,
  parseWhofiResponse,
} from "../events/custom/whofiProvider";
import type { Library } from "../types";

const RESPONSE = JSON.stringify([
  {
    id: "1",
    title: "10:30a | Storytime",
    clean_title: "Storytime",
    start: "2026-07-20 10:30:00",
    end: "2026-07-20 11:00:00",
    desc: "<p>Songs &amp; books.</p>",
    category_name: "Children's Programs",
    age: "Children (Ages 0-5)",
    location_name: "Keller Public Library",
    allDay: false,
  },
  {
    id: "2",
    title: "5:30p | Block Party",
    clean_title: "Block Party",
    start: "2026-07-21 17:30:00",
    end: "2026-07-21 18:30:00",
    desc: "Building fun.",
    category_name: "Children's Programs",
    age: "Children (Ages 6-11)",
    location_name: "Keller Public Library",
    allDay: false,
  },
  {
    id: "3",
    title: "1p | Keller Knits",
    clean_title: "Keller Knits",
    start: "2026-07-22 13:00:00",
    end: "2026-07-22 14:00:00",
    desc: "Adults knitting.",
    category_name: "Adult programs",
    age: "Adult (Ages 19+)",
    location_name: "Keller Public Library",
    allDay: false,
  },
  {
    id: "4",
    title: "CANCELLED: Baby Storytime",
    clean_title: "CANCELLED: Baby Storytime",
    start: "2026-07-23 10:30:00",
    end: "2026-07-23 11:00:00",
    desc: "",
    category_name: "Baby Programs",
    age: "Children (Ages 0-5)",
    location_name: "Keller Public Library",
    allDay: false,
  },
]);

const KELLER: Library = {
  id: "TX0120-002",
  name: "Keller Public Library",
  system: "Keller Public Library",
  address: "640 Johnson Rd",
  city: "Keller",
  state: "TX",
  zipCode: "76248",
  coordinates: { latitude: 32.9416025, longitude: -97.238904 },
};

const RANGE = {
  start: new Date("2026-07-18T00:00:00"),
  end: new Date("2026-09-16T00:00:00"),
};

describe("parseWhofiResponse", () => {
  test("floats the wall-clock start and strips HTML from the description", () => {
    const events = parseWhofiResponse(RESPONSE);
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      title: "Storytime",
      start: "2026-07-20T10:30:00",
      end: "2026-07-20T11:00:00",
      description: "Songs & books.",
      age: "Children (Ages 0-5)",
    });
  });

  test("returns [] for a non-array payload", () => {
    expect(parseWhofiResponse(JSON.stringify({ error: "nope" }))).toEqual([]);
  });
});

describe("createWhofiProvider", () => {
  test("keeps kid events, maps ages from the label, drops adult + cancelled", async () => {
    const fetchText = vi.fn(async () => RESPONSE);
    const provider = createWhofiProvider({
      feeds: {
        TX0120: "https://keller-tx.whofi.com/calendar/fetch_calendar_events",
      },
      fetchText,
      findLibraryById: (id) => (id === KELLER.id ? KELLER : undefined),
    });

    const events = await provider.getEvents([KELLER.id], RANGE);

    // adult (Keller Knits) and CANCELLED baby storytime are dropped
    expect(events.map((event) => event.title)).toEqual([
      "Storytime",
      "Block Party",
    ]);
    expect(events[0]).toMatchObject({
      libraryId: KELLER.id,
      startTime: "2026-07-20T10:30:00",
    });
    expect(events[0].ageGroups).toEqual(
      expect.arrayContaining(["baby", "toddler"]),
    );
    expect(events[1].ageGroups).toEqual(expect.arrayContaining(["school-age"]));
  });

  test("builds a date-only window URL from the range", async () => {
    const fetchText = vi.fn(async (_url: string) => "[]");
    const provider = createWhofiProvider({
      feeds: {
        TX0120: "https://keller-tx.whofi.com/calendar/fetch_calendar_events",
      },
      fetchText,
      findLibraryById: (id) => (id === KELLER.id ? KELLER : undefined),
    });

    await provider.getEvents([KELLER.id], RANGE);

    expect(fetchText).toHaveBeenCalledTimes(1);
    const url = fetchText.mock.calls[0][0] as string;
    expect(url).toContain("start=2026-07-18T00:00:00");
    expect(url).toContain("end=2026-09-16T00:00:00");
  });
});
