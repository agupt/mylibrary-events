import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, inferAgeGroupsFromText, mapAudiencesToAgeGroups } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";
import { createFeedCache } from "../feedCache";

/**
 * Communico ("attend.<domain>") adapter. The attend SPA is backed by an
 * unauthenticated JSON endpoint (found via Chrome DevTools network
 * inspection on attend.cuyahogalibrary.org):
 *
 *   GET <base>/eeventcaldata?event_type=0&req={"private":false,
 *        "date":"YYYY-MM-DD","days":N,"locations":[],"ages":[],"types":[]}
 *
 * Records carry structured ages ("Preschool, Families"), branch names
 * (location/library), local wall-clock times, and tags.
 */

export interface CommunicoRawEvent {
  id: string;
  title: string;
  sub_title?: string | null;
  description?: string | null;
  event_start: string; // "2026-07-13 10:00:00" local wall-clock
  event_end: string;
  ages?: string | null;
  tagsArray?: string[] | null;
  location?: string | null;
  library?: string | null;
  private_event?: unknown;
  changed_reason?: string | null;
}

const MAX_DESCRIPTION_LENGTH = 280;
const MAX_RANGE_DAYS = 60;

function toFloatingIso(communicoTime: string): string | null {
  const match = communicoTime.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  return match ? `${match[1]}T${match[2]}` : null;
}

export function eventDataUrl(base: string, range: DateRange): string {
  const date = range.start.toISOString().slice(0, 10);
  const days = Math.min(
    MAX_RANGE_DAYS,
    Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86_400_000)),
  );
  const req = JSON.stringify({
    private: false,
    date,
    days,
    locations: [],
    ages: [],
    types: [],
  });
  return `${base.replace(/\/$/, "")}/eeventcaldata?event_type=0&req=${encodeURIComponent(req)}`;
}

/** Maps one raw Communico record; null = drop (adult-only/cancelled/bad). */
export function mapCommunicoEvent(
  raw: CommunicoRawEvent,
  libraryId: string,
): StorytimeEvent | null {
  const startTime = toFloatingIso(String(raw.event_start ?? ""));
  const endTime = toFloatingIso(String(raw.event_end ?? "")) ?? startTime;
  const title = String(raw.title ?? "").trim();
  if (!startTime || !title) {
    return null;
  }
  if (/cancell?ed/i.test(String(raw.changed_reason ?? ""))) {
    return null;
  }
  const audienceLabels = String(raw.ages ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const ageGroups =
    audienceLabels.length > 0
      ? mapAudiencesToAgeGroups(audienceLabels)
      : inferAgeGroupsFromText(`${title} ${raw.sub_title ?? ""}`);
  if (ageGroups === null) {
    return null; // teen/adult-only
  }
  const categories = Array.isArray(raw.tagsArray) ? raw.tagsArray.map(String) : [];
  return {
    id: String(raw.id),
    libraryId,
    title,
    eventType: classifyEventType(categories, `${title} ${raw.sub_title ?? ""}`),
    ageGroups,
    startTime,
    endTime: endTime ?? startTime,
    description: String(raw.description ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

export interface CommunicoProviderDeps {
  /** attend-site base URL by system key, e.g. https://attend.cuyahogalibrary.org */
  feeds: Record<string, string>;
  fetchText: (url: string) => Promise<string>;
  findLibraryById: (id: string) => Library | undefined;
  cacheTtlMs?: number;
  now?: () => number;
  persistDir?: string;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(library|branch|the)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function branchMatches(raw: CommunicoRawEvent, library: Library): boolean {
  const branch = normalizeName(String(raw.location ?? raw.library ?? ""));
  const libraryName = normalizeName(library.name);
  return (
    branch.length > 0 &&
    libraryName.length > 0 &&
    (branch === libraryName ||
      branch.includes(libraryName) ||
      libraryName.includes(branch))
  );
}

export function createCommunicoProvider(deps: CommunicoProviderDeps): EventProvider {
  const getRaw = createFeedCache({
    load: async (url) => {
      const body = await deps.fetchText(url);
      const parsed: unknown = JSON.parse(body);
      if (!Array.isArray(parsed)) {
        throw new Error("Communico eeventcaldata did not return an array");
      }
      return parsed as CommunicoRawEvent[];
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
          const base = deps.feeds[systemKey];
          if (!base) return [];
          let rawEvents: CommunicoRawEvent[];
          try {
            rawEvents = await getRaw(eventDataUrl(base, range));
          } catch (error: unknown) {
            console.error(`Failed to load Communico events from ${base}`, error);
            return [];
          }
          const centralOutlet = libraries.find((l) => l.id.endsWith("-002"));
          const mainOutlet = [...libraries].sort((a, b) => a.id.localeCompare(b.id))[0];
          return rawEvents
            .filter((raw) => {
              const start = Date.parse(toFloatingIso(String(raw.event_start ?? "")) ?? "");
              return (
                Number.isFinite(start) &&
                start >= range.start.getTime() &&
                start < range.end.getTime()
              );
            })
            .map((raw) => {
              const branchName = String(raw.location ?? raw.library ?? "");
              const branch =
                libraries.find((library) => branchMatches(raw, library)) ??
                (centralOutlet && /\b(central|main)\b/i.test(branchName)
                  ? centralOutlet
                  : undefined);
              if (branchName.length > 0 && !branch) {
                return null; // another branch the user didn't select
              }
              return mapCommunicoEvent(raw, (branch ?? mainOutlet).id);
            })
            .filter((event): event is StorytimeEvent => event !== null);
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
