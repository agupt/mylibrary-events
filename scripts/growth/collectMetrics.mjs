/**
 * Growth observer entrypoint (docs/growth-agent/phase1-impact.md, WS-C).
 *
 *   node scripts/growth/collectMetrics.mjs [--date YYYY-MM-DD] [--dry-run]
 *        [--no-issues] [--backfill-from YYYY-MM-DD]
 *
 * One run: every collector → `reports/metrics/<date>.json` (validated) →
 * evaluateTriggers → planIssueActions → `gh` (github.mjs). Mondays also
 * write `reports/growth/weekly-YYYY-Www.md` and comment it on the rolling
 * report issue. Deterministic, no LLM (P1). Observation only: no agent acts
 * on what it opens.
 *
 * - `--dry-run`: snapshot + report go to a temp dir; GitHub is read (to
 *   show the issue plan) but never written. The report renders every day.
 * - `--no-issues`: no issue reads or writes (the snapshot is still written).
 * - `--backfill-from D`: first writes F1-only history snapshots (marked
 *   `backfill: true`) for data dates D..yesterday's data date, skipping run
 *   dates that already have a file.
 *
 * Exit: 0 clean; 1 a source read `error`, an issue step failed or the
 * backfill was incomplete (the snapshot is still written, so the workflow
 * commits it, then fails so the failed-run email reaches Amool); 2 fatal
 * (invalid signals.yml, bad arguments, or an unwritable snapshot).
 *
 * Needs Node >= 22.18: collectors import src/lib/analytics/pageType.ts via
 * Node's built-in type stripping (the workflow pins Node 22.x).
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  assembleSnapshot,
  backfillRunDates,
  backfillSnapshot,
  errorSignalIds,
  normalizeBlock,
  withIndexedShareEstimate,
} from "./lib/assemble.mjs";
import { falsePositiveStats } from "./lib/baselineStats.mjs";
import { assertIsoDate, collectBlock, errorBlock, isWeeklyRun, todayUtc } from "./lib/collectBlock.mjs";
import { evaluateTriggers } from "./lib/evaluateTriggers.mjs";
import { METRICS_DIR, loadHistory, snapshotExists, writeSnapshot } from "./lib/history.mjs";
import { loadSignalsConfig } from "./lib/loadSignalsConfig.mjs";
import { needsDataEvidence } from "./lib/needsDataLinks.mjs";
import { gscDataDate } from "./lib/parseGsc.mjs";
import { SIGNAL_LABEL, planIssueActions } from "./lib/planIssueActions.mjs";
import { formatRunSummary, renderWeeklyReport, weeklyReportPath } from "./lib/renderWeeklyReport.mjs";
import { createGhRunner, createGithub, dryRunGithub, executeIssuePlan, postWeeklyReport } from "./github.mjs";

export const EXIT = Object.freeze({ OK: 0, SOURCE_ERROR: 1, FATAL: 2 });
export const DEFAULT_OBSERVER_LOGIN = "github-actions[bot]";
const NEEDS_DATA_LABEL = "needs-data";
/** Env values scrubbed from any error a source throws past its own guard. */
const SECRET_ENV = ["POSTHOG_PERSONAL_API_KEY", "GSC_SERVICE_ACCOUNT_JSON", "BING_WEBMASTER_API_KEY", "CRUX_API_KEY", "FLY_API_TOKEN"];
const MIN_NODE = [22, 18];

const errorText = (error) => (error instanceof Error ? error.message : String(error));

// ---- arguments ------------------------------------------------------------

const FLAGS = new Set(["--dry-run", "--no-issues", "--help"]);
const VALUED = new Set(["--date", "--backfill-from"]);

/** CLI arguments → options. Throws on anything unexpected. */
export function parseArgs(argv, now = new Date()) {
  const options = { date: todayUtc(now), dryRun: false, noIssues: false, backfillFrom: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (FLAGS.has(arg)) {
      const name = { "--dry-run": "dryRun", "--no-issues": "noIssues", "--help": "help" }[arg];
      options[name] = true;
    } else if (VALUED.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      options[arg === "--date" ? "date" : "backfillFrom"] = assertIsoDate(value);
      i += 1;
    } else {
      throw new Error(`unknown argument ${JSON.stringify(arg)}`);
    }
  }
  if (options.backfillFrom !== null && options.backfillFrom >= options.date) {
    throw new Error("--backfill-from must be before --date");
  }
  return options;
}

// ---- sources --------------------------------------------------------------

const notDueOrUnconfigured = (env, key) => ({ status: env[key] ? "not-due" : "not-configured" });

