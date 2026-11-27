/**
 * Pure parsers: PostHog HogQL query responses → snapshot signal blocks
 * (S1–S4, S9, F6–F8, F10) plus the Phase 0 exit check. Every free-form
 * value is coerced to a schema-safe token (`toKey`, `toDomain`) so a junk
 * or hostile property value maps to `$other` instead of failing the
 * snapshot or landing verbatim in a public file.
 *
 * Page types come from WS-D's `classifyPath` (one classifier for events
 * and GSC URLs). Plain node imports the `.ts` via type stripping
 * (Node ≥ 22.18); vitest and `tsx` handle it natively.
 */
import { PAGE_TYPES, classifyPath } from "../../../src/lib/analytics/pageType.ts";
import { aiEngineOf } from "./aiReferrers.mjs";
import { SITE_HOSTS, toCount } from "./collectBlock.mjs";
import { PHASE0_SIGNALS } from "../sources/posthogQueries.mjs";

const KEY = /^[A-Za-z0-9$][A-Za-z0-9._:-]{0,63}$/;
const DOMAIN = /^(\$direct|(?=.{1,253}(:|$))[a-z0-9_-]+(\.[a-z0-9_-]+)*(:\d{1,5})?)$/;
const SYSTEM_ID = /^[A-Z]{2}\d{4}$/;
const MAX_SYSTEM_ROWS = 500;
const MAX_TOP_REFERRERS = 25;

// ---- primitives -----------------------------------------------------------

/** HogQL `{ columns, results }` → row objects keyed by column name. */
export function hogqlRows(response) {
  const columns = response?.columns;
  const results = response?.results;
  const isValid =
    Array.isArray(columns) &&
    Array.isArray(results) &&
    results.every((row) => Array.isArray(row) && row.length === columns.length);
  if (!isValid) throw new Error("unexpected PostHog response shape");
  return results.map((row) => Object.fromEntries(columns.map((name, i) => [name, row[i]])));
}

/** An id-like map key: kept as-is when safe, `$none` when absent, else `$other`. */
export function toKey(value) {
  if (value === null || value === undefined || value === "") return "$none";
  const text = String(value);
  return KEY.test(text) ? text : "$other";
}

/** A referring host (never a URL): lower-cased when valid, else `$other`. */
export function toDomain(value) {
  if (typeof value !== "string") return "$other";
  const host = value === "$direct" ? value : value.toLowerCase();
  return DOMAIN.test(host) ? host : "$other";
}

/** WS-D's `page_type` property when known, else `classifyPath($pathname)`. */
export function pageTypeOf(pageType, pathname) {
  if (PAGE_TYPES.includes(pageType)) return pageType;
  // No path is unknown, not the home page ("" would classify as home).
  return typeof pathname === "string" && pathname !== "" ? classifyPath(pathname).page_type : "other";
}


/** Locale-independent string order (deterministic snapshots). */
export const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Adds `n` to `map[key]`, returning a new map. */
export const addCount = (map, key, n) => ({ ...map, [key]: (map[key] ?? 0) + n });

const sumBy = (rows, field) => rows.reduce((total, row) => total + toCount(row[field]), 0);
const dataStatus = (total) => (total > 0 ? "ok" : "zero-rows");

// ---- Self ring ------------------------------------------------------------

/** S1 from the totals query and the per-(page_type, $pathname) query. */
export function parseS1({ totals, byPage }) {
  const [total = {}] = hogqlRows(totals);
  const pageviews = toCount(total.pageviews);
  const byPageGroup = hogqlRows(byPage).reduce(
    (groups, row) => addCount(groups, pageTypeOf(row.page_type, row.pathname), toCount(row.n)),
    {},
  );
  return { status: dataStatus(pageviews), pageviews, visitors: toCount(total.visitors), byPageGroup };
}

const QUERY_KINDS = ["zip", "city"];
const OUTCOMES = ["ok", "ambiguous", "not-found", "error"];

/** S2: every search counts; only known kinds/outcomes are bucketed. */
export function parseS2(response) {
  const rows = hogqlRows(response);
  const bucket = (field, names) =>
    Object.fromEntries(
      names.map((name) => [name, sumBy(rows.filter((row) => row[field] === name), "n")]),
    );
  const searches = sumBy(rows, "n");
  return {
    status: dataStatus(searches),
    searches,
    byKind: bucket("query_kind", QUERY_KINDS),
    byOutcome: bucket("outcome", OUTCOMES),
  };
}

/** `"CA0114"` (a JSONExtractArrayRaw item) or `CA0114` → `CA0114`. */
function unquote(value) {
  const text = String(value ?? "");
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? parsed : text;
  } catch {
    return text;
  }
}

const byCountThenSystem = (a, b) => b.count - a.count || compareText(a.system, b.system);

