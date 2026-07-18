import type { Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import type { DateRange, EventProvider } from "../eventProvider";
import { classifyEventType, mapAudiencesToAgeGroups } from "../classify";
import { createFeedCache } from "../feedCache";
import { parseBcFeed, type BcFeedEvent } from "./parseFeed";

export interface BcProviderDeps {
  /** feedUrl by system key (the FSCSKEY portion of a library id). */
  feeds: Record<string, string>;
  fetchText: (url: string) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function systemKeyOf(libraryId: string): string {
  return libraryId.split("-")[0];
}

/** An event belongs to a library if the branch zip or name lines up. */
function matchesLibrary(event: BcFeedEvent, library: Library): boolean {
  if (event.locationZip && event.locationZip === library.zipCode) {
    return true;
  }
  return namesOverlap(event.locationName, library.name);
}

function toStorytimeEvent(
  event: BcFeedEvent,
  libraryId: string,
): StorytimeEvent | null {
  const ageGroups = mapAudiencesToAgeGroups(event.audiences);
  if (ageGroups === null) {
    return null; // teen/adult-only program
  }
  return {
    id: event.id,
    libraryId,
    title: event.title,
    eventType: classifyEventType(event.categories, event.title),
    ageGroups,
    startTime: event.startTime,
    endTime: Number.isNaN(Date.parse(event.endTime))
      ? event.startTime
      : event.endTime,
    description: event.description,
  };
}

/**
 * EventProvider over BiblioCommons events RSS feeds. One feed covers a
 * whole library system; events are attributed to individual branches by
 * matching the feed item's location (zip, then name) against the IMLS
 * outlet record. Feeds are cached in-memory per URL.
 */
export function createBiblioCommonsProvider(deps: BcProviderDeps): EventProvider {
  const getFeedEvents = createFeedCache({
    load: (url) => deps.fetchText(url).then(parseBcFeed),
    ttlMs: deps.cacheTtlMs,
    now: deps.now,
    persistDir: deps.persistDir,
  });

  return {
    async getEvents(libraryIds: string[], range: DateRange) {
      // Group requested libraries by system so one feed serves all of a
      // system's branches and we can pick a main outlet for events the feed
      // can't pin to a branch.
      const bySystem = new Map<string, Library[]>();
      for (const libraryId of libraryIds) {
        const library = deps.findLibraryById(libraryId);
        if (!library) continue;
        const systemKey = systemKeyOf(libraryId);
        bySystem.set(systemKey, [...(bySystem.get(systemKey) ?? []), library]);
      }

      const results = await Promise.all(
        [...bySystem.entries()].map(async ([systemKey, libraries]) => {
          const feedUrl = deps.feeds[systemKey];
          if (!feedUrl) return [];
          let feedEvents: BcFeedEvent[];
          try {
            feedEvents = await getFeedEvents(feedUrl);
          } catch (error: unknown) {
            console.error(`Failed to load events feed ${feedUrl}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) =>
            a.id.localeCompare(b.id),
          )[0];
          return feedEvents
            .filter((event) => !event.isCancelled)
            .filter((event) => {
              const start = Date.parse(event.startTime);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((event) => {
              const branch = libraries.find((library) =>
                matchesLibrary(event, library),
              );
              // A located event at a branch the user didn't select is dropped;
              // an event with NO location data (some feeds, e.g. LV-Clark
              // County, leave bc:location empty) can't be pinned to a branch,
              // so it goes to the main outlet rather than vanishing.
              const hasLocation = Boolean(event.locationZip || event.locationName);
              if (!branch && hasLocation) return null;
              return toStorytimeEvent(event, (branch ?? mainOutlet).id);
            })
            .filter((event): event is StorytimeEvent => event !== null);
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

/** System keys that have a configured feed. */
export function systemsWithFeeds(feeds: Record<string, string>): Set<string> {
  return new Set(Object.keys(feeds));
}
