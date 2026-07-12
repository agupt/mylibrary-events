/** One raw VEVENT from an iCalendar feed (LibCal or any ICS source). */
export interface IcsEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  categories: string[];
  url: string;
  startTime: string; // ISO 8601 UTC
  endTime: string;
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

/**
 * Parses an iCal DATE-TIME. Supports UTC ("...Z"), floating/TZID local
 * times (treated as UTC — feed-level precision is good enough for a
 * day-oriented calendar), and all-day DATE values.
 */
function parseIcsDate(value: string): Date | null {
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dateTime) {
    const [, y, mo, d, h, mi, s] = dateTime;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return new Date(Date.UTC(+y, +mo - 1, +d));
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
            uid: current.UID ?? `${title}:${start.toISOString()}`,
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
            startTime: start.toISOString(),
            endTime: (end ?? start).toISOString(),
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
