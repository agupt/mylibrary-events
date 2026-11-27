import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { COVERAGE_STATS_PATH, collectS10, parseCoverageStats } from "../sources/coverage.mjs";

const stats = {
  generatedAt: "2026-11-23T19:56:22.694Z",
  systems: { total: 9234, active: 927, detected: 114, none: 8193 },
  pipeline: [
    { stage: "never-probed", systems: 6431, libraries: 6431, humanAction: "…" },
    { stage: "serving", systems: 927, libraries: 5314, humanAction: "…" },
  ],
  zipAnalysis: { total: 40979, failures: 0, nearestIsActive: 13188 },
};

function repoWith(contents) {
  const dir = mkdtempSync(path.join(tmpdir(), "s10-"));
  const file = path.join(dir, COVERAGE_STATS_PATH);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
  return dir;
}

describe("parseCoverageStats", () => {
  test("maps the harness output to S10 (zip reach as a percent)", () => {
    const block = parseCoverageStats(stats);
    expect(block).toEqual({
      status: "ok",
      coverageGeneratedAt: "2026-11-23T19:56:22.694Z",
      zipReachPct: 32.18,
      systemsActive: 927,
      pipeline: { "never-probed": 6431, serving: 927 },
    });
    expect(signalSchemas.S10.safeParse(block).success).toBe(true);
  });

  test("rejects impossible or malformed input", () => {
    expect(() =>
      parseCoverageStats({ ...stats, zipAnalysis: { total: 1, nearestIsActive: 2 } }),
    ).toThrow(/exceeds/);
    expect(() => parseCoverageStats({ ...stats, generatedAt: "yesterday" })).toThrow();
  });
});

describe("collectS10", () => {
  test("reads the committed file (the real one validates)", async () => {
    const block = await collectS10();
    expect(block.status).toBe("ok");
    expect(signalSchemas.S10.safeParse(block).success).toBe(true);
  });

  test("missing, non-JSON or wrong-shape files → error blocks", async () => {
    const missing = await collectS10({ cwd: mkdtempSync(path.join(tmpdir(), "s10-")) });
    expect(missing.status).toBe("error");
    expect((await collectS10({ cwd: repoWith("{not json") })).status).toBe("error");
    const wrongShape = await collectS10({ cwd: repoWith(JSON.stringify({ systems: {} })) });
    expect(wrongShape).toEqual({ status: "error", error: "coverageStats.json has an unexpected shape" });
    expect(signalSchemas.S10.safeParse(wrongShape).success).toBe(true);
  });
});
