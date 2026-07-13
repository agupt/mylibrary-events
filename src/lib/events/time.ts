/** Converts a UTC instant to a floating wall-clock ISO in a timezone. */
export function toWallClock(instantIso: string, timeZone: string): string {
  const date = new Date(instantIso);
  if (Number.isNaN(date.getTime())) return instantIso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}:${get("second")}`;
}
