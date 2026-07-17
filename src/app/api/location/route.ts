import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/apiResponse";
import { findLocation } from "@/lib/locate";

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

  const result = findLocation(parsed.data.q);
  if (result.status === "not-found") {
    return apiError(
      `No location found for "${parsed.data.q}". Try a city with state (e.g. "Oakland, CA") or a 5-digit zip code.`,
      404,
    );
  }
  if (result.status === "ambiguous") {
    return apiError(
      `"${parsed.data.q}" exists in several states — try one of: ${result.options.join(
        "; ",
      )}.`,
      400,
    );
  }

  // Geography is static and this response is radius-independent, so cache it
  // aggressively (24h edge, ~4d stale-while-revalidate). Safe against
  // response-shape changes because the client appends a version param
  // (LOCATION_API_VERSION) that busts old-shape entries on deploy.
  return apiSuccess(result.match, 86_400);
}
