export type DatePresetKey = "any" | "today" | "weekend" | "week";

export const DATE_PRESETS: Array<{ key: DatePresetKey; label: string }> = [
  { key: "any", label: "Any time" },
  { key: "today", label: "Today" },
  { key: "weekend", label: "This weekend" },
  { key: "week", label: "Next 7 days" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local "YYYY-MM-DD" for a date offset by `addDays` from `base`. */
function isoDay(base: Date, addDays = 0): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + addDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Maps a preset to inclusive local date bounds for filterEvents. `now` is the
 * viewer's current time (defaults to the actual now), so "today"/"weekend"
 * resolve in the user's own timezone.
 */
export function dateRangeForPreset(
  key: DatePresetKey,
  now: Date = new Date(),
): { dateStart?: string; dateEnd?: string } {
  if (key === "today") {
    return { dateStart: isoDay(now), dateEnd: isoDay(now) };
  }
  if (key === "week") {
    return { dateStart: isoDay(now), dateEnd: isoDay(now, 6) };
  }
  if (key === "weekend") {
    const dow = now.getDay(); // 0 Sun … 6 Sat
    if (dow === 6) return { dateStart: isoDay(now), dateEnd: isoDay(now, 1) }; // Sat–Sun
    if (dow === 0) return { dateStart: isoDay(now), dateEnd: isoDay(now) }; // Sun only
    const untilSat = 6 - dow;
    return { dateStart: isoDay(now, untilSat), dateEnd: isoDay(now, untilSat + 1) };
  }
  return {}; // "any"
}
