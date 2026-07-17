import { describe, expect, test } from "vitest";
import { dateRangeForPreset } from "../datePresets";

// Wed 2026-07-15 as the reference "now" (local).
const WED = new Date(2026, 6, 15, 9, 0, 0);

describe("dateRangeForPreset", () => {
  test("'any' places no bounds", () => {
    expect(dateRangeForPreset("any", WED)).toEqual({});
  });

  test("'today' is a single day", () => {
    expect(dateRangeForPreset("today", WED)).toEqual({
      dateStart: "2026-07-15",
      dateEnd: "2026-07-15",
    });
  });

  test("'week' spans today through six days out", () => {
    expect(dateRangeForPreset("week", WED)).toEqual({
      dateStart: "2026-07-15",
      dateEnd: "2026-07-21",
    });
  });

  test("'weekend' from a weekday is the upcoming Sat–Sun", () => {
    expect(dateRangeForPreset("weekend", WED)).toEqual({
      dateStart: "2026-07-18", // Saturday
      dateEnd: "2026-07-19", // Sunday
    });
  });

  test("'weekend' on Saturday is that Sat–Sun", () => {
    const sat = new Date(2026, 6, 18, 9, 0, 0);
    expect(dateRangeForPreset("weekend", sat)).toEqual({
      dateStart: "2026-07-18",
      dateEnd: "2026-07-19",
    });
  });

  test("'weekend' on Sunday is just that day", () => {
    const sun = new Date(2026, 6, 19, 9, 0, 0);
    expect(dateRangeForPreset("weekend", sun)).toEqual({
      dateStart: "2026-07-19",
      dateEnd: "2026-07-19",
    });
  });
});
