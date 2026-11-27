/**
 * S7: lab performance from PageSpeed Insights v5
 * (docs/growth-agent/phase1-impact.md §1 S7). Weekly (Mondays).
 *
 * 5 representative URLs × mobile/desktop × 3 runs = 30 calls, run with
 * low concurrency; each URL × strategy is the field-wise median of its
 * successful runs (lib/parsePsi.mjs). The key goes in the
 * `x-goog-api-key` header, never the URL.
 */
import { sanitizeError } from "../lib/snapshotSchema.mjs";
import { buildS7Block, medianRun, parsePsiRun } from "../lib/parsePsi.mjs";

export const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const SITE = "https://mylibrary-events.com";

/** Home, 1 state, 1 city, 1 library, /status (all exist in the manifest). */
export const DEFAULT_PSI_URLS = Object.freeze([
  `${SITE}/`,
  `${SITE}/storytimes/ca`,
  `${SITE}/storytimes/ca/san-francisco`,
  `${SITE}/library/ca/san-francisco/san-francisco-main-library`,
  `${SITE}/status`,
]);
export const STRATEGIES = Object.freeze(["mobile", "desktop"]);
export const RUNS_PER_URL = 3;
const CATEGORIES = ["performance", "seo", "accessibility", "best-practices"];
const TIMEOUT_MS = 90_000;
const DEFAULT_CONCURRENCY = 2;

export const NOT_CONFIGURED_S7 = Object.freeze({ status: "not-configured", runs: null });

function requestUrl(url, strategy) {
  const params = new URLSearchParams({ url, strategy });
  for (const category of CATEGORIES) params.append("category", category);
  return `${PSI_ENDPOINT}?${params}`;
}

async function runOnce({ url, strategy, apiKey, fetch }) {
  try {
    const response = await fetch(requestUrl(url, strategy), {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) {
      return { ok: false, error: `PSI HTTP ${response.status}` };
    }
    return parsePsiRun(await response.json());
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}

/** Runs `tasks` (thunks) with at most `limit` in flight; keeps order. */
async function runPool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  return results;
}

/**
 * Collects the S7 block.
 * @param {{ env?: object, fetch?: Function, urls?: string[], runs?: number, concurrency?: number }} [options]
 */
export async function collectS7({
  env = process.env,
  fetch = globalThis.fetch,
  urls = DEFAULT_PSI_URLS,
  runs = RUNS_PER_URL,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  const apiKey = env.CRUX_API_KEY;
  if (!apiKey) return { ...NOT_CONFIGURED_S7 };

  const combos = urls.flatMap((url) => STRATEGIES.map((strategy) => ({ url, strategy })));
  const tasks = combos.flatMap((combo) =>
    Array.from({ length: runs }, () => () => runOnce({ ...combo, apiKey, fetch })),
  );
  const results = await runPool(tasks, concurrency);

  const entries = combos.map((combo, i) =>
    medianRun(combo.url, combo.strategy, results.slice(i * runs, (i + 1) * runs)),
  );
  const firstError = results.find((r) => !r.ok)?.error;
  const block = buildS7Block(entries, firstError);
  return block.status === "error" ? { ...block, error: sanitizeError(block.error) } : block;
}
