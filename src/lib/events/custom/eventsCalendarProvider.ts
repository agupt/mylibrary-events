import type { Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * eventscalendar.co adapter (curl found by Amool on Tulare County Free Library).
 * eventscalendar.co is a widget broker in front of a Google Calendar: the
 * unauthenticated endpoint
 *   broker.eventscalendar.co/api/google/events?user=&project=&calendar=<gcalId>&from=<ms>&to=<ms>
 * returns { result, events[] }, each event carrying Google Calendar fields
 * (title, description HTML, location free-text, `color` hex, `allday`, and
 * `start_time`/`startHour`/`startMinutes` wall-clock components).
 *
 * Google Calendar has no audience metadata, but libraries encode audience in
 * the event COLOR via a posted "events key" (Tulare: yellow #fbd75b =
 * "Children, Tweens, and Family"). That mapping is per-calendar config, so the
 * kid color(s) live in the registry URL as `kidColors=<hex[,hex]>` — we keep
 * only those, then infer specific age groups from the title/description
 * (defaulting to all-ages, since the color already confirms it's for kids).
 *
 * Times are wall-clock local (America/Los_Angeles); we build a floating-local
 * ISO from the date + hour/minute components, so no timezone projection.
 */

const KEY_SEP = "||";
const MAX_DESCRIPTION_LENGTH = 280;
const KID_COLORS_PARAM = "kidColors";

interface EventsCalendarApiEvent {
  id?: string;
  title?: string;
  description?: string;
  location?: string;
  color?: string;
  allday?: boolean;
  start_time?: string;
  end_time?: string;
  startHour?: number;
  startMinutes?: number;
  endHour?: number;
  endMinutes?: number;
}

export interface EventsCalendarRawEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
}

function decodeEntities(value: string): string {
  const map: Record<string, string> = {
    "&amp;": "&",
    "&nbsp;": " ",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
  };
  return value.replace(
    /&amp;|&nbsp;|&quot;|&#39;|&apos;|&lt;|&gt;/g,
    (m) => map[m],
  );
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Build a floating-local ISO from a date string + wall-clock hour/minute. */
function floatingIso(dateTime: string, hour: number, minute: number): string {
  const date = String(dateTime).slice(0, 10);
  return `${date}T${pad2(hour)}:${pad2(minute)}:00`;
}

/**
 * Parses the broker response, keeping only events whose color is in the kid set.
 */
export function parseEventsCalendarResponse(
  jsonText: string,
  kidColors: ReadonlySet<string>,
): EventsCalendarRawEvent[] {
  const parsed: unknown = JSON.parse(jsonText);
  const events = (parsed as { events?: EventsCalendarApiEvent[] })?.events;
  if (!Array.isArray(events)) return [];
  const result: EventsCalendarRawEvent[] = [];
  for (const raw of events) {
    const color = String(raw.color ?? "").toLowerCase();
    if (!kidColors.has(color)) continue;
    const title = String(raw.title ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const startBase = String(raw.start_time ?? "");
    if (!title || startBase.length < 10) continue;
    const isAllDay = raw.allday === true;
    result.push({
      id: String(raw.id ?? `${title}:${startBase}`),
      title,
      description: stripHtml(String(raw.description ?? "")).slice(
        0,
        MAX_DESCRIPTION_LENGTH,
      ),
      location: String(raw.location ?? "").trim(),
      startTime: floatingIso(
        startBase,
        raw.startHour ?? 0,
        raw.startMinutes ?? 0,
      ),
      endTime: floatingIso(
        String(raw.end_time ?? startBase),
        raw.endHour ?? 0,
        raw.endMinutes ?? 0,
      ),
      isAllDay,
    });
  }
  return result;
}

export interface EventsCalendarProviderDeps {
  feeds: Record<string, string>;
  fetchText: (url: string, headers?: Record<string, string>) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

/** Splits the registry URL into the fetch base and its configured kid colors. */
function splitConfig(feedUrl: string): {
  base: URL;
  kidColors: Set<string>;
} {
  const base = new URL(feedUrl);
  const kidColors = new Set(
    (base.searchParams.get(KID_COLORS_PARAM) ?? "")
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
  base.searchParams.delete(KID_COLORS_PARAM);
  return { base, kidColors };
}

function toStorytimeEvent(
  raw: EventsCalendarRawEvent,
  libraryId: string,
): StorytimeEvent {
  const ageGroups =
    inferAgeGroupsFromText(`${raw.title} ${raw.description}`) ?? ["all-ages"];
  return {
    id: raw.id,
    libraryId,
    title: raw.title,
    eventType: classifyEventType([], `${raw.title} ${raw.description}`),
    ageGroups: [...ageGroups].sort(),
    startTime: raw.startTime,
    endTime: raw.endTime,
    description: raw.description,
    isAllDay: raw.isAllDay,
  };
}

export function createEventsCalendarProvider(
  deps: EventsCalendarProviderDeps,
): EventProvider {
  const loadEvents = createFeedCache({
    load: async (cacheKey: string) => {
      const [feedUrl, from, to] = cacheKey.split(KEY_SEP);
      const { base, kidColors } = splitConfig(feedUrl);
      base.searchParams.set("from", from);
      base.searchParams.set("to", to);
      return parseEventsCalendarResponse(
        await deps.fetchText(base.toString()),
        kidColors,
      );
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

      const from = String(range.start.getTime());
      const to = String(range.end.getTime());

      const results = await Promise.all(
        [...bySystem.entries()].map(async ([systemKey, libraries]) => {
          const feed = deps.feeds[systemKey];
          if (!feed) return [];
          const cacheKey = [feed, from, to].join(KEY_SEP);

          let raws: EventsCalendarRawEvent[];
          try {
            raws = await loadEvents(cacheKey);
          } catch (error: unknown) {
            console.error(`eventscalendar: failed to load ${feed}`, error);
            return [];
          }

          const mainOutlet = [...libraries].sort((a, b) =>
            a.id.localeCompare(b.id),
          )[0];

          return raws
            .filter((raw) => {
              const t = Date.parse(raw.startTime);
              return t >= range.start.getTime() && t < range.end.getTime();
            })
            .map((raw) => {
              const branch = raw.location
                ? libraries.find((library) =>
                    namesOverlap(raw.location, library.name),
                  )
                : undefined;
              return toStorytimeEvent(raw, (branch ?? mainOutlet).id);
            });
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
