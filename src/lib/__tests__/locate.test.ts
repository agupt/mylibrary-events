import { describe, expect, test } from "vitest";
import { findLocationMatch } from "../locate";

describe("findLocationMatch", () => {
  test("maps a library zip code to its home library", () => {
    // Act
    const match = findLocationMatch("94612");

    // Assert
    expect(match).not.toBeNull();
    expect(match?.matchedCity).toBe("Oakland");
    expect(match?.homeLibrary.id).toBe("opl-main");
  });

  test("maps a residential zip with no library to the nearest library in that city", () => {
    // Act — 94609 is Temescal, Oakland; Rockridge branch is closest
    const match = findLocationMatch("94609");

    // Assert
    expect(match?.matchedCity).toBe("Oakland");
    expect(match?.homeLibrary.system).toBe("Oakland Public Library");
  });

  test("maps a city name to its home library, case-insensitively", () => {
    // Act
    const match = findLocationMatch("  berkeley ");

    // Assert
    expect(match?.matchedCity).toBe("Berkeley");
    expect(match?.homeLibrary.id).toBe("bpl-central");
  });

  test("returns nearby libraries sorted by ascending distance, excluding the home library", () => {
    // Act
    const match = findLocationMatch("94102");

    // Assert
    expect(match).not.toBeNull();
    const nearby = match!.nearbyLibraries;
    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby.map((n) => n.library.id)).not.toContain(
      match!.homeLibrary.id,
    );
    const distances = nearby.map((n) => n.distanceMiles);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  test("returns null for an unknown zip code", () => {
    expect(findLocationMatch("10001")).toBeNull();
  });

  test("returns null for an unknown city", () => {
    expect(findLocationMatch("Springfield")).toBeNull();
  });

  test("returns null for empty input", () => {
    expect(findLocationMatch("   ")).toBeNull();
  });
});
