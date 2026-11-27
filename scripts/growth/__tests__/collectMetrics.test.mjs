/**
 * The observer orchestrator with stub sources and a mocked GitHub
 * (offline: data-refresh runs `npm test`).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EXIT, parseArgs, runObserver } from "../collectMetrics.mjs";
import { parseSignalsConfig } from "../lib/loadSignalsConfig.mjs";
import { SIGNAL_IDS, validateSnapshot } from "../lib/snapshotSchema.mjs";
import { f4, makeSnapshot, s1 } from "./helpers/snapshots.mjs";

const FRIDAY = "2026-11-27";
const MONDAY = "2026-11-30";
const NOW = new Date("2026-11-27T11:23:00Z");

const CONFIG_YAML = `
version: 1
signals:
  - id: S1
    name: Traffic volume
    status: draft
    metric: S1.pageviews
    rule: { kind: threshold, gte: 100 }
    severity: info
`;
const CONFIG = parseSignalsConfig(CONFIG_YAML).data;

let cwd;
let tmp;

beforeEach(async () => {
  cwd = await mkdtemp(path.join(os.tmpdir(), "growth-observer-cwd-"));
  tmp = await mkdtemp(path.join(os.tmpdir(), "growth-observer-tmp-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
  await rm(tmp, { recursive: true, force: true });
});

/** A source that owns `ids` and returns `blocks` (or throws `error`). */
const stub = (name, ids, produce, extra = {}) => ({ name, ids, collect: vi.fn(async (ctx) => produce(ctx)), ...extra });

/** Stub sources covering every signal: S1 from `s1Block`, the rest not-configured. */
function stubSources({ s1Block = s1(150), throwing = null } = {}) {
  const others = SIGNAL_IDS.filter((id) => id !== "S1" && id !== "S11");
  return [
    stub("posthog", ["S1"], () => ({ S1: s1Block })),
    stub("rest", others, () => Object.fromEntries(others.map((id) => [id, { status: "not-configured" }]))),
    ...(throwing ? [throwing] : []),
  ];
}

function fakeGithub({ open = [], failList = false } = {}) {
  return {
    listIssues: vi.fn(async ({ label, state }) => {
      if (failList) throw new Error("gh: HTTP 502");
      if (label === "signal" && state === "open") return open;
      return [];
    }),
    ensureLabels: vi.fn(async () => {}),
    createIssue: vi.fn(async () => 101),
    commentIssue: vi.fn(async () => {}),
    pinIssue: vi.fn(async () => {}),
  };
}

const quietLog = () => ({ log: vi.fn(), warn: vi.fn() });

function run(options) {
  return runObserver({
    date: FRIDAY,
    now: NOW,
    cwd,
    env: {},
    loadConfig: () => CONFIG,
    makeTempDir: async () => tmp,
    ...quietLog(),
    ...options,
  });
}

const readSnapshot = async (root, date) => JSON.parse(await readFile(path.join(root, "reports/metrics", `${date}.json`), "utf8"));

describe("parseArgs", () => {
  test("defaults to today, live, issues on", () => {
    expect(parseArgs([], new Date("2026-11-27T05:00:00Z"))).toEqual({
      date: "2026-11-27",
      dryRun: false,
      noIssues: false,
      backfillFrom: null,
      help: false,
    });
  });

  test("reads every flag", () => {
    expect(parseArgs(["--date", "2026-11-30", "--dry-run", "--no-issues", "--backfill-from", "2026-10-30"])).toMatchObject({
      date: "2026-11-30",
      dryRun: true,
      noIssues: true,
      backfillFrom: "2026-10-30",
    });
  });

  test("rejects bad dates and unknown flags", () => {
    expect(() => parseArgs(["--date", "2026-02-30"])).toThrow(/ISO date/);
    expect(() => parseArgs(["--backfill-from"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--force"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--date", "2026-11-27", "--backfill-from", "2026-11-27"])).toThrow(/before/);
  });
});

