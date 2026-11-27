import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadHistory, snapshotExists, snapshotPath, writeSnapshot } from "../lib/history.mjs";
import { makeSnapshot } from "./helpers/snapshots.mjs";

let dir;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "growth-history-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const put = (name, value) => writeFile(path.join(dir, name), typeof value === "string" ? value : JSON.stringify(value));

describe("loadHistory", () => {
  test("returns [] when the directory does not exist yet", async () => {
    const warn = vi.fn();
    expect(await loadHistory({ dir: path.join(dir, "missing"), warn })).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test("loads valid snapshots sorted by date", async () => {
    await put("2026-11-26.json", makeSnapshot("2026-11-26"));
    await put("2026-11-24.json", makeSnapshot("2026-11-24"));
    const history = await loadHistory({ dir, warn: vi.fn() });
    expect(history.map((s) => s.date)).toEqual(["2026-11-24", "2026-11-26"]);
  });

  test("skips malformed files with a warning instead of failing the run", async () => {
    const warn = vi.fn();
    await put("2026-11-24.json", "{ not json");
    await put("2026-11-25.json", { ...makeSnapshot("2026-11-25"), S1: { status: "bogus" } });
    await put("2026-11-26.json", makeSnapshot("2026-11-27")); // date does not match the name
    await put("2026-11-27.json", makeSnapshot("2026-11-27"));
    const history = await loadHistory({ dir, warn });
    expect(history.map((s) => s.date)).toEqual(["2026-11-27"]);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map((call) => call[0]).join("\n")).toMatch(/2026-11-24\.json[\s\S]*2026-11-25\.json[\s\S]*2026-11-26\.json/);
  });

  test("ignores files that are not dated snapshots", async () => {
    const warn = vi.fn();
    await put(".gitkeep", "");
    await put("notes.md", "hi");
    await put("2026-11-27.json", makeSnapshot("2026-11-27"));
    expect((await loadHistory({ dir, warn })).length).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("writeSnapshot", () => {
  test("writes pretty JSON at reports/metrics/<date>.json, creating the directory", async () => {
    const target = path.join(dir, "nested/metrics");
    const snapshot = makeSnapshot("2026-11-27");
    const written = await writeSnapshot({ dir: target, snapshot });
    expect(written).toBe(snapshotPath(target, "2026-11-27"));
    const text = await readFile(written, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(snapshot);
    expect(await snapshotExists({ dir: target, date: "2026-11-27" })).toBe(true);
    expect(await snapshotExists({ dir: target, date: "2026-11-28" })).toBe(false);
  });

  test("refuses to write an invalid snapshot", async () => {
    const bad = { ...makeSnapshot("2026-11-27"), S1: { status: "ok" } };
    await expect(writeSnapshot({ dir, snapshot: bad })).rejects.toThrow(/invalid snapshot/);
    expect(await snapshotExists({ dir, date: "2026-11-27" })).toBe(false);
  });
});
