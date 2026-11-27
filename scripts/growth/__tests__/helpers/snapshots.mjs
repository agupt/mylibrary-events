/** Test helpers: minimal schema-valid snapshots (offline, no fixtures on disk). */
import { SIGNAL_IDS } from "../../lib/snapshotSchema.mjs";

/** Every signal `not-configured` (S11 `not-applicable`), plus `overrides`. */
export function makeSnapshot(date, overrides = {}) {
  const blocks = Object.fromEntries(
    SIGNAL_IDS.map((id) => [id, { status: id === "S11" ? "not-applicable" : "not-configured" }]),
  );
  return {
    schemaVersion: 1,
    date,
    generatedAt: `${date}T11:23:00.000Z`,
    ...blocks,
    ...overrides,
  };
}

/** An S1 block with data. */
export const s1 = (pageviews, byPageGroup = {}) => ({ status: "ok", pageviews, visitors: pageviews, byPageGroup });

/** A daily F4 block with data. */
export const f4 = (sampled, indexed) => ({
  status: "ok",
  sampled,
  indexedByType: { library: indexed },
  coverageStates: { "Submitted and indexed": indexed },
});
