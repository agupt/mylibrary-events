/** One raw VEVENT from an iCalendar feed (LibCal or any ICS source). */
export interface IcsEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  categories: string[];
  url: string;
  /** Floating local wall-clock ISO (library's own timezone), no offset — e.g. "2026-07-16T14:00:00". Matches every other adapter so the client renders the library's wall-clock time regardless of the viewer's zone. */
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
  /** Floating wall-clock ISO with no zone, e.g. "2026-07-16T14:00:00". */
  iso: string;
  /** Source used a DATE value (all-day) rather than a DATE-TIME. */
  isDateOnly: boolean;
}

/**
 * Parses an iCal DATE-TIME into a floating wall-clock ISO (no zone). LibCal /
 * LibraryMarket / tribe_events export the library's own local time (as a
 * TZID or floating value); we keep the wall-clock digits and drop the zone so
 * the client shows the library's time regardless of the viewer's location —
 * the same contract every other adapter follows. A trailing "Z" is treated as
 * wall-clock too: our ICS sources are local library calendars, and shifting by
 * the viewer's UTC offset (the old behavior) was wrong for every non-UTC user.
 * All-day DATE values become midnight and are flagged via isDateOnly.
 */
function parseIcsDate(value: string): IcsInstant | null {
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (dateTime) {
    const [, y, mo, d, h, mi, s] = dateTime;
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`, isDateOnly: false };
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
