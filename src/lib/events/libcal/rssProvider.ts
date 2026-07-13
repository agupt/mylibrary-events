import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, mapAudiencesToAgeGroups } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";
import { parseLibcalRss, type LibcalRssEvent } from "./parseLibcalRss";

export interface LibcalRssProviderDeps {
  /** rss.php?m=month&cid=N feed URL by system key. */
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

/** libcal:campus carries the branch name (e.g. "Rice", "Rockridge Branch"). */
function campusMatches(event: LibcalRssEvent, library: Library): boolean {
  const campus = normalizeName(`${event.campus} ${event.location}`);
  const libraryName = normalizeName(library.name);
  return (
    campus.length > 0 &&
    libraryName.length > 0 &&
    (campus === libraryName ||
      campus.includes(libraryName) ||
      libraryName.includes(campus))
  );
}

function toStorytimeEvent(
  event: LibcalRssEvent,
  libraryId: string,
): StorytimeEvent | null {
  // libcal:audience is structured ("Children Ages 0-5"); numeric ranges
  // map precisely, keyword labels fall back to the shared mapper.
  const ageGroups =
    event.audiences.length > 0
      ? mapAudiencesToAgeGroups(event.audiences)
      : ["all-ages" as const];
  if (ageGroups === null) {
    return null; // teen/adult-only program
  }
  return {
    id: event.id,
    libraryId,
    title: event.title,
    eventType: classifyEventType(event.categories, event.title),
    ageGroups,
    // Floating local wall-clock time — LibCal reports the library's own
    // timezone, which is what patrons care about.
    startTime: event.startTime,
    endTime: event.endTime,
    description: event.description,
  };
}

/**
 * EventProvider over LibCal events RSS (rss.php?m=month&cid=N). One feed
 * covers a system's calendar; events are attributed to branches via
 * libcal:campus/location, with unattributed events assigned once to the
 * lowest-sequence requested outlet. Note: month mode only serves the
 * current month's remaining events — a 14-day window near month-end will
 * be partially covered until LibCal rolls over.
 */
export function createLibcalRssProvider(deps: LibcalRssProviderDeps): EventProvider {
  const getFeedEvents = createFeedCache({
    load: (url) => deps.fetchText(url).then(parseLibcalRss),
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
          let feedEvents: LibcalRssEvent[];
          try {
            feedEvents = await getFeedEvents(feedUrl);
          } catch (error: unknown) {
            console.error(`Failed to load LibCal RSS feed ${feedUrl}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) =>
            a.id.localeCompare(b.id),
          )[0];
          // IMLS convention: FSCS sequence 002 is the system's central
          // outlet. LibCal often names it just "Central Library" or
          // "Main Library", which shares no words with the IMLS name
          // (e.g. "Denver Public Library").
          const centralOutlet = libraries.find((library) =>
            library.id.endsWith("-002"),
          );
          return feedEvents
            // LibCal has no cancelled flag in RSS — staff prefix titles
            .filter((event) => !/^\s*cancell?ed\b/i.test(event.title))
            .filter((event) => {
              const start = Date.parse(event.startTime);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((event) => {
              const branch =
                libraries.find((library) => campusMatches(event, library)) ??
                (centralOutlet && /\b(central|main)\b/i.test(event.campus)
                  ? centralOutlet
                  : undefined);
              const hasCampusData = event.campus.length > 0;
              if (hasCampusData && !branch) {
                return null; // belongs to a branch the user didn't select
              }
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
