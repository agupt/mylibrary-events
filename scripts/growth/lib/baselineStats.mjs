/**
 * Baseline numbers for the weekly report and the Phase 1 exit criteria
 * (docs/growth-agent/phase1-impact.md §6). Pure: no I/O, no clock.
 *
 * - Clean-day streak: consecutive daily snapshots ending today with no
 *   `error` block. A missing day or a backfill-only file breaks it.
 *   (`not-configured` counts as clean here; whether that was Amool's
 *   choice is stated in the report, not decided by code.)
 * - Per-metric p50/p95 over the window, so each signals.yml note can cite
 *   them when thresholds move from draft to baselined.
 * - False-positive rate from the judgment labels on closed signal issues.
 */
import { shiftDate } from "./collectBlock.mjs";
import { ACTIVE_STATUSES } from "./loadSignalsConfig.mjs";
import { DATA_STATUSES, SIGNAL_IDS } from "./snapshotSchema.mjs";

export const CLEAN_TARGET_DAYS = 14;
/** Fewer judged issues than this is "not enough evidence", not a pass. */
export const MIN_JUDGED_ISSUES = 4;
export const VALID_LABEL = "signal-valid";
export const FALSE_POSITIVE_LABEL = "false-positive";
const STATS_DECIMALS = 6;

const round = (value) => Number(value.toFixed(STATS_DECIMALS));

function dirtyReason(snapshot) {
  if (snapshot === undefined) return "no snapshot";
  if (snapshot.backfill === true) return "backfill only";
  const errors = SIGNAL_IDS.filter((id) => snapshot[id]?.status === "error");
  return errors.length > 0 ? `error: ${errors.join(", ")}` : null;
}

/**
 * `{ days, target, brokenBy }` ending at `today`. `brokenBy` is the first
 * dirty day walking back (`{ date, reason }`), or null when the streak runs
 * all the way back to the first snapshot.
 */
export function cleanDayStreak(snapshots, today) {
  const byDate = new Map(snapshots.map((s) => [s.date, s]));
  const earliest = snapshots.reduce((min, s) => (s.date < min ? s.date : min), today);
  let days = 0;
  for (let date = today; date >= earliest; date = shiftDate(date, -1)) {
    const reason = dirtyReason(byDate.get(date));
    if (reason !== null) return { days, target: CLEAN_TARGET_DAYS, brokenBy: { date, reason } };
    days += 1;
  }
  return { days, target: CLEAN_TARGET_DAYS, brokenBy: null };
}

/** `{ [signalId]: { [status]: count } }` over snapshots dated in [from, to]. */
export function statusTally(snapshots, { from, to }) {
  const inRange = snapshots.filter((s) => s.date >= from && s.date <= to);
  return Object.fromEntries(
    SIGNAL_IDS.map((id) => [
      id,
      inRange.reduce((acc, s) => {
        const status = s[id]?.status ?? "missing";
        return { ...acc, [status]: (acc[status] ?? 0) + 1 };
      }, {}),
    ]),
  );
}

/** Linear-interpolated percentile (p in [0, 1]); null for no values. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return round(sorted[low] + (sorted[high] - sorted[low]) * (rank - low));
}

const toList = (value) => (Array.isArray(value) ? value : [value]);

function readPath(snapshot, dotted) {
  const [blockId, ...rest] = dotted.split(".");
  const block = snapshot[blockId];
  if (!DATA_STATUSES.includes(block?.status)) return null;
  const value = rest.reduce((node, key) => (node === null || node === undefined ? null : node[key]), block);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Sum of the paths, or null if any is unread. */
function readSum(snapshot, paths) {
  const values = toList(paths).map((p) => readPath(snapshot, p));
  return values.some((v) => v === null) ? null : values.reduce((a, b) => a + b, 0);
}

function readingOf(entry, snapshot) {
  const value = readSum(snapshot, entry.metric);
  if (value === null || entry.denominator === undefined) return value;
  const denominator = readSum(snapshot, entry.denominator);
  return denominator === null || denominator === 0 ? null : value / denominator;
}

const metricLabel = (entry) => toList(entry.metric).join(" + ") + (entry.denominator ? ` / ${toList(entry.denominator).join(" + ")}` : "");

/**
 * p50/p95 per active signals.yml entry over the `days` ending `today`.
 * Per-key entries are listed without numbers (their keys are in the files).
 */
export function metricStats(config, snapshots, today, days = CLEAN_TARGET_DAYS) {
  const from = shiftDate(today, -(days - 1));
  const window = snapshots.filter((s) => s.date >= from && s.date <= today && s.backfill !== true);
  return config.signals
    .filter((entry) => ACTIVE_STATUSES.includes(entry.status) && entry.metric !== undefined)
    .map((entry) => {
      const base = { signalId: entry.id, trigger: entry.trigger ?? null, metric: metricLabel(entry) };
      if (entry.per !== undefined) return { ...base, n: 0, p50: null, p95: null, note: "per-key: see snapshots" };
      const values = window.map((s) => readingOf(entry, s)).filter((v) => v !== null);
      return { ...base, n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), note: null };
    });
}

const labelNames = (issue) => (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label?.name));

/** FP rate = false-positive / (false-positive + signal-valid) over closed signal issues. */
export function falsePositiveStats(closedIssues) {
  const tally = { valid: 0, falsePositive: 0, unjudged: 0 };
  for (const issue of closedIssues) {
    const names = labelNames(issue);
    if (names.includes(FALSE_POSITIVE_LABEL)) tally.falsePositive += 1;
    else if (names.includes(VALID_LABEL)) tally.valid += 1;
    else tally.unjudged += 1;
  }
  const judged = tally.valid + tally.falsePositive;
  return {
    ...tally,
    rate: judged === 0 ? null : round(tally.falsePositive / judged),
    hasEnoughEvidence: judged >= MIN_JUDGED_ISSUES,
  };
}
