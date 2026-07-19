import type { AgeGroup, Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import {
  ageGroupsFromRange,
  classifyEventType,
  inferAgeGroupsFromText,
} from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * whofi calendar adapter (found by Amool on keller-tx.whofi.com). whofi is a
 * per-library municipal calendar platform served at `<slug>.whofi.com`; the
 * unauthenticated GET endpoint
 *   /calendar/fetch_calendar_events?start=<iso>&end=<iso>
 * returns a flat JSON array of events for the requested window. Only the
 * current + next month are published, so a wide window still returns whatever
 * exists.
 *
 * Each event carries a *structured* `age` label ("Children (Ages 0-5)",
 * "Young Adult (Ages 12-18)", "Adult (Ages 19+)", "General Interest") which is
 * authoritative for age mapping, a `category_name` for event-type hints, a
 * `location_name` for branch attribution, and `start`/`end` as floating local
 * wall-clock strings ("2026-09-05 16:00:00" — already the library's own
 * timezone, no offset, so no tz projection is needed).
 *
 * Registry URL is the endpoint base; the date window is generated per request.
 */

const KEY_SEP = "||";
const MAX_DESCRIPTION_LENGTH = 280;

/** Vendor `age` labels that are definitively non-kid → drop the event. */
const ADULT_AGE_LABEL = /adult\s*\(ages\s*19/i;

export interface WhofiRawEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  categoryName: string;
  age: string;
  locationName: string;
  isAllDay: boolean;
}

interface WhofiApiEvent {
  id?: number | string;
  title?: string;
  clean_title?: string;
  start?: string;
  end?: string;
  desc?: string;
  category_name?: string;
  age?: string;
  location_name?: string;
  allDay?: boolean;
}

/** "2026-09-05 16:00:00" → floating ISO "2026-09-05T16:00:00". */
function toFloating(value: string): string | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : null;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;|&nbsp;|&quot;|&#39;|&apos;|&lt;|&gt;/g, (m) => HTML_ENTITIES[m])
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWhofiResponse(jsonText: string): WhofiRawEvent[] {
  const parsed: unknown = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) return [];
  const events: WhofiRawEvent[] = [];
  for (const raw of parsed as WhofiApiEvent[]) {
    const title = String(raw.clean_title || raw.title || "")
      .replace(/\s+/g, " ")
      .trim();
    const start = toFloating(String(raw.start ?? ""));
    if (!title || !start) continue;
    events.push({
      id: String(raw.id ?? `${title}:${start}`),
      title,
      start,
      end: toFloating(String(raw.end ?? "")) ?? start,
      description: stripHtml(String(raw.desc ?? "")).slice(
        0,
        MAX_DESCRIPTION_LENGTH,
      ),
      categoryName: String(raw.category_name ?? "").trim(),
      age: String(raw.age ?? "").trim(),
      locationName: String(raw.location_name ?? "").trim(),
      isAllDay: raw.allDay === true,
    });
  }
  return events;
}

/**
 * Vendor age label is authoritative: a numeric range maps directly; an explicit
 * adult label drops the event; an empty/"General Interest" label falls back to
 * title/description inference.
 */
function ageGroupsFor(raw: WhofiRawEvent): AgeGroup[] | null {
  const fromRange = ageGroupsFromRange(raw.age);
  if (fromRange !== null) return fromRange;
  if (ADULT_AGE_LABEL.test(raw.age)) return null;
  return inferAgeGroupsFromText(`${raw.title} ${raw.description}`);
}

export interface WhofiProviderDeps {
  feeds: Record<string, string>;
  fetchText: (url: string, headers?: Record<string, string>) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function toStorytimeEvent(
  raw: WhofiRawEvent,
  libraryId: string,
): StorytimeEvent | null {
  if (/^cancell?ed\b/i.test(raw.title)) return null; // staff prefix, no structured flag
  const ageGroups = ageGroupsFor(raw);
  if (ageGroups === null) return null; // adult/teen-only or unclassifiable
  return {
    id: raw.id,
    libraryId,
    title: raw.title,
    eventType: classifyEventType(
      [raw.categoryName],
      `${raw.title} ${raw.description}`,
    ),
    ageGroups,
    startTime: raw.start,
    endTime: raw.end,
    description: raw.description,
    isAllDay: raw.isAllDay,
  };
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createWhofiProvider(deps: WhofiProviderDeps): EventProvider {
  const loadEvents = createFeedCache({
    load: async (cacheKey: string) => {
      const [base, start, end] = cacheKey.split(KEY_SEP);
      const url = `${base}?locationid=&categoryid=&audienceid=&ageid=&start=${start}T00:00:00&end=${end}T00:00:00`;
      return parseWhofiResponse(await deps.fetchText(url));
    },
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
        const systemKey = libraryId.split("-")[0];
        bySystem.set(systemKey, [...(bySystem.get(systemKey) ?? []), library]);
      }

      const start = isoDate(range.start);
      const end = isoDate(range.end);

      const results = await Promise.all(
        [...bySystem.entries()].map(async ([systemKey, libraries]) => {
          const feed = deps.feeds[systemKey];
          if (!feed) return [];
          const cacheKey = [feed, start, end].join(KEY_SEP);

          let raws: WhofiRawEvent[];
          try {
            raws = await loadEvents(cacheKey);
          } catch (error: unknown) {
            console.error(`whofi: failed to load ${feed}`, error);
            return [];
          }

          const mainOutlet = [...libraries].sort((a, b) =>
            a.id.localeCompare(b.id),
          )[0];

          return raws
            .filter((raw) => {
              const t = Date.parse(raw.start);
              return (
                t >= range.start.getTime() && t < range.end.getTime()
              );
            })
            .map((raw) => {
              const branch = raw.locationName
                ? libraries.find((library) =>
                    namesOverlap(raw.locationName, library.name),
                  )
                : undefined;
              return toStorytimeEvent(raw, (branch ?? mainOutlet).id);
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
