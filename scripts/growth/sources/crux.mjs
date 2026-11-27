/**
 * S6: field Core Web Vitals from the Chrome UX Report API
 * (docs/growth-agent/phase1-impact.md §1 S6). Weekly (Mondays).
 *
 * The key travels in the `x-goog-api-key` header, never the URL, so it
 * cannot leak into an error message or a log line. Errors are still
 * passed through sanitizeError().
 */
import { sanitizeError } from "../lib/snapshotSchema.mjs";
import { CRUX_METRICS, buildS6Block, parseCruxResponse } from "../lib/parseCrux.mjs";

export const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
export const DEFAULT_ORIGIN = "https://mylibrary-events.com";
const TIMEOUT_MS = 30_000;

export const NOT_CONFIGURED_S6 = Object.freeze({
  status: "not-configured",
  phone: null,
  desktop: null,
  collectionPeriod: null,
});

async function queryFormFactor({ origin, formFactor, apiKey, fetch }) {
  try {
    const response = await fetch(CRUX_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ origin, formFactor, metrics: Object.values(CRUX_METRICS) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = response.status === 200 ? await response.json() : null;
    return parseCruxResponse(response.status, body);
  } catch (error) {
    return { ok: false, error: sanitizeError(error) };
  }
}

/**
 * Collects the S6 block (PHONE + DESKTOP).
 * @param {{ env?: object, fetch?: Function, origin?: string }} [options]
 */
export async function collectS6({
  env = process.env,
  fetch = globalThis.fetch,
  origin = DEFAULT_ORIGIN,
} = {}) {
  const apiKey = env.CRUX_API_KEY;
  if (!apiKey) return { ...NOT_CONFIGURED_S6 };

  const [phone, desktop] = await Promise.all(
    ["PHONE", "DESKTOP"].map((formFactor) =>
      queryFormFactor({ origin, formFactor, apiKey, fetch }),
    ),
  );
  const block = buildS6Block(phone, desktop);
  return block.status === "error" ? { ...block, error: sanitizeError(block.error) } : block;
}
