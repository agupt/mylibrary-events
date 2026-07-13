import { describe, expect, test, vi } from "vitest";
import { createIcsProvider } from "../events/libcal/provider";
import type { Library } from "../types";

const MVPL: Library = {
  id: "CA0076-002",
  name: "Mountain View Public Library",
  system: "Mountain View Public Library",
  address: "585 Franklin St",
  city: "Mountain View",
  state: "CA",
  zipCode: "94041",
  coordinates: { latitude: 37.3913, longitude: -122.0827 },
};

const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART:20260715T170000Z",
  "DTEND:20260715T173000Z",
  "UID:ev-1",
  "SUMMARY:Preschool Storytime",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20260716T010000Z",
  "DTEND:20260716T020000Z",
  "UID:ev-2",
  "SUMMARY:Adults Only Trivia Night",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261001T170000Z",
  "DTEND:20261001T173000Z",
  "UID:ev-3",
  "SUMMARY:Baby Lapsit (out of range)",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const RANGE = {
  start: new Date("2026-07-12T00:00:00Z"),
  end: new Date("2026-07-26T00:00:00Z"),
};

describe("createIcsProvider", () => {
  test("serves kid events, drops adult-only and out-of-range ones", async () => {
    const provider = createIcsProvider({
      feeds: { CA0076: "https://example.libcal.com/ical" },
      fetchText: vi.fn(async () => ICS),
      findLibraryById: (id) => (id === MVPL.id ? MVPL : undefined),
    });

    const events = await provider.getEvents([MVPL.id], RANGE);

    expect(events.map((e) => e.title)).toEqual(["Preschool Storytime"]);
    expect(events[0].libraryId).toBe(MVPL.id);
    expect(events[0].eventType).toBe("storytime");
    expect(events[0].ageGroups).toEqual(["preschool"]);
  });

  test("returns empty for systems without a configured feed", async () => {
    const fetchText = vi.fn(async () => ICS);
    const provider = createIcsProvider({
      feeds: {},
      fetchText,
      findLibraryById: () => MVPL,
    });

    expect(await provider.getEvents([MVPL.id], RANGE)).toEqual([]);
    expect(fetchText).not.toHaveBeenCalled();
  });

  test("drops other branches' events when locations carry branch names", async () => {
    const fairOaks: Library = {
      ...MVPL,
      id: "CA0105-010",
      name: "Fair Oaks Library",
    };
    const branchIcs = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART:20260715T170000Z",
      "UID:fo-1",
      "SUMMARY:Toddler Storytime",
      "LOCATION:Fair Oaks - Fair Oaks Meeting Room",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20260715T180000Z",
      "UID:cm-1",
      "SUMMARY:Preschool Storytime",
      "LOCATION:Carmichael - Carmichael Meeting Room",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const provider = createIcsProvider({
      feeds: { CA0105: "https://engage.example.org/ical" },
      fetchText: vi.fn(async () => branchIcs),
      findLibraryById: (id) => (id === fairOaks.id ? fairOaks : undefined),
    });

    const events = await provider.getEvents([fairOaks.id], RANGE);

    // Fair Oaks kept; Carmichael (unselected branch) dropped, NOT
    // mis-attributed to the requested outlet
    expect(events.map((e) => e.title)).toEqual(["Toddler Storytime"]);
  });

  test("attributes by street address when LOCATION has no branch name", async () => {
    const central: Library = {
      ...MVPL,
      id: "TX0003-002",
      name: "Dallas Public Library",
      address: "1515 Young St",
    };
    const addressIcs = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART:20260715T170000Z",
      "UID:dal-1",
      "SUMMARY:Toddler Storytime",
      "LOCATION:1515 Young Street\\, Dallas\\, TX\\, 75201\\, US",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20260715T180000Z",
      "UID:dal-2",
      "SUMMARY:Baby Rhyme Time",
      "LOCATION:9609 Lake June Road\\, Dallas\\, TX\\, 75217\\, US",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const provider = createIcsProvider({
      feeds: { TX0003: "https://dallaslibrary.librarymarket.com/ical" },
      fetchText: vi.fn(async () => addressIcs),
      findLibraryById: (id) => (id === central.id ? central : undefined),
    });

    const events = await provider.getEvents([central.id], RANGE);

    // 1515 Young matches Central by address; Lake June (another branch)
    // is dropped, not mis-attributed
    expect(events.map((e) => e.title)).toEqual(["Toddler Storytime"]);
  });

  test("attributes unlocated events to the system's main outlet", async () => {
    const branch: Library = { ...MVPL, id: "CA0076-005", name: "North Branch" };
    const provider = createIcsProvider({
      feeds: { CA0076: "https://example.libcal.com/ical" },
      fetchText: vi.fn(async () => ICS),
      findLibraryById: (id) =>
        id === MVPL.id ? MVPL : id === branch.id ? branch : undefined,
    });

    const events = await provider.getEvents([branch.id, MVPL.id], RANGE);

    // No LOCATION in the feed → events go to the lowest-sequence outlet
    expect(events[0].libraryId).toBe(MVPL.id);
    expect(events).toHaveLength(1); // not duplicated across outlets
  });
});
