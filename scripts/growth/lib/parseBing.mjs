/**
 * Pure parser for Bing Webmaster `GetRankAndTrafficStats` (signal F5).
 * The endpoint takes no dates and returns all history in weekly buckets,
 * so F5 keeps the latest bucket. No rows, or an all-zero latest bucket, is
 * a valid `zero-rows` reading (Bing has no traffic yet), never an error.
 */
import { toCount } from "./collectBlock.mjs";

const WCF_DATE = /^\/Date\((-?\d+)([+-]\d{2})?(\d{2})?\)\/$/;
const MINUTE_MS = 60_000;

/** WCF `/Date(ms±hhmm)/` → the calendar date in the stated offset (UTC if none). */
export function parseBingDate(text) {
  const match = WCF_DATE.exec(String(text));
  if (!match) throw new Error("unexpected Bing date format");
  const [, ms, hours = "+00", minutes = "00"] = match;
  const sign = hours.startsWith("-") ? -1 : 1;
  const offsetMinutes = sign * (Math.abs(Number(hours)) * 60 + Number(minutes));
  return new Date(Number(ms) + offsetMinutes * MINUTE_MS).toISOString().slice(0, 10);
}

/** F5 from a `GetRankAndTrafficStats` response (`{ d: [...] }`). */
export function parseF5(response) {
  const rows = response?.d;
  if (!Array.isArray(rows)) throw new Error("unexpected Bing response shape");
  if (rows.length === 0) return { status: "zero-rows", weekOf: null, clicks: 0, impressions: 0 };
  const [latest] = rows
    .map((row) => ({ weekOf: parseBingDate(row.Date), clicks: toCount(row.Clicks), impressions: toCount(row.Impressions) }))
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0));
  const hasTraffic = latest.clicks + latest.impressions > 0;
  return { status: hasTraffic ? "ok" : "zero-rows", ...latest };
}
