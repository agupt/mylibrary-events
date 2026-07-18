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

const MAX_DESCRIPTION_LENGTH = 280;

/**
 * Minimal iCalendar parser for event feeds. Tolerant by design: malformed
 * VEVENTs are skipped, never thrown.
 */
export function parseIcs(ics: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of unfoldLines(ics)) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const start = parseIcsDate(current.DTSTART ?? "");
        const end = parseIcsDate(current.DTEND ?? current.DTSTART ?? "");
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
            categories: unescapeText(current.CATEGORIES ?? "")
              .split(",")
              .map((category) => category.trim())
              .filter(Boolean),
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
    current[name] = line.slice(separator + 1);
  }
  return events;
}
