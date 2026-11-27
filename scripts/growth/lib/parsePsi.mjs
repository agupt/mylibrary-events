/**
 * S7: PageSpeed Insights v5 `runPagespeed` parsing + median-of-3
 * (docs/growth-agent/phase1-impact.md §1 S7, assumption 5).
 *
 * Lab scores are noisy (~±5 points), so each URL × strategy is run 3 times
 * and every field is the median of its successful runs, computed field by
 * field (a run's LCP and its score need not come from the same run).
 *
 * Pure: no I/O.
 */

const CATEGORY_FIELDS = Object.freeze({
  performance: "performance",
  seo: "seo",
  accessibility: "accessibility",
  bestPractices: "best-practices",
});

const AUDIT_FIELDS = Object.freeze({
  lcpMs: "largest-contentful-paint",
  tbtMs: "total-blocking-time",
  cls: "cumulative-layout-shift",
});

export const RUN_FIELDS = Object.freeze([
  ...Object.keys(CATEGORY_FIELDS),
  ...Object.keys(AUDIT_FIELDS),
]);

const nonNegativeOrNull = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Lighthouse scores are 0..1; the snapshot stores 0..100. */
function toScore(category) {
  const score = nonNegativeOrNull(category?.score);
  return score === null || score > 1 ? null : Math.round(score * 100);
}

/**
 * Parses one PSI response into the run's metric fields.
 * @returns {{ ok: true, metrics: object } | { ok: false, error: string }}
 */
export function parsePsiRun(body) {
  const lighthouse = body?.lighthouseResult;
  if (!lighthouse || typeof lighthouse !== "object") {
    return { ok: false, error: "PSI response has no lighthouseResult" };
  }
  if (lighthouse.runtimeError?.code) {
    return { ok: false, error: `Lighthouse runtime error ${lighthouse.runtimeError.code}` };
  }
  const categories = lighthouse.categories ?? {};
  const audits = lighthouse.audits ?? {};
  const metrics = {
    ...Object.fromEntries(
      Object.entries(CATEGORY_FIELDS).map(([field, id]) => [field, toScore(categories[id])]),
    ),
    ...Object.fromEntries(
      Object.entries(AUDIT_FIELDS).map(([field, id]) => [
        field,
        nonNegativeOrNull(audits[id]?.numericValue),
      ]),
    ),
  };
  return { ok: true, metrics };
}

/** Median of the non-null numbers, or null when there are none. */
export function medianOf(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Collapses the runs for one URL × strategy into one S7 run entry.
 * `runs` are parsePsiRun results; failed runs are ignored. With no
 * successful run every field is null (not collected, P4).
 */
export function medianRun(url, strategy, runs) {
  const okMetrics = runs.filter((r) => r.ok).map((r) => r.metrics);
  const fields = Object.fromEntries(
    RUN_FIELDS.map((field) => [field, medianOf(okMetrics.map((m) => m[field]))]),
  );
  return { url, strategy, ...fields };
}

/**
 * Builds the S7 block from medianRun entries. Error only when no
 * URL × strategy produced a single successful run.
 */
export function buildS7Block(entries, firstError) {
  const anyValue = entries.some((entry) => RUN_FIELDS.some((f) => entry[f] !== null));
  if (!anyValue) {
    return { status: "error", error: firstError ?? "no successful PSI run" };
  }
  return { status: "ok", runs: entries };
}
