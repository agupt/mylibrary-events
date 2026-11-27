/**
 * F2 (striking distance) and F3 (CTR anomalies) derived from GSC Search
 * Analytics rows. Decision 3: GSC query strings never leave this module.
 * They are read in memory only to count distinct queries; every returned
 * value is an aggregate or one of our own canonical page URLs.
 *
 * These are reading definitions, not triggers: the trigger thresholds
 * (e.g. "CTR < 50% of expected at position ≤ 5, ≥ 100 impressions") live
 * in signals.yml. F3 therefore keeps a looser candidate set (position ≤ 10,
 * ≥ 20 impressions, below expected) for the evaluator to judge.
 */
import { toCount } from "./collectBlock.mjs";
import { normalizePageUrl, roundPosition, roundRatio } from "./parseGsc.mjs";

export const STRIKING = Object.freeze({ minPosition: 8, maxPosition: 30, minImpressions: 10 });
export const CTR_CANDIDATES = Object.freeze({ maxPosition: 10, minImpressions: 20 });
const MAX_TOP_PAGES = 25;
const MAX_ANOMALIES = 100;

/** F2 from `dimensions: ["query", "page"]` rows over the last 7 final days. */
export function deriveF2(rows, options = {}) {
  const { minPosition, maxPosition, minImpressions } = { ...STRIKING, ...options };
  const striking = rows
    .map((row) => ({
      query: row.keys?.[0],
      page: normalizePageUrl(row.keys?.[1] ?? ""),
      impressions: toCount(row.impressions),
      position: Number(row.position),
    }))
    .filter(
      ({ page, impressions, position }) =>
        page !== null && impressions >= minImpressions && position >= minPosition && position <= maxPosition,
    );

  const strikingQueryCount = new Set(striking.map(({ query }) => query)).size;
  // Distinct queries per page: the www and bare host of one page normalize
  // to the same URL, and a query seen on both must count once.
  const byPage = striking.reduce((acc, { query, page, impressions }) => {
    const prior = acc[page] ?? { strikingImpressions: 0, queries: new Set() };
    return {
      ...acc,
      [page]: { strikingImpressions: prior.strikingImpressions + impressions, queries: new Set(prior.queries).add(query) },
    };
  }, {});
  const topPages = Object.entries(byPage)
    .map(([page, { strikingImpressions, queries }]) => ({ page, strikingImpressions, queryCount: queries.size }))
    .sort((a, b) => b.strikingImpressions - a.strikingImpressions || (a.page < b.page ? -1 : 1))
    .slice(0, MAX_TOP_PAGES);

  return {
    status: striking.length > 0 ? "ok" : "zero-rows",
    strikingQueryCount,
    strikingImpressions: striking.reduce((sum, { impressions }) => sum + impressions, 0),
    topPages,
  };
}

/** The site's own CTR by rounded position, from `dimensions: ["page"]` rows. */
export function ctrCurve(rows) {
  const buckets = rows.reduce((acc, row) => {
    const impressions = toCount(row.impressions);
    if (impressions === 0) return acc;
    const bucket = Math.round(Number(row.position));
    const prior = acc.get(bucket) ?? { clicks: 0, impressions: 0 };
    return new Map(acc).set(bucket, {
      clicks: prior.clicks + toCount(row.clicks),
      impressions: prior.impressions + impressions,
    });
  }, new Map());
  return new Map([...buckets].map(([bucket, t]) => [bucket, t.clicks / t.impressions]));
}

/**
 * F3: pages (last 7 days) whose CTR is below the site's own 28-day CTR for
 * their rounded position. Ordered by missed clicks, capped at 100.
 */
export function deriveF3({ weekPages, curvePages }, options = {}) {
  const { maxPosition, minImpressions } = { ...CTR_CANDIDATES, ...options };
  const curve = ctrCurve(curvePages);
  const anomalies = weekPages
    .map((row) => {
      const impressions = toCount(row.impressions);
      const position = Number(row.position);
      const ctr = impressions > 0 ? toCount(row.clicks) / impressions : 0;
      return { page: normalizePageUrl(row.keys?.[0] ?? ""), position, ctr, impressions };
    })
    .filter(({ page, impressions, position }) => page !== null && impressions >= minImpressions && position <= maxPosition)
    .map((row) => ({ ...row, expectedCtr: curve.get(Math.round(row.position)) }))
    .filter(({ ctr, expectedCtr }) => expectedCtr !== undefined && ctr < expectedCtr)
    .map((row) => ({ ...row, missed: row.impressions * (row.expectedCtr - row.ctr) }))
    .sort((a, b) => b.missed - a.missed || (a.page < b.page ? -1 : 1))
    .slice(0, MAX_ANOMALIES)
    .map(({ page, position, ctr, expectedCtr, impressions }) => ({
      page,
      position: roundPosition(position),
      ctr: roundRatio(ctr),
      expectedCtr: roundRatio(expectedCtr),
      impressions,
    }));
  return { status: weekPages.length > 0 ? "ok" : "zero-rows", anomalies };
}
