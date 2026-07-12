import { describe, expect, test } from "vitest";
import { AGE_GROUPS, EVENT_TYPES } from "../constants";
import { mockEventProvider } from "../events/mockEventProvider";

const RANGE = {
  start: new Date("2026-07-13T00:00:00Z"),
  end: new Date("2026-07-27T00:00:00Z"),
};

describe("mockEventProvider", () => {
  test("generates events only for requested libraries", async () => {
    // Act
    const events = await mockEventProvider.getEvents(["sfpl-main"], RANGE);

    // Assert
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.libraryId === "sfpl-main")).toBe(true);
  });

  test("generates events only within the requested date range", async () => {
    // Act
    const events = await mockEventProvider.getEvents(
      ["sfpl-main", "opl-main"],
      RANGE,
    );

    // Assert
    for (const event of events) {
      const start = new Date(event.startTime);
      expect(start.getTime()).toBeGreaterThanOrEqual(RANGE.start.getTime());
      expect(start.getTime()).toBeLessThan(RANGE.end.getTime());
    }
  });

  test("is deterministic for the same inputs", async () => {
    // Act
    const first = await mockEventProvider.getEvents(["bpl-central"], RANGE);
    const second = await mockEventProvider.getEvents(["bpl-central"], RANGE);

    // Assert
    expect(first).toEqual(second);
  });

  test("produces valid event types and age groups", async () => {
    // Act
    const events = await mockEventProvider.getEvents(["sjpl-mlk"], RANGE);

    // Assert
    for (const event of events) {
      expect(EVENT_TYPES).toContain(event.eventType);
      expect(event.ageGroups.length).toBeGreaterThan(0);
      for (const ageGroup of event.ageGroups) {
        expect(AGE_GROUPS).toContain(ageGroup);
      }
      expect(new Date(event.endTime).getTime()).toBeGreaterThan(
        new Date(event.startTime).getTime(),
      );
    }
  });

});
