import { NEARBY_LIBRARY_LIMIT } from "./constants";
import { LIBRARIES } from "./data/libraries";
import { ZIP_CITIES, ZIP_COORDINATES } from "./data/zipCoordinates";
import { haversineMiles } from "./geo";
import type { Coordinates, Library, LocationMatch } from "./types";

const ZIP_PATTERN = /^\d{5}$/;

interface ResolvedQuery {
  coordinates: Coordinates;
  city: string;
}

function resolveZip(zip: string): ResolvedQuery | null {
  const coordinates = ZIP_COORDINATES[zip];
  const city = ZIP_CITIES[zip];
  if (!coordinates || !city) {
    return null;
  }
  return { coordinates, city };
}

function resolveCity(cityQuery: string): ResolvedQuery | null {
  const normalized = cityQuery.toLowerCase();
  const library = LIBRARIES.find(
    (candidate) => candidate.city.toLowerCase() === normalized,
  );
  if (!library) {
    return null;
  }
  return { coordinates: library.coordinates, city: library.city };
}

function byDistanceFrom(origin: Coordinates) {
  return (library: Library) => ({
    library,
    distanceMiles: haversineMiles(origin, library.coordinates),
  });
}

/**
 * Resolves a city name or 5-digit zip code to a home library (nearest
 * library within the matched city) plus the nearest other libraries,
 * sorted by ascending distance.
 */
export function findLocationMatch(rawQuery: string): LocationMatch | null {
  const query = rawQuery.trim();
  if (query.length === 0) {
    return null;
  }

  const resolved = ZIP_PATTERN.test(query)
    ? resolveZip(query)
    : resolveCity(query);
  if (!resolved) {
    return null;
  }

  const ranked = LIBRARIES.map(byDistanceFrom(resolved.coordinates)).sort(
    (a, b) => a.distanceMiles - b.distanceMiles,
  );

  const homeLibrary =
    ranked.find((entry) => entry.library.city === resolved.city)?.library ??
    ranked[0].library;

  const nearbyLibraries = ranked
    .filter((entry) => entry.library.id !== homeLibrary.id)
    .slice(0, NEARBY_LIBRARY_LIMIT);

  return {
    query,
    matchedCity: resolved.city,
    coordinates: resolved.coordinates,
    homeLibrary,
    nearbyLibraries,
  };
}
