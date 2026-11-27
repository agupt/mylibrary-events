/**
 * S8: Fly.io Prometheus (PromQL instant query) parsing
 * (docs/growth-agent/phase1-impact.md §1 S8).
 *
 * App-level only (Fly has no per-route split). Requests served from
 * Cloudflare's cache never reach Fly, so these are origin numbers.
 *
 * Pure: no I/O.
 */

export const WINDOW = "24h";

/** PromQL label values are quoted strings; reject anything that could break out. */
const APP_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The three instant queries S8 needs, for one Fly app. */
export function buildFlyQueries(app) {
  if (!APP_NAME.test(app)) {
    throw new Error(`invalid Fly app name: ${String(app).slice(0, 64)}`);
  }
  const selector = `app="${app}"`;
  return {
    requests: `sum(increase(fly_app_http_responses_count{${selector}}[${WINDOW}]))`,
    errors5xx: `sum(increase(fly_app_http_responses_count{${selector},status=~"5.."}[${WINDOW}]))`,
    p95Seconds:
      `histogram_quantile(0.95, sum(increase(fly_app_http_response_time_seconds_bucket{${selector}}[${WINDOW}])) by (le))`,
  };
}

/**
 * Reads a scalar from a Prometheus `/api/v1/query` response.
 * An empty vector means "no samples" (→ `empty: true`, value null).
 * NaN/Inf (histogram_quantile over no data) also reads as empty.
 * @returns {{ ok: true, value: number|null, empty: boolean } | { ok: false, error: string }}
 */
export function parsePromScalar(body) {
  if (body?.status !== "success") {
    const kind = typeof body?.errorType === "string" ? body.errorType : "unknown";
    return { ok: false, error: `Prometheus query failed (${kind})` };
  }
  const { resultType, result } = body.data ?? {};
  if (resultType === "scalar") {
    return toValue(result?.[1]);
  }
  if (resultType !== "vector" || !Array.isArray(result)) {
    return { ok: false, error: `unexpected Prometheus resultType ${String(resultType)}` };
  }
  if (result.length === 0) return { ok: true, value: null, empty: true };
  if (result.length > 1) {
    return { ok: false, error: `expected one series, got ${result.length}` };
  }
  return toValue(result[0]?.value?.[1]);
}

function toValue(raw) {
  const value = Number(raw);
  if (raw === undefined || !Number.isFinite(value)) {
    return { ok: true, value: null, empty: true };
  }
  return { ok: true, value, empty: false };
}

/**
 * Builds the S8 block from the three parsed queries.
 * No requests at all → `zero-rows` (source fine, nothing happened).
 */
export function buildS8Block({ requests, errors5xx, p95Seconds }) {
  const failed = [requests, errors5xx, p95Seconds].find((r) => !r.ok);
  if (failed) return { status: "error", error: failed.error };

  const total = Math.max(0, requests.value ?? 0);
  if (total === 0) {
    return { status: "zero-rows", requests: 0, rate5xx: null, p95Seconds: null };
  }
  const errors = Math.max(0, errors5xx.value ?? 0);
  return {
    status: "ok",
    requests: total,
    rate5xx: Math.min(1, errors / total),
    p95Seconds: p95Seconds.value === null ? null : Math.max(0, p95Seconds.value),
  };
}

export const NOT_CONFIGURED_S8 = Object.freeze({
  status: "not-configured",
  requests: null,
  rate5xx: null,
  p95Seconds: null,
});
