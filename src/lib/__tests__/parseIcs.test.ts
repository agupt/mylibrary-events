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
    expect(storytime?.startTime).toBe("2026-07-15T17:00:00.000Z");
    expect(storytime?.endTime).toBe("2026-07-15T18:00:00.000Z");
  });

  test("handles TZID-local datetimes without crashing", () => {
    const events = parseIcs(ICS_FIXTURE);
    const yoga = events.find((e) => e.title === "Adult Yoga");
    expect(yoga?.startTime).toBe("2026-07-16T10:00:00.000Z");
  });

  test("skips events with no parseable start date", () => {
    const events = parseIcs(ICS_FIXTURE);
    expect(events.map((e) => e.title)).not.toContain("Broken event with no date");
    expect(events).toHaveLength(2);
  });

  test("returns empty array for an empty calendar", () => {
    expect(parseIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toEqual([]);
  });
});
