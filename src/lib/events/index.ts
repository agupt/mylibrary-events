import { getAllLibraries } from "../data/directory";
import type { Library } from "../types";
import { createBiblioCommonsProvider } from "./bibliocommons/provider";
import { activeFeedsByVendor, getFeedEntry } from "./calendarFeeds";
import type { DateRange, EventProvider } from "./eventProvider";
import { createIcsProvider } from "./libcal/provider";

const FETCH_TIMEOUT_MS = 10_000;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "user-agent": "library-storytime/1.0 (events aggregator)" },
  });
  if (!response.ok) {
    throw new Error(`Feed request failed: HTTP ${response.status} for ${url}`);
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
      }),
      systemKeys: new Set(Object.keys(activeFeedsByVendor("bibliocommons"))),
    },
    {
      provider: createIcsProvider({
        // LibCal and generic iCal feeds share the ICS adapter
        feeds: { ...activeFeedsByVendor("libcal"), ...activeFeedsByVendor("ical") },
        fetchText,
        findLibraryById,
      }),
      systemKeys: new Set([
        ...Object.keys(activeFeedsByVendor("libcal")),
        ...Object.keys(activeFeedsByVendor("ical")),
      ]),
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
