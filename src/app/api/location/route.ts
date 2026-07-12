import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/apiResponse";
import { findLocationMatch } from "@/lib/locate";

const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Enter a city name or 5-digit zip code.")
    .max(100, "Search text is too long."),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const match = findLocationMatch(parsed.data.q);
  if (!match) {
    return apiError(
      `No libraries found for "${parsed.data.q}". Try a Bay Area city (e.g. Oakland) or zip code (e.g. 94612).`,
      404,
    );
  }

  return apiSuccess(match);
}
