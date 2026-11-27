/**
 * Bing Webmaster collector (WS-A1): F5, weekly (Monday run).
 *
 *   node scripts/growth/sources/bing.mjs [--date YYYY-MM-DD] [--weekly]
 *
 * Env: BING_WEBMASTER_API_KEY (secret). Bing takes the key as a query
 * parameter, so every error is redacted against it before it is stored.
 * No published read quota: one call per week. 0 rows is `zero-rows`.
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
  todayUtc,
} from "../lib/collectBlock.mjs";
import { parseF5 } from "../lib/parseBing.mjs";
import { SITE_ORIGIN } from "../lib/snapshotSchema.mjs";

/** The verified Bing site (GetUserSites, 2026-11-26). */
export const BING_SITE_URL = `${SITE_ORIGIN}/`;
const BING_API = "https://ssl.bing.com/webmaster/api.svc/json";

async function fetchRankAndTraffic({ apiKey, fetchImpl }) {
  const params = new URLSearchParams({ siteUrl: BING_SITE_URL, apikey: apiKey });
  const response = await request(fetchImpl, `${BING_API}/GetRankAndTrafficStats?${params}`);
  if (!response.ok) {
    const detail = safeDetail(response.body?.Message);
    throw new Error(`Bing GetRankAndTrafficStats failed: HTTP ${response.status} ${detail}`.trim());
  }
  return parseF5(response.body);
}

/** `{ F5 }` for run date `date`. */
export async function collectBing({ date, env = process.env, fetchImpl = fetch, weekly = isWeeklyRun(date) }) {
  const apiKey = env.BING_WEBMASTER_API_KEY?.trim();
  if (!apiKey) return { F5: { status: "not-configured" } };
  if (!weekly) return { F5: { status: "not-due" } };
  const F5 = await collectBlock("F5", () => fetchRankAndTraffic({ apiKey, fetchImpl }), { secrets: [apiKey] });
  return { F5 };
}

async function main(argv) {
  const date = argValue(argv, "--date", todayUtc());
  const blocks = await collectBing({ date, weekly: argv.includes("--weekly") || isWeeklyRun(date) });
  console.log(JSON.stringify(blocks, null, 2));
  return hasErrors(blocks) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`bing: ${errorBlock(error, [process.env.BING_WEBMASTER_API_KEY]).error}`);
      process.exitCode = 1;
    },
  );
}
