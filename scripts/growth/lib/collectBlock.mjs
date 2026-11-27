/**
 * Shared plumbing for the A1 collectors (PostHog, GSC, Bing): date helpers
 * and `collectBlock`, which guarantees that whatever a source produces is a
 * schema-valid signal block. A thrown error or an invalid block becomes
 * `{ status: "error", error }` with the message redacted and sanitized, so
 * one bad source can never fail the snapshot or leak a credential.
 */
import { SITE_ORIGIN, sanitizeError, signalSchemas } from "./snapshotSchema.mjs";

const SITE_HOST = new URL(SITE_ORIGIN).hostname;
/** Our own hostnames (bare and www): self-referrals, our GSC page URLs. */
export const SITE_HOSTS = Object.freeze([SITE_HOST, `www.${SITE_HOST}`]);

/** Per-request timeout for every collector call. */
export const REQUEST_TIMEOUT_MS = 30_000;
const DETAIL_MAX = 80;
const DAY_MS = 86_400_000;
const MONDAY = 1;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns `date` when it is a real calendar date (YYYY-MM-DD), else throws. */
export function assertIsoDate(date) {
  const ms = typeof date === "string" && ISO_DATE.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  const isReal = !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(date);
  if (!isReal) throw new Error(`expected an ISO date (YYYY-MM-DD), got ${JSON.stringify(date)}`);
  return date;
}

/** `date` moved by whole UTC days. */
export function shiftDate(date, days) {
  const ms = Date.parse(`${assertIsoDate(date)}T00:00:00Z`) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Weekly-cadence sources (F2, F3, F5) collect in the Monday run (§1). */
export function isWeeklyRun(date) {
  return new Date(`${assertIsoDate(date)}T00:00:00Z`).getUTCDay() === MONDAY;
}

/** A non-negative integer count; anything else (null, NaN, negative) reads 0. */
export function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** `{ [id]: { status } }` for several signals at once. */
export function statusBlocks(ids, status) {
  return Object.fromEntries(ids.map((id) => [id, { status }]));
}

/** Replaces every occurrence of each (non-trivial) secret with a marker. */
function redact(message, secrets) {
  return secrets
    .filter((secret) => typeof secret === "string" && secret.length >= 8)
    .reduce((text, secret) => text.split(secret).join("[redacted]"), message);
}

/** An error block whose message is redacted, then sanitized for the schema. */
export function errorBlock(error, secrets = []) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return { status: "error", error: sanitizeError(redact(message, secrets)) };
}

function firstIssue(result) {
  const issue = result.error.issues[0];
  return `${issue.path.join(".") || "(root)"} ${issue.message}`;
}

/**
 * Runs `produce()` and returns a block that passes `signalSchemas[id]`.
 * `secrets` are scrubbed from any error message before it is stored.
 */
export async function collectBlock(id, produce, { secrets = [] } = {}) {
  try {
    const block = await produce();
    const result = signalSchemas[id].safeParse(block);
    if (result.success) return result.data;
    return errorBlock(`invalid ${id} block: ${firstIssue(result)}`, secrets);
  } catch (error) {
    return errorBlock(error, secrets);
  }
}

/**
 * One HTTP request through an injected `fetch` (offline tests), with a
 * timeout. Returns `{ ok, status, body, text }`; `body` is the parsed JSON
 * or null. Never throws on HTTP status, only on network failure.
 * Redirects are refused by default so a credential (bearer header or
 * query-string key) is never replayed to another URL; uncredentialed
 * fetches may pass `redirect: "follow"`.
 */
export async function request(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    redirect: "error",
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body, text };
}

/** A vendor error code/detail reduced to a short, plain token string. */
export function safeDetail(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[^A-Za-z0-9_ .:-]/g, "").replace(/\s+/g, " ").trim().slice(0, DETAIL_MAX);
}

/** True when any block in `{ id: block }` reads `error`. */
export function hasErrors(blocks) {
  return Object.values(blocks).some((block) => block.status === "error");
}

/** `--name value` from argv, or `fallback`. */
export function argValue(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
}

/** Today's UTC date (the run date when none is given). */
export function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
