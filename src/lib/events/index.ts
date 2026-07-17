import path from "node:path";
import { getAllLibraries } from "../data/directory";
import type { Library } from "../types";
import { createBiblioCommonsProvider } from "./bibliocommons/provider";
import { activeFeedsByVendor, getFeedEntry } from "./calendarFeeds";
import type { DateRange, EventProvider } from "./eventProvider";
import { createCommunicoProvider } from "./communico/provider";
import { createBklynProvider } from "./custom/bklynProvider";
import { createFlpProvider } from "./custom/flpProvider";
import { createSfplProvider } from "./custom/sfplProvider";
import { createCivicPlusProvider } from "./custom/civicPlusProvider";
import { createOpenCitiesProvider } from "./custom/openCitiesProvider";
import { createMyLibraryDigitalProvider } from "./custom/myLibraryDigitalProvider";
import { createGovCalProvider } from "./custom/govCalProvider";
import { createIcsProvider } from "./libcal/provider";
import { createLibcalRssProvider } from "./libcal/rssProvider";
import { createSnapshotProvider } from "./snapshot/provider";

const FETCH_TIMEOUT_MS = 60_000; // slow vendors (LibraryCalendar ~46s) are tolerable: SWR serves stale instantly while refreshing

// Disk-persistent feed cache: survives restarts (cold start serves the
// fresh disk copy) and outages (stale copy beats an empty page). On
// serverless, point FEED_CACHE_DIR at /tmp.
const PERSIST_DIR =
  process.env.FEED_CACHE_DIR ?? path.join(process.cwd(), ".cache/feeds");

async function fetchText(
  url: string,
  headers?: Record<string, string>,
): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: headers ?? { "user-agent": "library-storytime/1.0 (events aggregator)" },
  });
  if (!response.ok) {
    throw new Error(`Feed request failed: HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

/** POST JSON and return the response text (OpenCities calendar API). */
async function postJson(url: string, body: unknown): Promise<string> {
  const origin = new URL(url).origin;
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      origin,
      referer: `${origin}/`,
      "x-requested-with": "XMLHttpRequest",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST failed: HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

let librariesById: Map<string, Library> | null = null;

function findLibraryById(id: string): Library | undefined {
  if (librariesById === null) {
    librariesById = new Map(
      getAllLibraries().map((library) => [library.id, library]),
    );
  }
  return librariesById.get(id);
}

let outletCountBySystem: Map<string, number> | null = null;

/** How many IMLS outlets a system (FSCSKEY) has — 1 means no branch ambiguity. */
function outletCountForSystem(systemKey: string): number {
  if (outletCountBySystem === null) {
    outletCountBySystem = new Map();
    for (const library of getAllLibraries()) {
      const key = library.id.split("-")[0];
      outletCountBySystem.set(key, (outletCountBySystem.get(key) ?? 0) + 1);
    }
  }
  return outletCountBySystem.get(systemKey) ?? 0;
}

/**
 * Routes each requested library to its system's vendor adapter
 * (BiblioCommons RSS or LibCal/generic iCal) and merges the results.
 */
function createCompositeProvider(): EventProvider {
  const vendorProviders: Array<{
    provider: EventProvider;
    systemKeys: Set<string>;
  }> = [
    {
      provider: createBiblioCommonsProvider({
        feeds: activeFeedsByVendor("bibliocommons"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("bibliocommons"))),
    },
    {
      // LibCal RSS month feeds: structured audiences + branch campus
      provider: createLibcalRssProvider({
        feeds: activeFeedsByVendor("libcal"),
        fetchText,
        findLibraryById,
        outletCountForSystem,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("libcal"))),
    },
    {
      // Generic iCalendar exports from any other source
      provider: createIcsProvider({
        feeds: activeFeedsByVendor("ical"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("ical"))),
    },
    {
      // Communico attend sites (unauthenticated eeventcaldata JSON)
      provider: createCommunicoProvider({
        feeds: activeFeedsByVendor("communico"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("communico"))),
    },
    {
      // Brooklyn Public Library's custom Drupal+Solr search API
      provider: createBklynProvider({
        feeds: activeFeedsByVendor("bklyn"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("bklyn"))),
    },
    {
      // Free Library of Philadelphia's Cloudflare-exempt RSS endpoint
      provider: createFlpProvider({
        feeds: activeFeedsByVendor("flp"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("flp"))),
    },
    {
      // San Francisco Public Library's Drupal events AJAX endpoint
      provider: createSfplProvider({
        feeds: activeFeedsByVendor("sfpl"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("sfpl"))),
    },
    {
      // CivicPlus municipal calendars (library-category RSS)
      provider: createCivicPlusProvider({
        feeds: activeFeedsByVendor("civicplus"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("civicplus"))),
    },
    {
      // OpenCities municipal calendars (POST JSON API, children's calendar)
      provider: createOpenCitiesProvider({
        feeds: activeFeedsByVendor("opencities"),
        postJson,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("opencities"))),
    },
    {
      // mylibrary.digital — Cloudflare-exempt /rss (app itself is walled)
      provider: createMyLibraryDigitalProvider({
        feeds: activeFeedsByVendor("mylibrarydigital"),
        fetchText,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("mylibrarydigital"))),
    },
    {
      // County "GetEventsByDay" calendars (POST JSON, per-label filter)
      provider: createGovCalProvider({
        feeds: activeFeedsByVendor("govcal"),
        postJson,
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("govcal"))),
    },
    {
      // Bot-walled sites served from cron-scraped snapshots (NYPL)
      provider: createSnapshotProvider({
        feeds: activeFeedsByVendor("snapshot"),
        findLibraryById,
        persistDir: PERSIST_DIR,
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("snapshot"))),
    },
  ];

  return {
    async getEvents(libraryIds: string[], range: DateRange) {
      const results = await Promise.all(
        vendorProviders.map(({ provider, systemKeys }) => {
          const ids = libraryIds.filter((id) =>
            systemKeys.has(id.split("-")[0]),
          );
          return ids.length > 0 ? provider.getEvents(ids, range) : [];
        }),
      );
      return results
        .flat()
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );
    },
  };
}

let provider: EventProvider | null = null;

/** The app's runtime event provider (live vendor feeds only). */
export function getEventProvider(): EventProvider {
  if (provider === null) {
    provider = createCompositeProvider();
  }
  return provider;
}

/** True if the library's system has an active (fetchable) calendar feed. */
export function hasCalendarFeed(libraryId: string): boolean {
  return getFeedEntry(libraryId.split("-")[0])?.status === "active";
}
