import type { Library, StorytimeEvent } from "../../types";
import { addressesMatch, namesOverlap } from "../nameMatch";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";
import { expandRecurrence } from "../recurrence";
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

function locationMatches(event: IcsEvent, library: Library): boolean {
  // Branch name first; street address second (Dallas-style feeds put
  // "1515 Young Street, Dallas, TX" in LOCATION with no branch name)
  return (
    namesOverlap(event.location, library.name) ||
    addressesMatch(event.location, library.address)
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
    isAllDay: event.isAllDay,
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
          let feedUrl = deps.feeds[systemKey];
          if (!feedUrl) {
            return [];
          }
          // "{YYYY-MM}" template → the range's month at fetch time.
          // Month-scoped feeds (Dallas's LibraryCalendar) generate in
          // seconds; the unscoped variant renders months of events and
          // times out. Trade-off: windows crossing a month boundary are
          // partially covered until the month rolls (same as LibCal RSS).
          feedUrl = feedUrl.replace(
            "{YYYY-MM}",
            range.start.toISOString().slice(0, 7),
          );
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
          // Recurring events (weekly/monthly storytimes) are anchored at the
          // series' original start — often years back — so expand each into
          // its concrete occurrences within the window; non-recurring events
          // pass through if their single start lands in range.
          const inRange = feedEvents.flatMap((event) => {
            if (event.rrule) {
              return expandRecurrence(
                event.startTime,
                event.endTime,
                event.rrule,
                event.exdates,
                range.start.getTime(),
                range.end.getTime(),
              ).map((occ) => ({
                ...event,
                startTime: occ.startTime,
                endTime: occ.endTime,
                uid: `${event.uid}:${occ.startTime.slice(0, 10)}`,
              }));
            }
            const start = Date.parse(event.startTime);
            return start >= range.start.getTime() && start < range.end.getTime()
              ? [event]
              : [];
          });
          // Does this feed's LOCATION field carry branch names at all?
          // Single-building systems (Mountain View) put rooms there
          // ("Children's Room") — attribute everything to the main outlet.
          // Multi-branch systems (Sacramento, Hawaii) put branches there —
          // then an unmatched location means "a branch the user didn't
          // select" and must be dropped, not mis-attributed to Central.
          const locationsAreBranches = inRange.some((event) =>
            libraries.some((library) => locationMatches(event, library)),
          );
          return inRange
            .map((event) => {
              const branch = libraries.find((library) =>
                locationMatches(event, library),
              );
              if (!branch && locationsAreBranches && event.location.length > 0) {
                return null;
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
