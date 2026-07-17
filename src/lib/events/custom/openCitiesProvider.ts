import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";
import { civicPlusToFloatingIso } from "./civicPlusProvider";

/**
 * OpenCities municipal platform adapter. Cities on OpenCities expose a
 * calendar JSON API (found by Amool on menlopark.gov):
 *
 *   POST /ocapi/calendars/getcalendaritems
 *   { LanguageCode, Ids: [<calendarGuid>...], StartDate, EndDate }
 *
 * Response: { success, data: [ { Date, Items: [ { Id, Name, DateTime,
 * CalendarId } ] } ] } — day-grouped. Libraries split their programs across
 * audience calendars (Menlo Park: children / teen / adult); we target only
 * the children's calendar GUID(s), stored as a `calendars` query param on the
 * registry URL. Items carry only Name + DateTime (M/D/YYYY h:mm:ss AM/PM, the
 * same format as CivicPlus), so age is inferred from the name and — since the
 * feed is already the children's calendar — defaults to all-ages rather than
 * being dropped. No branch data: everything goes to the main outlet.
 */

const KEY_SEP = "||";

export interface OpenCitiesRawEvent {
  id: string;
  name: string;
  /** Floating local wall-clock ISO. */
  startTime: string;
}

interface OpenCitiesDay {
  Items?: Array<{ Id?: string; Name?: string; DateTime?: string; CalendarId?: string }>;
}

/** Flattens the day-grouped OpenCities response into raw events. */
export function parseOpenCitiesResponse(jsonText: string): OpenCitiesRawEvent[] {
  const parsed: unknown = JSON.parse(jsonText);
  const days = (parsed as { data?: OpenCitiesDay[] })?.data;
  if (!Array.isArray(days)) return [];
  const events: OpenCitiesRawEvent[] = [];
  for (const day of days) {
    for (const item of day.Items ?? []) {
      const name = String(item.Name ?? "").replace(/\s+/g, " ").trim();
      const startTime = civicPlusToFloatingIso(String(item.DateTime ?? ""));
      if (!name || !startTime) continue;
      events.push({ id: String(item.Id ?? `${name}:${startTime}`), name, startTime });
    }
  }
  return events;
}

export interface OpenCitiesProviderDeps {
  /** Endpoint + `?calendars=<guid,guid>` (children's calendars) by system key. */
  feeds: Record<string, string>;
  postJson: (url: string, body: unknown) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function toStorytimeEvent(
  raw: OpenCitiesRawEvent,
  libraryId: string,
): StorytimeEvent | null {
  const ageGroups = inferAgeGroupsFromText(raw.name);
  if (ageGroups === null) return null; // explicit teen/adult on the kids calendar
  return {
    id: raw.id,
    libraryId,
    title: raw.name,
    eventType: classifyEventType([], raw.name),
    ageGroups,
    startTime: raw.startTime,
    endTime: raw.startTime,
    description: "",
  };
}

/** Local YYYY-MM-DD (the API filters on calendar-local dates). */
function toDateParam(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createOpenCitiesProvider(deps: OpenCitiesProviderDeps): EventProvider {
  const getEventsForKey = createFeedCache({
    load: async (cacheKey: string) => {
      const [endpoint, ids, startDate, endDate] = cacheKey.split(KEY_SEP);
      const body = {
        LanguageCode: "en-US",
        Ids: ids.split(","),
        StartDate: startDate,
        EndDate: endDate,
      };
      return parseOpenCitiesResponse(await deps.postJson(endpoint, body));
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

      const results = await Promise.all(
        [...bySystem.entries()].map(async ([systemKey, libraries]) => {
          const feed = deps.feeds[systemKey];
          if (!feed) return [];
          const url = new URL(feed);
          const ids = url.searchParams.get("calendars");
          if (!ids) return [];
          const endpoint = `${url.origin}${url.pathname}`;
          const cacheKey = [
            endpoint,
            ids,
            toDateParam(range.start),
            toDateParam(range.end),
          ].join(KEY_SEP);

          let raws: OpenCitiesRawEvent[];
          try {
            raws = await getEventsForKey(cacheKey);
          } catch (error: unknown) {
            console.error(`OpenCities: failed to load ${endpoint}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) => a.id.localeCompare(b.id))[0];
          return raws
            .filter((raw) => {
              const start = Date.parse(raw.startTime);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((raw) => toStorytimeEvent(raw, mainOutlet.id))
            .filter((event): event is StorytimeEvent => event !== null);
        }),
      );
      return results
        .flat()
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    },
  };
}
