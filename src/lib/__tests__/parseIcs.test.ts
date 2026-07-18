import { describe, expect, test } from "vitest";
import { parseIcs } from "../events/libcal/parseIcs";

const ICS_FIXTURE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Springshare//LibCal//EN",
  "BEGIN:VEVENT",
  "DTSTART:20260715T170000Z",
  "DTEND:20260715T180000Z",
  "UID:LibCal-12345",
  "SUMMARY:Toddler Storytime\\, Indoors",
  "DESCRIPTION:Songs and stories\\nfor little ones. This line is long enou",
  " gh to be folded across two physical lines per RFC 5545.",
  "LOCATION:Children's Room",
  "CATEGORIES:Storytime,Kids",
  "URL:https://example.libcal.com/event/12345",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Los_Angeles:20260716T100000",
  "DTEND;TZID=America/Los_Angeles:20260716T110000",
  "SUMMARY:Adult Yoga",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260718",
  "DTEND;VALUE=DATE:20260719",
  "SUMMARY:Summer Reading Kickoff",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:Broken event with no date",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  test("parses a VEVENT with folding, escapes, and categories", () => {
    const events = parseIcs(ICS_FIXTURE);

    const storytime = events.find((e) => e.uid === "LibCal-12345");
    expect(storytime).toBeDefined();
    expect(storytime?.title).toBe("Toddler Storytime, Indoors");
    expect(storytime?.description).toContain("folded across two physical lines");
    expect(storytime?.location).toBe("Children's Room");
    expect(storytime?.categories).toEqual(["Storytime", "Kids"]);
    // A trailing "Z" is a genuine UTC instant and is PRESERVED here; the ICS
    // provider projects it into the library's own zone. (Stripping it to
    // floating wall-clock shifted every event by the UTC offset.)
    expect(storytime?.startTime).toBe("2026-07-15T17:00:00Z");
    expect(storytime?.endTime).toBe("2026-07-15T18:00:00Z");
    expect(storytime?.isAllDay).toBe(false);
  });

  test("keeps TZID-local wall-clock digits without a zone", () => {
    const events = parseIcs(ICS_FIXTURE);
    const yoga = events.find((e) => e.title === "Adult Yoga");
    expect(yoga?.startTime).toBe("2026-07-16T10:00:00");
    expect(yoga?.isAllDay).toBe(false);
  });

  test("flags DATE-only (all-day) events and anchors them to midnight", () => {
    const events = parseIcs(ICS_FIXTURE);
    const allDay = events.find((e) => e.title === "Summer Reading Kickoff");
    expect(allDay?.startTime).toBe("2026-07-18T00:00:00");
    expect(allDay?.isAllDay).toBe(true);
  });

  test("skips events with no parseable start date", () => {
    const events = parseIcs(ICS_FIXTURE);
    expect(events.map((e) => e.title)).not.toContain("Broken event with no date");
    expect(events).toHaveLength(3);
  });

  test("returns empty array for an empty calendar", () => {
    expect(parseIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toEqual([]);
  });
});
