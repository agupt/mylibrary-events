import { describe, expect, test } from "vitest";
import { localizeToWallClock, resolveTimeZone } from "../events/timeZone";

describe("resolveTimeZone", () => {
  test("resolves US coordinates to their IANA zone", () => {
    expect(resolveTimeZone(32.2988, -90.1848)).toBe("America/Chicago"); // Jackson, MS
    expect(resolveTimeZone(37.3913, -122.0827)).toBe("America/Los_Angeles"); // Mountain View, CA
    expect(resolveTimeZone(40.7128, -74.006)).toBe("America/New_York"); // NYC
  });

  test("returns a string even for edge coordinates (never throws)", () => {
    // tz-lookup always resolves to some zone; the wrapper must not throw.
    expect(typeof resolveTimeZone(0, 0)).toBe("string");
  });
});

describe("localizeToWallClock", () => {
  test("projects a UTC instant into the target zone's wall-clock", () => {
    // 15:00 UTC = 10:00 CDT (summer, UTC-5)
    expect(localizeToWallClock("2026-07-18T15:00:00Z", "America/Chicago")).toBe(
      "2026-07-18T10:00:00",
    );
    // 05:00 UTC = midnight CDT — the all-day marker that read "5 AM" pre-fix
    expect(localizeToWallClock("2026-07-20T05:00:00Z", "America/Chicago")).toBe(
      "2026-07-20T00:00:00",
    );
  });

  test("crosses the date boundary when the local day differs", () => {
    // 01:00 UTC = 18:00 PDT the PREVIOUS day
    expect(localizeToWallClock("2026-07-16T01:00:00Z", "America/Los_Angeles")).toBe(
      "2026-07-15T18:00:00",
    );
  });

  test("honors DST — the same UTC hour maps to different offsets", () => {
    // January: CST (UTC-6) → 15:00Z = 09:00
    expect(localizeToWallClock("2026-01-18T15:00:00Z", "America/Chicago")).toBe(
      "2026-01-18T09:00:00",
    );
  });

  test("returns floating (non-Z) inputs unchanged", () => {
    expect(localizeToWallClock("2026-07-16T10:00:00", "America/Chicago")).toBe(
      "2026-07-16T10:00:00",
    );
  });
});
