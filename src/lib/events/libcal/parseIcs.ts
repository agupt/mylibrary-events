/** One raw VEVENT from an iCalendar feed (LibCal or any ICS source). */
export interface IcsEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  categories: string[];
  url: string;
  /** Either a floating local wall-clock ISO ("2026-07-16T14:00:00") when the feed used a TZID/floating value, OR a UTC instant ending in "Z" ("2026-07-16T14:00:00Z") when the feed used UTC. The ICS provider localizes any "Z" time to the library's own timezone before display; every other adapter emits floating wall-clock. */
  startTime: string;
  endTime: string;
  /** True when the source used a DATE value (VALUE=DATE / all-day), so the UI shows "All day" instead of a midnight time. */
  isAllDay: boolean;
  /** Raw RRULE ("FREQ=WEEKLY;BYDAY=TH;…"), if the event recurs. */
  rrule?: string;
  /** Excluded occurrence dates (EXDATE), each "YYYYMMDD…". */
  exdates: string[];
}

/** RFC 5545 line unfolding: continuation lines start with space/tab. */
function unfoldLines(ics: string): string[] {
  const lines: string[] = [];
  for (const rawLine of ics.split(/\r?\n/)) {
    if ((rawLine.startsWith(" ") || rawLine.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
    } else {
      lines.push(rawLine);
    }
  }
  return lines;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

interface IcsInstant {
  /** Floating wall-clock ISO ("2026-07-16T14:00:00"), OR a UTC instant with a trailing "Z" when the source used UTC. */
  iso: string;
  /** Source used a DATE value (all-day) rather than a DATE-TIME. */
  isDateOnly: boolean;
}

/**
 * Parses an iCal DATE-TIME. TZID/floating values ("…T140000") carry the
 * library's own local wall-clock, so we keep the digits verbatim. UTC values
 * ("…T140000Z") are a genuine instant — LibraryMarket/Drupal feeds publish in
 * UTC — so we PRESERVE the "Z" and let the ICS provider project it into the
 * library's timezone; stripping it (the old behavior) shifted every event by
 * the library's UTC offset. All-day DATE values become midnight (isDateOnly).
 */
function parseIcsDate(value: string): IcsInstant | null {
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTime) {
    const [, y, mo, d, h, mi, s, zulu] = dateTime;
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${zulu}`, isDateOnly: false };
  }
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return { iso: `${y}-${mo}-${d}T00:00:00`, isDateOnly: true };
  }
  return null;
}

/**
 * Adds an iCal DURATION (ISO 8601, e.g. "PT1H30M", "P1DT2H") to a start
 * instant, preserving its floating-or-UTC form. Used when a VEVENT carries
 * DURATION instead of DTEND (Bedework/Nashville do). Returns the start
 * unchanged when there's no/invalid duration, or null when there's no start.
 */
function addDuration(
  start: IcsInstant | null,
  duration: string | undefined,
): IcsInstant | null {
  if (!start) return null;
  if (!duration) return start;
  const match = duration
    .trim()
    .match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return start;
  const [, w, d, h, mi, s] = match.map((v) => Number(v ?? 0));
  const seconds = w * 604800 + d * 86400 + h * 3600 + mi * 60 + s;
  if (seconds === 0) return start;
  // Treat the wall-clock digits as UTC for the arithmetic so DST never shifts a
  // fixed-length duration; reattach the original floating/Z form afterward.
  const hasZulu = start.iso.endsWith("Z");
  const base = new Date(hasZulu ? start.iso : `${start.iso}Z`);
  if (Number.isNaN(base.getTime())) return start;
  const shifted = new Date(base.getTime() + seconds * 1000);
  return {
    iso: shifted.toISOString().slice(0, 19) + (hasZulu ? "Z" : ""),
    isDateOnly: start.isDateOnly,
  };
}

const MAX_DESCRIPTION_LENGTH = 280;

/**
 * Minimal iCalendar parser for event feeds. Tolerant by design: malformed
 * VEVENTs are skipped, never thrown.
 */
export function parseIcs(ics: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;
  // CATEGORIES may repeat across lines (Bedework emits one per tag); the flat
  // record would keep only the last, so accumulate them separately.
  let categories: string[] = [];

  for (const line of unfoldLines(ics)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      categories = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const start = parseIcsDate(current.DTSTART ?? "");
        const end =
          (current.DTEND ? parseIcsDate(current.DTEND) : null) ??
          addDuration(start, current.DURATION);
        const title = unescapeText(current.SUMMARY ?? "").trim();
        if (start && title) {
          events.push({
            uid: current.UID ?? `${title}:${start.iso}`,
            title,
            description: unescapeText(current.DESCRIPTION ?? "")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, MAX_DESCRIPTION_LENGTH),
            location: unescapeText(current.LOCATION ?? "").trim(),
            categories,
            url: current.URL ?? "",
            startTime: start.iso,
            endTime: (end ?? start).iso,
            isAllDay: start.isDateOnly,
            rrule: current.RRULE,
            exdates: (current.EXDATE ?? "")
              .split(",")
              .map((date) => date.trim())
              .filter(Boolean),
          });
        }
      }
      current = null;
      categories = [];
      continue;
    }
    if (current === null) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    // "DTSTART;TZID=America/Los_Angeles" → property name "DTSTART"
    const name = line.slice(0, separator).split(";")[0].toUpperCase();
    const value = line.slice(separator + 1);
    if (name === "CATEGORIES") {
      for (const category of unescapeText(value)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)) {
        categories.push(category);
      }
    } else {
      current[name] = value;
    }
  }
  return events;
}