/**
 * The real collectors. Each owns its signal IDs; `stage: 2` sources run
 * after stage 1 and read its blocks from `ctx.blocks`. Imported lazily so
 * tests with stub sources never load network modules.
 */
export function defaultSources({ fetchImpl = globalThis.fetch } = {}) {
  const lazy = (specifier) => () => import(specifier);
  const load = {
    posthog: lazy("./sources/posthog.mjs"),
    gsc: lazy("./sources/gsc.mjs"),
    bing: lazy("./sources/bing.mjs"),
    coverage: lazy("./sources/coverage.mjs"),
    crux: lazy("./sources/crux.mjs"),
    psi: lazy("./sources/psi.mjs"),
    fly: lazy("./sources/fly.mjs"),
    feedHealth: lazy("./sources/feedHealth.mjs"),
    assemble: lazy("./lib/assemble.mjs"),
  };
  return [
    {
      name: "posthog",
      ids: ["S1", "S2", "S3", "S4", "S9", "S12", "F6", "F7", "F8", "F10"],
      collect: async ({ date, env }) => (await load.posthog()).collectPosthog({ date, env, fetchImpl }),
    },
    {
      name: "gsc",
      ids: ["F1", "F2", "F3", "F4"],
      collect: async ({ date, env, weekly }) => (await load.gsc()).collectGsc({ date, env, fetchImpl, weekly }),
    },
    {
      name: "bing",
      ids: ["F5"],
      collect: async ({ date, env, weekly }) => (await load.bing()).collectBing({ date, env, fetchImpl, weekly }),
    },
    { name: "coverage", ids: ["S10"], collect: async ({ cwd }) => ({ S10: await (await load.coverage()).collectS10({ cwd }) }) },
    {
      name: "crux",
      ids: ["S6"],
      collect: async ({ env, weekly }) => ({
        S6: weekly ? await (await load.crux()).collectS6({ env, fetch: fetchImpl }) : notDueOrUnconfigured(env, "CRUX_API_KEY"),
      }),
    },
    {
      name: "psi",
      ids: ["S7"],
      collect: async ({ env, weekly }) => ({
        S7: weekly ? await (await load.psi()).collectS7({ env, fetch: fetchImpl }) : notDueOrUnconfigured(env, "CRUX_API_KEY"),
      }),
    },
    { name: "fly", ids: ["S8"], collect: async ({ env }) => ({ S8: await (await load.fly()).collectS8({ env, fetch: fetchImpl }) }) },
    {
      name: "feedHealth",
      ids: ["S5"],
      collect: async ({ date, history, cwd }) => {
        const { demandSystemsFrom, latestBlockBefore } = await load.assemble();
        const S5 = await (await load.feedHealth()).collectS5({
          date,
          demandSystems: demandSystemsFrom(history, date),
          previousS5: latestBlockBefore(history, date, "S5"),
          cwd,
          fetch: fetchImpl,
        });
        return { S5 };
      },
    },
    {
      name: "thinPages",
      ids: ["S13"],
      stage: 2,
      collect: async ({ date, history, cwd, weekly, blocks }) => {
        if (!weekly) return { S13: { status: "not-due" } };
        const snapshots = [...history, { date, S5: blocks.S5 }];
        // F4 samples carry no per-URL results yet, so indexedPaths is unknown (null).
        return { S13: await (await load.feedHealth()).collectS13({ date, snapshots, cwd }) };
      },
    },
  ];
}

/** Runs one source; a throw becomes error blocks; foreign IDs are dropped. */
async function runSource(source, ctx, secrets) {
  try {
    const blocks = (await source.collect(ctx)) ?? {};
    return Object.fromEntries(source.ids.filter((id) => id in blocks).map((id) => [id, blocks[id]]));
  } catch (error) {
    const block = errorBlock(error, secrets);
    return Object.fromEntries(source.ids.map((id) => [id, block]));
  }
}

async function collectAll(sources, ctx, secrets) {
  const stage = async (list, blocks) => {
    const results = await Promise.all(list.map((source) => runSource(source, { ...ctx, blocks }, secrets)));
    return Object.assign({}, blocks, ...results);
  };
  const first = await stage(sources.filter((s) => (s.stage ?? 1) === 1), {});
  return stage(sources.filter((s) => s.stage === 2), first);
}

// ---- backfill -------------------------------------------------------------

/** The real GSC connection for the backfill, or null when unconfigured. */
async function connectGscDefault({ env, fetchImpl }) {
  const json = env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  const siteUrl = env.GSC_SITE_URL?.trim();
  if (!json || !siteUrl) return null;
  const { parseServiceAccount, fetchAccessToken } = await import("./sources/gscAuth.mjs");
  const { createGscClient } = await import("./sources/gsc.mjs");
  const serviceAccount = parseServiceAccount(json);
  const accessToken = await fetchAccessToken({ serviceAccount, fetchImpl });
  return { client: createGscClient({ accessToken, siteUrl, fetchImpl }), secrets: [serviceAccount.privateKey, accessToken] };
}

