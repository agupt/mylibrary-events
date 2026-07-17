import type { AgeGroup, Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import { classifyEventType } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * San Francisco Public Library adapter. SFPL runs Drupal behind a bot wall,
 * but its events view exposes an unauthenticated AJAX endpoint (found by
 * Amool via DevTools):
 *
 *   GET /views/ajax?view_name=events&view_display_id=page_events_list
 *       &date-end-after=MM/DD/YYYY&page=N&ajax_page_state[libraries]=<token>
 *
 * It returns Drupal's AJAX command array; one `insert` command carries the
 * rendered events HTML (25 teaser cards per page). The `libraries` token is
 * required (a stripped request 500s), so we scrape a fresh one from the
 * /events page each load rather than hard-coding it.
 *
 * Times in the list carry no AM/PM ("12:15 - 1:15"), so we disambiguate with
 * a library-hours heuristic (9–11 = AM, 12–8 = PM) — safe because no public
 * library programs run between 9pm and 9am. Emits floating local wall-clock,
 * like every other adapter.
 */

const MAX_PAGES = 8; // 25/page — covers a 2-week window across all branches
const MAX_DESCRIPTION_LENGTH = 280;

export interface SfplRawEvent {
  id: string;
  title: string;
  /** Floating local date, "YYYY-MM-DD", from the event URL path. */
  date: string;
  /** Raw clock strings from the display range, e.g. "12:15" / "1:15". */
  startClock: string;
  endClock: string;
  audiences: string[];
  topics: string[];
  /** Location slug, e.g. "main-library" / "glen-park". */
  locationSlug: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&#x27;|&apos;/gi, "'")
    .replace(/&#0*34;|&quot;/gi, '"')
    .replace(/&#0*38;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldLinks(card: string, fieldName: string): string[] {
  const block = card.match(
    new RegExp(`field--name-field-event-${fieldName}[\\s\\S]*?<\\/div>\\s*<\\/div>`),
  );
  if (!block) return [];
  return [...block[0].matchAll(/hreflang="en">([^<]+)</g)].map((m) =>
    decodeEntities(m[1]),
  );
}

/** Extracts event teaser cards from one page of the events view HTML. */
export function parseSfplEvents(html: string): SfplRawEvent[] {
  const cards = html.split("views-row").slice(1);
  const events: SfplRawEvent[] = [];
  for (const card of cards) {
    const path = card.match(
      /about="\/events\/(\d{4})\/(\d{2})\/(\d{2})\/([^"]+)"/,
    );
    if (!path) continue;
    const date = `${path[1]}-${path[2]}-${path[3]}`;
    const titleMatch = card.match(/event__title[\s\S]*?<span>([^<]+)<\/span>/);
    const title = decodeEntities(titleMatch?.[1] ?? "");
    if (!title) continue;
    const range = card.match(
      /date-display-range">[^,]+,[^,]+,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/,
    );
    events.push({
      id: path[4],
      title,
      date,
      startClock: range?.[1] ?? "",
      endClock: range?.[2] ?? "",
      audiences: fieldLinks(card, "audience"),
      topics: fieldLinks(card, "topic"),
      locationSlug: card.match(/about="\/locations\/([^"]+)"/)?.[1] ?? "",
    });
  }
  return events;
}

/**
 * "12:15" → "12:15" (24h), applying the library-hours heuristic: hours 9–11
 * are AM, 12 and 1–8 are PM. Returns null for an unparseable clock.
 */
