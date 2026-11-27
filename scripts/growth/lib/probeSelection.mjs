/**
 * S5 probe selection (docs/growth-agent/phase1-impact.md §1 S5, risk R3).
 *
 * Each day probes three groups, in priority order:
 *   1. re-queued failures from the previous S5 block,
 *   2. demand: systems seen as `home_system` in the last 7 days (A1's data),
 *   3. the rotation: every active system sits in one of 7 buckets chosen by
 *      a stable hash of its FSCSKEY, and day N probes bucket N mod 7.
 *
 * Buckets come from a hash, not a list index, so adding or removing a
 * system never shifts the others between buckets: any 7 consecutive days
 * cover every active system exactly once in the rotation. The rotation is
 * never truncated; only the extras (failures + demand) are capped, so
 * production load stays near ~140 probes/day.
 *
 * Pure: no I/O, no clock (the date is injected).
 */

export const ROTATION_DAYS = 7;
/** Cap on failures + demand on top of the rotation (gentle on production). */
export const DEFAULT_MAX_EXTRA = 60;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** FNV-1a 32-bit hash, unsigned (`>>> 0`; see AGENTS.md on signed shifts). */
function fnv1a(text) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** The rotation bucket (0..6) a system belongs to. Stable across runs. */
export function rotationBucket(system) {
  return fnv1a(system) % ROTATION_DAYS;
}

/** Bucket probed on a UTC date ("YYYY-MM-DD"). */
export function bucketForDate(date) {
  if (typeof date !== "string" || !ISO_DATE.test(date)) {
    throw new Error(`bucketForDate: expected YYYY-MM-DD, got ${String(date)}`);
  }
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
  if (!Number.isFinite(dayNumber)) {
    throw new Error(`bucketForDate: invalid date ${date}`);
  }
  return ((dayNumber % ROTATION_DAYS) + ROTATION_DAYS) % ROTATION_DAYS;
}

/** A probe failed if the feed was unreachable/unknown or it carries an error. */
export function isFailedProbe(probe) {
  return probe.feedReachable !== true || probe.error !== undefined;
}

/** Systems whose probe failed in a previous S5 block (null-safe). */
export function failedSystemsFrom(previousS5) {
  const probes = Array.isArray(previousS5?.probes) ? previousS5.probes : [];
  return [...new Set(probes.filter(isFailedProbe).map((p) => p.system))];
}

/**
 * Chooses today's probes.
 *
 * @param {object} input
 * @param {{system: string, outlet: string}[]} input.activeSystems every active system with its main outlet
 * @param {string} input.date run date, YYYY-MM-DD (UTC)
 * @param {string[]} [input.demandSystems] FSCSKEYs searched in the last 7 days
 * @param {string[]} [input.failedSystems] FSCSKEYs whose last probe failed
 * @param {number} [input.maxExtra] cap on failures + demand beyond the rotation
 * @returns {{system: string, outlet: string, reason: "failure"|"demand"|"rotation"}[]}
 */
export function selectProbes({
  activeSystems,
  date,
  demandSystems = [],
  failedSystems = [],
  maxExtra = DEFAULT_MAX_EXTRA,
}) {
  const bucket = bucketForDate(date);
  const outletBySystem = new Map(activeSystems.map((s) => [s.system, s.outlet]));
  const toProbe = (reason) => (system) => ({
    system,
    outlet: outletBySystem.get(system),
    reason,
  });

  const rotation = [...outletBySystem.keys()]
    .filter((system) => rotationBucket(system) === bucket)
    .sort()
    .map(toProbe("rotation"));
  const inRotation = new Set(rotation.map((p) => p.system));

  // Only systems still active are probed; inactive ones have no feed to check.
  const extraCandidates = [
    ...failedSystems.map(toProbe("failure")),
    ...demandSystems.map(toProbe("demand")),
  ].filter((p) => p.outlet !== undefined && !inRotation.has(p.system));

  const seen = new Set();
  const extras = extraCandidates
    .filter((p) => (seen.has(p.system) ? false : (seen.add(p.system), true)))
    .slice(0, Math.max(0, maxExtra));

  return [...extras, ...rotation];
}

/**
 * Picks a system's main outlet from its outlet ids: the IMLS FSCS central
 * library is `-002` when present (see AGENTS.md), else the lowest id.
 */
export function mainOutletOf(system, outletIds) {
  const central = `${system}-002`;
  if (outletIds.includes(central)) return central;
  return [...outletIds].sort()[0];
}

/**
 * Circuit breaker for R3: after `threshold` consecutive blocked probes
 * (feed 403 or our own API answering 403/429), stop probing so a vendor
 * WAF doesn't escalate a block on the production IP.
 * Returns a new state each call (no mutation).
 */
export const BREAKER_THRESHOLD = 5;
const BLOCKED_STATUSES = new Set([403, 429]);

export function nextBreakerState(state, { blocked }) {
  const consecutive = blocked ? state.consecutive + 1 : 0;
  return {
    consecutive,
    open: state.open || consecutive >= state.threshold,
    threshold: state.threshold,
  };
}

export function initialBreakerState(threshold = BREAKER_THRESHOLD) {
  return { consecutive: 0, open: false, threshold };
}

export function isBlockedStatus(status) {
  return BLOCKED_STATUSES.has(status);
}
