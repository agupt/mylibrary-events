import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/apiResponse";
import { coverageForLibrary } from "@/lib/coverage";
import { getAllLibraries } from "@/lib/data/directory";
import { getEventProvider } from "@/lib/events";
import { getFeedEntry, getFeedRegistry } from "@/lib/events/calendarFeeds";
import type { StorytimeEvent } from "@/lib/types";

const PROBE_RANGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const idSchema = z
  .string()
  .regex(/^[A-Z0-9]+-[0-9]+$/, "Invalid library id (expected e.g. CA0081-002).");

function distribution<K extends string>(
  events: StorytimeEvent[],
  keysOf: (event: StorytimeEvent) => K[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    for (const key of keysOf(event)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * Coverage + live-feed analysis for one library:
 * GET /api/libraries/CA0081-002/analysis
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return apiError(parsedId.error.issues[0].message, 400);
  }

  const library = getAllLibraries().find((l) => l.id === parsedId.data);
  if (!library) {
    return apiError(`No library with id "${parsedId.data}".`, 404);
  }

  const coverage = coverageForLibrary(library, getFeedRegistry());
  const feedEntry = getFeedEntry(coverage.systemKey);
  const systemOutlets = getAllLibraries().filter(
    (l) => l.id.split("-")[0] === coverage.systemKey,
  );

  const base = {
    library,
    system: {
      key: coverage.systemKey,
      name: library.system,
      outlets: systemOutlets.length,
    },
    coverage: {
      status: coverage.status,
      vendor: coverage.vendor ?? null,
      feedUrl: feedEntry?.url ?? null,
      note: feedEntry?.note ?? null,
    },
  };

  if (coverage.status !== "active") {
    return apiSuccess({ ...base, probe: null });
  }

  // Check feed reachability directly so a blocked/broken feed reports as
  // unreachable instead of masquerading as "0 events".
  let feedReachable = false;
  let feedHttpStatus: number | null = null;
  if (feedEntry?.url) {
    try {
      const response = await fetch(feedEntry.url, {
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "library-storytime/1.0 (events aggregator)" },
      });
      feedHttpStatus = response.status;
      feedReachable = response.ok;
    } catch (error: unknown) {
      console.error(`Feed reachability check failed for ${library.id}`, error);
    }
  }

  try {
    const start = new Date();
    const end = new Date(start.getTime() + PROBE_RANGE_DAYS * MS_PER_DAY);
    const events = feedReachable
      ? await getEventProvider().getEvents([library.id], { start, end })
      : [];
    return apiSuccess({
      ...base,
      probe: {
        rangeDays: PROBE_RANGE_DAYS,
        feedReachable,
        feedHttpStatus,
        eventCount: events.length,
        byEventType: distribution(events, (event) => [event.eventType]),
        byAgeGroup: distribution(events, (event) => event.ageGroups),
        nextEvent: events[0] ?? null,
      },
    });
  } catch (error: unknown) {
    console.error(`Analysis probe failed for ${library.id}`, error);
    return apiSuccess({
      ...base,
      probe: {
        rangeDays: PROBE_RANGE_DAYS,
        feedReachable,
        feedHttpStatus,
        error: "Feed probe failed.",
      },
    });
  }
}
