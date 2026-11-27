/**
 * Pure trigger evaluation over the snapshot history
 * (docs/growth-agent/phase1-impact.md §3).
 *
 *   evaluateTriggers(config, snapshots, today) → { date, fired, notEvaluated, quiet }
 *
 * No I/O and no clock: `today` (YYYY-MM-DD) is injected, and snapshots dated
 * after it are ignored. Snapshots are assumed already validated
 * (snapshotSchema); this module only reads them.
 *
 * Core semantics:
 * - `null` (not collected) never satisfies a rule; `0` with a data status does.
 * - Nothing is silently dropped: every trigger lands in exactly one of
 *   `fired` (≥1 key crossed), `quiet` (evaluated, nothing crossed) or
 *   `notEvaluated` (with a reason).
 * - A reading is `{ num, den }`; `den` is null unless the entry divides.
 *   Window aggregates pool ratios (Σnum / Σden), never average them.
 */
import { DATA_STATUSES } from "./snapshotSchema.mjs";
import { ACTIVE_STATUSES, COMPARATOR_OPS } from "./loadSignalsConfig.mjs";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const ROUND_FACTOR = 1e6;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a trigger was not evaluated (reported, never silently dropped). */
export const NOT_EVALUATED_REASONS = Object.freeze([
  "insufficient-history",
  "insufficient-volume",
  "insufficient-field-data",
  "source-error",
  "not-configured",
  "not-applicable",
  "not-due",
  "not-collected",
  "disabled",
]);

/** Snapshot statuses that block evaluation, and the reason each reports. */
const STATUS_REASONS = Object.freeze({
  error: "source-error",
  "not-configured": "not-configured",
  "not-applicable": "not-applicable",
  "not-due": "not-due",
  "insufficient-volume": "insufficient-volume",
  "insufficient-field-data": "insufficient-field-data",
});

/** Tie-break when per-key reasons are equally common. */
const REASON_PRIORITY = ["insufficient-history", "insufficient-volume", "not-collected"];

// ---- dates ----------------------------------------------------------------

function shiftDate(iso, deltaDays) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + deltaDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** `count` dates ending at `endIso`, oldest first. */
function dateRange(endIso, count) {
  return Array.from({ length: count }, (_, i) => shiftDate(endIso, i - count + 1));
}

// ---- reading the snapshot ---------------------------------------------------

const toArray = (value) => (Array.isArray(value) ? value : [value]);
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const round = (value) => (isNumber(value) ? Math.round(value * ROUND_FACTOR) / ROUND_FACTOR : value);

function getPath(root, dottedPath) {
  return dottedPath.split(".").reduce((node, segment) => (isPlainObject(node) ? node[segment] : undefined), root);
}

const blockId = (dottedPath) => dottedPath.split(".")[0];
const entryBlockId = (entry) => blockId(toArray(entry.metric)[0]);
const hasDataStatus = (block) => isPlainObject(block) && DATA_STATUSES.includes(block.status);

/** Sums the number at each path; null if any is missing or its block has no data. */
function sumPaths(snapshot, paths) {
  let total = 0;
  for (const dottedPath of toArray(paths)) {
    if (!hasDataStatus(snapshot?.[blockId(dottedPath)])) return null;
    const value = getPath(snapshot, dottedPath);
    if (!isNumber(value)) return null;
    total += value;
  }
  return total;
}

/** A single-path metric may be a boolean; a summed one is always numeric. */
function readScalar(snapshot, paths) {
  const list = toArray(paths);
  if (list.length === 1 && hasDataStatus(snapshot?.[blockId(list[0])])) {
    const value = getPath(snapshot, list[0]);
    if (typeof value === "boolean") return value;
  }
  return sumPaths(snapshot, list);
}

function makeReading(num, den) {
  if (num === null || num === undefined) return null;
  if (den === undefined) return { num, den: null };
  if (!isNumber(den) || den === 0 || !isNumber(num)) return null;
  return { num, den };
}

const valueOf = (reading) => (reading.den === null ? reading.num : reading.num / reading.den);

function readGlobal(entry, snapshot) {
  const num = readScalar(snapshot, entry.metric);
  if (entry.denominator === undefined) return makeReading(num, undefined);
  return makeReading(num, sumPaths(snapshot, entry.denominator));
}

