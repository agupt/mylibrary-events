import type { Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * County "GetEventsByDay" calendar adapter (found by Amool on
 * calendar.countyofmonterey.gov). A shared county calendar hosts many
 * departments; a per-event `Labels` array tags the owner ("MCFL" = Monterey
 * County Free Libraries), and the API filters on it server-side via
 * search:"labels:<LABEL>". Each event carries `DateStart` as a floating local
 * wall-clock ("2026-07-16T10:00:00Z" — the Z is bogus; StartUTC is the real
 * instant, 7h off), an `AllDay` flag, and a "<Branch> - <Title>" Name.
 *
 * The registry URL encodes the endpoint plus config as query params:
 *   <endpoint>?ppid=<n>&label=<LABEL>&lat=<lat>&lng=<lng>
 */

const KEY_SEP = "||";
const MAX_DESCRIPTION_LENGTH = 280;
const SEARCH_DISTANCE_MILES = 500;
const EVENTS_PER_DAY = 50;

export interface GovCalRawEvent {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  description: string;
  labels: string[];
}

interface GovCalDay {
  Events?: Array<{
    Id?: number | string;
    PId?: number | string;
    Name?: string;
    Description?: string;
    DateStart?: string;
    DateEnd?: string;
    AllDay?: boolean;
    Labels?: string[];
  }>;
}

/** "2026-07-16T10:00:00Z" → floating "2026-07-16T10:00:00" (drops the bogus Z). */
function toFloating(value: string): string | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : null;
}

export function parseGovCalResponse(jsonText: string, label: string): GovCalRawEvent[] {
  const parsed: unknown = JSON.parse(jsonText);
  const days = (parsed as { Value?: GovCalDay[] })?.Value;
  if (!Array.isArray(days)) return [];
  const events: GovCalRawEvent[] = [];
  for (const day of days) {
    for (const event of day.Events ?? []) {
      const labels = Array.isArray(event.Labels) ? event.Labels.map(String) : [];
      if (label && !labels.includes(label)) continue; // belt-and-suspenders
      const name = String(event.Name ?? "").replace(/\s+/g, " ").trim();
      const startTime = toFloating(String(event.DateStart ?? ""));
      if (!name || !startTime) continue;
      events.push({
        id: String(event.Id ?? event.PId ?? `${name}:${startTime}`),
        name,
        startTime,
        endTime: toFloating(String(event.DateEnd ?? "")) ?? startTime,
        isAllDay: event.AllDay === true,
        description: String(event.Description ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_DESCRIPTION_LENGTH),
        labels,
      });
    }
  }
  return events;
}

export interface GovCalProviderDeps {
  feeds: Record<string, string>;
  postJson: (url: string, body: unknown) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

/** "Greenfield - Wee One's Wonderland!" → branch "Greenfield". */
function branchFromName(name: string): string {
  const dash = name.indexOf(" - ");
  return dash > 0 ? name.slice(0, dash).trim() : "";
}

function toStorytimeEvent(raw: GovCalRawEvent, libraryId: string): StorytimeEvent | null {
  const ageGroups = inferAgeGroupsFromText(`${raw.name} ${raw.description}`);
  if (ageGroups === null) return null; // adult/teen-only
  return {
    id: raw.id,
    libraryId,
    title: raw.name,
    eventType: classifyEventType([], `${raw.name} ${raw.description}`),
    ageGroups,
    startTime: raw.startTime,
    endTime: raw.endTime,
    description: raw.description,
    isAllDay: raw.isAllDay,
  };
}

export function createGovCalProvider(deps: GovCalProviderDeps): EventProvider {
  const getEvents = createFeedCache({
    load: async (cacheKey: string) => {
      const [endpoint, ppid, label, lat, lng, startIso, days] = cacheKey.split(KEY_SEP);
      const body = {
        ppid: Number(ppid),
        tps: null,
        lat: Number(lat),
        lng: Number(lng),
        distance: SEARCH_DISTANCE_MILES,
        search: label ? `labels:${label}` : "",
        sort: "Time",
        category: [],
        labels: [],
        defFilter: "all",
        start: startIso,
        daysToLoad: Number(days),
        eventsPerDay: EVENTS_PER_DAY,
      };
      return parseGovCalResponse(await deps.postJson(endpoint, body), label);
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

      const days = Math.max(
        1,
        Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000),
      );
      const startIso = `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}-${String(range.start.getDate()).padStart(2, "0")}T00:00:00.000Z`;

      const results = await Promise.all(
        [...bySystem.entries()].map(async ([systemKey, libraries]) => {
          const feed = deps.feeds[systemKey];
          if (!feed) return [];
          const url = new URL(feed);
          const cacheKey = [
            `${url.origin}${url.pathname}`,
            url.searchParams.get("ppid") ?? "0",
            url.searchParams.get("label") ?? "",
            url.searchParams.get("lat") ?? "0",
            url.searchParams.get("lng") ?? "0",
            startIso,
            String(days),
          ].join(KEY_SEP);

          let raws: GovCalRawEvent[];
          try {
            raws = await getEvents(cacheKey);
          } catch (error: unknown) {
            console.error(`GovCal: failed to load ${feed}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) => a.id.localeCompare(b.id))[0];
          return raws
            .filter((raw) => {
              const start = Date.parse(raw.startTime);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((raw) => {
              const hint = branchFromName(raw.name);
              const branch = hint
                ? libraries.find((library) => namesOverlap(hint, library.name))
                : undefined;
              return toStorytimeEvent(raw, (branch ?? mainOutlet).id);
            })
            .filter((event): event is StorytimeEvent => event !== null);
        }),
      );
      return results
        .flat()
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    },
  };
}
