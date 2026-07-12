import { describe, expect, test } from "vitest";
import { getAllLibraries } from "../data/directory";
import { lookupCity, lookupZip } from "../data/zipLookup";

/**
 * Integration checks over the generated IMLS/GeoNames datasets — these
 * verify the import pipeline produced usable data, not just any JSON.
 */
describe("generated library directory", () => {
  test("contains the national IMLS outlet universe", () => {
    const libraries = getAllLibraries();
    expect(libraries.length).toBeGreaterThan(15000);
  });

  test("includes Oakland Main with a website from the overlay", () => {
    const oaklandMain = getAllLibraries().find((l) => l.id === "CA0081-002");
    expect(oaklandMain?.name).toBe("Oakland Main Library");
    expect(oaklandMain?.state).toBe("CA");
    expect(oaklandMain?.websiteUrl).toBe("https://oaklandlibrary.org");
  });

  test("every library has valid coordinates and a 5-digit zip", () => {
    for (const library of getAllLibraries()) {
      expect(Math.abs(library.coordinates.latitude)).toBeLessThanOrEqual(90);
      expect(Math.abs(library.coordinates.longitude)).toBeLessThanOrEqual(180);
      expect(library.zipCode).toMatch(/^\d{5}$/);
    }
  });
});

describe("generated zip database", () => {
  test("resolves a known zip to city and state", () => {
    const place = lookupZip("94612");
    expect(place?.city).toBe("Oakland");
    expect(place?.state).toBe("CA");
  });

  test("returns null for a nonexistent zip", () => {
    expect(lookupZip("00000")).toBeNull();
  });

  test("finds multi-state cities and respects the state filter", () => {
    const portlands = lookupCity("Portland");
    const states = portlands.map((place) => place.state);
    expect(states).toContain("OR");
    expect(states).toContain("ME");

    const oregonOnly = lookupCity("Portland", "OR");
    expect(oregonOnly).toHaveLength(1);
    expect(oregonOnly[0].state).toBe("OR");
  });
});