async function runBackfill({ from, date, history, metricsOut, realMetricsDir, env, fetchImpl, connectGsc, now, warn, log }) {
  const known = new Set(history.map((s) => s.date));
  const dates = [];
  for (const runDate of backfillRunDates(from, date)) {
    if (!known.has(runDate) && !(await snapshotExists({ dir: realMetricsDir, date: runDate }))) dates.push(runDate);
  }
  const result = { written: [], failed: [], snapshots: [] };
  if (dates.length === 0) return result;

  const connection = await connectGsc({ env, fetchImpl });
  if (connection === null) {
    warn("growth-observer: --backfill-from: backfill needs GSC (GSC_SERVICE_ACCOUNT_JSON, GSC_SITE_URL); nothing backfilled");
    return { ...result, failed: dates };
  }
  const { collectF1ForDate } = await import("./sources/gsc.mjs");
  for (const runDate of dates) {
    const F1 = await collectBlock("F1", () => collectF1ForDate({ client: connection.client, dataDate: gscDataDate(runDate) }), {
      secrets: connection.secrets,
    });
    if (F1.status === "error") {
      warn(`growth-observer: backfill ${runDate} (data ${gscDataDate(runDate)}) failed: ${F1.error}`);
      result.failed.push(runDate);
      continue;
    }
    const snapshot = backfillSnapshot({ runDate, generatedAt: now.toISOString(), F1 });
    await writeSnapshot({ dir: metricsOut, snapshot });
    result.written.push(runDate);
    result.snapshots.push(snapshot);
  }
  log(`growth-observer: backfill wrote ${result.written.length} snapshot(s), ${result.failed.length} failed`);
  return result;
}

// ---- GitHub ---------------------------------------------------------------

async function runIssues({ github, evaluation, now, observerLogin, dryRun, warn, log }) {
  let open;
  try {
    open = await github.listIssues({ label: SIGNAL_LABEL, state: "open" });
  } catch (error) {
    if (!dryRun) {
      // Without the open list, dedupe is impossible: creating would duplicate.
      warn(`growth-observer: could not read open signal issues, no issue actions taken: ${errorText(error)}`);
      return { plan: null, failed: true };
    }
    warn(`growth-observer: dry run: could not read open signal issues (${errorText(error)}); planning against none`);
    open = [];
  }
  const plan = planIssueActions(evaluation, open, now, { observerLogin });
  const result = await executeIssuePlan(plan, github, { log });
  for (const e of result.errors) warn(`growth-observer: issue ${e.action} for ${e.signalId} failed: ${e.error}`);
  return { plan, failed: result.errors.length > 0 };
}

async function readOrNull(read, label, warn) {
  try {
    return await read();
  } catch (error) {
    warn(`growth-observer: could not read ${label}: ${errorText(error)}`);
    return null;
  }
}

async function runWeeklyReport({ github, date, snapshots, evaluation, config, snapshot, outRoot, post, observerLogin, warn }) {
  const needsData = github
    ? await readOrNull(
        async () => needsDataEvidence(await github.listIssues({ label: NEEDS_DATA_LABEL, state: "open" }), { evaluation, config, snapshot }),
        "needs-data issues",
        warn,
      )
    : null;
  const falsePositives = github
    ? await readOrNull(async () => falsePositiveStats(await github.listIssues({ label: SIGNAL_LABEL, state: "closed" })), "closed signal issues", warn)
    : null;
  const markdown = renderWeeklyReport({ date, snapshots, evaluation, config, needsData, falsePositives });
  const reportPath = path.join(outRoot, weeklyReportPath(date));
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown);
  if (!post || !github) return { reportPath, failed: false };
  try {
    await postWeeklyReport(github, { markdown, date, observerLogin, warn });
    return { reportPath, failed: false };
  } catch (error) {
    warn(`growth-observer: could not post the weekly report: ${errorText(error)}`);
    return { reportPath, failed: true };
  }
}

// ---- the run --------------------------------------------------------------

/**
 * One observer run. Everything with side effects is injectable for tests.
 * @returns {Promise<{ exitCode, snapshot, evaluation, plan, outRoot, reportPath, backfill }>}
 */