describe("runObserver: collection", () => {
  test("one source throwing still writes the snapshot with status error, exit 1", async () => {
    const throwing = stub("fly", ["S8"], () => {
      throw new Error("boom with token=abc123secret");
    });
    const sources = stubSources().map((s) => (s.name === "rest" ? { ...s, ids: s.ids.filter((id) => id !== "S8") } : s));
    const restIds = sources[1].ids;
    sources[1] = stub("rest", restIds, () => Object.fromEntries(restIds.map((id) => [id, { status: "not-configured" }])));
    const result = await run({ sources: [...sources, throwing], noIssues: true });
    expect(result.exitCode).toBe(EXIT.SOURCE_ERROR);
    const written = await readSnapshot(cwd, FRIDAY);
    expect(validateSnapshot(written).success).toBe(true);
    expect(written.S8.status).toBe("error");
    expect(written.S8.error).not.toContain("abc123secret");
    expect(written.S1).toEqual(s1(150));
  });

  test("a source cannot write blocks it does not own", async () => {
    const sources = stubSources();
    sources[0] = stub("posthog", ["S1"], () => ({ S1: s1(150), S8: { status: "ok", requests: 1, rate5xx: 0, p95Seconds: 1 } }));
    const result = await run({ sources, noIssues: true });
    expect(result.snapshot.S8).toEqual({ status: "not-configured" });
  });

  test("an invalid block from a collector becomes an error block", async () => {
    const result = await run({ sources: stubSources({ s1Block: { status: "ok", pageviews: -1 } }), noIssues: true });
    expect(result.snapshot.S1.status).toBe("error");
    expect(result.exitCode).toBe(EXIT.SOURCE_ERROR);
  });

  test("an invalid signals.yml fails before any collection or issue", async () => {
    const sources = stubSources();
    const github = fakeGithub();
    const result = await run({
      sources,
      github,
      loadConfig: () => {
        throw new Error("signals.yml: signals.0.rule: invalid");
      },
    });
    expect(result.exitCode).toBe(EXIT.FATAL);
    expect(sources[0].collect).not.toHaveBeenCalled();
    expect(github.listIssues).not.toHaveBeenCalled();
    await expect(readdir(path.join(cwd, "reports"))).rejects.toThrow();
  });

  test("sources see history (excluding a same-day re-run) and weekly cadence", async () => {
    const dir = path.join(cwd, "reports/metrics");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-11-26.json"), JSON.stringify(makeSnapshot("2026-11-26")));
    await writeFile(path.join(dir, `${FRIDAY}.json`), JSON.stringify(makeSnapshot(FRIDAY)));
    const sources = stubSources();
    await run({ sources, noIssues: true });
    const ctx = sources[0].collect.mock.calls[0][0];
    expect(ctx.history.map((s) => s.date)).toEqual(["2026-11-26"]);
    expect(ctx.weekly).toBe(false);
    expect(ctx.date).toBe(FRIDAY);
  });

  test("stage-2 sources run after stage 1 and see its blocks", async () => {
    const S5 = { status: "ok", probes: [], probed: 0, activeTotal: 3 };
    const sources = stubSources();
    const restIds = sources[1].ids.filter((id) => id !== "S5" && id !== "S13");
    sources[1] = stub("rest", restIds, () => Object.fromEntries(restIds.map((id) => [id, { status: "not-configured" }])));
    const feed = stub("feedHealth", ["S5"], () => ({ S5 }));
    const thin = stub(
      "thinPages",
      ["S13"],
      (ctx) => ({ S13: ctx.blocks.S5 === S5 ? { status: "not-due" } : { status: "error", error: "no S5" } }),
      { stage: 2 },
    );
    const result = await run({ sources: [...sources, feed, thin], noIssues: true });
    expect(result.snapshot.S13).toEqual({ status: "not-due" });
  });
});

