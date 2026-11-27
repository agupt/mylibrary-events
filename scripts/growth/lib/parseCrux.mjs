/**
 * S6: Chrome UX Report `records:queryRecord` parsing
 * (docs/growth-agent/phase1-impact.md §1 S6, assumption 3).
 *
 * - HTTP 404, or a 200 without a `record`, means the origin has too little
 *   field data for that form factor → `insufficient-field-data`.
 * - A metric missing from an existing record (INP today: too few
 *   interactions) reads `null`: insufficient field data for that metric
 *   alone. The form factor stays `ok` while any metric has a value, which
 *   matches the B0 schema (one status per form factor).
 * - Any other HTTP status is an error for the whole block.
 *
 * Pure: no I/O.
 */

export const CRUX_METRICS = Object.freeze({
  lcpP75: "largest_contentful_paint",
  inpP75: "interaction_to_next_paint",
  clsP75: "cumulative_layout_shift",
});

const EMPTY_READING = Object.freeze({
  status: "insufficient-field-data",
  lcpP75: null,
  inpP75: null,
  clsP75: null,
});

/** CLS p75 arrives as a string ("0.01"); LCP/INP as integers. */
function toP75(metric) {
  const raw = metric?.percentiles?.p75;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function toIsoDate(part) {
  const { year, month, day } = part ?? {};
  if (![year, month, day].every(Number.isInteger)) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parses one form factor's response.
 * @returns {{ ok: true, reading: object, collectionPeriod: object|null }
 *          | { ok: false, error: string }}
 */
export function parseCruxResponse(httpStatus, body) {
  if (httpStatus === 404) {
    return { ok: true, reading: { ...EMPTY_READING }, collectionPeriod: null };
  }
  if (httpStatus !== 200) {
    return { ok: false, error: `CrUX HTTP ${httpStatus}` };
  }
  const record = body?.record;
  if (!record || typeof record !== "object") {
    return { ok: true, reading: { ...EMPTY_READING }, collectionPeriod: null };
  }

  const metrics = record.metrics ?? {};
  const values = Object.fromEntries(
    Object.entries(CRUX_METRICS).map(([field, name]) => [field, toP75(metrics[name])]),
  );
  const hasAny = Object.values(values).some((v) => v !== null);
  const first = toIsoDate(record.collectionPeriod?.firstDate);
  const last = toIsoDate(record.collectionPeriod?.lastDate);

  return {
    ok: true,
    reading: { status: hasAny ? "ok" : "insufficient-field-data", ...values },
    collectionPeriod: first && last ? { firstDate: first, lastDate: last } : null,
  };
}

/**
 * Combines PHONE and DESKTOP results into the S6 block.
 * Either form factor failing makes the block `error` (message supplied by
 * the caller, already sanitized).
 */
export function buildS6Block(phone, desktop) {
  const failed = [phone, desktop].find((r) => !r.ok);
  if (failed) {
    return { status: "error", error: failed.error };
  }
  const anyOk = [phone, desktop].some((r) => r.reading.status === "ok");
  return {
    status: anyOk ? "ok" : "insufficient-field-data",
    phone: phone.reading,
    desktop: desktop.reading,
    collectionPeriod: phone.collectionPeriod ?? desktop.collectionPeriod ?? null,
  };
}
