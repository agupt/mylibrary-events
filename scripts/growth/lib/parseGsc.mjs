/**
 * Pure Google Search Console helpers (F1, F4; F2/F3 live in f2f3.mjs):
 * final-data dates, page URL normalization, F1 page-type aggregation via
 * WS-D's `classifyPath`, sitemap parsing, the deterministic stratified
 * URL-Inspection sampler, inspection parsing and the weekly pooled
 * indexed-share estimate.
 */
import { PAGE_TYPES, classifyPath } from "../../../src/lib/analytics/pageType.ts";
import { SITE_HOSTS, shiftDate, toCount } from "./collectBlock.mjs";
import { SITE_ORIGIN } from "./snapshotSchema.mjs";

/** GSC finalizes data ~3 days late (assumption 2). */
export const GSC_FINAL_LAG_DAYS = 3;
/** URL inspections per day: 20× under the 2,000/day per-site quota. */
export const INSPECTIONS_PER_DAY = 100;

const LABEL_MAX = 80;
const RATIO_DECIMALS = 4;
const POSITION_DECIMALS = 2;
const Z_95 = 1.96;

export const roundRatio = (value) => Number(value.toFixed(RATIO_DECIMALS));
export const roundPosition = (value) => Number(value.toFixed(POSITION_DECIMALS));

// ---- dates and URLs -------------------------------------------------------

/** The final-data date F1 reads on run date `date` (D-3). */
export function gscDataDate(date) {
  return shiftDate(date, -GSC_FINAL_LAG_DAYS);
}

/** An inclusive `days`-long range ending on the final-data date. */
export function gscRange(date, days) {
  const endDate = gscDataDate(date);
  return { startDate: shiftDate(endDate, -(days - 1)), endDate };
}

/** One of our page URLs, canonical (https, no www, no query/hash); else null. */
export function normalizePageUrl(url) {
  try {
    const parsed = new URL(url);
    if (!SITE_HOSTS.includes(parsed.hostname)) return null;
    return `${SITE_ORIGIN}${parsed.pathname}`;
  } catch {
    return null;
  }
}

const pageTypeOfUrl = (url) => classifyPath(url).page_type;

// ---- F1 -------------------------------------------------------------------

function groupPages(pageRows) {
  return pageRows.reduce((groups, row) => {
    const pageType = pageTypeOfUrl(row.keys?.[0] ?? "");
    const prior = groups[pageType] ?? { clicks: 0, impressions: 0, pagesWithImpressions: 0 };
    const impressions = toCount(row.impressions);
    if (impressions === 0) return groups;
    return {
      ...groups,
      [pageType]: {
        clicks: prior.clicks + toCount(row.clicks),
        impressions: prior.impressions + impressions,
        pagesWithImpressions: prior.pagesWithImpressions + 1,
      },
    };
  }, {});
}

/**
 * F1 for one final-data date: `totals` is the `dimensions: ["date"]`
 * response (site totals), `pages` the `dimensions: ["page"]` rows.
 */
export function parseF1({ dataDate, totals, pages }) {
  const [total] = totals?.rows ?? [];
  const impressions = toCount(total?.impressions);
  return {
    status: impressions > 0 ? "ok" : "zero-rows",
    dataDate,
    clicks: toCount(total?.clicks),
    impressions,
    ctr: impressions > 0 ? roundRatio(Math.min(1, Math.max(0, total.ctr))) : null,
    position: impressions > 0 ? roundPosition(total.position) : null,
    byPageGroup: groupPages(pages),
  };
}

// ---- sitemap --------------------------------------------------------------

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** `<loc>` entries of a `urlset` or `sitemapindex` document. */
export function parseSitemap(xml) {
  const text = String(xml);
  const kind = /<sitemapindex[\s>]/.test(text) ? "sitemapindex" : /<urlset[\s>]/.test(text) ? "urlset" : null;
  if (!kind) throw new Error("not a sitemap document");
  const locs = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(([, loc]) =>
    loc.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity]),
  );
  return { kind, locs };
}

