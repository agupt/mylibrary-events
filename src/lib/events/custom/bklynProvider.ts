import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, mapAudiencesToAgeGroups } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * Brooklyn Public Library adapter. BPL runs a custom Drupal+Solr search
 * (discover.bklynlibrary.org); the SPA's own API was mapped via Chrome
 * DevTools:
 *
 *   GET /api/search/index.php?event=true
 *       &eventdate=MM-DD-YYYY          (start date)
 *       &eventage=Birth+to+Five+Years||Kids
 *       &pagination=N                  (fixed 20 groups/page)
 *
 * Requires a browser-ish User-Agent AND a Referer header. Docs carry
 * ds_event_start_date (UTC), ss_event_location (branch), ss_event_age,
 * sm_event_tags, is_event_canceled.
 */

interface BklynDoc {
  ts_title?: string;
  ts_body?: string;
  ds_event_start_date?: string;
  ds_event_end_date?: string;
  ss_event_location?: string;
  ss_event_age?: string;
  sm_event_tags?: string | string[];
  is_event_canceled?: string;
  item_id?: string;
  id?: string;
}

const MAX_PAGES = 15; // 300 events — logged if the range needs more
const MAX_DESCRIPTION_LENGTH = 280;
const KID_AGES = "Birth to Five Years||Kids||Adults"; // Adults kept: family events are often tagged Adults+Kids

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(library|branch|the)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseBklynResponse(json: string): BklynDoc[] {
  const parsed: unknown = JSON.parse(json);
  const groups = (
    parsed as {
      grouped?: { ss_grouping?: { groups?: Array<{ doclist?: { docs?: BklynDoc[] } }> } };
    }
  )?.grouped?.ss_grouping?.groups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => group.doclist?.docs ?? []);
}

export function mapBklynDoc(doc: BklynDoc, libraryId: string): StorytimeEvent | null {
  const title = stripHtml(String(doc.ts_title ?? ""));
  const startTime = String(doc.ds_event_start_date ?? "");
  if (!title || Number.isNaN(Date.parse(startTime))) return null;
  if (String(doc.is_event_canceled) === "1") return null;

  const ageGroups = mapAudiencesToAgeGroups(
    String(doc.ss_event_age ?? "")
      .split(",")
      .map((age) => age.trim())
      .filter(Boolean),
  );
  if (ageGroups === null) return null; // teen/adult-only

  const tags = Array.isArray(doc.sm_event_tags)
    ? doc.sm_event_tags.map(String)
    : String(doc.sm_event_tags ?? "")
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((tag) => tag.replace(/^['" ]+|['" ]+$/g, ""))
        .filter(Boolean);

  return {
    id: String(doc.item_id ?? doc.id ?? `${title}:${startTime}`),
    libraryId,
    title,
    eventType: classifyEventType(tags, title),
    ageGroups,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(
      Number.isNaN(Date.parse(String(doc.ds_event_end_date))) ? startTime : String(doc.ds_event_end_date),
    ).toISOString(),
    description: stripHtml(String(doc.ts_body ?? "")).slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

export interface BklynProviderDeps {
  /** API base by system key (NY0004 → https://discover.bklynlibrary.org). */
  feeds: Record<string, string>;
  fetchText: (url: string, headers?: Record<string, string>) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

export function createBklynProvider(deps: BklynProviderDeps): EventProvider {
  const getPage = createFeedCache({
    load: (url) =>
      deps
        .fetchText(url, {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          referer: "https://discover.bklynlibrary.org/",
        })
        .then(parseBklynResponse),
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
          const base = deps.feeds[systemKey];
          if (!base) return [];
          const start = range.start;
          const eventdate = `${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(
            start.getUTCDate(),
          ).padStart(2, "0")}-${start.getUTCFullYear()}`;

          const docs: BklynDoc[] = [];
          for (let page = 1; page <= MAX_PAGES; page += 1) {
            let pageDocs: BklynDoc[];
            try {
              pageDocs = await getPage(
                `${base}/api/search/index.php?event=true&eventdate=${eventdate}` +
                  `&eventage=${encodeURIComponent(KID_AGES)}&pagination=${page}`,
              );
            } catch (error: unknown) {
              console.error(`BPL events page ${page} failed`, error);
              break;
            }
            if (pageDocs.length === 0) break;
            docs.push(...pageDocs);
            const lastStart = Date.parse(
              String(pageDocs[pageDocs.length - 1]?.ds_event_start_date ?? ""),
            );
            if (Number.isFinite(lastStart) && lastStart >= range.end.getTime()) {
              break;
            }
            if (page === MAX_PAGES) {
              console.warn(
                `BPL: hit ${MAX_PAGES}-page cap for range starting ${eventdate}; results truncated`,
              );
            }
          }

          const centralOutlet = libraries.find((l) => l.id.endsWith("-002"));
          return docs
            .filter((doc) => {
              const start = Date.parse(String(doc.ds_event_start_date ?? ""));
              return (
                Number.isFinite(start) &&
                start >= range.start.getTime() &&
                start < range.end.getTime()
              );
            })
            .map((doc) => {
              const locationName = String(doc.ss_event_location ?? "");
              const location = normalizeName(locationName);
              const branch =
                libraries.find((library) => {
                  const name = normalizeName(library.name);
                  return (
                    name.length > 0 &&
                    location.length > 0 &&
                    (location === name || location.includes(name) || name.includes(location))
                  );
                }) ??
                (centralOutlet && /\bcentral\b/i.test(locationName) ? centralOutlet : undefined);
              if (locationName.length > 0 && !branch) {
                return null; // a branch the user didn't select
              }
              const target = branch ?? libraries[0];
              return mapBklynDoc(doc, target.id);
            })
            .filter((event): event is StorytimeEvent => event !== null);
        }),
      );
      return results
        .flat()
        .sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );
    },
  };
}
