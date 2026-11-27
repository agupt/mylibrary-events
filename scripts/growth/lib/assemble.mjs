/**
 * Pure snapshot assembly for the observer orchestrator
 * (docs/growth-agent/phase1-impact.md §1, WS-C). No I/O, no clock.
 *
 * - Every block is re-checked against its schema here: A2 collectors build
 *   blocks without collectBlock, so this is the one place that guarantees a
 *   bad block becomes `status: "error"` instead of failing the snapshot.
 * - A signal no source produced reads `error`, never absent (P4).
 */
import { errorBlock, shiftDate, assertIsoDate } from "./collectBlock.mjs";
import { GSC_FINAL_LAG_DAYS, estimateIndexedShare } from "./parseGsc.mjs";
import { DATA_STATUSES, SIGNAL_IDS, SNAPSHOT_SCHEMA_VERSION, signalSchemas } from "./snapshotSchema.mjs";

const WEEK_DAYS = 7;
const S11_BLOCK = Object.freeze({ status: "not-applicable" });

const hasData = (block) => DATA_STATUSES.includes(block?.status);

function firstIssue(result) {
  const issue = result.error.issues[0];
  return `${issue.path.join(".") || "(root)"} ${issue.message}`;
}

/** `block` when it passes `signalSchemas[id]`, else an error block. */
export function normalizeBlock(id, block) {
  if (id === "S11") return { ...S11_BLOCK };
  if (block === undefined || block === null) return { status: "error", error: `no source produced ${id}` };
  const result = signalSchemas[id].safeParse(block);
  return result.success ? result.data : errorBlock(`invalid ${id} block: ${firstIssue(result)}`);
}

/** A full snapshot from `{ id: block }`; unknown keys are dropped. */
export function assembleSnapshot({ date, generatedAt, blocks, backfill = false }) {
  const signals = Object.fromEntries(SIGNAL_IDS.map((id) => [id, normalizeBlock(id, blocks[id])]));
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    date,
    generatedAt,
    ...(backfill ? { backfill: true } : {}),
    ...signals,
  };
}

export function errorSignalIds(snapshot) {
  return SIGNAL_IDS.filter((id) => snapshot[id]?.status === "error");
}

/** Snapshots dated in [date - (days - 1), date]. */
function inWindow(history, date, days) {
  const from = shiftDate(date, -(days - 1));
  return history.filter((s) => s.date >= from && s.date <= date);
}

/**
 * Weekly `F4.indexedShareEstimate`: today's daily sample pooled with the
 * prior 6 days' samples (phase1-impact.md §1 F4). Untouched when today's
 * F4 has no reading or nothing was sampled.
 */
export function withIndexedShareEstimate(todayF4, history, date) {
  if (!hasData(todayF4)) return todayF4;
  const prior = inWindow(history, date, WEEK_DAYS)
    .filter((s) => s.date < date)
    .map((s) => s.F4)
    .filter(hasData);
  const estimate = estimateIndexedShare([...prior, todayF4]);
  return estimate === null ? todayF4 : { ...todayF4, indexedShareEstimate: estimate };
}

/**
 * S5 demand set: systems that showed up in search results with zero events
 * (S4) during the 7 days before the run date.
 * ASSUMPTION: the spec's "home_system in the last 7 days" has no HogQL query
 * yet; S4's systems are the subset of home systems where a probe matters
 * most. The weekly rotation still covers every active system.
 */
export function demandSystemsFrom(history, date) {
  const systems = inWindow(history, shiftDate(date, -1), WEEK_DAYS)
    .map((s) => s.S4)
    .filter(hasData)
    .flatMap((block) => (block.zeroEventBySystem ?? []).map((row) => row.system));
  return [...new Set(systems)].sort();
}

/** The newest snapshot strictly before `date`: its `id` block, or null. */
export function latestBlockBefore(history, date, id) {
  const earlier = history.filter((s) => s.date < date).sort((a, b) => a.date.localeCompare(b.date));
  return earlier.at(-1)?.[id] ?? null;
}

/**
 * Run dates a `--backfill-from <dataDate>` fills: the run date for data
 * date d is d + GSC lag, up to (not including) today's run.
 */
export function backfillRunDates(fromDataDate, runDate) {
  assertIsoDate(fromDataDate);
  const dates = [];
  for (let d = shiftDate(fromDataDate, GSC_FINAL_LAG_DAYS); d < runDate; d = shiftDate(d, 1)) dates.push(d);
  return dates;
}

/** A history-only snapshot: F1 from the backfill, every other signal not-due. */
export function backfillSnapshot({ runDate, generatedAt, F1 }) {
  const blocks = Object.fromEntries(SIGNAL_IDS.map((id) => [id, { status: "not-due" }]));
  return assembleSnapshot({ date: runDate, generatedAt, blocks: { ...blocks, F1 }, backfill: true });
}
