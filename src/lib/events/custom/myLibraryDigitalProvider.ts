import { XMLParser } from "fast-xml-parser";
import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * mylibrary.digital adapter. The app (alamedafree.events.mylibrary.digital)
 * sits behind Cloudflare's JS challenge — the events API 403s any non-browser
 * client — but its /rss endpoint is exempt (found by Amool), the same escape
 * hatch FLP uses. The feed is a rolling window of upcoming events; the event
 * date/time lives in the description HTML ("Date/Time: Fri, 17 Jul 2026,
 * 10:30am - 11:00am"), not pubDate (which is when the item was published).
 * No branch field, so everything is attributed to the main outlet. Emits
 * floating local wall-clock. Subdomain-per-library, so reusable.
 */

const MAX_DESCRIPTION_LENGTH = 280;
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export interface MyLibraryDigitalRawEvent {
  id: string;
  title: string;
  /** Floating local wall-clock ISO, no offset. */
  startTime: string;
  endTime: string;
  description: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&#0*39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function to24h(hour: string, minute: string, meridiem: string): string {
  let h = Number(hour);
  const isPm = /pm/i.test(meridiem);
  if (isPm && h !== 12) h += 12;
  if (!isPm && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

/**
 * Pulls the event's floating start/end from the "Date/Time:" line embedded in
 * the (HTML-encoded) description. Returns null if it can't be found.
 */
export function parseMyLibraryDigitalDateTime(
  descriptionHtml: string,
): { startTime: string; endTime: string } | null {
  const text = decodeEntities(descriptionHtml);
  const match = text.match(
    /Date\/Time:\s*<\/strong>\s*[A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*(am|pm)(?:\s*[-–]\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i,
  );
  if (!match) return null;
  const [, day, monthName, year, sh, sm, sap, eh, em, eap] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  const date = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const startTime = `${date}T${to24h(sh, sm, sap)}:00`;
  const endTime = eh ? `${date}T${to24h(eh, em, eap)}:00` : startTime;
  return { startTime, endTime };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseMyLibraryDigitalFeed(xml: string): MyLibraryDigitalRawEvent[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const document: unknown = parser.parse(xml);
  const items = asArray(
    (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel?.item,
  );

  const events: MyLibraryDigitalRawEvent[] = [];
  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;
    const title = stripHtml(String(item.title ?? ""));
    const descriptionHtml = String(item.description ?? "");
    const when = parseMyLibraryDigitalDateTime(descriptionHtml);
    if (!title || !when) continue;
    // Drop the "Date/Time: …" preamble from the human-readable description.
    const description = stripHtml(descriptionHtml)
      .replace(/^Date\/Time:[^.]*?(?:am|pm)\s*/i, "")
      .slice(0, MAX_DESCRIPTION_LENGTH);
    events.push({
      id: String(item.guid ?? item.link ?? `${title}:${when.startTime}`),
      title,
      startTime: when.startTime,
      endTime: when.endTime,
      description,
    });
  }
  return events;
}

export interface MyLibraryDigitalProviderDeps {
  feeds: Record<string, string>;
  fetchText: (url: string) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function toStorytimeEvent(
  raw: MyLibraryDigitalRawEvent,
  libraryId: string,
): StorytimeEvent | null {
  const ageGroups = inferAgeGroupsFromText(`${raw.title} ${raw.description}`);
  if (ageGroups === null) return null; // adult/teen-only
  return {
    id: raw.id,
    libraryId,
    title: raw.title,
    eventType: classifyEventType([], `${raw.title} ${raw.description}`),
    ageGroups,
    startTime: raw.startTime,
    endTime: raw.endTime,
    description: raw.description,
  };
}

export function createMyLibraryDigitalProvider(
  deps: MyLibraryDigitalProviderDeps,
): EventProvider {
  const getFeedEvents = createFeedCache({
    load: (url) => deps.fetchText(url).then(parseMyLibraryDigitalFeed),
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
          const feedUrl = deps.feeds[systemKey];
          if (!feedUrl) return [];
          let feedEvents: MyLibraryDigitalRawEvent[];
          try {
            feedEvents = await getFeedEvents(feedUrl);
          } catch (error: unknown) {
            console.error(`mylibrary.digital: failed to load ${feedUrl}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) => a.id.localeCompare(b.id))[0];
          return feedEvents
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
