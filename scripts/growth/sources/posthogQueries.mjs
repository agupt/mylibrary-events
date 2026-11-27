/**
 * Every HogQL query the growth observer sends to PostHog (WS-A1,
 * phase1-impact.md §1 + §1a). One module so the privacy deny-list test
 * (assumption 9) can see all of them: explicit columns only, never `$ip`,
 * `message`, a full URL, `SELECT *` or the whole `properties` blob, and
 * only allow-listed property names. `posthog.mjs` re-checks each query
 * with `checkQueryPrivacy()` before sending it.
 *
 * Dates are validated ISO strings inlined into `toDateTime(…, 'UTC')`;
 * nothing user-controlled ever reaches a query.
 */
import { AI_REFERRER_DOMAINS } from "../lib/aiReferrers.mjs";
import { SITE_HOSTS, assertIsoDate, shiftDate } from "../lib/collectBlock.mjs";

/** Property names a query may read. Anything else fails the privacy check. */
export const ALLOWED_PROPERTIES = Object.freeze([
  "page_type",
  "$pathname", // our own URL path: classified in memory, never stored
  "$session_id", // grouping key for S12: never selected, never stored
  "$referring_domain", // a domain, not a URL
  "utm_source", // presence only (has_campaign), the value is never read out
  "query_kind",
  "outcome",
  "systems_without_feed",
  "zero_event_systems",
  "filter", // the filter's name; its value is never selected
  "bot",
  "hits",
  "paths",
  "context",
  "action",
]);

const DENIED = [
  [/\$ip\b/, "$ip"],
  [/message/i, "message (feedback text)"],
  [/\bselect\s+(distinct\s+)?\*|,\s*\*\s*(,|\bfrom\b)/i, "SELECT *"],
  [/\$current_url|\$referrer\b|user_agent|elements_chain|\bperson/i, "full URL, user agent or person data"],
];

/**
 * Privacy violations in a HogQL string (empty when clean). Used by the
 * deny-list test and as a runtime guard before every request.
 */
