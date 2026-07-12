import { getAllLibraries } from "../data/directory";
import { CALENDAR_FEEDS } from "./calendarFeeds";
import type { EventProvider } from "./eventProvider";
import { createBiblioCommonsProvider } from "./bibliocommons/provider";

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

let provider: EventProvider | null = null;
let librariesById: Map<string, ReturnType<typeof getAllLibraries>[number]> | null =
  null;

/** The app's runtime event provider (live BiblioCommons feeds). */
export function getEventProvider(): EventProvider {
  if (provider === null) {
    provider = createBiblioCommonsProvider({
      feeds: CALENDAR_FEEDS,
      fetchText,
      findLibraryById: (id) => {
        if (librariesById === null) {
          librariesById = new Map(
            getAllLibraries().map((library) => [library.id, library]),
          );
        }
        return librariesById.get(id);
      },
    });
  }
  return provider;
}

/** True if the library's system has a configured calendar feed. */
export function hasCalendarFeed(libraryId: string): boolean {
  return libraryId.split("-")[0] in CALENDAR_FEEDS;
}
