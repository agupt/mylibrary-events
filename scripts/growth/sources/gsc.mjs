/**
 * Google Search Console collector (WS-A1): F1 daily (final data, D-3),
 * F2/F3 weekly (Monday run), F4 daily URL-Inspection sample.
 *
 *   node scripts/growth/sources/gsc.mjs [--date YYYY-MM-DD]   # prints the blocks
 *
 * Env: GSC_SERVICE_ACCOUNT_JSON (secret), GSC_SITE_URL (variable,
 * `sc-domain:mylibrary-events.com`). Missing → `not-configured`.
 * Quotas (§2): Search Analytics 1,200/min; URL Inspection 2,000/day and
 * 600/min per site: F4 sends 100/day at 1 request/second.
 */
import { pathToFileURL } from "node:url";
import {
  argValue,
  collectBlock,
  errorBlock,
  hasErrors,
  isWeeklyRun,
  request,
  safeDetail,
  statusBlocks,
  todayUtc,
} from "../lib/collectBlock.mjs";
import { deriveF2, deriveF3 } from "../lib/f2f3.mjs";
import {
  INSPECTIONS_PER_DAY,
  gscDataDate,
  gscRange,
  parseF1,
  parseInspection,
  parseSitemap,
  sampleInspectionUrls,
  summarizeF4,
} from "../lib/parseGsc.mjs";
import { SITE_ORIGIN } from "../lib/snapshotSchema.mjs";
import { fetchAccessToken, parseServiceAccount } from "./gscAuth.mjs";

export const GSC_SIGNAL_IDS = Object.freeze(["F1", "F2", "F3", "F4"]);
const SEARCH_ANALYTICS_BASE = "https://www.googleapis.com/webmasters/v3/sites";
const URL_INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;
const ROW_LIMIT = 25_000; // Search Analytics maximum per request
const MAX_ROW_PAGES = 4; // ≤ 100k rows per pull
const MAX_CHILD_SITEMAPS = 20;
const INSPECTION_INTERVAL_MS = 1000;
const MAX_SERVER_ERRORS = 5;
const USER_AGENT = `library-storytime-growth-observer/1.0 (+${SITE_ORIGIN})`;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GoogleApiError extends Error {
  constructor(label, response) {
    const detail = safeDetail(response.body?.error?.status ?? response.body?.error);
    super(`${label} failed: HTTP ${response.status} ${detail}`.trim());
    this.status = response.status;
  }
}

