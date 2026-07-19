import type { AgeGroup, Library, StorytimeEvent } from "../../types";
import { namesOverlap } from "../nameMatch";
import { classifyEventType } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * Los Angeles Public Library (CA0063) adapter — a Drupal Views events search
 * that renders results as server-side HTML (no JSON/ICS surface exists:
 * `_format=json` → 406, JSON:API → 404). LAPL serves fine to a browser UA over
 * plain HTTP (no Imperva/F5 wall), so this is a live server-side scraper, not a
 * cron snapshot.
 *
 * The per-event teaser carries branch, date and time but NOT audience — so the
 * age signal lives in the QUERY, not the HTML. We therefore fetch once per
 * kid-audience filter and tag every returned event with that audience's age
 * groups, then dedup across audiences (an event can match several) by
 * slug+date+time, unioning the groups.
 *
 * SYSTEM-WIDE by design: LAPL has 73 branches but its calendar is queried as
 * one system per audience (~22 pages for the 14-day default), cached and shared
 * across all users — far cheaper globally than per-branch fetching, which would
 * fragment the cache and multiply against the always-in-scope rule. Branch
 * attribution comes from the teaser location text.
 */

const KEY_SEP = "||";
const MAX_DESCRIPTION_LENGTH = 280;
const TEASER_MARKER = "c-teaser-standard c-teaser-standard--event";

/** Drupal renders a fixed 24 results per page; a shorter page is the last. */
const PAGE_SIZE = 24;
/** Bound the request footprint (anti-ban) and the cold-fetch latency. */
const MAX_PAGES_PER_AUDIENCE = 15;
const PAGE_CONCURRENCY = 5;

/**
 * Kid audiences and their age mapping. LAPL has no "preschool" bucket, so
 * "Kids" (1556) carries preschool+school-age; "Babies and Toddlers" (1555) is a
 * single combined filter. Teens (1557) are intentionally excluded — the app has
 * no teen age group yet.
 */
const KID_AUDIENCES: ReadonlyArray<{ id: string; groups: AgeGroup[] }> = [
  { id: "1555", groups: ["baby", "toddler"] },
  { id: "1556", groups: ["preschool", "school-age"] },
  { id: "2976", groups: ["all-ages"] },
];

export interface LaplRawEvent {
  slug: string;
  title: string;
  /** floating local date "2026-07-20". */
  date: string;
  startTime: string; // floating ISO "2026-07-20T10:30:00"
  endTime: string;
  location: string;
  description: string;
  ageGroups: AgeGroup[];
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

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** "7/20/2026" → "2026-07-20". */
function isoDateFromUsDate(value: string): string | null {
  const m = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** "10:30 AM" → "10:30:00" (24h). */
function to24h(value: string): string | null {
  const m = value.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) hour += 12;
  return `${String(hour).padStart(2, "0")}:${m[2]}:00`;
}

function field(chunk: string, cls: string): string | null {
  const m = chunk.match(
    new RegExp(`c-teaser-standard__${cls}"[\\s\\S]*?</span>\\s*([\\s\\S]*?)</`),
  );
  return m ? stripTags(m[1]) : null;
}

/** Number of event teasers on a rendered page. */
export function teaserCount(html: string): number {
  return html.split(TEASER_MARKER).length - 1;
}

export function parseLaplPage(
  html: string,
  groups: AgeGroup[],
): LaplRawEvent[] {
  const chunks = html.split(TEASER_MARKER).slice(1);
  const events: LaplRawEvent[] = [];
  for (const chunk of chunks) {
    const slugMatch = chunk.match(/href="\/events\/([^"?&]+)"/);
    const titleMatch = chunk.match(/e-link__text">\s*([\s\S]*?)\s*<\/span>/);
    const dateText = field(chunk, "date");
    const timeText = field(chunk, "time");
    if (!slugMatch || !titleMatch || !dateText || !timeText) continue;

    const date = isoDateFromUsDate(dateText);
    if (!date) continue;
    const times = timeText.match(/\d{1,2}:\d{2}\s*[AP]M/gi) ?? [];
    const start = times[0] ? to24h(times[0]) : null;
    if (!start) continue;
    const end = times[1] ? to24h(times[1]) : null;

    const descMatch = chunk.match(
      /c-teaser-standard__text"[^>]*>([\s\S]*?)<\/div>/,
    );

    events.push({
      slug: slugMatch[1],
      title: stripTags(titleMatch[1]),
      date,
      startTime: `${date}T${start}`,
      endTime: `${date}T${end ?? start}`,
      location: field(chunk, "location") ?? "",
      description: descMatch
        ? stripTags(descMatch[1]).slice(0, MAX_DESCRIPTION_LENGTH)
        : "",
      ageGroups: groups,
    });
  }
  return events;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export interface LaplProviderDeps {
  feeds: Record<string, string>;
  fetchText: (url: string, headers?: Record<string, string>) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function buildUrl(
  base: string,
  audience: string,
  min: string,
  max: string,
  page: number,
): string {
  const url = new URL(base);
  url.searchParams.set("audience", audience);
  url.searchParams.set("date[min]", min);
  url.searchParams.set("date[max]", max);
  if (page > 0) url.searchParams.set("page", String(page));
  return url.toString();
}

/**
 * Fetches all pages for one audience via BLIND batched pagination: LAPL only
 * renders its numbered pager when certain filter params are present, so we
 * never trust it — instead we page until a page returns fewer than a full 24
 * teasers (the last page), fetching each batch concurrently. Returns the raw
 * HTML of every fetched page.
 */
async function fetchAudiencePages(
  deps: LaplProviderDeps,
  base: string,
  audienceId: string,
  min: string,
  max: string,
): Promise<string[]> {
  const htmls: string[] = [];
  let start = 0;
  let reachedEnd = false;
  while (!reachedEnd && start < MAX_PAGES_PER_AUDIENCE) {
    const batch = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, MAX_PAGES_PER_AUDIENCE - start) },
      (_, i) => start + i,
    );
    const batchHtmls = await mapWithConcurrency(batch, PAGE_CONCURRENCY, (page) =>
      deps.fetchText(buildUrl(base, audienceId, min, max, page)),
    );
    htmls.push(...batchHtmls);
    if (batchHtmls.some((html) => teaserCount(html) < PAGE_SIZE)) {
      reachedEnd = true;
    }
    start += batch.length;
  }
  if (!reachedEnd) {
    console.warn(
      `LAPL: audience ${audienceId} window ${min}..${max} hit the ${MAX_PAGES_PER_AUDIENCE}-page cap; later events may be dropped`,
    );
  }
  return htmls;
}

