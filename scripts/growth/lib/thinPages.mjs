/**
 * S13: thin-page share (docs/growth-agent/phase1-impact.md §1 S13).
 *
 * Joins the page manifest (from `src/lib/seo/pages.ts` via pageManifest.ts)
 * with the latest S5 reading per system. A signal only: AdSense is parked.
 *
 * - A library page maps to its system; a city page to every system with a
 *   library in that city.
 * - A page is zero-event when every one of its systems has a known count of
 *   0; non-zero when any known count is > 0; otherwise unprobed (unknown).
 *   **Unprobed pages are never counted as 0.**
 * - Shares are over probed pages only (null when none are probed).
 * - Caveat: S5's `eventCount30d` is the system's main outlet (that is what
 *   `/analysis` counts), so a branch page inherits the main outlet's count.
 *
 * Pure: no I/O, no clock.
 */

/** A reading older than this is stale and treated as unknown. */
export const MAX_READING_AGE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Latest usable `eventCount30d` per system across snapshot history.
 * Failed probes (null count) never overwrite an earlier good reading;
 * readings older than `maxAgeDays` before `today` are dropped.
 *
 * @param {{date: string, S5?: {probes?: object[]}}[]} snapshots any order
 * @param {{ today: string, maxAgeDays?: number }} options
 * @returns {Map<string, {eventCount30d: number, date: string}>}
 */
export function latestCountsBySystem(snapshots, { today, maxAgeDays = MAX_READING_AGE_DAYS }) {
  const cutoff = Date.parse(`${today}T00:00:00Z`) - maxAgeDays * MS_PER_DAY;
  const ordered = [...snapshots]
    .filter((s) => typeof s?.date === "string" && Date.parse(`${s.date}T00:00:00Z`) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  const entries = ordered.flatMap((snapshot) =>
    (Array.isArray(snapshot.S5?.probes) ? snapshot.S5.probes : [])
      .filter((p) => Number.isInteger(p.eventCount30d) && p.eventCount30d >= 0)
      .map((p) => [p.system, { eventCount30d: p.eventCount30d, date: snapshot.date }]),
  );
  return new Map(entries); // later dates win
}

/** "zero" | "nonzero" | "unknown" for one page. */
export function classifyPage(page, counts) {
  const known = page.systems
    .map((system) => counts.get(system))
    .filter((reading) => reading !== undefined);
  if (known.some((r) => r.eventCount30d > 0)) return "nonzero";
  if (known.length > 0 && known.length === page.systems.length) return "zero";
  return "unknown";
}

const ratioOrNull = (part, whole) => (whole > 0 ? part / whole : null);

/**
 * Builds the S13 block.
 * @param {{path: string, type: string, systems: string[]}[]} manifest
 * @param {Map<string, {eventCount30d: number}>} counts from latestCountsBySystem
 * @param {{ indexedPaths?: Set<string>|null }} [options] paths known indexed
 *   (F4 sample); without them `indexedZeroEventShare` is null
 */
export function computeThinPages(manifest, counts, { indexedPaths = null } = {}) {
  const classified = manifest.map((page) => ({ page, kind: classifyPage(page, counts) }));
  const tally = (rows) => ({
    zero: rows.filter((r) => r.kind === "zero").length,
    probed: rows.filter((r) => r.kind !== "unknown").length,
  });

  const all = tally(classified);
  const indexed =
    indexedPaths instanceof Set
      ? tally(classified.filter((r) => indexedPaths.has(r.page.path)))
      : null;

  return {
    status: "ok",
    pages: manifest.length,
    zeroEventPages: all.zero,
    zeroEventShare: ratioOrNull(all.zero, all.probed),
    indexedZeroEventShare: indexed ? ratioOrNull(indexed.zero, indexed.probed) : null,
    unprobedPages: manifest.length - all.probed,
  };
}
