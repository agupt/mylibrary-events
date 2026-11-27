/**
 * S5 feed health + S13 thin pages (docs/growth-agent/phase1-impact.md §1).
 *
 * S5 probes production `GET /api/libraries/<main-outlet>/analysis` for
 * today's probe set (lib/probeSelection.mjs). `/analysis` does live vendor
 * feed fetches, so this is deliberately gentle: concurrency 2, a jittered
 * pause between requests, a per-day cache-buster, and a circuit breaker
 * that stops after 5 consecutive blocked probes (risk R3).
 *
 * S13 joins the page manifest (pageManifest.ts, run with tsx) with the
 * latest S5 reading per system (lib/thinPages.mjs).
 *
 * Collectors never throw: a failure becomes a `status: "error"` block
 * with a sanitized message.
 */
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sanitizeError } from "../lib/snapshotSchema.mjs";
import {
  DEFAULT_MAX_EXTRA,
  failedSystemsFrom,
  initialBreakerState,
  isBlockedStatus,
  mainOutletOf,
  SKIPPED_ERROR,
  nextBreakerState,
  selectProbes,
} from "../lib/probeSelection.mjs";
import { computeThinPages, latestCountsBySystem } from "../lib/thinPages.mjs";

export const DEFAULT_BASE_URL = "https://mylibrary-events.com";
export const PROBE_CONCURRENCY = 2;
export const PROBE_TIMEOUT_MS = 45_000;
const PAUSE_BASE_MS = 750;
const PAUSE_JITTER_MS = 750;
const USER_AGENT = "library-storytime-growth-observer/1.0";
const SYSTEM_ID = /^[A-Z]{2}\d{4}$/;
const OUTLET_ID = /^[A-Z]{2}\d{4}-\d{3}$/;
const MANIFEST_MAX_BUFFER = 64 * 1024 * 1024;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultPause = () => PAUSE_BASE_MS + Math.floor(Math.random() * PAUSE_JITTER_MS);

// ---- active systems -------------------------------------------------------

/**
 * Every active system in the committed feed registry, with its main outlet
 * from the IMLS directory. Systems with no outlet in the directory are
 * skipped (nothing to probe).
 */
export async function loadActiveSystems({ cwd = process.cwd() } = {}) {
  const [registry, libraries] = await Promise.all([
    readJson(path.join(cwd, "src/lib/data/feedRegistry.json")),
    readJson(path.join(cwd, "src/lib/data/generated/libraries.json")),
  ]);
  return activeSystemsFrom(registry, libraries);
}

/** Pure part of loadActiveSystems. */
export function activeSystemsFrom(registry, libraries) {
  const active = new Set(
    Object.entries(registry ?? {})
      .filter(([system, entry]) => SYSTEM_ID.test(system) && entry?.status === "active")
      .map(([system]) => system),
  );
  const outletsBySystem = new Map();
  for (const library of Array.isArray(libraries) ? libraries : []) {
    const id = library?.id;
    if (typeof id !== "string" || !OUTLET_ID.test(id)) continue;
    const system = id.split("-")[0];
    if (!active.has(system)) continue;
    outletsBySystem.set(system, [...(outletsBySystem.get(system) ?? []), id]);
  }
  return [...outletsBySystem.entries()]
    .map(([system, outlets]) => ({ system, outlet: mainOutletOf(system, outlets) }))
    .sort((a, b) => a.system.localeCompare(b.system));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

// ---- one probe ------------------------------------------------------------

const failedProbe = (system, outlet, error, extra = {}) => ({
  system,
  outlet,
  feedReachable: null,
  httpStatus: null,
  eventCount30d: null,
  ...extra,
  error: sanitizeError(error),
});

const validStatus = (status) =>
  Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;

/**
 * Maps one `/analysis` HTTP response to an S5 probe row.
 * `httpStatus` is the FEED's status as `/analysis` saw it; failures of our
 * own API are reported in `error` (and the row is re-queued tomorrow).
 * An unreachable feed has `eventCount30d: null`, never 0 (it was not counted).
 */
export function parseAnalysisResponse({ system, outlet, httpStatus, body }) {
  if (httpStatus !== 200 || body?.success !== true) {
    return failedProbe(system, outlet, `analysis HTTP ${httpStatus}`);
  }
  const data = body.data ?? {};
  if (data.coverage?.status !== "active" || !data.probe) {
    return failedProbe(system, outlet, "system not active in the deployed registry");
  }
  const { probe } = data;
  const feedStatus = validStatus(probe.feedHttpStatus);
  if (probe.feedReachable !== true) {
    return failedProbe(
      system,
      outlet,
      feedStatus === null ? "feed unreachable" : `feed unreachable (HTTP ${feedStatus})`,
      { feedReachable: false, httpStatus: feedStatus },
    );
  }
  if (probe.error !== undefined || !Number.isInteger(probe.eventCount) || probe.eventCount < 0) {
    return failedProbe(system, outlet, "feed probe failed", {
      feedReachable: true,
      httpStatus: feedStatus,
    });
  }
  return {
    system,
    outlet,
    feedReachable: true,
    httpStatus: feedStatus,
    eventCount30d: probe.eventCount,
  };
}

/** Fetches and parses one probe. Never throws. */
export async function probeOne({ system, outlet }, { baseUrl, date, fetch, timeoutMs }) {
  if (!OUTLET_ID.test(outlet) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { probe: failedProbe(system, outlet, "invalid outlet id or date"), apiStatus: null };
  }
  const url = `${baseUrl}/api/libraries/${outlet}/analysis?observer=${date}`;
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null);
    return {
      probe: parseAnalysisResponse({ system, outlet, httpStatus: response.status, body }),
      apiStatus: response.status,
    };
  } catch (error) {
    return { probe: failedProbe(system, outlet, error), apiStatus: null };
  }
}

