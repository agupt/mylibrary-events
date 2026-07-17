import { XMLParser } from "fast-xml-parser";
import type { Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import { classifyEventType, inferAgeGroupsFromText } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * CivicPlus municipal calendar adapter. Cities on CivicPlus expose per-category
 * RSS at /Home/Components/RssFeeds/RssFeed/View?id=N; the library category is
 * one of them (Redwood City id=4, "Library Feed", found by Amool). Items carry
 * structured <eventStartDate>M/D/YYYY h:mm:ss AM/PM</eventStartDate> — a clean,
 * unambiguous time, unlike SFPL's list. No structured age/location, so age is
 * inferred from text and the branch comes from an "@ <Branch>" title suffix.
 * Emits floating local wall-clock, like every other adapter.
 */

const MAX_DESCRIPTION_LENGTH = 280;

export interface CivicPlusRawEvent {
  id: string;
  title: string;
  /** Floating local wall-clock ISO, no offset. */
  startTime: string;
  endTime: string;
  description: string;
  /** Branch named after "@" in the title, if any (e.g. "Schaberg"). */
  branchHint: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&#0*39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*8217;|&rsquo;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** "7/18/2026 10:00:00 AM" → floating "2026-07-18T10:00:00" (null if unparseable). */
export function civicPlusToFloatingIso(value: string): string | null {
  const match = value
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const [, mo, d, y, rawHour, min, sec, meridiem] = match;
  let hour = Number(rawHour);
  const isPm = meridiem.toUpperCase() === "PM";
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  const pad = (n: number | string) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}T${pad(hour)}:${min}:${sec}`;
}

/** "Toddler Storytime @ Schaberg (07/22/2026 10:30 AM - 11:00 AM)" → title + branch. */
function splitTitle(rawTitle: string): { title: string; branchHint: string } {
  // Drop the trailing "(MM/DD/YYYY ...)" date echo CivicPlus appends.
  const withoutDate = rawTitle.replace(/\s*\((?:\d{1,2}\/\d{1,2}\/\d{4})[^)]*\)\s*$/, "").trim();
  const at = withoutDate.match(/\s+@\s+(.+)$/);
  return {
    title: withoutDate,
    branchHint: at ? at[1].trim() : "",
  };
}

export function parseCivicPlusFeed(xml: string): CivicPlusRawEvent[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const document: unknown = parser.parse(xml);
  const items = asArray(
    (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel?.item,
  );

  const events: CivicPlusRawEvent[] = [];
  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;
    const rawTitle = stripHtml(String(item.title ?? ""));
    const startTime = civicPlusToFloatingIso(String(item.eventStartDate ?? ""));
    if (!rawTitle || !startTime) continue;
    const endTime = civicPlusToFloatingIso(String(item.eventEndDate ?? "")) ?? startTime;
    const { title, branchHint } = splitTitle(rawTitle);
    events.push({
      id: String(item.guid ?? item.link ?? `${title}:${startTime}`),
      title,
      startTime,
      endTime,
      description: stripHtml(String(item.description ?? "")).slice(0, MAX_DESCRIPTION_LENGTH),
      branchHint,
    });
  }
  return events;
}

export interface CivicPlusProviderDeps {
  /** Library-category RSS feed URL by system key. */
  feeds: Record<string, string>;
  fetchText: (url: string) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function toStorytimeEvent(
  raw: CivicPlusRawEvent,
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

export function createCivicPlusProvider(deps: CivicPlusProviderDeps): EventProvider {
  const getFeedEvents = createFeedCache({
    load: (url) => deps.fetchText(url).then(parseCivicPlusFeed),
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
          let feedEvents: CivicPlusRawEvent[];
          try {
            feedEvents = await getFeedEvents(feedUrl);
          } catch (error: unknown) {
            console.error(`CivicPlus: failed to load ${feedUrl}`, error);
            return [];
          }
          const mainOutlet = [...libraries].sort((a, b) => a.id.localeCompare(b.id))[0];
          return feedEvents
            .filter((raw) => {
              const start = Date.parse(raw.startTime);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((raw) => {
              // Branch from the "@ <name>" title hint; unhinted events (and
              // main-library programs) go to the lowest-sequence outlet.
              const branch = raw.branchHint
                ? libraries.find((library) => namesOverlap(raw.branchHint, library.name))
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
