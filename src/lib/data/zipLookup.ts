import { readFileSync } from "node:fs";
import path from "node:path";
import type { Coordinates } from "../types";

/**
 * Nationwide zip and city lookup generated from the GeoNames US postal
 * dataset by scripts/importZipCodes.mjs. Server-side only.
 */

export interface PlaceInfo {
  coordinates: Coordinates;
  city: string;
  state: string;
  /** Number of zip codes in the city — a rough population proxy. */
  zipCount?: number;
}

type ZipRow = [latitude: number, longitude: number, city: string, state: string];

let zipCache: Record<string, ZipRow> | null = null;
let cityCache: Map<string, PlaceInfo> | null = null;

function loadZips(): Record<string, ZipRow> {
  if (zipCache === null) {
    const filePath = path.join(process.cwd(), "src/lib/data/generated/zips.json");
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error(
        `Zip database at ${filePath} is malformed. Run: npm run data:zips`,
      );
    }
    zipCache = parsed as Record<string, ZipRow>;
  }
  return zipCache;
}

function toPlaceInfo(row: ZipRow): PlaceInfo {
  return {
    coordinates: { latitude: row[0], longitude: row[1] },
    city: row[2],
    state: row[3],
  };
}

export function lookupZip(zip: string): PlaceInfo | null {
  const row = loadZips()[zip];
  return row ? toPlaceInfo(row) : null;
}

function cityKey(city: string, state: string): string {
  return `${city.toLowerCase()}|${state.toUpperCase()}`;
}

/** city|STATE → centroid of that city's zip codes (built once, cached). */
function loadCityIndex(): Map<string, PlaceInfo> {
  if (cityCache === null) {
    const sums = new Map<
      string,
      { lat: number; lng: number; count: number; city: string; state: string }
    >();
    for (const row of Object.values(loadZips())) {
      const key = cityKey(row[2], row[3]);
      const entry = sums.get(key) ?? {
        lat: 0,
        lng: 0,
        count: 0,
        city: row[2],
        state: row[3],
      };
      sums.set(key, {
        ...entry,
        lat: entry.lat + row[0],
        lng: entry.lng + row[1],
        count: entry.count + 1,
      });
    }
    cityCache = new Map(
      [...sums.entries()].map(([key, sum]) => [
        key,
        {
          coordinates: {
            latitude: sum.lat / sum.count,
            longitude: sum.lng / sum.count,
          },
          city: sum.city,
          state: sum.state,
          zipCount: sum.count,
        },
      ]),
    );
  }
  return cityCache;
}

/**
 * Finds cities by name. With a state, returns at most one exact match;
 * without one, returns every state's city of that name (caller decides
 * how to handle ambiguity).
 */
export function lookupCity(city: string, state?: string): PlaceInfo[] {
  const index = loadCityIndex();
  if (state) {
    const match = index.get(cityKey(city, state));
    return match ? [match] : [];
  }
  const normalized = `${city.toLowerCase()}|`;
  return [...index.entries()]
    .filter(([key]) => key.startsWith(normalized))
    .map(([, info]) => info)
    .sort((a, b) => a.state.localeCompare(b.state));
}
