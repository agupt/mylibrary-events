import { describe, expect, test } from "vitest";
import { expandRecurrence } from "../events/recurrence";

const ms = (iso: string) => Date.UTC(
  +iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10),
  +iso.slice(11, 13) || 0, +iso.slice(14, 16) || 0,
);

describe("expandRecurrence", () => {
  test("weekly series anchored in the past yields this window's occurrences", () => {
    // Thursdays, started 2023, still running — window is one week in 2026.
    const occ = expandRecurrence(
      "2023-07-13T10:00:00",
      "2023-07-13T11:00:00",
      "FREQ=WEEKLY;UNTIL=20270326T235959Z;BYDAY=TH",
      [],
      ms("2026-07-16T00:00:00"),
      ms("2026-07-23T00:00:00"),
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]).toEqual({
      startTime: "2026-07-16T10:00:00",
      endTime: "2026-07-16T11:00:00",
    });
  });

  test("monthly nth-weekday (3rd Saturday) lands on the right date", () => {
    const occ = expandRecurrence(
      "2024-01-20T14:00:00",
      "2024-01-20T15:00:00",
      "FREQ=MONTHLY;UNTIL=20270306T235959Z;BYDAY=3SA",
      [],
      ms("2026-07-01T00:00:00"),
      ms("2026-07-31T00:00:00"),
    );
    // 3rd Saturday of July 2026 is the 18th.
    expect(occ).toEqual([
      { startTime: "2026-07-18T14:00:00", endTime: "2026-07-18T15:00:00" },
    ]);
  });

  test("EXDATE removes an excluded occurrence", () => {
    const occ = expandRecurrence(
      "2026-07-02T10:00:00",
      "2026-07-02T11:00:00",
      "FREQ=WEEKLY;BYDAY=TH",
      ["20260716T100000"],
      ms("2026-07-01T00:00:00"),
      ms("2026-07-31T00:00:00"),
    );
    const dates = occ.map((o) => o.startTime.slice(0, 10));
    expect(dates).toContain("2026-07-09");
    expect(dates).not.toContain("2026-07-16"); // excluded
    expect(dates).toContain("2026-07-23");
  });

  test("a series that already ended (UNTIL in the past) yields nothing", () => {
    const occ = expandRecurrence(
      "2024-01-01T10:00:00",
      "2024-01-01T11:00:00",
      "FREQ=WEEKLY;UNTIL=20240429T235959Z;BYDAY=MO",
      [],
      ms("2026-07-16T00:00:00"),
      ms("2026-07-30T00:00:00"),
    );
    expect(occ).toEqual([]);
  });
});