function clockTo24h(clock: string): string | null {
  const match = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minute = match[2];
  let hour = Number(match[1]);
  if (hour >= 1 && hour <= 8) hour += 12; // afternoon/evening
  // 9,10,11 stay AM; 12 stays PM (noon)
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function sfplFloatingIso(date: string, clock: string): string | null {
  const time = clockTo24h(clock);
  return time ? `${date}T${time}:00` : null;
}

/** SFPL audience labels → our age groups; null = no kid audience (drop it). */
function audiencesToAgeGroups(audiences: string[]): AgeGroup[] | null {
  const groups = new Set<AgeGroup>();
  for (const audience of audiences) {
    const label = audience.toLowerCase();
    if (/bab|toddler|preschool/.test(label)) {
      groups.add("baby");
      groups.add("toddler");
      groups.add("preschool");
    }
    if (/elementary|middle school/.test(label)) groups.add("school-age");
    if (/all ages|famil/.test(label)) groups.add("all-ages");
  }
  return groups.size > 0 ? [...groups] : null;
}

function toStorytimeEvent(
  raw: SfplRawEvent,
  libraryId: string,
): StorytimeEvent | null {
  const startTime = sfplFloatingIso(raw.date, raw.startClock);
  if (!startTime) return null;
  const ageGroups = audiencesToAgeGroups(raw.audiences);
  if (ageGroups === null) return null; // adult/teen-only
  const endTime = sfplFloatingIso(raw.date, raw.endClock) ?? startTime;
  return {
    id: raw.id,
    libraryId,
    title: raw.title,
    eventType: classifyEventType(raw.topics, raw.title),
    ageGroups,
    startTime,
    endTime,
    description: raw.topics.join(", ").slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

export interface SfplProviderDeps {
  /** Events page URL by system key, e.g. https://sfpl.org/events */
  feeds: Record<string, string>;
  fetchText: (url: string) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function extractToken(eventsPageHtml: string): string | null {
  return eventsPageHtml.match(/["']libraries["']\s*:\s*["']([^"']+)["']/)?.[1] ?? null;
}

function ajaxUrl(origin: string, dateParam: string, page: number, token: string): string {
  const params = new URLSearchParams({
    _wrapper_format: "drupal_ajax",
    view_name: "events",
    view_display_id: "page_events_list",
    view_dom_id: "x",
    "date-end-after": dateParam,
    page: String(page),
    _drupal_ajax: "1",
    "ajax_page_state[theme]": "sfpl_2019",
    "ajax_page_state[theme_token]": "",
    "ajax_page_state[libraries]": token,
  });
  return `${origin}/views/ajax?${params.toString()}`;
}

function htmlFromAjax(jsonText: string): string {
  const commands: unknown = JSON.parse(jsonText);
  if (!Array.isArray(commands)) return "";
  const insert = commands.find(
    (c): c is { data: string } =>
      typeof c === "object" &&
      c !== null &&
      (c as { command?: string }).command === "insert" &&
      typeof (c as { data?: unknown }).data === "string" &&
      (c as { data: string }).data.includes("views-row"),
  );
  return insert?.data ?? "";
}

/** MM/DD/YYYY in the library's local frame (matches the view's filter). */
function toDateParam(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function createSfplProvider(deps: SfplProviderDeps): EventProvider {
  const getText = createFeedCache({
    load: (url) => deps.fetchText(url),
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
          const eventsPageUrl = deps.feeds[systemKey];
          if (!eventsPageUrl) return [];
          const origin = new URL(eventsPageUrl).origin;

          let token: string | null;
          try {
            token = extractToken(await getText(eventsPageUrl));
          } catch (error: unknown) {
            console.error(`SFPL: could not load events page ${eventsPageUrl}`, error);
            return [];
          }
          if (!token) {
            console.error("SFPL: no libraries token on the events page");
            return [];
          }

          const dateParam = toDateParam(range.start);
          const mainOutlet = [...libraries].sort((a, b) => a.id.localeCompare(b.id))[0];
          const raws: SfplRawEvent[] = [];
          for (let page = 0; page < MAX_PAGES; page += 1) {
            let pageRaws: SfplRawEvent[];
            try {
              pageRaws = parseSfplEvents(
                htmlFromAjax(await getText(ajaxUrl(origin, dateParam, page, token))),
              );
            } catch (error: unknown) {
              console.error(`SFPL: page ${page} failed`, error);
              break;
            }
            if (pageRaws.length === 0) break;
            raws.push(...pageRaws);
            // Rows are date-ascending; stop once past the window.
            const lastDate = Date.parse(pageRaws[pageRaws.length - 1].date);
            if (Number.isFinite(lastDate) && lastDate > range.end.getTime()) break;
          }

          return raws
            .filter((raw) => {
              const start = Date.parse(raw.date);
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((raw) => {
              const branch = libraries.find((library) =>
                namesOverlap(raw.locationSlug.replace(/-/g, " "), library.name),
              );
              if (raw.locationSlug.length > 0 && !branch) {
                return null; // a branch the user didn't select
              }
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