/** A Search Console client bound to one access token and property. */
export function createGscClient({ accessToken, siteUrl, fetchImpl = fetch }) {
  const post = async (url, label, body) => {
    const response = await request(fetchImpl, url, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new GoogleApiError(label, response);
    return response.body ?? {};
  };
  const analyticsUrl = `${SEARCH_ANALYTICS_BASE}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return {
    searchAnalytics: (body) => post(analyticsUrl, "GSC searchAnalytics", body),
    inspectUrl: (inspectionUrl) => post(URL_INSPECTION_URL, "URL Inspection", { inspectionUrl, siteUrl }),
  };
}

/** Every row of a Search Analytics query, paging by `startRow`. */
async function allRows(client, body) {
  const rows = [];
  for (let page = 0; page < MAX_ROW_PAGES; page += 1) {
    const response = await client.searchAnalytics({ ...body, rowLimit: ROW_LIMIT, startRow: page * ROW_LIMIT });
    const batch = response.rows ?? [];
    rows.push(...batch);
    if (batch.length < ROW_LIMIT) break;
  }
  return rows;
}

/** F1 for one final-data date (also used by the orchestrator's backfill). */
export async function collectF1ForDate({ client, dataDate }) {
  const totals = await client.searchAnalytics({ startDate: dataDate, endDate: dataDate, dimensions: ["date"] });
  const pages = await allRows(client, { startDate: dataDate, endDate: dataDate, dimensions: ["page"] });
  return parseF1({ dataDate, totals, pages });
}

async function collectF2({ client, date }) {
  return deriveF2(await allRows(client, { ...gscRange(date, 7), dimensions: ["query", "page"] }));
}

async function collectF3({ client, date }) {
  const weekPages = await allRows(client, { ...gscRange(date, 7), dimensions: ["page"] });
  const curvePages = await allRows(client, { ...gscRange(date, 28), dimensions: ["page"] });
  return deriveF3({ weekPages, curvePages });
}

/** Our live sitemap's URLs (follows one level of sitemap index). */
export async function fetchSitemapUrls({ fetchImpl = fetch, url = SITEMAP_URL } = {}) {
  const fetchDoc = async (target) => {
    // Public, uncredentialed fetch: following a redirect is safe here.
    const response = await request(fetchImpl, target, { headers: { "user-agent": USER_AGENT }, redirect: "follow" });
    if (!response.ok) throw new Error(`sitemap fetch failed: HTTP ${response.status}`);
    return parseSitemap(response.text);
  };
  const root = await fetchDoc(url);
  if (root.kind === "urlset") return root.locs;
  const children = root.locs.filter((loc) => loc.startsWith(`${SITE_ORIGIN}/`)).slice(0, MAX_CHILD_SITEMAPS);
  const docs = [];
  for (const child of children) docs.push(await fetchDoc(child));
  return docs.flatMap((doc) => (doc.kind === "urlset" ? doc.locs : []));
}

/**
 * F4: inspect today's stratified sample at 1 request/second. A 4xx (quota,
 * auth) stops at once; a few 5xx are skipped, more abort the sample.
 */
async function collectF4({ client, date, fetchImpl, sleep, perDay }) {
  const sample = sampleInspectionUrls(await fetchSitemapUrls({ fetchImpl }), date, { perDay });
  const results = [];
  let serverErrors = 0;
  for (const [index, { url, pageType }] of sample.entries()) {
    if (index > 0) await sleep(INSPECTION_INTERVAL_MS);
    try {
      results.push({ pageType, ...parseInspection(await client.inspectUrl(url)) });
    } catch (error) {
      serverErrors += 1;
      if (!(error instanceof GoogleApiError) || error.status < 500 || serverErrors > MAX_SERVER_ERRORS) throw error;
    }
  }
  return summarizeF4(results);
}

/** Connects with the service account, or null when GSC is not configured. */
async function connectGsc({ env, fetchImpl }) {
  const json = env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  const siteUrl = env.GSC_SITE_URL?.trim();
  if (!json || !siteUrl) return null;
  const serviceAccount = parseServiceAccount(json);
  const accessToken = await fetchAccessToken({ serviceAccount, fetchImpl });
  return { client: createGscClient({ accessToken, siteUrl, fetchImpl }), secrets: [serviceAccount.privateKey, accessToken] };
}

/** Every GSC signal block for run date `date`. */
export async function collectGsc({
  date,
  env = process.env,
  fetchImpl = fetch,
  sleep = defaultSleep,
  weekly = isWeeklyRun(date),
  inspectPerDay = INSPECTIONS_PER_DAY,
}) {
  let connection;
  try {
    connection = await connectGsc({ env, fetchImpl });
  } catch (error) {
    const block = errorBlock(error, [env.GSC_SERVICE_ACCOUNT_JSON]);
    return Object.fromEntries(GSC_SIGNAL_IDS.map((id) => [id, block]));
  }
  if (connection === null) return statusBlocks(GSC_SIGNAL_IDS, "not-configured");
  const { client, secrets } = connection;
  const collect = (id, produce) => collectBlock(id, produce, { secrets });

  const F1 = await collect("F1", () => collectF1ForDate({ client, dataDate: gscDataDate(date) }));
  const F2 = weekly ? await collect("F2", () => collectF2({ client, date })) : { status: "not-due" };
  const F3 = weekly ? await collect("F3", () => collectF3({ client, date })) : { status: "not-due" };
  const F4 = await collect("F4", () => collectF4({ client, date, fetchImpl, sleep, perDay: inspectPerDay }));
  return { F1, F2, F3, F4 };
}

async function main(argv) {
  const date = argValue(argv, "--date", todayUtc());
  const blocks = await collectGsc({ date, weekly: argv.includes("--weekly") || isWeeklyRun(date) });
  console.log(JSON.stringify(blocks, null, 2));
  return hasErrors(blocks) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`gsc: ${errorBlock(error, [process.env.GSC_SERVICE_ACCOUNT_JSON]).error}`);
      process.exitCode = 1;
    },
  );
}