/** S3/S4: per-FSCSKEY counts from an `arrayJoin` query, capped at 500 rows. */
export function parseSystemCounts(response, field) {
  const counts = hogqlRows(response).reduce((acc, row) => {
    const system = unquote(row.system);
    return SYSTEM_ID.test(system) ? addCount(acc, system, toCount(row.n)) : acc;
  }, {});
  const rows = Object.entries(counts)
    .map(([system, count]) => ({ system, count }))
    .filter((row) => row.count > 0)
    .sort(byCountThenSystem)
    .slice(0, MAX_SYSTEM_ROWS);
  return { status: dataStatus(rows.length), [field]: rows };
}

/** S9: outbound clicks and filter changes by filter name (never by value). */
export function parseS9(response) {
  const rows = hogqlRows(response);
  const outboundClicks = sumBy(rows.filter((row) => row.event === "outbound_click"), "n");
  const filterChanges = rows
    .filter((row) => row.event === "filter_changed")
    .reduce((acc, row) => addCount(acc, toKey(row.filter), toCount(row.n)), {});
  const total = outboundClicks + Object.values(filterChanges).reduce((a, b) => a + b, 0);
  return { status: dataStatus(total), outboundClicks, filterChanges };
}

// ---- Frontier ring --------------------------------------------------------

/** F6: AI-crawler hits by bot, plus hits on /llms.txt. */
export function parseF6(response) {
  const rows = hogqlRows(response);
  const hitsByBot = rows.reduce((acc, row) => addCount(acc, toKey(row.bot), toCount(row.hits)), {});
  return {
    status: dataStatus(sumBy(rows, "hits")),
    hitsByBot,
    llmsTxtHits: sumBy(rows, "llms_txt_hits"),
  };
}

const byPageviewsThenDomain = (a, b) => b.pageviews - a.pageviews || compareText(a.domain, b.domain);

/** F7 (AI engines) and F8 (top referring domains, self excluded) from one query. */
export function parseReferrers(response) {
  const rows = hogqlRows(response);
  const status = dataStatus(sumBy(rows, "n"));
  const visitsByEngine = rows.reduce((acc, row) => {
    const engine = aiEngineOf(row.domain);
    return engine ? addCount(acc, engine, toCount(row.n)) : acc;
  }, {});
  const byDomain = rows
    .map((row) => ({ domain: toDomain(row.domain), pageviews: toCount(row.n) }))
    .filter(({ domain }) => !SITE_HOSTS.includes(domain))
    .reduce((acc, { domain, pageviews }) => addCount(acc, domain, pageviews), {});
  const topReferrers = Object.entries(byDomain)
    .map(([domain, pageviews]) => ({ domain, pageviews }))
    .filter(({ pageviews }) => pageviews > 0)
    .sort(byPageviewsThenDomain)
    .slice(0, MAX_TOP_REFERRERS);
  return { F7: { status, visitsByEngine }, F8: { status, topReferrers } };
}

/** F10: submission counts by context. The message is never selected. */
export function parseF10(response) {
  const rows = hogqlRows(response);
  const byContext = rows.reduce((acc, row) => addCount(acc, toKey(row.context), toCount(row.n)), {});
  const submissions = sumBy(rows, "n");
  return { status: dataStatus(submissions), submissions, byContext };
}

// ---- Phase 0 exit check ---------------------------------------------------

/** One `{ id, label, firstSeen, lastSeen, count }` per Phase 0 signal. */
export function parsePhase0(response) {
  const [row] = hogqlRows(response);
  if (!row) throw new Error("phase-0 query returned no row");
  return PHASE0_SIGNALS.map(({ id, label }) => {
    const prefix = id.toLowerCase();
    const count = toCount(row[`${prefix}_n`]);
    return {
      id,
      label,
      firstSeen: count > 0 ? String(row[`${prefix}_first`]) : null,
      lastSeen: count > 0 ? String(row[`${prefix}_last`]) : null,
      count,
    };
  });
}

/** Plain-text report: one line per signal and an "arrived: n/m" summary. */
export function formatPhase0(rows, { since }) {
  const idWidth = Math.max(...rows.map((row) => row.id.length));
  const labelWidth = Math.max(...rows.map((row) => row.label.length));
  const lines = rows.map((row) => {
    const head = `${row.id.padEnd(idWidth)}  ${row.label.padEnd(labelWidth)}`;
    return row.count > 0
      ? `${head}  first-seen ${row.firstSeen}  last-seen ${row.lastSeen}  events ${row.count}`
      : `${head}  never (0 events)`;
  });
  const arrived = rows.filter((row) => row.count > 0).length;
  return [
    `Phase 0 signal arrival since ${since} (UTC dates, PostHog)`,
    ...lines,
    `arrived: ${arrived}/${rows.length}`,
  ].join("\n");
}