// ---- F4 sampler -----------------------------------------------------------

/** FNV-1a 32-bit (unsigned: `>>>`, never `>>`, per AGENTS.md). */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Largest-remainder proportional allocation of `n` across strata sizes. */
function allocate(sizes, n) {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const exact = sizes.map((size) => (n * size) / total);
  const floors = exact.map(Math.floor);
  const left = n - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const bonus = new Set(order.slice(0, left).map(({ index }) => index));
  return floors.map((value, index) => value + (bonus.has(index) ? 1 : 0));
}

/**
 * Today's URL-Inspection sample: our sitemap URLs stratified by page type,
 * allocated proportionally (so a pooled weekly share is self-weighting),
 * and picked within each stratum by a per-date hash, deterministic for a
 * given date and different across dates.
 */
export function sampleInspectionUrls(urls, date, { perDay = INSPECTIONS_PER_DAY } = {}) {
  const ours = [...new Set(urls.filter((url) => normalizePageUrl(url) !== null))];
  const strata = PAGE_TYPES.map((pageType) => ({
    pageType,
    urls: ours.filter((url) => pageTypeOfUrl(url) === pageType),
  })).filter((stratum) => stratum.urls.length > 0);
  if (strata.length === 0) return [];
  const quotas = allocate(
    strata.map((stratum) => stratum.urls.length),
    Math.min(perDay, ours.length),
  );
  return strata.flatMap(({ pageType, urls: members }, index) =>
    members
      .map((url) => ({ url, rank: fnv1a(`${date}|${url}`) }))
      .sort((a, b) => a.rank - b.rank || (a.url < b.url ? -1 : 1))
      .slice(0, quotas[index])
      .map(({ url }) => ({ url, pageType })),
  );
}

// ---- F4 inspection --------------------------------------------------------

/** A vendor label made schema-safe (e.g. curly quotes dropped), max 80 chars. */
export function sanitizeLabel(text) {
  const cleaned = String(text ?? "")
    .replace(/[^A-Za-z0-9 ,._:()-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, LABEL_MAX)
    .trim();
  return cleaned || "unknown";
}

/** One URL Inspection response → `{ indexed, verdict, coverageState }`. */
export function parseInspection(response) {
  const status = response?.inspectionResult?.indexStatusResult;
  if (!status || typeof status !== "object") {
    throw new Error("URL Inspection response has no indexStatusResult");
  }
  return {
    indexed: status.verdict === "PASS",
    verdict: sanitizeLabel(status.verdict),
    coverageState: sanitizeLabel(status.coverageState),
  };
}

/** The daily F4 block from `[{ pageType, indexed, coverageState }]`. */
export function summarizeF4(results) {
  const indexedByType = results.reduce(
    (acc, { pageType, indexed }) => ({ ...acc, [pageType]: (acc[pageType] ?? 0) + (indexed ? 1 : 0) }),
    {},
  );
  const coverageStates = results.reduce(
    (acc, { coverageState }) => ({ ...acc, [coverageState]: (acc[coverageState] ?? 0) + 1 }),
    {},
  );
  return {
    status: results.length > 0 ? "ok" : "zero-rows",
    sampled: results.length,
    indexedByType,
    coverageStates,
  };
}

/**
 * Weekly `F4.indexedShareEstimate`: pools daily F4 blocks (indexed =
 * Σ indexedByType) into a share with a Wilson 95% interval; null when
 * nothing was sampled. Blocks without a reading are skipped.
 */
export function estimateIndexedShare(blocks) {
  const usable = blocks.filter((block) => Number.isInteger(block?.sampled) && block.indexedByType);
  const n = usable.reduce((sum, block) => sum + block.sampled, 0);
  if (n === 0) return null;
  const indexed = usable.reduce(
    (sum, block) => sum + Object.values(block.indexedByType).reduce((a, b) => a + b, 0),
    0,
  );
  const p = indexed / n;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    value: roundRatio(p),
    ci95: { low: roundRatio(Math.max(0, center - margin)), high: roundRatio(Math.min(1, center + margin)) },
  };
}
