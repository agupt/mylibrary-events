import { MAX_NEARBY_LIBRARIES, MAX_RADIUS_MILES } from "./constants";
import { getAllLibraries } from "./data/directory";
import { lookupCity, lookupZip, type PlaceInfo } from "./data/zipLookup";
import { haversineMiles } from "./geo";
import type { Coordinates, Library, LocationResult } from "./types";

const ZIP_PATTERN = /^\d{5}$/;
const MAX_AMBIGUOUS_OPTIONS = 8;

export interface LocateDeps {
  getLibraries: () => Library[];
  lookupZip: (zip: string) => PlaceInfo | null;
  lookupCity: (city: string, state?: string) => PlaceInfo[];
}

const defaultDeps: LocateDeps = {
  getLibraries: getAllLibraries,
  lookupZip,
  lookupCity,
};

/** Splits "Portland, OR" (or "Portland OR") into name + state code. */
function parseCityQuery(query: string): { city: string; state?: string } {
  const withComma = query.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (withComma) {
    return { city: withComma[1].trim(), state: withComma[2].toUpperCase() };
  }
  const withSpace = query.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (withSpace) {
    return { city: withSpace[1].trim(), state: withSpace[2].toUpperCase() };
  }
  return { city: query };
}

function byDistanceFrom(origin: Coordinates) {
  return (library: Library) => ({
    library,
    distanceMiles: haversineMiles(origin, library.coordinates),
  });
}

function buildMatch(
  query: string,
  place: PlaceInfo,
  libraries: Library[],
): LocationResult {
  const ranked = libraries
    .map(byDistanceFrom(place.coordinates))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
  if (ranked.length === 0) {
    return { status: "not-found" };
  }

  const homeLibrary =
    ranked.find(
      (entry) =>
        entry.library.city.toLowerCase() === place.city.toLowerCase() &&
        entry.library.state === place.state,
    )?.library ?? ranked[0].library;

  // Every library within the max radius (capped), with distances, so the
  // client's distance control can include far-away libraries — not just the
  // nearest few — when the user widens the radius.
  const nearbyLibraries = ranked
    .filter(
      (entry) =>
        entry.library.id !== homeLibrary.id &&
        entry.distanceMiles <= MAX_RADIUS_MILES,
    )
    .slice(0, MAX_NEARBY_LIBRARIES);

  return {
    status: "ok",
    match: {
      query,
      matchedCity: place.city,
      matchedState: place.state,
      coordinates: place.coordinates,
      homeLibrary,
      nearbyLibraries,
    },
  };
}

/**
 * Resolves a 5-digit zip or a city name (optionally "City, ST") to a home
 * library plus nearby libraries. Bare city names that exist in several
 * states return `ambiguous` with "City, ST" suggestions.
 */
export function findLocation(
  rawQuery: string,
  deps: LocateDeps = defaultDeps,
): LocationResult {
  const query = rawQuery.trim();
  if (query.length === 0) {
    return { status: "not-found" };
  }

  if (ZIP_PATTERN.test(query)) {
    const place = deps.lookupZip(query);
    return place
      ? buildMatch(query, place, deps.getLibraries())
      : { status: "not-found" };
  }

  const { city, state } = parseCityQuery(query);
  let places = deps.lookupCity(city, state);
  // "Portland OR"-style parse can misfire ("New York" → city "New" + state
  // "YO"); fall back to treating the whole query as a city name.
  if (places.length === 0 && state) {
    places = deps.lookupCity(query);
  }

  if (places.length === 0) {
    return { status: "not-found" };
  }
  if (places.length > 1) {
    // Largest cities first (zip count ≈ population) so "portland"
    // suggests Portland, OR before the eight tiny Portlands.
    const bySize = [...places].sort(
      (a, b) =>
        (b.zipCount ?? 0) - (a.zipCount ?? 0) ||
        a.state.localeCompare(b.state),
    );
    return {
      status: "ambiguous",
      options: bySize
        .slice(0, MAX_AMBIGUOUS_OPTIONS)
        .map((place) => `${place.city}, ${place.state}`),
    };
  }
  return buildMatch(query, places[0], deps.getLibraries());
}
