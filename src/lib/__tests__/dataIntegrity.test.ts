import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { getAllLibraries } from "../data/directory";
import { lookupCity, lookupZip } from "../data/zipLookup";
import { findLocation } from "../locate";

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

  test("web-searched domains flow into websiteUrl (UI and pipeline share one view)", () => {
    // Orange County PL has no hand-maintained override; its link must
    // come from generated/domains.json
    const katieWheeler = getAllLibraries().find((l) => l.id === "CA0084-035");
    expect(katieWheeler?.websiteUrl).toBe("https://ocpl.org");
    // Hand-verified overrides still win over searched domains
    const sfMain = getAllLibraries().find((l) => l.id === "CA0114-002");
    expect(sfMain?.websiteUrl).toBe("https://sfpl.org");
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

describe("all zip codes (exhaustive)", () => {
  type ZipRow = [number, number, string, string];
  const zips: Record<string, ZipRow> = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src/lib/data/generated/zips.json"),
      "utf8",
    ),
  );

  test("every zip has a valid shape: 5 digits, coords in range, city and state", () => {
    const entries = Object.entries(zips);
    expect(entries.length).toBeGreaterThan(40000);
    for (const [zip, [latitude, longitude, city, state]] of entries) {
      if (!/^\d{5}$/.test(zip)) throw new Error(`Bad zip key: ${zip}`);
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw new Error(`Bad coords for ${zip}`);
      }
      if (!city || !/^[A-Z]{2}$/.test(state)) {
        throw new Error(`Bad city/state for ${zip}: ${city}, ${state}`);
      }
    }
  });

  test("every zip resolves through lookupZip", () => {
    for (const zip of Object.keys(zips)) {
      if (lookupZip(zip) === null) throw new Error(`lookupZip failed for ${zip}`);
    }
  });

  test("one zip per state produces a full location match with a home library", () => {
    const onePerState = new Map<string, string>();
    for (const [zip, row] of Object.entries(zips)) {
      if (!onePerState.has(row[3])) onePerState.set(row[3], zip);
    }
    expect(onePerState.size).toBeGreaterThanOrEqual(50);

    for (const [state, zip] of onePerState) {
      const result = findLocation(zip);
      if (result.status !== "ok") {
        throw new Error(`findLocation failed for ${zip} (${state})`);
      }
      expect(result.match.homeLibrary.id).toMatch(/^[A-Z0-9]+-[0-9]+$/);
    }
  });
});