export function checkQueryPrivacy(sql) {
  const denied = DENIED.filter(([pattern]) => pattern.test(sql)).map(([, label]) => label);
  const dotted = [...sql.matchAll(/\bproperties\.(\$?[A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
  const extracted = [...sql.matchAll(/JSONExtract\w*\(\s*properties\s*,\s*'([^']*)'/g)].map((m) => m[1]);
  const unlisted = [...dotted, ...extracted]
    .filter((name) => !ALLOWED_PROPERTIES.includes(name))
    .map((name) => `property not allow-listed: ${name}`);
  const remainder = sql
    .replace(/\bproperties\.\$?[A-Za-z_]/g, "")
    .replace(/JSONExtract\w*\(\s*properties\s*,/g, "");
  const blob = /\bproperties\b/.test(remainder) ? ["whole properties blob"] : [];
  return [...denied, ...unlisted, ...blob];
}

/** The observer reads day D-1 (UTC) on run date D. */
export function dayWindow(date) {
  return { from: shiftDate(date, -1), to: assertIsoDate(date) };
}

function between({ from, to }) {
  return (
    `timestamp >= toDateTime('${assertIsoDate(from)} 00:00:00', 'UTC') ` +
    `AND timestamp < toDateTime('${assertIsoDate(to)} 00:00:00', 'UTC')`
  );
}

/** §1a engaged-visit actions: search, outbound click, any page_action but widget_loaded. */
const ENGAGED_ACTION =
  "(event IN ('search_performed', 'outbound_click') " +
  "OR (event = 'page_action' AND coalesce(properties.action, '') != 'widget_loaded'))";

const systemCounts = (field) => (window) =>
  `SELECT arrayJoin(JSONExtractArrayRaw(properties, '${field}')) AS system, count() AS n ` +
  `FROM events WHERE event = 'search_results' AND ${between(window)} ` +
  `GROUP BY system ORDER BY n DESC LIMIT 1000`;

/** Query builders by name; each takes a `{ from, to }` window. */
export const POSTHOG_QUERIES = Object.freeze({
  s1Totals: (window) =>
    `SELECT count() AS pageviews, uniq(distinct_id) AS visitors ` +
    `FROM events WHERE event = '$pageview' AND ${between(window)} LIMIT 1`,
  s1ByPage: (window) =>
    `SELECT properties.page_type AS page_type, properties.$pathname AS pathname, count() AS n ` +
    `FROM events WHERE event = '$pageview' AND ${between(window)} ` +
    `GROUP BY page_type, pathname ORDER BY n DESC LIMIT 10000`,
  s2: (window) =>
    `SELECT properties.query_kind AS query_kind, properties.outcome AS outcome, count() AS n ` +
    `FROM events WHERE event = 'search_performed' AND ${between(window)} ` +
    `GROUP BY query_kind, outcome LIMIT 100`,
  s3: systemCounts("systems_without_feed"),
  s4: systemCounts("zero_event_systems"),
  s9: (window) =>
    `SELECT event, properties.filter AS filter, count() AS n ` +
    `FROM events WHERE event IN ('outbound_click', 'filter_changed') AND ${between(window)} ` +
    `GROUP BY event, filter LIMIT 1000`,
  f6: (window) =>
    `SELECT properties.bot AS bot, sum(toInt(properties.hits)) AS hits, ` +
    `sum(JSONExtractInt(properties, 'paths', '/llms.txt')) AS llms_txt_hits ` +
    `FROM events WHERE event = 'ai_bot_hits' AND ${between(window)} ` +
    `GROUP BY bot ORDER BY hits DESC LIMIT 100`,
  referrers: (window) =>
    `SELECT properties.$referring_domain AS domain, count() AS n ` +
    `FROM events WHERE event = '$pageview' AND ${between(window)} ` +
    `GROUP BY domain ORDER BY n DESC LIMIT 1000`,
  f10: (window) =>
    `SELECT properties.context AS context, count() AS n ` +
    `FROM events WHERE event = 'feedback_submitted' AND ${between(window)} ` +
    `GROUP BY context LIMIT 100`,
  s12Coverage: (window) =>
    `SELECT countIf(properties.page_type IS NOT NULL AND properties.page_type != '') AS typed_pageviews, ` +
    `countIf(properties.$session_id IS NOT NULL AND properties.$session_id != '') AS session_pageviews ` +
    `FROM events WHERE event = '$pageview' AND ${between(window)} LIMIT 1`,
  s12Sessions: (window) =>
    `SELECT argMinIf(properties.$referring_domain, timestamp, event = '$pageview') AS entry_domain, ` +
    `argMinIf(if(coalesce(properties.utm_source, '') != '', 1, 0), timestamp, event = '$pageview') AS has_campaign, ` +
    `argMinIf(properties.page_type, timestamp, event = '$pageview') AS landing_type, ` +
    `argMinIf(properties.$pathname, timestamp, event = '$pageview') AS landing_path, ` +
    `countIf(event = '$pageview') AS pageviews, ` +
    `countIf(${ENGAGED_ACTION}) AS engaged_actions, ` +
    `argMinIf(if(event = 'page_action', properties.action, event), timestamp, ${ENGAGED_ACTION}) AS first_action ` +
    `FROM events WHERE event IN ('$pageview', 'search_performed', 'outbound_click', 'page_action') ` +
    `AND ${between(window)} ` +
    `AND properties.$session_id IS NOT NULL AND properties.$session_id != '' ` +
    `GROUP BY properties.$session_id LIMIT 50000`,
  s12Actions: (window) =>
    `SELECT properties.page_type AS page_type, properties.$pathname AS pathname, ` +
    `if(event = 'page_action', properties.action, event) AS action, count() AS n ` +
    `FROM events WHERE event IN ('page_action', 'outbound_click', 'search_performed', 'filter_changed') ` +
    `AND ${between(window)} GROUP BY page_type, pathname, action ORDER BY n DESC LIMIT 10000`,
});

// ---- Phase 0 exit check (integration order step 2) -----------------------

const quoteList = (values) => values.map((value) => `'${value}'`).join(", ");
const AI_DOMAINS_SQL = quoteList(AI_REFERRER_DOMAINS.flatMap((d) => [d, `www.${d}`]));
const SELF_OR_DIRECT_SQL = quoteList(["$direct", ...SITE_HOSTS]);

/** Each Phase 0 signal, the event that carries it, and its arrival condition. */
export const PHASE0_SIGNALS = Object.freeze([
  { id: "S1", label: "$pageview", condition: "event = '$pageview'" },
  { id: "S2", label: "search_performed", condition: "event = 'search_performed'" },
  {
    id: "S3",
    label: "search_results.systems_without_feed",
    condition: "event = 'search_results' AND JSONLength(JSONExtractRaw(properties, 'systems_without_feed')) > 0",
  },
  {
    id: "S4",
    label: "search_results.zero_event_systems",
    condition: "event = 'search_results' AND JSONLength(JSONExtractRaw(properties, 'zero_event_systems')) > 0",
  },
  { id: "S9_outbound", label: "outbound_click", condition: "event = 'outbound_click'" },
  { id: "S9_filter", label: "filter_changed", condition: "event = 'filter_changed'" },
  { id: "F6", label: "ai_bot_hits", condition: "event = 'ai_bot_hits'" },
  {
    id: "F7",
    label: "$pageview from an AI engine",
    condition: `event = '$pageview' AND lower(coalesce(properties.$referring_domain, '')) IN (${AI_DOMAINS_SQL})`,
  },
  {
    id: "F8",
    label: "$pageview with a referrer",
    condition: `event = '$pageview' AND coalesce(properties.$referring_domain, '$direct') NOT IN (${SELF_OR_DIRECT_SQL})`,
  },
  { id: "F10", label: "feedback_submitted", condition: "event = 'feedback_submitted'" },
]);

const PHASE0_EVENTS = quoteList([
  "$pageview", "search_performed", "search_results", "outbound_click",
  "filter_changed", "ai_bot_hits", "feedback_submitted",
]);

const utcDate = (expr) => `toString(toDate(toTimeZone(${expr}, 'UTC')))`;

/** One row: `<id>_first`, `<id>_last` (UTC dates) and `<id>_n` per signal. */
export function phase0Query(since, until) {
  const columns = PHASE0_SIGNALS.flatMap(({ id, condition }) => {
    const prefix = id.toLowerCase();
    return [
      `${utcDate(`minIf(timestamp, ${condition})`)} AS ${prefix}_first`,
      `${utcDate(`maxIf(timestamp, ${condition})`)} AS ${prefix}_last`,
      `countIf(${condition}) AS ${prefix}_n`,
    ];
  });
  return (
    `SELECT ${columns.join(", ")} FROM events ` +
    `WHERE event IN (${PHASE0_EVENTS}) AND ${between({ from: since, to: until })} LIMIT 1`
  );
}
