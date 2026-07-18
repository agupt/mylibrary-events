import { describe, expect, test } from "vitest";
import { findLocation, type LocateDeps } from "../locate";
import type { Library } from "../types";

function library(overrides: Partial<Library> & { id: string }): Library {
  return {
    name: "Test Library",
    system: "Test System",
    address: "1 Main St",
    city: "Oakland",
    state: "CA",
    zipCode: "94612",
    coordinates: { latitude: 37.8, longitude: -122.27 },
    ...overrides,
  };
}

const LIBRARIES: Library[] = [
  library({
    id: "CA0081-002",
    name: "Oakland Main Library",
    city: "Oakland",
    state: "CA",
    coordinates: { latitude: 37.8014, longitude: -122.2727 },
  }),
  library({
    id: "CA0081-015",
    name: "Rockridge Branch Library",
    city: "Oakland",
    state: "CA",
    zipCode: "94618",
    coordinates: { latitude: 37.8443, longitude: -122.2519 },
  }),
  library({
    id: "CA0114-002",
    name: "San Francisco Main Library",
    city: "San Francisco",
    state: "CA",
    zipCode: "94102",
    coordinates: { latitude: 37.7793, longitude: -122.4157 },
  }),
  library({
    id: "OR0999-001",
    name: "Portland Central Library",
    city: "Portland",
    state: "OR",
    zipCode: "97205",
    coordinates: { latitude: 45.5191, longitude: -122.6837 },
  }),
];

const PLACES = {
  "94609": { city: "Oakland", state: "CA", latitude: 37.8362, longitude: -122.2648 },
  "94102": { city: "San Francisco", state: "CA", latitude: 37.7793, longitude: -122.4157 },
};

const CITIES = [
  { city: "Oakland", state: "CA", latitude: 37.8044, longitude: -122.2712, zipCount: 30 },
  { city: "Portland", state: "OR", latitude: 45.5202, longitude: -122.6742, zipCount: 60 },
  { city: "Portland", state: "ME", latitude: 43.6591, longitude: -70.2568, zipCount: 8 },
];

const deps: LocateDeps = {
  getLibraries: () => LIBRARIES,
  lookupZip: (zip) => {
    const place = PLACES[zip as keyof typeof PLACES];
    return place
      ? {
          coordinates: { latitude: place.latitude, longitude: place.longitude },
          city: place.city,
          state: place.state,
        }
      : null;
  },
  lookupCity: (city, state) =>
    CITIES.filter(
      (candidate) =>
        candidate.city.toLowerCase() === city.toLowerCase() &&
        (!state || candidate.state === state.toUpperCase()),
    ).map((candidate) => ({
      coordinates: {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      },
      city: candidate.city,
      state: candidate.state,
      zipCount: candidate.zipCount,
    })),
};

describe("findLocation", () => {
  test("maps a residential zip to the nearest library in the same city", () => {
    // Act — 94609 is Temescal, Oakland; Rockridge is the closest library
    const result = findLocation("94609", deps);

    // Assert
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.matchedCity).toBe("Oakland");
    expect(result.match.matchedState).toBe("CA");
    expect(result.match.homeLibrary.id).toBe("CA0081-015");
  });

  test("prefers a same-city library as home even when another is closer", () => {
    // Act — SF Main is at 94102 exactly; home must be an SF library
    const result = findLocation("94102", deps);

    // Assert
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.homeLibrary.city).toBe("San Francisco");
  });

  test("resolves 'city, ST' queries case-insensitively", () => {
    const result = findLocation("  portland, or ", deps);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.matchedState).toBe("OR");
    expect(result.match.homeLibrary.id).toBe("OR0999-001");
  });

  test("returns ambiguous options for a multi-state city, largest city first", () => {
    const result = findLocation("portland", deps);

    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    // OR has more zips (bigger city), so it's suggested before ME
    expect(result.options).toEqual(["Portland, OR", "Portland, ME"]);
  });

  test("resolves an unambiguous bare city name", () => {
    const result = findLocation("oakland", deps);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.match.matchedCity).toBe("Oakland");
  });

  test("sorts nearby libraries ascending and excludes the home library", () => {
    const result = findLocation("94609", deps);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const nearby = result.match.nearbyLibraries;
    expect(nearby.map((n) => n.library.id)).not.toContain(
      result.match.homeLibrary.id,
    );
    const distances = nearby.map((n) => n.distanceMiles);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  test("always includes the home library's system branches, even past the radius", () => {
    // Mirrors Raymond/Jackson-Hinds: a small home library whose sibling branch
    // is far away (>60mi) must still be in scope — same system, one calendar —
    // while an unrelated far library is excluded.
    const raymond = library({
      id: "MS0021-009",
      name: "Raymond Public Library",
      city: "Raymond",
      state: "MS",
      coordinates: { latitude: 32.2585, longitude: -90.4187 },
    });
    const willieMorris = library({
      id: "MS0021-016",
      name: "Willie Morris Library",
      city: "Jackson",
      state: "MS",
      coordinates: { latitude: 33.5, longitude: -88.7 }, // ~130mi sibling branch
    });
    const otherFar = library({
      id: "AL0001-002",
      name: "Some Alabama Library",
      city: "Birmingham",
      state: "AL",
      coordinates: { latitude: 33.5186, longitude: -86.8104 }, // ~230mi, other system
    });
    const localDeps: LocateDeps = {
      getLibraries: () => [raymond, willieMorris, otherFar],
      lookupZip: () => ({
        coordinates: { latitude: 32.2585, longitude: -90.4187 },
        city: "Raymond",
        state: "MS",
      }),
      lookupCity: () => [],
    };

    const result = findLocation("39154", localDeps);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const branch = result.match.nearbyLibraries.find(
      (n) => n.library.id === "MS0021-016",
    );
    expect(branch).toBeDefined();
    expect(branch?.isHomeSystem).toBe(true);
    expect(branch?.distanceMiles).toBeGreaterThan(60); // beyond MAX_RADIUS_MILES
    // The unrelated far library is not pulled in.
    expect(
      result.match.nearbyLibraries.map((n) => n.library.id),
    ).not.toContain("AL0001-002");
  });

  test("returns not-found for an unknown zip", () => {
    expect(findLocation("00000", deps).status).toBe("not-found");
  });

  test("returns not-found for an unknown city", () => {
    expect(findLocation("Atlantis", deps).status).toBe("not-found");
  });

  test("returns not-found for empty input", () => {
    expect(findLocation("   ", deps).status).toBe("not-found");
  });
});
