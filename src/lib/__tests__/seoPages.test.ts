import { describe, expect, it } from "vitest";
import { stateNameFor, US_STATE_NAMES } from "@/lib/seo/stateNames";
import {
  getActiveCityPages,
  getActiveLibraryPages,
  getActiveStatePages,
  nearestCities,
  resolveCity,
  resolveLibrary,
  resolveState,
  siblingBranches,
} from "@/lib/seo/pages";

// Reads the real generated dataset + feed registry (like dataIntegrity.test).
describe("seo page index", () => {
  const libraries = getActiveLibraryPages();
  const cities = getActiveCityPages();
  const states = getActiveStatePages();

  it("produces the expected page tiers", () => {
    expect(libraries.length).toBeGreaterThan(4000);
    expect(cities.length).toBeGreaterThan(2000);
    expect(states.length).toBeGreaterThan(40);
  });

  it("gives every library page a unique canonical path", () => {
    const paths = new Set(libraries.map((page) => page.path));
    expect(paths.size).toBe(libraries.length);
  });

  it("round-trips every library path through resolveLibrary", () => {
    for (const page of libraries.slice(0, 200)) {
      const resolved = resolveLibrary(
        page.stateSlug,
        page.citySlug,
        page.librarySlug,
      );
      expect(resolved?.library.id).toBe(page.library.id);
    }
  });

  it("disambiguates same-named branches with the outlet suffix", () => {
    const elizabeth = libraries.filter((page) =>
      page.path.startsWith("/library/nj/elizabeth/elizabeth-free-public-library"),
    );
    expect(elizabeth.length).toBe(2);
    expect(new Set(elizabeth.map((p) => p.path)).size).toBe(2);
  });

  it("only mints pages for active-feed cities", () => {
    for (const city of cities.slice(0, 100)) {
      expect(city.libraries.length).toBeGreaterThan(0);
      expect(resolveCity(city.stateSlug, city.citySlug)?.city).toBe(city.city);
    }
  });

  it("resolves state hubs and returns null for unknown params", () => {
    expect(resolveState(states[0].stateSlug)?.stateSlug).toBe(states[0].stateSlug);
    expect(resolveState("zz")).toBeNull();
    expect(resolveCity("zz", "nowhere")).toBeNull();
    expect(resolveLibrary("zz", "nowhere", "nothing")).toBeNull();
  });

  it("returns nearby cities distinct from the source city", () => {
    const multi = cities.find((c) => c.stateSlug === "ca");
    expect(multi).toBeDefined();
    const near = nearestCities(multi!, 5);
    expect(near.length).toBeLessThanOrEqual(5);
    expect(near.every((c) => c.path !== multi!.path)).toBe(true);
  });

  it("returns sibling branches within the same city only", () => {
    const multiBranch = cities.find((c) => c.libraries.length > 1)!;
    const first = multiBranch.libraries[0];
    const siblings = siblingBranches(first);
    expect(siblings.every((s) => s.citySlug === first.citySlug)).toBe(true);
    expect(siblings.every((s) => s.path !== first.path)).toBe(true);
  });
});

describe("stateNames", () => {
  it("maps codes to names and falls back to the upper-cased code", () => {
    expect(stateNameFor("ca")).toBe("California");
    expect(stateNameFor("DC")).toBe("District of Columbia");
    expect(stateNameFor("zz")).toBe("ZZ");
  });

  it("covers every state present in the active page set", () => {
    for (const state of getActiveStatePages()) {
      expect(US_STATE_NAMES[state.stateCode.toUpperCase()]).toBeDefined();
    }
  });
});
