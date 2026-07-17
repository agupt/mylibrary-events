/**
 * Minimal RFC 5545 RRULE expander for floating (zoneless) library calendars.
 * Recurring storytimes are the most common library event, and feeds anchor a
 * weekly/monthly series at its ORIGINAL start (often years back), so without
 * expansion those events vanish from the current window entirely.
 *
 * Scope (what real library ICS feeds use): FREQ=DAILY/WEEKLY/MONTHLY/YEARLY,
 * INTERVAL, BYDAY (incl. "3SA" nth-weekday for MONTHLY), UNTIL, COUNT, EXDATE.
 * All arithmetic is done in UTC-date space so it is timezone-stable; the
 * wall-clock time-of-day is held constant across occurrences.
 */

const WEEKDAYS: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};
const DAY_MS = 86_400_000;
const MAX_OCCURRENCES = 500;

const pad = (n: number) => String(n).padStart(2, "0");

/** Parses an iCal date/datetime (floating, or "…Z") into a UTC-ms instant. */
function parseIcsInstant(value: string): number | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?Z?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Splits a floating ISO ("2026-07-16T10:00:00") into UTC-ms and its time part. */
function fromFloating(iso: string): { ms: number; time: string } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return { ms: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), time: `${h}:${mi}:${s}` };
}

function toFloating(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Date (UTC-ms at midnight) of the nth `weekday` in month; n<0 counts from end. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number | null {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1));
    const shift = (weekday - first.getUTCDay() + 7) % 7;
    const day = 1 + shift + (n - 1) * 7;
    const d = new Date(Date.UTC(year, month, day));
    return d.getUTCMonth() === month ? d.getTime() : null;
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  const day = last.getUTCDate() - shift + (n + 1) * 7;
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCMonth() === month ? d.getTime() : null;
}

/**
 * Expands one recurring event into concrete occurrences whose start falls
 * within [windowStartMs, windowEndMs). Non-recurring callers should skip this.
 */
export function expandRecurrence(
  startIso: string,
  endIso: string,
  rrule: string,
  exdates: string[],
  windowStartMs: number,
  windowEndMs: number,
): Array<{ startTime: string; endTime: string }> {
  const start = fromFloating(startIso);
  const end = fromFloating(endIso);
  if (!start) return [];
  const durationMs = end ? Math.max(0, end.ms - start.ms) : 0;
  const rule = Object.fromEntries(
    rrule.split(";").map((kv) => kv.split("=") as [string, string]),
  );
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const untilMs = rule.UNTIL ? parseIcsInstant(rule.UNTIL) : null;
  const count = rule.COUNT ? Number(rule.COUNT) : null;
  const byday = (rule.BYDAY ?? "").split(",").filter(Boolean);
  const exSet = new Set(exdates.map((e) => e.slice(0, 8)));

  const startDate = new Date(start.ms);
  const firstDayMs = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  );

  // Collect candidate occurrence DATES (UTC midnight), then filter to window.
  const candidates: number[] = [];
  const upperMs = untilMs != null ? Math.min(untilMs, windowEndMs) : windowEndMs;

  if (freq === "DAILY") {
    let day = firstDayMs;
    if (day < windowStartMs) {
      const steps = Math.floor((windowStartMs - day) / (interval * DAY_MS));
      day += steps * interval * DAY_MS;
    }
    for (let i = 0; i < MAX_OCCURRENCES && day <= upperMs + DAY_MS; i += 1) {
      candidates.push(day);
      day += interval * DAY_MS;
    }
  } else if (freq === "WEEKLY") {
    const targetDays = byday.length ? byday.map((b) => WEEKDAYS[b]) : [startDate.getUTCDay()];
    let day = Math.max(firstDayMs, windowStartMs - 7 * DAY_MS);
    day = Date.UTC(new Date(day).getUTCFullYear(), new Date(day).getUTCMonth(), new Date(day).getUTCDate());
    for (let i = 0; i < MAX_OCCURRENCES && day <= upperMs + DAY_MS; i += 1) {
      const wd = new Date(day).getUTCDay();
      if (day >= firstDayMs && targetDays.includes(wd)) {
        const weekDiff = Math.floor((day - firstDayMs) / (7 * DAY_MS));
        if (((weekDiff % interval) + interval) % interval === 0) candidates.push(day);
      }
      day += DAY_MS;
    }
  } else if (freq === "MONTHLY" || freq === "YEARLY") {
    const step = freq === "YEARLY" ? 12 : 1;
    const winStart = new Date(Math.max(firstDayMs, windowStartMs));
    let year = winStart.getUTCFullYear();
    let month = winStart.getUTCMonth();
    for (let i = 0; i < 24; i += 1) {
      const monthDiff = (year - startDate.getUTCFullYear()) * 12 + (month - startDate.getUTCMonth());
      if (monthDiff >= 0 && monthDiff % (interval * step) === 0) {
        if (byday.length) {
          for (const b of byday) {
            const parsed = b.match(/^(-?\d)([A-Z]{2})$/);
            if (parsed) {
              const occ = nthWeekdayOfMonth(year, month, WEEKDAYS[parsed[2]], Number(parsed[1]));
              if (occ != null) candidates.push(occ);
            }
          }
        } else {
          candidates.push(Date.UTC(year, month, startDate.getUTCDate()));
        }
      }
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      if (Date.UTC(year, month, 1) > windowEndMs) break;
    }
  }

  const occurrences: Array<{ startTime: string; endTime: string }> = [];
  let emitted = 0;
  for (const dayMs of candidates.sort((a, b) => a - b)) {
    if (count != null && emitted >= count) break;
    const occStartMs = dayMs + (start.ms - firstDayMs); // re-apply time-of-day
    emitted += 1; // COUNT counts every occurrence from series start, in or out of window
    if (occStartMs < windowStartMs || occStartMs >= windowEndMs) continue;
    if (untilMs != null && occStartMs > untilMs) continue;
    const compact = `${new Date(dayMs).getUTCFullYear()}${pad(new Date(dayMs).getUTCMonth() + 1)}${pad(new Date(dayMs).getUTCDate())}`;
    if (exSet.has(compact)) continue;
    occurrences.push({
      startTime: toFloating(occStartMs),
      endTime: toFloating(occStartMs + durationMs),
    });
  }
  return occurrences;
}
