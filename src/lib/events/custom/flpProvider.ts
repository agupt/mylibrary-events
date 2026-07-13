import { XMLParser } from "fast-xml-parser";
import { namesOverlap } from "../nameMatch";
import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType } from "../classify";
import type { AgeGroup } from "../../types";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * Free Library of Philadelphia adapter. Their site is Cloudflare-walled
 * for HTML, but the ColdFusion RSS endpoint is exempt (found by Amool):
 *
 *   https://libwww.freelibrary.org/rss/eventsrss.cfm?age=<value>
 *
 * Each feed is a rolling "next 10 events" for its filter, with custom
 * <startdate>MM/DD/YY and <starttime>H:MM A.M./P.M. tags and the branch
 * name as a " - Branch" suffix on the title. We stack the kids' age
 * variants and merge; the age group comes from which feed an item
 * appeared in. Coverage is shallow (next ~10 per age) but live.
 */

const AGE_FEEDS: Array<{ param: string; ageGroups: AgeGroup[] }> = [
  { param: "infant", ageGroups: ["baby"] },
  { param: "toddler", ageGroups: ["toddler"] },
  { param: "preschooler", ageGroups: ["preschool"] },
  { param: "school-age", ageGroups: ["school-age"] },
];

const MAX_DESCRIPTION_LENGTH = 280;

export interface FlpRawEvent {
  title: string;
  link: string;
  startdate: string; // MM/DD/YY
  starttime: string; // "5:30 P.M."
  description: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#0*60;|&lt;/gi, "<")
    .replace(/&#0*62;|&gt;/gi, ">")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseFlpFeed(xml: string): FlpRawEvent[] {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const document: unknown = parser.parse(xml);
  const items = asArray(
    (document as { rss?: { channel?: { item?: unknown } } })?.rss?.channel?.item,
  );
  return items
    .map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      return {
        title: String(item.title ?? "").trim(),
        link: String(item.link ?? item.guid ?? ""),
        startdate: String(item.startdate ?? ""),
        starttime: String(item.starttime ?? ""),
        description: stripHtml(String(item.description ?? "")).slice(0, MAX_DESCRIPTION_LENGTH),
      };
    })
    .filter((event) => event.title.length > 0);
}

/** "07/13/26" + "5:30 P.M." → floating local ISO. */
export function flpStartIso(startdate: string, starttime: string): string | null {
  const date = startdate.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!date) return null;
  const time = starttime.match(/(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M/i);
  let hours = 0;
  let minutes = "00";
  if (time) {
    hours = Number(time[1]) % 12;
    if (time[3].toUpperCase() === "P") hours += 12;
    minutes = time[2] ?? "00";
  }
  return `20${date[3]}-${date[1]}-${date[2]}T${String(hours).padStart(2, "0")}:${minutes}:00`;
}

/** "07/13/26: Family BINGO - Whitman Library" → { title, branch } */
export function splitFlpTitle(rawTitle: string): { title: string; branch: string } {
  const withoutDate = rawTitle.replace(/^\d{2}\/\d{2}\/\d{2}:\s*/, "");
  const separator = withoutDate.lastIndexOf(" - ");
  if (separator === -1) return { title: withoutDate.trim(), branch: "" };
  return {
    title: withoutDate.slice(0, separator).trim(),
    branch: withoutDate.slice(separator + 3).trim(),
  };
}

export interface FlpProviderDeps {
  /** base URL by system key (PA0385 → https://libwww.freelibrary.org). */
  feeds: Record<string, string>;
  fetchText: (url: string, headers?: Record<string, string>) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

export function createFlpProvider(deps: FlpProviderDeps): EventProvider {
  const getFeed = createFeedCache({
    // The RSS endpoint is Cloudflare-exempt but still expects a
    // browser-ish User-Agent
    load: (url) =>
      deps
        .fetchText(url, {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        })
        .then(parseFlpFeed),
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

      const results: StorytimeEvent[] = [];
      for (const [systemKey, libraries] of bySystem) {
        const base = deps.feeds[systemKey];
        if (!base) continue;
        const centralOutlet = libraries.find((l) => l.id.endsWith("-002"));

        // Merge by event link: the same event may appear in several age
        // feeds — union the age groups instead of duplicating.
        const merged = new Map<string, StorytimeEvent>();
        for (const feed of AGE_FEEDS) {
          let raws: FlpRawEvent[];
          try {
            raws = await getFeed(`${base}/rss/eventsrss.cfm?age=${feed.param}`);
          } catch (error: unknown) {
            console.error(`FLP feed age=${feed.param} failed`, error);
            continue;
          }
          for (const raw of raws) {
            const startTime = flpStartIso(raw.startdate, raw.starttime);
            if (!startTime) continue;
            const start = Date.parse(startTime);
            if (start < range.start.getTime() || start >= range.end.getTime()) continue;

            const { title, branch } = splitFlpTitle(raw.title);
            const target =
              libraries.find((library) => namesOverlap(branch, library.name)) ??
              (centralOutlet && /central/i.test(branch) ? centralOutlet : undefined);
            if (branch.length > 0 && !target) continue; // unselected branch

            const existing = merged.get(raw.link);
            if (existing) {
              existing.ageGroups = [...new Set([...existing.ageGroups, ...feed.ageGroups])].sort();
              continue;
            }
            merged.set(raw.link, {
              id: raw.link,
              libraryId: (target ?? libraries[0]).id,
              title,
              eventType: classifyEventType([], title),
              ageGroups: [...feed.ageGroups],
              startTime,
              endTime: new Date(Date.parse(`${startTime}Z`) + 60 * 60 * 1000)
                .toISOString()
                .slice(0, 19),
              description: raw.description,
            });
          }
        }
        results.push(...merged.values());
      }
      return results.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    },
  };
}
