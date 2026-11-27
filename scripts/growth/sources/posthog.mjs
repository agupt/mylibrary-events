/**
 * PostHog collector (WS-A1): S1–S4, S9, S12, F6, F7, F8, F10 for day D-1
 * (UTC), plus the one-off Phase 0 exit check.
 *
 *   node scripts/growth/sources/posthog.mjs --phase0-check [--since YYYY-MM-DD]
 *   node scripts/growth/sources/posthog.mjs [--date YYYY-MM-DD]   # prints the blocks
 *
 * Env: POSTHOG_PERSONAL_API_KEY (secret), POSTHOG_PROJECT_ID (variable).
 * Missing → every block reads `not-configured`. Queries run sequentially
 * (PostHog allows 3 concurrent), each re-checked by `checkQueryPrivacy`.
 * Needs Node ≥ 22.18 (imports WS-D's pageType.ts via type stripping).
 */
import { pathToFileURL } from "node:url";
import {
  argValue,
  collectBlock,
  errorBlock,
  hasErrors,
  request,
  safeDetail,
  shiftDate,
  statusBlocks,
  todayUtc,
} from "../lib/collectBlock.mjs";
import { isS12Configured, parseS12 } from "../lib/engagement.mjs";
import {
  formatPhase0,
  parseF10,
  parseF6,
  parsePhase0,
  parseReferrers,
  parseS1,
  parseS2,
  parseS9,
  parseSystemCounts,
} from "../lib/parsePosthog.mjs";
import { POSTHOG_QUERIES, checkQueryPrivacy, dayWindow, phase0Query } from "./posthogQueries.mjs";

export const POSTHOG_HOST = "https://us.posthog.com";
export const POSTHOG_SIGNAL_IDS = Object.freeze(["S1", "S2", "S3", "S4", "S9", "S12", "F6", "F7", "F8", "F10"]);
/** Phase 0 deployed 2026-11-24 (phase0-impact.md). */
export const PHASE0_SINCE = "2026-11-24";

/** `{ apiKey, projectId }`, null when unset, or `{ error }` when malformed. */
function posthogConfig(env) {
  const apiKey = env.POSTHOG_PERSONAL_API_KEY?.trim();
  const projectId = env.POSTHOG_PROJECT_ID?.trim();
  if (!apiKey || !projectId) return null;
  if (!/^\d+$/.test(projectId)) return { error: "POSTHOG_PROJECT_ID must be numeric" };
  return { apiKey, projectId };
}

/** A HogQL client. Refuses any query that fails the privacy deny-list. */
export function createPosthogClient({ apiKey, projectId, host = POSTHOG_HOST, fetchImpl = fetch }) {
  const url = `${host}/api/projects/${projectId}/query/`;
  return {
    async query(sql) {
      const violations = checkQueryPrivacy(sql);
      if (violations.length > 0) throw new Error(`refusing HogQL query: ${violations.join(", ")}`);
      const response = await request(fetchImpl, url, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
      });
      if (!response.ok) {
        const detail = safeDetail(response.body?.detail ?? response.body?.type);
        throw new Error(`PostHog query failed: HTTP ${response.status} ${detail}`.trim());
      }
      return response.body;
    },
  };
}

/** Memoizes one async call so two signals can share a query. */
const once = (fn) => {
  let promise = null;
  return () => (promise ??= fn());
};

/** Every PostHog signal block for run date `date` (reads D-1 UTC). */
export async function collectPosthog({ date, env = process.env, fetchImpl = fetch }) {
  const config = posthogConfig(env);
  if (config === null) return statusBlocks(POSTHOG_SIGNAL_IDS, "not-configured");
  if (config.error) {
    return Object.fromEntries(POSTHOG_SIGNAL_IDS.map((id) => [id, errorBlock(config.error)]));
  }
  const client = createPosthogClient({ ...config, fetchImpl });
  const window = dayWindow(date);
  const run = (name) => client.query(POSTHOG_QUERIES[name](window));
  const collect = (id, produce) => collectBlock(id, produce, { secrets: [config.apiKey] });
  const referrers = once(() => run("referrers"));

  const S1 = await collect("S1", async () => parseS1({ totals: await run("s1Totals"), byPage: await run("s1ByPage") }));
  const S2 = await collect("S2", async () => parseS2(await run("s2")));
  const S3 = await collect("S3", async () => parseSystemCounts(await run("s3"), "missesBySystem"));
  const S4 = await collect("S4", async () => parseSystemCounts(await run("s4"), "zeroEventBySystem"));
  const S9 = await collect("S9", async () => parseS9(await run("s9")));
  const S12 = await collect("S12", async () => {
    const coverage = await run("s12Coverage");
    if (!isS12Configured(coverage)) return { status: "not-configured" };
    return parseS12({ coverage, sessions: await run("s12Sessions"), actions: await run("s12Actions") });
  });
  const F6 = await collect("F6", async () => parseF6(await run("f6")));
  const F7 = await collect("F7", async () => parseReferrers(await referrers()).F7);
  const F8 = await collect("F8", async () => parseReferrers(await referrers()).F8);
  const F10 = await collect("F10", async () => parseF10(await run("f10")));
  return { S1, S2, S3, S4, S9, S12, F6, F7, F8, F10 };
}

/** Phase 0 exit check: first/last-seen UTC date and count per Phase 0 signal. */
export async function phase0Check({
  env = process.env,
  fetchImpl = fetch,
  since = PHASE0_SINCE,
  until = shiftDate(todayUtc(), 1),
}) {
  const config = posthogConfig(env);
  if (config === null || config.error) {
    throw new Error("PostHog is not configured (POSTHOG_PERSONAL_API_KEY, numeric POSTHOG_PROJECT_ID)");
  }
  const client = createPosthogClient({ ...config, fetchImpl });
  const rows = parsePhase0(await client.query(phase0Query(since, until)));
  return { rows, text: formatPhase0(rows, { since }) };
}

async function main(argv) {
  if (argv.includes("--phase0-check")) {
    const { text } = await phase0Check({ since: argValue(argv, "--since", PHASE0_SINCE) });
    console.log(text);
    return 0;
  }
  const blocks = await collectPosthog({ date: argValue(argv, "--date", todayUtc()) });
  console.log(JSON.stringify(blocks, null, 2));
  return hasErrors(blocks) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      const { POSTHOG_PERSONAL_API_KEY: apiKey } = process.env;
      console.error(`posthog: ${errorBlock(error, [apiKey]).error}`);
      process.exitCode = 1;
    },
  );
}
