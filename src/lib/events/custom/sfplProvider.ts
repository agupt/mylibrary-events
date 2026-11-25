import type { AgeGroup, Library, StorytimeEvent } from "../../types";
import { namesOverlap, normalizeName } from "../nameMatch";
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
 * Each teaser's date/time is a `<time datetime="START/END">` element whose
 * attribute carries full ISO instants with the local offset
 * ("2026-11-24T10:30:00-08:00/2026-11-24T11:00:00-08:00"). The visible text
 * still omits AM/PM ("10:30 - 11:00"), so the attribute is the only reliable
 * source. We drop the offset to emit floating local wall-clock, like every
 * other adapter. (Until ~Nov 2026 this was a `<span class="date-display-range">`
 * with text only, parsed with an hours heuristic; SFPL's markup change to
 * `<time>` silently zeroed the adapter.)
 */

const MAX_PAGES = 8; // 25/page — covers a 2-week window across all branches
const MAX_DESCRIPTION_LENGTH = 280;

export interface SfplRawEvent {
  id: string;
  title: string;
  /** Floating local date, "YYYY-MM-DD", of the start. */
  date: string;
  /** Floating local wall-clock, "YYYY-MM-DDTHH:MM:SS"; null if absent. */
  startTime: string | null;
  endTime: string | null;
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

const FLOATING_ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?/;

/**
 * "2026-11-24T10:30:00-08:00" → "2026-11-24T10:30:00": keeps the local
 * wall-clock, drops the offset. Null for anything that isn't an ISO datetime.
 */
export function sfplFloatingIso(isoWithOffset: string): string | null {
  const match = isoWithOffset.trim().match(FLOATING_ISO);
  return match ? `${match[1]}T${match[2]}${match[3] ?? ":00"}` : null;
}

/** The `<time datetime="START/END">` range of a teaser card. */
function timeRange(card: string): { start: string | null; end: string | null } {
  const attr = card.match(/<time[^>]*\sdatetime="([^"]+)"/)?.[1] ?? "";
  const [start = "", end = ""] = attr.split("/");
  return { start: sfplFloatingIso(start), end: sfplFloatingIso(end) };
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
    const titleMatch = card.match(/event__title[\s\S]*?<span>([^<]+)<\/span>/);
    const title = decodeEntities(titleMatch?.[1] ?? "");
    if (!title) continue;
    const { start, end } = timeRange(card);
    events.push({
      id: path[4],
      title,
      // Prefer the start instant's date; fall back to the URL path date.
      date: start?.slice(0, 10) ?? `${path[1]}-${path[2]}-${path[3]}`,
      startTime: start,
      endTime: end,
      audiences: fieldLinks(card, "audience"),
      topics: fieldLinks(card, "topic"),
      locationSlug: card.match(/about="\/locations\/([^"]+)"/)?.[1] ?? "",
    });
  }
  return events;
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
  const startTime = raw.startTime;
  if (!startTime) return null;
  const ageGroups = audiencesToAgeGroups(raw.audiences);
  if (ageGroups === null) return null; // adult/teen-only
  const endTime = raw.endTime ?? startTime;
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
  /**
   * Every IMLS outlet of a system, so a location slug resolves to its one
   * true branch before we filter to the requested ones. Without it, a
   * requested "Mission" would claim "mission-bay" events. Defaults to the
   * requested outlets only.
   */
  outletsForSystem?: (systemKey: string) => Library[];
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

/**
 * Resolves a `/locations/<slug>` to one outlet: an exact normalized-name
 * match wins ("parkside" → Parkside, not Park; "mission-bay" → Mission Bay,
 * not Mission); otherwise the overlapping outlet whose name is closest in
 * length ("main-library" → "San Francisco Main Library").
 */
export function resolveSfplBranch(slug: string, outlets: Library[]): Library | undefined {
  const slugName = normalizeName(slug.replace(/-/g, " "));
  if (!slugName) return undefined;
  const exact = outlets.find((outlet) => normalizeName(outlet.name) === slugName);
  if (exact) return exact;
  const distance = (outlet: Library): number =>
    Math.abs(normalizeName(outlet.name).length - slugName.length);
  return outlets
    .filter((outlet) => namesOverlap(slugName, outlet.name))
    .sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))[0];
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
          const requestedIds = new Set(libraries.map((library) => library.id));
          const knownOutlets = deps.outletsForSystem?.(systemKey) ?? [];
          const systemOutlets = knownOutlets.length > 0 ? knownOutlets : libraries;
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
              // Floating local wall-clock, like the range bounds. (A bare
              // "YYYY-MM-DD" would parse as UTC midnight and, west of UTC,
              // fall before range.start — dropping all of today's events.)
              const start = raw.startTime ? Date.parse(raw.startTime) : NaN;
              return start >= range.start.getTime() && start < range.end.getTime();
            })
            .map((raw) => {
              if (raw.locationSlug.length === 0) {
                return toStorytimeEvent(raw, mainOutlet.id);
              }
              const branch = resolveSfplBranch(raw.locationSlug, systemOutlets);
              // Unmapped (bookmobile/outreach) or a branch the user didn't select.
              if (!branch || !requestedIds.has(branch.id)) return null;
              return toStorytimeEvent(raw, branch.id);
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