function itemReading(entry, item) {
  const field = entry.value ?? (entry.per === "$key" ? null : "count");
  const raw = field === null ? (isPlainObject(item) ? item.count : item) : item?.[field];
  if (!isNumber(raw) && typeof raw !== "boolean") return null;
  if (entry.valueDenominator === undefined) return makeReading(raw, undefined);
  return makeReading(raw, item?.[entry.valueDenominator]);
}

function passesWhere(entry, item) {
  if (entry.where === undefined) return true;
  return Object.entries(entry.where).every(([field, comparator]) => compare(comparator, item?.[field]));
}

const itemKey = (entry, item) => toArray(entry.per).map((field) => String(item?.[field])).join(" ");

/** Per-key readings for one snapshot: Map(key → reading|null), or null if not collected. */
function readKeyed(entry, snapshot) {
  if (!hasDataStatus(snapshot?.[entryBlockId(entry)])) return null;
  const container = getPath(snapshot, entry.metric);
  if (entry.per === "$key") {
    if (!isPlainObject(container)) return null;
    return new Map(Object.entries(container).map(([key, item]) => [key, itemReading(entry, item)]));
  }
  if (!Array.isArray(container)) return null;
  const readings = new Map();
  for (const item of container) {
    if (!passesWhere(entry, item)) continue;
    const key = itemKey(entry, item);
    if (!readings.has(key)) readings.set(key, itemReading(entry, item));
  }
  return readings;
}

const ZERO_READING = Object.freeze({ num: 0, den: null });

function keyReading(entry, readings, key) {
  if (readings === null) return null;
  if (readings.has(key)) return readings.get(key);
  return entry.absentKey === "zero" ? ZERO_READING : null;
}

/**
 * One key's value in one snapshot (for needs-data evidence): a number or
 * boolean, or null when not collected. Absent keys follow `absentKey`.
 */
export function readKeyValue(entry, snapshot, key) {
  if (entry?.per === undefined || snapshot === undefined) return null;
  const reading = keyReading(entry, readKeyed(entry, snapshot), key);
  return reading === null ? null : round(valueOf(reading));
}

// ---- comparators and aggregates -------------------------------------------

function compare(comparator, value) {
  const op = COMPARATOR_OPS.find((name) => comparator[name] !== undefined);
  const limit = comparator[op];
  if (op === "eq") return value === limit;
  if (!isNumber(value)) return false;
  if (op === "gt") return value > limit;
  if (op === "gte") return value >= limit;
  if (op === "lt") return value < limit;
  return value <= limit;
}

const thresholdOf = (rule) =>
  Object.fromEntries(COMPARATOR_OPS.filter((op) => rule[op] !== undefined).map((op) => [op, rule[op]]));