describe("runObserver: issues", () => {
  test("live: executes the plan (a fired trigger opens one issue)", async () => {
    const github = fakeGithub();
    const result = await run({ sources: stubSources(), github });
    expect(result.evaluation.fired.map((f) => f.signalId)).toEqual(["S1"]);
    expect(github.createIssue).toHaveBeenCalledOnce();
    const created = github.createIssue.mock.calls[0][0];
    expect(created.title).toBe("signal S1: Traffic volume");
    expect(created.body).toContain(`reports/metrics/${FRIDAY}.json`);
    expect(result.exitCode).toBe(EXIT.OK);
  });

  test("passes the observer login so only the bot's issues dedupe", async () => {
    const open = [
      { number: 5, body: "<!-- growth-observer:signal=S1 -->", author: "app/github-actions", comments: [], labels: [] },
    ];
    const github = fakeGithub({ open });
    const result = await run({ sources: stubSources(), github });
    // A marked bot issue with no state marker reads as firing/unknown fingerprint: comment, not duplicate.
    expect(github.createIssue).not.toHaveBeenCalled();
    expect(github.commentIssue).toHaveBeenCalledWith(5, expect.any(String));
    expect(result.plan[0]).toMatchObject({ action: "comment", issueNumber: 5 });
  });

  test("live: if open issues cannot be read, nothing is created (no duplicates), exit 1", async () => {
    const github = fakeGithub({ failList: true });
    const result = await run({ sources: stubSources(), github });
    expect(github.createIssue).not.toHaveBeenCalled();
    expect(result.plan).toBeNull();
    expect(result.exitCode).toBe(EXIT.SOURCE_ERROR);
  });

  test("--no-issues touches no issues", async () => {
    const github = fakeGithub();
    const result = await run({ sources: stubSources(), github, noIssues: true });
    expect(github.listIssues).not.toHaveBeenCalled();
    expect(result.plan).toBeNull();
  });

  test("an issue step failing makes the run exit 1 but the snapshot stays written", async () => {
    const github = fakeGithub();
    github.createIssue.mockRejectedValue(new Error("HTTP 502"));
    const result = await run({ sources: stubSources(), github });
    expect(result.exitCode).toBe(EXIT.SOURCE_ERROR);
    expect(validateSnapshot(await readSnapshot(cwd, FRIDAY)).success).toBe(true);
  });
});

describe("runObserver: dry run", () => {
  test("writes only to a temp dir, plans issues but performs no GitHub writes", async () => {
    const github = fakeGithub();
    const result = await run({ sources: stubSources(), github, dryRun: true });
    expect(result.outRoot).toBe(tmp);
    expect(validateSnapshot(await readSnapshot(tmp, FRIDAY)).success).toBe(true);
    await expect(readdir(path.join(cwd, "reports"))).rejects.toThrow();
    expect(result.plan[0]).toMatchObject({ action: "create", signalId: "S1" });
    expect(github.createIssue).not.toHaveBeenCalled();
    expect(github.commentIssue).not.toHaveBeenCalled();
    expect(github.ensureLabels).not.toHaveBeenCalled();
  });

  test("renders the weekly report even on a weekday, into the temp dir", async () => {
    const result = await run({ sources: stubSources(), github: fakeGithub(), dryRun: true });
    expect(result.reportPath).toBe(path.join(tmp, "reports/growth/weekly-2026-W48.md"));
    expect(await readFile(result.reportPath, "utf8")).toContain("# Weekly growth report: 2026-W48");
  });

  test("tolerates an unreadable GitHub (plans against no open issues)", async () => {
    const { log, warn } = quietLog();
    const result = await run({ sources: stubSources(), github: fakeGithub({ failList: true }), dryRun: true, log, warn });
    expect(result.plan[0].action).toBe("create");
    expect(result.exitCode).toBe(EXIT.OK);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/could not read open signal issues/));
  });
});

