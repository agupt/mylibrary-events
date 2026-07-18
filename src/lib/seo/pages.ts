import { getAllLibraries } from "../data/directory";
import { getFeedRegistry } from "../events/calendarFeeds";
import { haversineMiles } from "../geo";
import type { Coordinates, Library } from "../types";
import { slugify, stateSlug } from "./slug";

/**
 * The SINGLE source of truth for the SEO landing-page network. Every route
 * (`generateStaticParams`, `generateMetadata`, the page body), the sitemap,
 * canonical URLs, and every internal link derive their URLs from HERE — the
 * exact "two stores of the same fact" divergence AGENTS.md warns against is
 * avoided by computing the slug set once and reading it everywhere.
 *
 * Server-only: reads the generated dataset + feed registry via fs.
 *
 * VERSION-1 eligibility gate: a library/city page exists iff its IMLS system
 * (FSCSKEY) is status:"active" in feedRegistry.json — i.e. it has a live
 * event feed. We do NOT probe live event counts at build time (per the build
 * brief), so the "must render >=N upcoming events" runtime gate is deferred;
 * pages honestly show "no upcoming events right now" when a feed is empty.
 */

const LIBRARY_ROOT = "/library";
const STORYTIMES_ROOT = "/storytimes";
const NEAREST_CITY_LIMIT = 6;
const SIBLING_BRANCH_LIMIT = 6;

export interface LibraryPage {
  library: Library;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  librarySlug: string;
  /** Absolute-from-root path, e.g. "/library/ca/oakland/oakland-main-library". */
  path: string;
}

export interface CityPage {
  city: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
  /** e.g. "/storytimes/ca/oakland". */
  path: string;
  /** Centroid of the city's active libraries (for nearest-city links). */
  coordinates: Coordinates;
  libraries: LibraryPage[];
}

export interface StatePage {
  stateCode: string;
  stateSlug: string;
  /** e.g. "/storytimes/ca". */
  path: string;
  cities: CityPage[];
}

interface PageIndex {
  libraryPages: LibraryPage[];
  cityPages: CityPage[];
  statePages: StatePage[];
  libraryByPath: Map<string, LibraryPage>;
  cityByPath: Map<string, CityPage>;
  stateByPath: Map<string, StatePage>;
}

/** IMLS system key (FSCSKEY) for an outlet id like "CA0081-002" -> "CA0081". */
function systemKeyOf(libraryId: string): string {
  return libraryId.split("-")[0];
}

/** Outlet suffix ("002") used to disambiguate same-named branches in a city. */
function outletSuffixOf(libraryId: string): string {
  return libraryId.split("-")[1] ?? "0";
}

function activeSystemKeys(): Set<string> {
  const registry = getFeedRegistry();
  return new Set(
    Object.keys(registry).filter((key) => registry[key].status === "active"),
  );
}