/** Σnum (or Σnum/Σden) over the non-null numeric readings; null if none. */
function pool(readings) {
  const numeric = readings.filter((r) => r !== null && isNumber(r.num));
  if (numeric.length === 0) return null;
  const num = numeric.reduce((total, r) => total + r.num, 0);
  if (numeric[0].den === null) return num;
  const den = numeric.reduce((total, r) => total + r.den, 0);
  return den === 0 ? null : num / den;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const skip = (reason) => ({ evaluated: false, reason });

function verdict(rule, value, points) {
  return {
    evaluated: true,
    fired: compare(rule, value),
    value: round(value),
    evidence: {
      dates: points.map((p) => p.date),
      values: points.map((p) => round(valueOf(p.reading))),
    },
  };
}

/** Dates with a reading, as `{ date, reading }`, oldest first. */
function pointsOn(read, dates) {
  return dates.map((date) => ({ date, reading: read(date) })).filter((p) => p.reading !== null);
}

/** The last `count` readings at or before `fromDate`, oldest first. */
function lastObservations(ctx, read, fromDate, count) {
  const found = [];
  for (const date of ctx.datesDesc) {
    if (date > fromDate) continue;
    const reading = read(date);
    if (reading !== null) found.unshift({ date, reading });
    if (found.length === count) break;
  }
  return found;
}

// ---- rule kinds -----------------------------------------------------------

function ruleThreshold(rule, read, ctx) {
  const reading = read(ctx.anchor);
  if (reading === null) return skip("not-collected");
  return verdict(rule, valueOf(reading), [{ date: ctx.anchor, reading }]);
}

function ruleRollingSum(rule, read, ctx) {
  const dates = dateRange(ctx.anchor, rule.windowDays);
  const points = pointsOn(read, dates);
  if (rule.requireFullWindow && points.length < dates.length) return skip("insufficient-history");
  const total = pool(points.map((p) => p.reading));
  if (total === null) return skip("not-collected");
  return verdict(rule, total, points);
}

function aggregateWindow(rule, points) {
  if (points.length === 0) return null;
  if (rule.aggregate === "last") return valueOf(points.at(-1).reading);
  const readings = points.map((p) => p.reading);
  if (readings[0].den !== null) return pool(readings);
  const total = pool(readings);
  return total === null ? null : total / readings.length;
}

function ruleWowChange(rule, read, ctx) {
  const recentPoints = pointsOn(read, dateRange(ctx.anchor, WEEK_DAYS));
  const priorPoints = pointsOn(read, dateRange(shiftDate(ctx.anchor, -WEEK_DAYS), WEEK_DAYS));
  const recent = aggregateWindow(rule, recentPoints);
  const prior = aggregateWindow(rule, priorPoints);
  if (!isNumber(recent) || !isNumber(prior)) return skip("insufficient-history");
  if (rule.change === "pct" && prior === 0) return skip("insufficient-volume");
  const change = rule.change === "pct" ? ((recent - prior) / prior) * 100 : recent - prior;
  return verdict(rule, change, [...priorPoints, ...recentPoints]);
}

function ruleVsTrailingMedian(rule, read, ctx) {
  const latest = read(ctx.anchor);
  if (latest === null || !isNumber(valueOf(latest))) return skip("not-collected");
  const priors = lastObservations(ctx, read, shiftDate(ctx.anchor, -1), rule.window).filter((p) =>
    isNumber(valueOf(p.reading)),
  );
  if (priors.length < rule.minPrior) return skip("insufficient-history");
  const mid = median(priors.map((p) => valueOf(p.reading)));
  if (rule.compare === "ratio" && mid === 0) return skip("insufficient-volume");
  const value = rule.compare === "ratio" ? valueOf(latest) / mid : valueOf(latest) - mid;
  return verdict(rule, value, [...priors, { date: ctx.anchor, reading: latest }]);
}

function ruleConsecutive(rule, read, ctx) {
  if (rule.over === "observations") {
    if (read(ctx.anchor) === null) return skip("not-collected");
    const points = lastObservations(ctx, read, ctx.anchor, rule.n);
    if (points.length < rule.n) return skip("insufficient-history");
    return streakVerdict(rule, points);
  }
  if (ctx.historyDays < rule.n) return skip("insufficient-history");
  const dates = dateRange(ctx.anchor, rule.n);
  const points = pointsOn(read, dates);
  if (points.length < dates.length) {
    // A missing day breaks the streak: evaluated, not fired.
    return { evaluated: true, fired: false, value: null, evidence: { dates: [], values: [] } };
  }
  return streakVerdict(rule, points);
}

function streakVerdict(rule, points) {
  const result = verdict(rule, valueOf(points.at(-1).reading), points);
  return { ...result, fired: points.every((p) => compare(rule, valueOf(p.reading))) };
}

function ruleNewKey(rule, read, ctx) {
  const lookbackEnd = shiftDate(ctx.anchor, -rule.windowDays);
  const lookback = dateRange(lookbackEnd, rule.lookbackDays);
  if (!lookback.some((date) => ctx.hasData(date))) return skip("insufficient-history");
  const points = pointsOn(read, dateRange(ctx.anchor, rule.windowDays));
  const current = pool(points.map((p) => p.reading));
  const seenBefore = lookback.some((date) => {
    const reading = read(date);
    return reading !== null && reading.num !== 0;
  });
  if (current === null || seenBefore) {
    return { evaluated: true, fired: false, value: current, evidence: { dates: [], values: [] } };
  }
  return verdict(rule, current, points);
}

const RULES = Object.freeze({
  threshold: ruleThreshold,
  rollingSum: ruleRollingSum,
  wowChange: ruleWowChange,
  vsTrailingMedian: ruleVsTrailingMedian,
  consecutive: ruleConsecutive,
  newKey: ruleNewKey,
});

// ---- guards, anchor, history ----------------------------------------------

function guardReading(guard, snapshot, key) {
  if (!guard.perKey) {
    const num = sumPaths(snapshot, guard.metric);
    return makeReading(num, guard.denominator === undefined ? undefined : sumPaths(snapshot, guard.denominator));
  }
  const dottedPath = toArray(guard.metric)[0];
  if (!hasDataStatus(snapshot?.[blockId(dottedPath)])) return null;
  const container = getPath(snapshot, dottedPath);
  if (!isPlainObject(container)) return null;
  const item = container[key];
  const raw = guard.field === undefined ? item : item?.[guard.field];
  return makeReading(item === undefined ? 0 : raw, undefined);
}

function passesGuard(entry, ctx, key) {
  const guard = entry.minVolume;
  if (guard === undefined) return true;
  const end = shiftDate(ctx.anchor, -guard.offsetDays);
  const readings = dateRange(end, guard.windowDays).map((date) => guardReading(guard, ctx.byDate.get(date), key));
  const value = pool(readings);
  return value !== null && compare(guard, value);
}

/** Why a reading is null: the deepest sub-status on the metric path, if any. */
function nullReason(entry, snapshot) {
  const segments = toArray(entry.metric)[0].split(".");
  let node = snapshot;
  let reason = "not-collected";
  for (const segment of segments) {
    node = isPlainObject(node) ? node[segment] : undefined;
    if (isPlainObject(node) && STATUS_REASONS[node.status]) reason = STATUS_REASONS[node.status];
  }
  return reason;
}

function blockReason(entry, snapshot) {
  const block = snapshot?.[entryBlockId(entry)];
  if (!isPlainObject(block)) return "not-collected";
  if (block.status === "insufficient-volume") return "insufficient-volume";
  if (!hasDataStatus(block)) return STATUS_REASONS[block.status] ?? "not-collected";
  return null;
}

const hasReading = (entry, snapshot) =>
  entry.per === undefined ? readGlobal(entry, snapshot) !== null : readKeyed(entry, snapshot) !== null;

/** The weekly anchor: the newest reading in the last 7 days. */
function weeklyAnchor(entry, byDate, today) {
  const window = dateRange(today, WEEK_DAYS).reverse();
  const found = window.find((date) => hasDataStatus(byDate.get(date)?.[entryBlockId(entry)]) && hasReading(entry, byDate.get(date)));
  if (found !== undefined) return { date: found };
  const informative = window.find((date) => {
    const block = byDate.get(date)?.[entryBlockId(entry)];
    return isPlainObject(block) && block.status !== "not-due";
  });
  if (informative !== undefined) {
    const snapshot = byDate.get(informative);
    return { reason: blockReason(entry, snapshot) ?? nullReason(entry, snapshot) };
  }
  const anyNotDue = window.some((date) => isPlainObject(byDate.get(date)?.[entryBlockId(entry)]));
  return { reason: anyNotDue ? "not-due" : "not-collected" };
}

function findAnchor(entry, byDate, today) {
  if (entry.cadence === "weekly") {
    const anchor = weeklyAnchor(entry, byDate, today);
    if (anchor.reason) return anchor;
    const reason = blockReason(entry, byDate.get(anchor.date));
    return reason ? { reason } : anchor;
  }
  const snapshot = byDate.get(today);
  const reason = blockReason(entry, snapshot);
  if (reason) return { reason };
  if (entry.per === undefined && readGlobal(entry, snapshot) === null) return { reason: nullReason(entry, snapshot) };
  if (entry.per !== undefined && readKeyed(entry, snapshot) === null) return { reason: "not-collected" };
  return { date: today };
}

/** Days from the first snapshot with data for this block to the anchor, inclusive. */
function historyDays(entry, datesDesc, byDate, anchor) {
  const first = datesDesc.filter((date) => date <= anchor && hasDataStatus(byDate.get(date)?.[entryBlockId(entry)])).at(-1);
  return first === undefined ? 0 : daysBetween(first, anchor) + 1;
}

// ---- evaluation -----------------------------------------------------------

function firedItem(entry, ctx, result, key) {
  return {
    signalId: entry.id,
    trigger: entry.trigger,
    name: entry.name,
    ...(key === undefined ? {} : { key }),
    severity: entry.severity,
    status: entry.status,
    rule: entry.rule.kind,
    date: ctx.anchor,
    value: result.value,
    threshold: thresholdOf(entry.rule),
    evidence: result.evidence,
  };
}

function dominantReason(reasons) {
  const counts = new Map();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const rank = (reason) => {
    const index = REASON_PRIORITY.indexOf(reason);
    return index === -1 ? REASON_PRIORITY.length : index;
  };
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]))[0][0];
}

