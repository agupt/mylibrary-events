import tzlookup from "tz-lookup";

/**
 * Resolves a coordinate to its IANA timezone (e.g. "America/Chicago").
 * Returns null on invalid coordinates so callers can fall back gracefully.
 */
export function resolveTimeZone(
  latitude: number,
  longitude: number,
): string | null {
  try {
    return tzlookup(latitude, longitude);
  } catch {
    return null;
  }
}

/**
 * Converts a UTC ISO instant (ending in "Z") to a floating local wall-clock
 * string in `timeZone` — e.g. "2026-07-18T15:00:00Z" + "America/Chicago" →
 * "2026-07-18T10:00:00". Inputs without a trailing "Z" are already floating
 * wall-clock and returned unchanged.
 *
 * Some ICS feeds (LibraryMarket/Drupal) publish event times in UTC; treating
 * those digits as local shifts every event by the library's UTC offset, so the
 * instant must be projected into the library's own zone before display.
 */
export function localizeToWallClock(iso: string, timeZone: string): string {
  if (!iso.endsWith("Z")) {
    return iso;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, -1); // malformed instant: best-effort strip the Z
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23", // 00–23, never "24:00" at midnight
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