/**
 * Fetches every kid-audience across all pages for one system+window, dedups by
 * occurrence (slug+start time) and unions age groups. Cached as a unit.
 */
function createLoader(deps: LaplProviderDeps) {
  return async (cacheKey: string): Promise<LaplRawEvent[]> => {
    const [base, min, max] = cacheKey.split(KEY_SEP);
    const byOccurrence = new Map<string, LaplRawEvent>();

    for (const audience of KID_AUDIENCES) {
      const htmls = await fetchAudiencePages(
        deps,
        base,
        audience.id,
        min,
        max,
      );
      for (const html of htmls) {
        for (const raw of parseLaplPage(html, audience.groups)) {
          const key = `${raw.slug}${KEY_SEP}${raw.startTime}`;
          const existing = byOccurrence.get(key);
          if (existing) {
            existing.ageGroups = [
              ...new Set([...existing.ageGroups, ...raw.ageGroups]),
            ];
          } else {
            byOccurrence.set(key, { ...raw });
          }
        }
      }
    }
    return [...byOccurrence.values()];
  };
}

export function createLaplProvider(deps: LaplProviderDeps): EventProvider {
  const loadEvents = createFeedCache({
    load: createLoader(deps),
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

      const isoDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const min = isoDate(range.start);
      const max = isoDate(range.end);

      const results = await Promise.all(
        [...bySystem.entries()].map(async ([systemKey, libraries]) => {
          const feed = deps.feeds[systemKey];
          if (!feed) return [];
          const cacheKey = [feed, min, max].join(KEY_SEP);

          let raws: LaplRawEvent[];
          try {
            raws = await loadEvents(cacheKey);
          } catch (error: unknown) {
            console.error(`LAPL: failed to load ${feed}`, error);
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
            .map((raw): StorytimeEvent => {
              const branch = raw.location
                ? libraries.find((library) =>
                    namesOverlap(raw.location, library.name),
                  )
                : undefined;
              return {
                id: `${raw.slug}:${raw.startTime}`,
                libraryId: (branch ?? mainOutlet).id,
                title: raw.title,
                eventType: classifyEventType(
                  [],
                  `${raw.title} ${raw.description}`,
                ),
                ageGroups: [...raw.ageGroups].sort(),
                startTime: raw.startTime,
                endTime: raw.endTime,
                description: raw.description,
                isAllDay: false,
              };
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