describe("runObserver: Monday", () => {
  test("adds the weekly F4 estimate, writes the report and posts it", async () => {
    const dir = path.join(cwd, "reports/metrics");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-11-29.json"), JSON.stringify(makeSnapshot("2026-11-29", { F4: f4(100, 70) })));
    const sources = stubSources();
    const restIds = sources[1].ids.filter((id) => id !== "F4");
    sources[1] = stub("rest", restIds, () => Object.fromEntries(restIds.map((id) => [id, { status: "not-configured" }])));
    const github = fakeGithub();
    const result = await run({
      date: MONDAY,
      now: new Date("2026-11-30T11:23:00Z"),
      sources: [...sources, stub("gsc", ["F4"], () => ({ F4: f4(100, 90) }))],
      github,
    });
    expect(result.snapshot.F4.indexedShareEstimate.value).toBe(0.8);
    expect(result.reportPath).toBe(path.join(cwd, "reports/growth/weekly-2026-W49.md"));
    expect(github.createIssue).toHaveBeenCalledWith(expect.objectContaining({ title: "Weekly growth report" }));
    expect(github.commentIssue).toHaveBeenCalledWith(101, expect.stringContaining("# Weekly growth report: 2026-W49"));
  });

  test("weekday live runs write no report", async () => {
    const result = await run({ sources: stubSources(), github: fakeGithub() });
    expect(result.reportPath).toBeNull();
  });
});

describe("runObserver: --backfill-from", () => {
  const fakeClient = () => ({
    searchAnalytics: vi.fn(async (body) =>
      body.dimensions[0] === "date"
        ? { rows: [{ keys: [body.startDate], clicks: 10, impressions: 400, ctr: 0.025, position: 9 }] }
        : { rows: [] },
    ),
  });

  test("writes one backfill snapshot per missing run date, F1 only", async () => {
    const dir = path.join(cwd, "reports/metrics");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-11-25.json"), JSON.stringify(makeSnapshot("2026-11-25")));
    const client = fakeClient();
    const result = await run({
      sources: stubSources(),
      noIssues: true,
      backfillFrom: "2026-11-20", // run dates 11-23 .. 11-26; 11-25 exists
      connectGsc: async () => ({ client, secrets: [] }),
    });
    const files = (await readdir(dir)).sort();
    expect(files).toEqual(["2026-11-23.json", "2026-11-24.json", "2026-11-25.json", "2026-11-26.json", `${FRIDAY}.json`]);
    const backfilled = await readSnapshot(cwd, "2026-11-23");
    expect(backfilled).toMatchObject({ backfill: true, F1: { status: "ok", dataDate: "2026-11-20", clicks: 10 } });
    expect(client.searchAnalytics).toHaveBeenCalledTimes(6);
    expect(result.backfill).toEqual({ written: ["2026-11-23", "2026-11-24", "2026-11-26"], failed: [] });
    expect(result.exitCode).toBe(EXIT.OK);
  });

  test("without GSC credentials the backfill is reported, not silently skipped", async () => {
    const { log, warn } = quietLog();
    const result = await run({
      sources: stubSources(),
      noIssues: true,
      backfillFrom: "2026-11-20",
      connectGsc: async () => null,
      log,
      warn,
    });
    expect(result.exitCode).toBe(EXIT.SOURCE_ERROR);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/backfill needs GSC/));
  });

  test("a failed date is not written, so a later backfill retries it", async () => {
    const client = {
      searchAnalytics: vi.fn(async (body) => {
        if (body.startDate === "2026-11-21") throw new Error("HTTP 500");
        return { rows: [] };
      }),
    };
    const result = await run({
      sources: stubSources(),
      noIssues: true,
      backfillFrom: "2026-11-20",
      connectGsc: async () => ({ client, secrets: [] }),
    });
    expect(result.backfill.failed).toEqual(["2026-11-24"]);
    expect(result.backfill.written).toContain("2026-11-23");
    expect(result.exitCode).toBe(EXIT.SOURCE_ERROR);
  });
});
