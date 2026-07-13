import { describe, expect, test } from "vitest";
import {
  mapSnapshotEvent,
  parseSnapshotTime,
} from "../events/snapshot/provider";

const RAW = {
  title: "Baby Lapsit Storytime",
  link: "/events/programs/2026/07/06/baby-lapsit-storytime",
  date: "2026-07-14",
  time: "Tue, July 14 @ 12:30 PM",
  location: "Yorkville Library, Meeting Room",
  audience: "Children,Infant (0-18 months)",
  description: "Bond with your little one.",
};

describe("parseSnapshotTime", () => {
  test("parses 12-hour times", () => {
    expect(parseSnapshotTime("Today @ 12:30 PM")).toBe("12:30:00");
    expect(parseSnapshotTime("Tue, July 14 @ 3 PM")).toBe("15:00:00");
    expect(parseSnapshotTime("Wed @ 12 AM")).toBe("00:00:00");
    expect(parseSnapshotTime("no time here")).toBe("00:00:00");
  });
});

describe("mapSnapshotEvent", () => {
  test("maps month-based age ranges to baby, not school-age", () => {
    const event = mapSnapshotEvent(RAW, "NY0778-002", "https://www.nypl.org");

    expect(event).toMatchObject({
      title: "Baby Lapsit Storytime",
      eventType: "storytime",
      startTime: "2026-07-14T12:30:00",
    });
    // "Infant (0-18 months)" must parse as months → baby only;
    // "Children" adds school-age
    expect(event?.ageGroups).toContain("baby");
    expect(event?.ageGroups).not.toContain("toddler");
  });

  test("drops adult-only audiences", () => {
    expect(
      mapSnapshotEvent({ ...RAW, audience: "Adults" }, "NY0778-002", "x"),
    ).toBeNull();
  });

  test("rejects malformed dates", () => {
    expect(mapSnapshotEvent({ ...RAW, date: "Today" }, "NY0778-002", "x")).toBeNull();
  });
});
