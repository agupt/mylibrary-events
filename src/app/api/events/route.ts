import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/apiResponse";
import {
  AGE_GROUPS,
  DEFAULT_EVENT_RANGE_DAYS,
  EVENT_TYPES,
  MAX_LIBRARIES_PER_REQUEST,
} from "@/lib/constants";
import { getEventProvider, hasCalendarFeed } from "@/lib/events";
import { filterEvents } from "@/lib/filterEvents";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 60;

const querySchema = z.object({
  libraryIds: z
    .string()
    .min(1, "libraryIds is required.")
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(
      z
        .array(z.string())
        .min(1, "At least one library id is required.")
        .max(MAX_LIBRARIES_PER_REQUEST, "Too many libraries requested."),
    ),
  days: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_RANGE_DAYS)
    .default(DEFAULT_EVENT_RANGE_DAYS),
  ageGroup: z.enum(AGE_GROUPS).optional(),
  eventType: z.enum(EVENT_TYPES).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    libraryIds: searchParams.get("libraryIds") ?? "",
    days: searchParams.get("days") ?? undefined,
    ageGroup: searchParams.get("ageGroup") ?? undefined,
    eventType: searchParams.get("eventType") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const { libraryIds, days, ageGroup, eventType } = parsed.data;
  // Events carry floating library-local wall-clock times (no zone); providers
  // compare them against this lower bound in server-local time. Anchor to the
  // START OF TODAY, not the current instant: comparing a floating afternoon
  // time against `now` on a UTC server wrongly drops the rest of today's
  // events as "past" (a 2pm event is 14:00, already behind an afternoon `now`).
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + days * MS_PER_DAY);

  try {
    const events = await getEventProvider().getEvents(libraryIds, {
      start,
      end,
    });
    return apiSuccess(
      {
        events: filterEvents(events, { ageGroup, eventType }),
        libraryIdsWithoutFeed: libraryIds.filter((id) => !hasCalendarFeed(id)),
      },
      900, // Cloudflare/CDN may cache 15 min — matches the feed cache TTL
    );
  } catch (error: unknown) {
    console.error("Event lookup failed", error);
    return apiError("Could not load events right now. Please try again.", 502);
  }
}
