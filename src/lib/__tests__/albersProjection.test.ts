import { describe, expect, test } from "vitest";
import { isConterminous, projectAlbersUsa } from "../albersProjection";

const SEATTLE = { latitude: 47.6, longitude: -122.33 };
const MIAMI = { latitude: 25.76, longitude: -80.19 };
const NYC = { latitude: 40.71, longitude: -74.0 };
const DENVER = { latitude: 39.74, longitude: -104.99 };
const HONOLULU = { latitude: 21.3, longitude: -157.85 };
const ANCHORAGE = { latitude: 61.2, longitude: -149.9 };

describe("projectAlbersUsa", () => {
  test("preserves east-west ordering", () => {
    expect(projectAlbersUsa(SEATTLE).x).toBeLessThan(projectAlbersUsa(DENVER).x);
    expect(projectAlbersUsa(DENVER).x).toBeLessThan(projectAlbersUsa(NYC).x);
  });

  test("preserves north-south ordering (y grows northward)", () => {
    expect(projectAlbersUsa(SEATTLE).y).toBeGreaterThan(projectAlbersUsa(DENVER).y);
    expect(projectAlbersUsa(DENVER).y).toBeGreaterThan(projectAlbersUsa(MIAMI).y);
  });

  test("is deterministic", () => {
    expect(projectAlbersUsa(NYC)).toEqual(projectAlbersUsa(NYC));
  });
});

describe("isConterminous", () => {
  test("includes lower-48 cities, excludes AK and HI", () => {
    expect(isConterminous(SEATTLE)).toBe(true);
    expect(isConterminous(MIAMI)).toBe(true);
    expect(isConterminous(HONOLULU)).toBe(false);
    expect(isConterminous(ANCHORAGE)).toBe(false);
  });
});