export async function runObserver({
  date,
  now = new Date(),
  dryRun = false,
  noIssues = false,
  backfillFrom = null,
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
  sources = defaultSources({ fetchImpl }),
  github = undefined,
  observerLogin = env.GROWTH_OBSERVER_LOGIN?.trim() || DEFAULT_OBSERVER_LOGIN,
  loadConfig = loadSignalsConfig,
  connectGsc = connectGscDefault,
  makeTempDir = () => mkdtemp(path.join(os.tmpdir(), "growth-observer-dry-run-")),
  log = console.log,
  warn = console.warn,
}) {
  const empty = { snapshot: null, evaluation: null, plan: null, outRoot: null, reportPath: null, backfill: null };
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    warn(`growth-observer: invalid signals config, nothing collected: ${errorText(error)}`);
    return { ...empty, exitCode: EXIT.FATAL };
  }

  const outRoot = dryRun ? await makeTempDir() : cwd;
  const realMetricsDir = path.join(cwd, METRICS_DIR);
  const metricsOut = path.join(outRoot, METRICS_DIR);
  const secrets = SECRET_ENV.map((name) => env[name]).filter(Boolean);
  let history = (await loadHistory({ dir: realMetricsDir, warn })).filter((s) => s.date < date);
  let failed = false;

  let backfill = null;
  if (backfillFrom !== null) {
    backfill = await runBackfill({ from: backfillFrom, date, history, metricsOut, realMetricsDir, env, fetchImpl, connectGsc, now, warn, log });
    history = [...history, ...backfill.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    failed ||= backfill.failed.length > 0;
    backfill = { written: backfill.written, failed: backfill.failed };
  }

  const weekly = isWeeklyRun(date);
  const blocks = await collectAll(sources, { date, weekly, env, cwd, history }, secrets);
  if (weekly) blocks.F4 = withIndexedShareEstimate(normalizeBlock("F4", blocks.F4), history, date);
  const snapshot = assembleSnapshot({ date, generatedAt: now.toISOString(), blocks });
  try {
    await writeSnapshot({ dir: metricsOut, snapshot });
  } catch (error) {
    warn(`growth-observer: ${errorText(error)}`);
    return { ...empty, snapshot, outRoot, backfill, exitCode: EXIT.FATAL };
  }
  failed ||= errorSignalIds(snapshot).length > 0;

  const snapshots = [...history, snapshot];
  const evaluation = evaluateTriggers(config, snapshots, date);
  const liveGithub = github === undefined ? createGithub(createGhRunner({ env })) : github;
  const gh = liveGithub && dryRun ? dryRunGithub(liveGithub, { log }) : liveGithub;

  let plan = null;
  if (!noIssues && gh) {
    const issues = await runIssues({ github: gh, evaluation, now, observerLogin, dryRun, warn, log });
    plan = issues.plan;
    failed ||= issues.failed;
  }

  let reportPath = null;
  if (weekly || dryRun) {
    const report = await runWeeklyReport({
      github: noIssues ? null : gh,
      date,
      snapshots,
      evaluation,
      config,
      snapshot,
      outRoot,
      post: weekly && !noIssues,
      observerLogin,
      warn,
    });
    reportPath = report.reportPath;
    failed ||= report.failed;
  }

  log(formatRunSummary({ snapshot, evaluation, plan, dryRun }));
  log(`growth-observer: snapshot ${path.join(metricsOut, `${date}.json`)}${reportPath ? `, report ${reportPath}` : ""}`);
  return { exitCode: failed ? EXIT.SOURCE_ERROR : EXIT.OK, snapshot, evaluation, plan, outRoot, reportPath, backfill };
}

// ---- CLI ------------------------------------------------------------------

const USAGE = `usage: node scripts/growth/collectMetrics.mjs [--date YYYY-MM-DD] [--dry-run] [--no-issues] [--backfill-from YYYY-MM-DD]`;

function hasTypeStripping(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

/** Local runs read a gitignored .env.local (never in CI). */
function loadLocalEnv(cwd) {
  if (process.env.CI) return;
  try {
    process.loadEnvFile(path.join(cwd, ".env.local"));
  } catch {
    // absent or unreadable: every source then reads not-configured
  }
}

async function main(argv) {
  if (!hasTypeStripping()) {
    console.error(`growth-observer: needs Node >= ${MIN_NODE.join(".")} (type stripping for pageType.ts), got ${process.versions.node}`);
    return EXIT.FATAL;
  }
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`growth-observer: ${errorText(error)}\n${USAGE}`);
    return EXIT.FATAL;
  }
  if (options.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  loadLocalEnv(process.cwd());
  const { exitCode } = await runObserver({ ...options, env: process.env });
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      const secrets = SECRET_ENV.map((name) => process.env[name]).filter(Boolean);
      console.error(`growth-observer: fatal: ${errorBlock(error, secrets).error}`);
      process.exitCode = EXIT.FATAL;
    },
  );
}