function keyUniverse(entry, ctx) {
  const keys = new Set();
  for (const date of ctx.datesDesc) {
    if (date > ctx.anchor) continue;
    for (const key of readKeyed(entry, ctx.byDate.get(date))?.keys() ?? []) keys.add(key);
  }
  for (const excluded of entry.excludeKeys) keys.delete(excluded);
  return [...keys].sort();
}

function evaluatePerKey(entry, ctx, ruleFn) {
  const readCache = new Map();
  const readingsOn = (date) => {
    if (!readCache.has(date)) readCache.set(date, readKeyed(entry, ctx.byDate.get(date)));
    return readCache.get(date);
  };
  const results = keyUniverse(entry, ctx).map((key) => {
    if (entry.minVolume?.perKey && !passesGuard(entry, ctx, key)) return { key, ...skip("insufficient-volume") };
    return { key, ...ruleFn(entry.rule, (date) => keyReading(entry, readingsOn(date), key), ctx) };
  });
  const fired = results.filter((r) => r.evaluated && r.fired).map((r) => firedItem(entry, ctx, r, r.key));
  if (fired.length > 0) return { fired };
  if (results.length === 0 || results.some((r) => r.evaluated)) return { quiet: true };
  return { reason: dominantReason(results.map((r) => r.reason)) };
}