// ---- the probe run --------------------------------------------------------

/**
 * Probes `selected` with a small worker pool. After the breaker opens the
 * remaining systems are recorded as skipped errors (so they re-queue)
 * rather than silently dropped. Output order matches `selected`.
 */
export async function probeSystems(
  selected,
  {
    baseUrl = DEFAULT_BASE_URL,
    date,
    fetch = globalThis.fetch,
    concurrency = PROBE_CONCURRENCY,
    timeoutMs = PROBE_TIMEOUT_MS,
    sleep = defaultSleep,
    pauseMs = defaultPause,
  },
) {
  const results = new Array(selected.length);
  let next = 0;
  let breaker = initialBreakerState();

  const worker = async () => {
    while (next < selected.length) {
      const index = next;
      next += 1;
      const target = selected[index];
      if (breaker.open) {
        results[index] = failedProbe(target.system, target.outlet, SKIPPED_ERROR);
        continue;
      }
      const { probe, apiStatus } = await probeOne(target, { baseUrl, date, fetch, timeoutMs });
      results[index] = probe;
      // Re-queued failures are expected to fail again; they don't trip the
      // breaker on their own (only fresh rotation/demand probes do).
      if (target.reason !== "failure") {
        breaker = nextBreakerState(breaker, {
          blocked: isBlockedStatus(apiStatus) || isBlockedStatus(probe.httpStatus),
        });
      }
      if (next < selected.length) await sleep(pauseMs());
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { probes: results, breakerOpen: breaker.open };
}

/**
 * Collects the S5 block.
 * @param {object} options
 * @param {string} options.date run date YYYY-MM-DD (UTC)
 * @param {string[]} [options.demandSystems] FSCSKEYs seen as home_system in the last 7 days
 * @param {object|null} [options.previousS5] the previous snapshot's S5 block (failures re-queue)
 * @param {{system: string, outlet: string}[]} [options.activeSystems] defaults to loadActiveSystems()
 */
export async function collectS5({
  date,
  demandSystems = [],
  previousS5 = null,
  activeSystems,
  cwd = process.cwd(),
  maxExtra = DEFAULT_MAX_EXTRA,
  ...probeOptions
}) {
  try {
    const active = activeSystems ?? (await loadActiveSystems({ cwd }));
    const selected = selectProbes({
      activeSystems: active,
      date,
      demandSystems: demandSystems.filter((s) => SYSTEM_ID.test(s)),
      failedSystems: failedSystemsFrom(previousS5),
      maxExtra,
    });
    const { probes } = await probeSystems(selected, { date, ...probeOptions });
    return { status: "ok", probes, probed: probes.length, activeTotal: active.length };
  } catch (error) {
    return { status: "error", error: sanitizeError(error) };
  }
}

// ---- S13 ------------------------------------------------------------------

const execFileAsync = promisify(execFileCallback);

/** Runs pageManifest.ts under tsx and returns the parsed manifest. */
export async function loadPageManifest({ cwd = process.cwd(), execFile = execFileAsync } = {}) {
  const tsx = path.join(cwd, "node_modules/.bin/tsx");
  const script = path.join(cwd, "scripts/growth/sources/pageManifest.ts");
  let stdout;
  try {
    ({ stdout } = await execFile(tsx, [script], { cwd, maxBuffer: MANIFEST_MAX_BUFFER }));
  } catch (error) {
    // The raw message carries absolute runner paths + stderr: log it to the
    // job output only, never into the (public) snapshot.
    console.error("pageManifest.ts failed:", error);
    throw new Error("page manifest generation failed");
  }
  return validateManifest(JSON.parse(stdout));
}

/** Never trust a subprocess's output blindly: shape-check every row. */
export function validateManifest(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("page manifest is empty or not an array");
  }
  const bad = value.find(
    (page) =>
      typeof page?.path !== "string" ||
      !page.path.startsWith("/") ||
      !["library", "city"].includes(page.type) ||
      !Array.isArray(page.systems) ||
      page.systems.length === 0 ||
      !page.systems.every((s) => SYSTEM_ID.test(s)),
  );
  if (bad !== undefined) throw new Error("page manifest has a malformed row");
  return value;
}

/**
 * Collects the S13 block.
 * @param {object} options
 * @param {string} options.date run date YYYY-MM-DD
 * @param {object[]} options.snapshots snapshot history, INCLUDING today's S5
 * @param {Set<string>|null} [options.indexedPaths] page paths known indexed (F4)
 */
export async function collectS13({
  date,
  snapshots,
  indexedPaths = null,
  loadManifest = loadPageManifest,
  cwd = process.cwd(),
}) {
  try {
    const manifest = await loadManifest({ cwd });
    const counts = latestCountsBySystem(snapshots, { today: date });
    return computeThinPages(manifest, counts, { indexedPaths });
  } catch (error) {
    return { status: "error", error: sanitizeError(error) };
  }
}
