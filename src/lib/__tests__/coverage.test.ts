import { describe, expect, test } from "vitest";
import { computeCoverage } from "../coverage";
import type { FeedEntry } from "../events/calendarFeeds";
import type { Library } from "../types";

function library(id: string, state: string, system: string): Library {
  return {
    id,
    name: `Branch ${id}`,
    system,
    address: "1 Main St",
    city: "Town",
    state,
    zipCode: "12345",
    coordinates: { latitude: 40, longitude: -100 },
  };
}

const LIBRARIES: Library[] = [
  library("CA0081-002", "CA", "Oakland Public Library"),
  library("CA0081-015", "CA", "Oakland Public Library"),
  library("CA0114-002", "CA", "San Francisco Public Library"),
  library("NY0001-002", "NY", "New York Public Library"),
  library("NY0001-003", "NY", "New York Public Library"),
  library("NY0001-004", "NY", "New York Public Library"),
];

const REGISTRY: Record<string, FeedEntry> = {
  CA0081: { vendor: "bibliocommons", status: "active", url: "https://x/rss", source: "verified" },
  CA0114: { vendor: "libcal", status: "detected", source: "discovered" },
};

describe("computeCoverage", () => {
  test("classifies each library by its system's registry entry", () => {
    const { perLibrary } = computeCoverage(LIBRARIES, REGISTRY);

    const statusById = Object.fromEntries(
      perLibrary.map((c) => [c.library.id, c.status]),
    );
    expect(statusById["CA0081-002"]).toBe("active");
    expect(statusById["CA0081-015"]).toBe("active");
    expect(statusById["CA0114-002"]).toBe("detected");
    expect(statusById["NY0001-002"]).toBe("none");
  });

  test("aggregates library and system totals", () => {
    const { summary } = computeCoverage(LIBRARIES, REGISTRY);

    expect(summary.libraries).toEqual({
      total: 6,
      active: 2,
      detected: 1,
      none: 3,
    });
    expect(summary.systems).toEqual({
      total: 3,
      active: 1,
      detected: 1,
      none: 1,
    });
  });

  test("breaks coverage down by state and vendor", () => {
    const { summary } = computeCoverage(LIBRARIES, REGISTRY);

    expect(summary.byState).toEqual([
      { state: "CA", libraries: 3, active: 2, detected: 1 },
      { state: "NY", libraries: 3, active: 0, detected: 0 },
    ]);
    expect(summary.byVendor.bibliocommons).toEqual({ systems: 1, libraries: 2 });
    expect(summary.byVendor.libcal).toEqual({ systems: 1, libraries: 1 });
  });

  test("ranks uncovered systems by outlet count", () => {
    const { summary } = computeCoverage(LIBRARIES, REGISTRY);

    expect(summary.topUncoveredSystems[0]).toMatchObject({
      systemKey: "NY0001",
      outlets: 3,
    });
  });
});