/** Average coordinate of a non-empty set of libraries. */
function centroidOf(libraries: readonly Library[]): Coordinates {
  const sum = libraries.reduce(
    (acc, library) => ({
      latitude: acc.latitude + library.coordinates.latitude,
      longitude: acc.longitude + library.coordinates.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / libraries.length,
    longitude: sum.longitude / libraries.length,
  };
}

/**
 * Assigns a unique library slug within a single city. Same-named branches
 * (the one real case today: two "Elizabeth Free Public Library" outlets in
 * Elizabeth, NJ) get the IMLS outlet number appended — deterministic because
 * the id is stable and committed.
 */
function assignLibrarySlugs(
  cityLibraries: readonly Library[],
): Map<string, string> {
  const nameSlugCounts = new Map<string, number>();
  for (const library of cityLibraries) {
    const nameSlug = slugify(library.name);
    nameSlugCounts.set(nameSlug, (nameSlugCounts.get(nameSlug) ?? 0) + 1);
  }

  const slugById = new Map<string, string>();
  const used = new Set<string>();
  // Sort by id so slug assignment is order-independent across data refreshes.
  const ordered = [...cityLibraries].sort((a, b) => a.id.localeCompare(b.id));
  for (const library of ordered) {
    const nameSlug = slugify(library.name);
    let candidate =
      (nameSlugCounts.get(nameSlug) ?? 0) > 1
        ? `${nameSlug}-${outletSuffixOf(library.id)}`
        : nameSlug;
    // Residual-collision guard (should never fire with today's data).
    let counter = 2;
    while (used.has(candidate)) {
      candidate = `${nameSlug}-${outletSuffixOf(library.id)}-${counter}`;
      counter += 1;
    }
    used.add(candidate);
    slugById.set(library.id, candidate);
  }
  return slugById;
}

let cache: PageIndex | null = null;

function buildIndex(): PageIndex {
  const active = activeSystemKeys();
  const libraries = getAllLibraries().filter((library) =>
    active.has(systemKeyOf(library.id)),
  );

  // Group libraries by their (state, city) key.
  const byCityKey = new Map<string, Library[]>();
  for (const library of libraries) {
    const key = `${stateSlug(library.state)}/${slugify(library.city)}`;
    byCityKey.set(key, [...(byCityKey.get(key) ?? []), library]);
  }

  const libraryPages: LibraryPage[] = [];
  const cityPages: CityPage[] = [];
  const libraryByPath = new Map<string, LibraryPage>();
  const cityByPath = new Map<string, CityPage>();

  for (const [cityKey, cityLibraries] of byCityKey) {
    const [stSlug, citySlug] = cityKey.split("/");
    const slugById = assignLibrarySlugs(cityLibraries);
    const first = cityLibraries[0];

    const pagesForCity: LibraryPage[] = cityLibraries.map((library) => {
      const librarySlug = slugById.get(library.id) as string;
      const path = `${LIBRARY_ROOT}/${stSlug}/${citySlug}/${librarySlug}`;
      const page: LibraryPage = {
        library,
        stateCode: library.state,
        stateSlug: stSlug,
        citySlug,
        librarySlug,
        path,
      };
      libraryByPath.set(path, page);
      return page;
    });
    pagesForCity.sort((a, b) => a.library.name.localeCompare(b.library.name));
    libraryPages.push(...pagesForCity);

    const cityPage: CityPage = {
      city: first.city,
      stateCode: first.state,
      stateSlug: stSlug,
      citySlug,
      path: `${STORYTIMES_ROOT}/${stSlug}/${citySlug}`,
      coordinates: centroidOf(cityLibraries),
      libraries: pagesForCity,
    };
    cityByPath.set(cityPage.path, cityPage);
    cityPages.push(cityPage);
  }

  // Group cities into state hubs.
  const byStateSlug = new Map<string, CityPage[]>();
  for (const cityPage of cityPages) {
    byStateSlug.set(cityPage.stateSlug, [
      ...(byStateSlug.get(cityPage.stateSlug) ?? []),
      cityPage,
    ]);
  }
  const statePages: StatePage[] = [];
  const stateByPath = new Map<string, StatePage>();
  for (const [stSlug, cities] of byStateSlug) {
    const sortedCities = [...cities].sort((a, b) =>
      a.city.localeCompare(b.city),
    );
    const statePage: StatePage = {
      stateCode: sortedCities[0].stateCode,
      stateSlug: stSlug,
      path: `${STORYTIMES_ROOT}/${stSlug}`,
      cities: sortedCities,
    };
    stateByPath.set(statePage.path, statePage);
    statePages.push(statePage);
  }

  cityPages.sort((a, b) =>
    (a.stateSlug + a.citySlug).localeCompare(b.stateSlug + b.citySlug),
  );
  statePages.sort((a, b) => a.stateSlug.localeCompare(b.stateSlug));
  libraryPages.sort((a, b) => a.path.localeCompare(b.path));

  return {
    libraryPages,
    cityPages,
    statePages,
    libraryByPath,
    cityByPath,
    stateByPath,
  };
}

function getIndex(): PageIndex {
  if (cache === null) {
    cache = buildIndex();
  }
  return cache;
}

export function getActiveLibraryPages(): LibraryPage[] {
  return getIndex().libraryPages;
}

export function getActiveCityPages(): CityPage[] {
  return getIndex().cityPages;
}

export function getActiveStatePages(): StatePage[] {
  return getIndex().statePages;
}

export function resolveLibrary(
  state: string,
  city: string,
  librarySlug: string,
): LibraryPage | null {
  const path = `${LIBRARY_ROOT}/${state.toLowerCase()}/${city.toLowerCase()}/${librarySlug.toLowerCase()}`;
  return getIndex().libraryByPath.get(path) ?? null;
}

export function resolveCity(state: string, city: string): CityPage | null {
  const path = `${STORYTIMES_ROOT}/${state.toLowerCase()}/${city.toLowerCase()}`;
  return getIndex().cityByPath.get(path) ?? null;
}

export function resolveState(state: string): StatePage | null {
  const path = `${STORYTIMES_ROOT}/${state.toLowerCase()}`;
  return getIndex().stateByPath.get(path) ?? null;
}

let nearestCache: Map<string, CityPage[]> | null = null;

/** The nearest active city pages to a given city (by centroid distance). */
export function nearestCities(
  cityPage: CityPage,
  limit: number = NEAREST_CITY_LIMIT,
): CityPage[] {
  if (nearestCache === null) {
    nearestCache = new Map();
  }
  const cached = nearestCache.get(cityPage.path);
  if (cached) return cached.slice(0, limit);

  const all = getIndex().cityPages;
  const ranked = all
    .filter((other) => other.path !== cityPage.path)
    .map((other) => ({
      city: other,
      distance: haversineMiles(cityPage.coordinates, other.coordinates),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEAREST_CITY_LIMIT)
    .map((entry) => entry.city);
  nearestCache.set(cityPage.path, ranked);
  return ranked.slice(0, limit);
}

/** Other active branches in the same city as the given library page. */
export function siblingBranches(
  page: LibraryPage,
  limit: number = SIBLING_BRANCH_LIMIT,
): LibraryPage[] {
  const city = resolveCity(page.stateSlug, page.citySlug);
  if (!city) return [];
  return city.libraries
    .filter((sibling) => sibling.path !== page.path)
    .slice(0, limit);
}