function evaluateEntry(entry, byDate, datesDesc, today) {
  if (!ACTIVE_STATUSES.includes(entry.status)) {
    return { reason: entry.status === "disabled" ? "disabled" : "not-applicable" };
  }
  const anchor = findAnchor(entry, byDate, today);
  if (anchor.reason) return { reason: anchor.reason };

  const ctx = {
    anchor: anchor.date,
    byDate,
    datesDesc,
    historyDays: historyDays(entry, datesDesc, byDate, anchor.date),
    hasData: (date) => hasDataStatus(byDate.get(date)?.[entryBlockId(entry)]),
  };
  if (ctx.historyDays < entry.minHistoryDays) return { reason: "insufficient-history" };
  if (entry.minVolume && !entry.minVolume.perKey && !passesGuard(entry, ctx)) {
    return { reason: "insufficient-volume" };
  }

  const ruleFn = RULES[entry.rule.kind];
  if (entry.per !== undefined) return evaluatePerKey(entry, ctx, ruleFn);

  const result = ruleFn(entry.rule, (date) => readGlobal(entry, byDate.get(date)), ctx);
  if (!result.evaluated) return { reason: result.reason };
  return result.fired ? { fired: [firedItem(entry, ctx, result)] } : { quiet: true };
}

/**
 * Evaluates every signals.yml entry against the snapshot history.
 *
 * @param {object} config     validated signals config (loadSignalsConfig)
 * @param {object[]} snapshots daily snapshots, any order
 * @param {string} today       evaluation date, YYYY-MM-DD (UTC)
 * @returns {{ date: string, fired: object[], notEvaluated: object[], quiet: object[] }}
 *   fired:        { signalId, trigger, name, key?, severity, status, rule, date, value, threshold, evidence: { dates, values } }
 *   notEvaluated: { signalId, trigger, reason }   (reason ∈ NOT_EVALUATED_REASONS)
 *   quiet:        { signalId, trigger }
 */
export function evaluateTriggers(config, snapshots, today) {
  if (typeof today !== "string" || !ISO_DATE.test(today)) {
    throw new Error(`today must be a YYYY-MM-DD date, got ${JSON.stringify(today)}`);
  }
  const byDate = new Map(
    snapshots
      .filter((s) => isPlainObject(s) && typeof s.date === "string" && ISO_DATE.test(s.date) && s.date <= today)
      .map((s) => [s.date, s]),
  );
  const datesDesc = [...byDate.keys()].sort().reverse();

  const result = { date: today, fired: [], notEvaluated: [], quiet: [] };
  for (const entry of config.signals) {
    const outcome = evaluateEntry(entry, byDate, datesDesc, today);
    const id = { signalId: entry.id, trigger: entry.trigger };
    if (outcome.fired) result.fired.push(...outcome.fired);
    else if (outcome.quiet) result.quiet.push(id);
    else result.notEvaluated.push({ ...id, reason: outcome.reason });
  }
  return result;
}
