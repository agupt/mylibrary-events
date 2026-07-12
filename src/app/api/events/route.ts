import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/apiResponse";
import { AGE_GROUPS, DEFAULT_EVENT_RANGE_DAYS, EVENT_TYPES } from "@/lib/constants";
import { mockEventProvider } from "@/lib/events/mockEventProvider";
import { filterEvents } from "@/lib/filterEvents";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 60;
const MAX_LIBRARIES_PER_REQUEST = 20;

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
  const start = new Date();
  const end = new Date(start.getTime() + days * MS_PER_DAY);

  const events = await mockEventProvider.getEvents(libraryIds, { start, end });
  return apiSuccess(filterEvents(events, { ageGroup, eventType }));
}
