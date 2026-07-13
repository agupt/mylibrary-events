import { existsSync, readFileSync } from "node:fs";
import { namesOverlap } from "../nameMatch";
import path from "node:path";
import type { Library, StorytimeEvent } from "../../types";
import { classifyEventType, mapAudiencesToAgeGroups } from "../classify";
import type { DateRange, EventProvider } from "../eventProvider";

/**
 * Snapshot adapter for systems whose calendars cannot be fetched
 * server-side (bot-walled SSR sites like NYPL behind Imperva). A
 * scheduled headless-browser scraper (scripts/scrapeNyplSnapshot.mjs,
 * run by the data-refresh GitHub Action) writes
 * generated/snapshots/<systemKey>.json; this provider serves from that
 * committed file. Staleness is bounded by the cron cadence — events
 * outside the scraped window simply don't appear.
 */

export interface SnapshotRawEvent {
  title: string;
  link: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "Tue, July 14 @ 3 PM"
  location: string;
  audience: string;
  description: string;
}

interface SnapshotFile {
  generatedAt: string;
  systemKey: string;
  events: SnapshotRawEvent[];
}

const DEFAULT_DURATION_MINUTES = 60; // listings carry no end time
const MAX_SNAPSHOT_AGE_DAYS = 14;

/** "@ 12:30 PM" / "@ 3 PM" → "HH:MM:00" (floating local). */
export function parseSnapshotTime(time: string): string {
  const match = time.match(/@\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return "00:00:00";
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hours += 12;
  return `${String(hours).padStart(2, "0")}:${match[2] ?? "00"}:00`;
}

export function mapSnapshotEvent(
  raw: SnapshotRawEvent,
  libraryId: string,
  sourceOrigin: string,
): StorytimeEvent | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !raw.title) return null;
  const audiences = raw.audience
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const ageGroups =
    audiences.length > 0 ? mapAudiencesToAgeGroups(audiences) : ["all-ages" as const];
  if (ageGroups === null) return null;

  const startTime = `${raw.date}T${parseSnapshotTime(raw.time)}`;
  const end = new Date(`${startTime}Z`).getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000;
  return {
    id: `${sourceOrigin}${raw.link}#${raw.date}`,
    libraryId,
    title: raw.title,
    eventType: classifyEventType(audiences, raw.title),
    ageGroups,
    startTime,
    endTime: new Date(end).toISOString().slice(0, 19),
    description: raw.description,
  };
}

export interface SnapshotProviderDeps {
  /** Origin used for stable event ids, by system key. */
  feeds: Record<string, string>;
  findLibraryById: (id: string) => Library | undefined;
  snapshotDir?: string;
  /** Accepted for provider-constructor symmetry; snapshots are already on disk. */
  persistDir?: string;
}

export function createSnapshotProvider(deps: SnapshotProviderDeps): EventProvider {
  const snapshotDir =
    deps.snapshotDir ?? path.join(process.cwd(), "src/lib/data/generated/snapshots");
  const cache = new Map<string, SnapshotFile | null>();

  function loadSnapshot(systemKey: string): SnapshotFile | null {
    if (!cache.has(systemKey)) {
      const filePath = path.join(snapshotDir, `${systemKey}.json`);
      if (!existsSync(filePath)) {
        cache.set(systemKey, null);
      } else {
        try {
          const parsed = JSON.parse(readFileSync(filePath, "utf8")) as SnapshotFile;
          const ageDays =
            (Date.now() - Date.parse(parsed.generatedAt)) / 86_400_000;
          if (ageDays > MAX_SNAPSHOT_AGE_DAYS) {
            console.warn(
              `Snapshot ${systemKey} is ${Math.round(ageDays)} days old — run the scraper`,
            );
          }
          cache.set(systemKey, parsed);
        } catch (error: unknown) {
          console.error(`Malformed snapshot for ${systemKey}`, error);
          cache.set(systemKey, null);
        }
      }
    }
    return cache.get(systemKey) ?? null;
  }

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
        const origin = deps.feeds[systemKey];
        const snapshot = origin ? loadSnapshot(systemKey) : null;
        if (!snapshot) continue;
        const centralOutlet = libraries.find((l) => l.id.endsWith("-002"));
        for (const raw of snapshot.events) {
          const start = Date.parse(`${raw.date}T${parseSnapshotTime(raw.time)}`);
          if (!Number.isFinite(start) || start < range.start.getTime() || start >= range.end.getTime()) {
            continue;
          }
          const branchName = raw.location.split(",")[0] ?? "";
          const branch =
            libraries.find((library) => namesOverlap(branchName, library.name)) ??
            (centralOutlet && /\b(main|central|stephen a schwarzman)\b/i.test(branchName)
              ? centralOutlet
              : undefined);
          if (branchName.length > 0 && !branch) {
            continue; // a branch the user didn't select
          }
          const mapped = mapSnapshotEvent(raw, (branch ?? libraries[0]).id, origin);
          if (mapped) results.push(mapped);
        }
      }
      return results.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    },
  };
}
