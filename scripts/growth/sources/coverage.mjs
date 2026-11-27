/**
 * S10: coverage reach from the committed coverage harness output
 * (docs/growth-agent/phase1-impact.md §1 S10).
 *
 * Reads `src/lib/data/generated/coverageStats.json`, which data-refresh
 * commits weekly. Never re-runs the harness: data-refresh owns that fact.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { sanitizeError } from "../lib/snapshotSchema.mjs";

export const COVERAGE_STATS_PATH = "src/lib/data/generated/coverageStats.json";
const PERCENT_DECIMALS = 2;
const STAGE_KEY = /^[A-Za-z0-9$][A-Za-z0-9._:-]{0,63}$/;

/** Only the fields S10 reads; the rest of the file is ignored. */
const coverageStatsSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  systems: z.object({ active: z.number().int().nonnegative() }),
  pipeline: z.array(
    z.object({ stage: z.string().regex(STAGE_KEY), systems: z.number().int().nonnegative() }),
  ),
  zipAnalysis: z.object({
    total: z.number().int().positive(),
    nearestIsActive: z.number().int().nonnegative(),
  }),
});

const round = (value, decimals) => Number(value.toFixed(decimals));

/** Pure: coverageStats.json contents → S10 block (throws on bad shape). */
export function parseCoverageStats(raw) {
  const stats = coverageStatsSchema.parse(raw);
  const { total, nearestIsActive } = stats.zipAnalysis;
  if (nearestIsActive > total) {
    throw new Error("coverageStats: nearestIsActive exceeds total zips");
  }
  return {
    status: "ok",
    coverageGeneratedAt: stats.generatedAt,
    zipReachPct: round((nearestIsActive / total) * 100, PERCENT_DECIMALS),
    systemsActive: stats.systems.active,
    pipeline: Object.fromEntries(stats.pipeline.map(({ stage, systems }) => [stage, systems])),
  };
}

/** Collects the S10 block. Never throws. */
export async function collectS10({ cwd = process.cwd() } = {}) {
  try {
    const text = await readFile(path.join(cwd, COVERAGE_STATS_PATH), "utf8");
    return parseCoverageStats(JSON.parse(text));
  } catch (error) {
    const message = error instanceof z.ZodError ? "coverageStats.json has an unexpected shape" : error;
    return { status: "error", error: sanitizeError(message) };
  }
}
