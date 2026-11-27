/**
 * S12 landing engagement over WS-D's event schema (phase1-impact.md §1a):
 * per visit (`$session_id`), entry source → landing page type → first
 * engaged action, plus the engaged-visit rate per landing page type and
 * action counts per page type.
 *
 * Engaged visit (§1a, defined here, never emitted): ≥ 1 of
 * `search_performed`, `outbound_click`, a `page_action` other than
 * `widget_loaded`, or ≥ 2 pageviews. No time-on-page.
 *
 * Entry sources are a closed set of categories, never raw domains or UTM
 * values: `campaign` (any utm_source), `direct`, `internal`, `ai`,
 * `search`, `social`, `referral`.
 */
import { aiEngineOf } from "./aiReferrers.mjs";
import { SITE_HOSTS, toCount } from "./collectBlock.mjs";
import { addCount, compareText, hogqlRows, pageTypeOf, toKey } from "./parsePosthog.mjs";

const MAX_FUNNEL_ROWS = 50;
const ENGAGED_MIN_PAGEVIEWS = 2;
const RATE_DECIMALS = 4;

const SEARCH_ENGINE =
  /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|yandex\.[a-z.]+|baidu\.com|startpage\.com)$/;
const SOCIAL =
  /(^|\.)(facebook\.com|instagram\.com|reddit\.com|t\.co|x\.com|twitter\.com|pinterest\.com|nextdoor\.com|linkedin\.com|lnkd\.in|threads\.net|bsky\.app|youtube\.com|tiktok\.com)$/;

/** The entry-source category of a visit's first pageview. */
export function entrySourceOf({ referringDomain, hasCampaign }) {
  if (toCount(hasCampaign) > 0) return "campaign";
  const domain = typeof referringDomain === "string" ? referringDomain.toLowerCase() : "";
  if (domain === "" || domain === "$direct") return "direct";
  if (SITE_HOSTS.includes(domain)) return "internal";
  if (aiEngineOf(domain)) return "ai";
  if (SEARCH_ENGINE.test(domain)) return "search";
  if (SOCIAL.test(domain)) return "social";
  return "referral";
}

/** §1a engaged-visit rule for one session row. */
export function isEngaged(row) {
  return toCount(row.engaged_actions) > 0 || toCount(row.pageviews) >= ENGAGED_MIN_PAGEVIEWS;
}

/** The funnel's action: the first engaged action, else `browse` (≥ 2 pageviews), else `none`. */
export function firstActionOf(row) {
  if (typeof row.first_action === "string" && row.first_action !== "") return toKey(row.first_action);
  return toCount(row.pageviews) >= ENGAGED_MIN_PAGEVIEWS ? "browse" : "none";
}

const round = (value) => Number(value.toFixed(RATE_DECIMALS));

function summarizeVisits(sessionRows) {
  const visits = sessionRows.map((row) => ({
    source: entrySourceOf({ referringDomain: row.entry_domain, hasCampaign: row.has_campaign }),
    pageType: pageTypeOf(row.landing_type, row.landing_path),
    action: firstActionOf(row),
    engaged: isEngaged(row),
  }));

  const visitsByEntry = visits.reduce(
    (acc, { source, pageType }) => ({ ...acc, [source]: addCount(acc[source] ?? {}, pageType, 1) }),
    {},
  );

  const tallies = visits.reduce(
    (acc, { pageType, engaged }) => {
      const prior = acc[pageType] ?? { visits: 0, engaged: 0 };
      return { ...acc, [pageType]: { visits: prior.visits + 1, engaged: prior.engaged + (engaged ? 1 : 0) } };
    },
    {},
  );
  const engagedRateByPageType = Object.fromEntries(
    Object.entries(tallies).map(([pageType, t]) => [pageType, round(t.engaged / t.visits)]),
  );

  const funnelCounts = visits.reduce((acc, { source, pageType, action }) => {
    const id = JSON.stringify([source, pageType, action]);
    return addCount(acc, id, 1);
  }, {});
  const funnel = Object.entries(funnelCounts)
    .map(([id, count]) => {
      const [source, pageType, action] = JSON.parse(id);
      return { source, pageType, action, visits: count };
    })
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        compareText(a.source, b.source) ||
        compareText(a.pageType, b.pageType) ||
        compareText(a.action, b.action),
    )
    .slice(0, MAX_FUNNEL_ROWS);

  return { visitsByEntry, engagedRateByPageType, funnel };
}

function summarizeActions(actionRows) {
  return actionRows.reduce((acc, row) => {
    const pageType = pageTypeOf(row.page_type, row.pathname);
    return { ...acc, [pageType]: addCount(acc[pageType] ?? {}, toKey(row.action), toCount(row.n)) };
  }, {});
}

/** True once pageviews carry WS-D's `page_type` and a `$session_id`. */
export function isS12Configured(coverage) {
  const [counts = {}] = hogqlRows(coverage);
  return toCount(counts.typed_pageviews) > 0 && toCount(counts.session_pageviews) > 0;
}

/**
 * S12 from three queries (`s12Coverage`, `s12Sessions`, `s12Actions`).
 * Reads `not-configured` until WS-D's `page_type` reaches pageviews, or
 * when visits carry no `$session_id` (assumption 8); never a fake 0.
 */
export function parseS12({ coverage, sessions, actions }) {
  if (!isS12Configured(coverage)) return { status: "not-configured" };
  const sessionRows = hogqlRows(sessions);
  return {
    status: sessionRows.length > 0 ? "ok" : "zero-rows",
    ...summarizeVisits(sessionRows),
    actionsByPageType: summarizeActions(hogqlRows(actions)),
  };
}
