import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";
import { parseIcs, type IcsEvent } from "./parseIcs";

export interface IcsProviderDeps {
  /** iCal feed URL by system key (works for LibCal and any ICS source). */
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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(library|branch|the)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationMatches(event: IcsEvent, library: Library): boolean {
  const location = normalizeName(event.location);
  const libraryName = normalizeName(library.name);
  return (
    location.length > 0 &&
    libraryName.length > 0 &&
    (location === libraryName ||
      location.includes(libraryName) ||
      libraryName.includes(location))
  );
}

function toStorytimeEvent(
  event: IcsEvent,
  libraryId: string,
): StorytimeEvent | null {
  // ICS feeds carry no structured audience data — infer from text.
  const text = `${event.title} ${event.categories.join(" ")}`;
  const ageGroups = inferAgeGroupsFromText(text);
  if (ageGroups === null) {
    return null; // teen/adult-only program
  }
  return {
    id: event.uid,
    libraryId,
    title: event.title,
    eventType: classifyEventType(event.categories, event.title),
    ageGroups,
    startTime: event.startTime,
    endTime: event.endTime,
    description: event.description,
  };
}

/**
 * EventProvider over iCalendar feeds (LibCal's ical_subscribe.php or any
 * ICS export). One feed covers a system; events naming a branch in their
 * LOCATION are attributed to that branch, and unattributed events go to
 * the system's main outlet (lowest FSCS sequence) among the requested
 * libraries so single-building systems Just Work.
 */
export function createIcsProvider(deps: IcsProviderDeps): EventProvider {
  const getFeedEvents = createFeedCache({
    load: (url) => deps.fetchText(url).then(parseIcs),
    ttlMs: deps.cacheTtlMs,
    now: deps.now,
    persistDir: deps.persistDir,
  });

  return {
    async getEvents(libraryIds: string[], range: DateRange) {
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
          if (!feedUrl) {
            return [];
          }
          let feedEvents: IcsEvent[];
          try {
            feedEvents = await getFeedEvents(feedUrl);
          } catch (error: unknown) {
            console.error(`Failed to load ICS feed ${feedUrl}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) =>
            a.id.localeCompare(b.id),
          )[0];
          return feedEvents
            .filter((event) => {
              const start = Date.parse(event.startTime);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((event) => {
              const branch = libraries.find((library) =>
                locationMatches(event, library),
              );
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
