/**
 * Snapshot history on disk: `reports/metrics/YYYY-MM-DD.json`, one file per
 * run date (docs/growth-agent/phase1-impact.md §2). The snapshot is a dated
 * reading of the sources, never a store (assumption 1), so a malformed file
 * is skipped with a warning rather than failing the run.
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSnapshot } from "./snapshotSchema.mjs";

export const METRICS_DIR = "reports/metrics";
const SNAPSHOT_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export function snapshotPath(dir, date) {
  return path.join(dir, `${date}.json`);
}

async function readSnapshotFile(filePath, expectedDate) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    return { error: `not valid JSON (${error instanceof Error ? error.message : error})` };
  }
  const result = validateSnapshot(value);
  if (!result.success) return { error: `fails the snapshot schema: ${result.error.slice(0, 300)}` };
  if (result.data.date !== expectedDate) {
    return { error: `date ${result.data.date} does not match the file name` };
  }
  return { snapshot: result.data };
}

/**
 * Every valid snapshot in `dir`, oldest first. A missing directory is an
 * empty history (the first run).
 */
export async function loadHistory({ dir, warn = console.warn }) {
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const snapshots = [];
  for (const name of names.sort()) {
    const match = SNAPSHOT_FILE.exec(name);
    if (!match) continue;
    const { snapshot, error } = await readSnapshotFile(path.join(dir, name), match[1]);
    if (error) warn(`growth-observer: skipping ${name}: ${error}`);
    else snapshots.push(snapshot);
  }
  return snapshots.sort((a, b) => a.date.localeCompare(b.date));
}

export async function snapshotExists({ dir, date }) {
  try {
    return (await stat(snapshotPath(dir, date))).isFile();
  } catch {
    return false;
  }
}

/** Validates, then writes `snapshot` as pretty JSON. Returns the file path. */
export async function writeSnapshot({ dir, snapshot }) {
  const result = validateSnapshot(snapshot);
  if (!result.success) throw new Error(`refusing to write an invalid snapshot: ${result.error}`);
  await mkdir(dir, { recursive: true });
  const filePath = snapshotPath(dir, snapshot.date);
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return filePath;
}
