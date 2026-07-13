/**
 * Coverage harness — runs the full-dataset analysis:
 *
 * 1. Every library (16,883): coverage status from the feed registry
 *    (src/lib/data/feedRegistry.json — one store, provenance per entry).
 * 2. Every zip code (40,979): nearest library via a spatial grid index,
 *    and whether that nearest library has an active feed.
 *
 * Outputs:
 *  - src/lib/data/generated/coverageStats.json (consumed by /status)
 *  - reports/coverage-report-<date>.md (human-readable report)
 *
 * Usage: node scripts/coverageHarness.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const EARTH_RADIUS_MILES = 3958.8;
const GRID_DEGREES = 1;

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;

const libraries = JSON.parse(readFileSync("src/lib/data/generated/libraries.json", "utf8"));
const zips = JSON.parse(readFileSync("src/lib/data/generated/zips.json", "utf8"));
const domains = readJson("src/lib/data/generated/domains.json", {});
const platformDetection = readJson("src/lib/data/generated/platformDetection.json", {});
const registry = JSON.parse(readFileSync("src/lib/data/feedRegistry.json", "utf8"));

const SLUG_PROBE_MIN_OUTLETS = 3; // what discoverFeeds.mjs has been run with

const statusOf = (library) => registry[library.id.split("-")[0]]?.status ?? "none";
const vendorOf = (library) => registry[library.id.split("-")[0]]?.vendor ?? null;

// ---------- Part 1: library coverage ----------
const systems = new Map();
const byState = new Map();
const libraryCounts = { active: 0, detected: 0, none: 0 };

for (const library of libraries) {
  const status = statusOf(library);
  libraryCounts[status] += 1;

  const systemKey = library.id.split("-")[0];
  const system = systems.get(systemKey) ?? {
    systemKey,
    system: library.system,
    state: library.state,
    outlets: 0,
    status,
    vendor: vendorOf(library),
  };
  systems.set(systemKey, { ...system, outlets: system.outlets + 1 });

  const state = byState.get(library.state) ?? {
    state: library.state, libraries: 0, active: 0, detected: 0, zips: 0, zipsNearActive: 0,
  };
  byState.set(library.state, {
    ...state,
    libraries: state.libraries + 1,
    active: state.active + (status === "active" ? 1 : 0),
    detected: state.detected + (status === "detected" ? 1 : 0),
  });
}

const systemList = [...systems.values()];

// ---------- Decision-tree pipeline: one branch per system ----------
// Every branch is a debug point with a named human/engineering action.
const HUMAN_ACTIONS = {
  serving: "— (events flowing)",
  "calendar-id-needed": "Open the LibCal instance, pick the events calendar, add its id to the registry",
  "identity-collision": "Adjudicate which system owns the instance (same-named systems in different states)",
  "feed-empty": "Instance verified but feed has no items — check for a different public calendar",
  "feed-unverified": "Re-verify feed (possible WAF block at probe time)",
  "no-platform-found": "Domain read, no known vendor fingerprint — inspect site, identify platform or scope a site scraper",
  "site-unreachable": "Confirm the domain is right / site is up",
  "domain-unknown-probed": "Slug guessing failed and official website unknown — run findDomains for this system",
  "never-probed": "Not yet examined (small system) — extend findDomains/detectPlatforms coverage",
};

function stageForSystem(system) {
  const entry = registry[system.systemKey];
  if (entry?.status === "active") return "serving";

  const detected = platformDetection[system.systemKey];
  if (detected?.resolution && !["already-active", "activated", "error"].includes(detected.resolution)) {
    return detected.resolution; // adapter-needed:<vendor>, no-platform-found, calendar-id-needed, feed-empty, feed-unverified, site-unreachable
  }
  if (entry?.status === "detected") {
    if (/collision/i.test(entry.note ?? "")) return "identity-collision";
    return entry.vendor === "libcal" ? "calendar-id-needed" : "feed-empty";
  }
  if (system.systemKey in domains) return "no-platform-found";
  if (system.outlets >= SLUG_PROBE_MIN_OUTLETS) return "domain-unknown-probed";
  return "never-probed";
}

const pipeline = new Map();
for (const system of systemList) {
  const stage = stageForSystem(system);
  system.stage = stage;
  const bucket = pipeline.get(stage) ?? { stage, systems: 0, libraries: 0 };
  pipeline.set(stage, {
    ...bucket,
    systems: bucket.systems + 1,
    libraries: bucket.libraries + system.outlets,
  });
}
const pipelineRows = [...pipeline.values()]
  .sort((a, b) => b.libraries - a.libraries)
  .map((row) => ({
    ...row,
    humanAction:
      HUMAN_ACTIONS[row.stage] ??
      (row.stage.startsWith("adapter-needed:")
        ? `Build ${row.stage.split(":")[1]} adapter (unlocks every system on it; worst case a scraper)`
        : "Investigate"),
  }));

const systemCounts = {
  total: systemList.length,
  active: systemList.filter((s) => s.status === "active").length,
  detected: systemList.filter((s) => s.status === "detected").length,
  none: systemList.filter((s) => s.status === "none").length,
};
const byVendor = {};
for (const system of systemList) {
  if (!system.vendor) continue;
  const vendor = byVendor[system.vendor] ?? { systems: 0, libraries: 0 };
  byVendor[system.vendor] = {
    systems: vendor.systems + 1,
    libraries: vendor.libraries + system.outlets,
  };
}

// ---------- Part 2: nearest library for EVERY zip (grid index) ----------
const grid = new Map();
const cellKey = (lat, lng) =>
  `${Math.floor(lat / GRID_DEGREES)}:${Math.floor(lng / GRID_DEGREES)}`;
libraries.forEach((library, index) => {
  const key = cellKey(library.coordinates.latitude, library.coordinates.longitude);
  const cell = grid.get(key);
  if (cell) cell.push(index);
  else grid.set(key, [index]);
});

const toRad = (deg) => (deg * Math.PI) / 180;
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

function nearestLibrary(lat, lng) {
  const cellLat = Math.floor(lat / GRID_DEGREES);
  const cellLng = Math.floor(lng / GRID_DEGREES);
  for (let ring = 0; ring <= 40; ring += 1) {
    let best = null;
    for (let dLat = -ring; dLat <= ring; dLat += 1) {
      for (let dLng = -ring; dLng <= ring; dLng += 1) {
        if (Math.max(Math.abs(dLat), Math.abs(dLng)) !== ring) continue;
        const cell = grid.get(`${cellLat + dLat}:${cellLng + dLng}`);
        if (!cell) continue;
        for (const index of cell) {
          const library = libraries[index];
          const distance = haversineMiles(
            lat, lng,
            library.coordinates.latitude, library.coordinates.longitude,
          );
          if (!best || distance < best.distance) best = { library, distance };
        }
      }
    }
    // One extra ring after the first hit guarantees true nearest across
    // cell boundaries.
    if (best) {
      for (let dLat = -(ring + 1); dLat <= ring + 1; dLat += 1) {
        for (let dLng = -(ring + 1); dLng <= ring + 1; dLng += 1) {
          if (Math.max(Math.abs(dLat), Math.abs(dLng)) !== ring + 1) continue;
          const cell = grid.get(`${cellLat + dLat}:${cellLng + dLng}`);
          if (!cell) continue;
          for (const index of cell) {
            const library = libraries[index];
            const distance = haversineMiles(
              lat, lng,
              library.coordinates.latitude, library.coordinates.longitude,
            );
            if (distance < best.distance) best = { library, distance };
          }
        }
      }
      return best;
    }
  }
  return null;
}

console.log(`Analyzing nearest library for ${Object.keys(zips).length} zip codes...`);
const startedAt = process.hrtime.bigint();
let zipTotal = 0;
let zipNearActive = 0;
let zipNearDetected = 0;
let zipFailures = 0;
const distances = [];

for (const [zip, row] of Object.entries(zips)) {
  const [lat, lng, , state] = row;
  const nearest = nearestLibrary(lat, lng);
  if (!nearest) {
    zipFailures += 1;
    console.error(`  NO MATCH for zip ${zip}`);
    continue;
  }
  zipTotal += 1;
  distances.push(nearest.distance);
  const status = statusOf(nearest.library);
  if (status === "active") zipNearActive += 1;
  if (status === "detected") zipNearDetected += 1;

  const stateEntry = byState.get(state) ?? {
    state, libraries: 0, active: 0, detected: 0, zips: 0, zipsNearActive: 0,
  };
  byState.set(state, {
    ...stateEntry,
    zips: stateEntry.zips + 1,
    zipsNearActive: stateEntry.zipsNearActive + (status === "active" ? 1 : 0),
  });
}
const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

distances.sort((a, b) => a - b);
const percentile = (p) => distances[Math.floor((distances.length - 1) * p)];

const stats = {
  generatedAt: new Date().toISOString(),
  libraries: { total: libraries.length, ...libraryCounts },
  systems: systemCounts,
  pipeline: pipelineRows,
  domainsKnown: Object.keys(domains).length,
  byVendor,
  byState: [...byState.values()].sort((a, b) => a.state.localeCompare(b.state)),
  topUncoveredSystems: systemList
    .filter((s) => s.status === "none")
    .sort((a, b) => b.outlets - a.outlets)
    .slice(0, 20),
  zipAnalysis: {
    total: zipTotal,
    failures: zipFailures,
    nearestIsActive: zipNearActive,
    nearestIsDetected: zipNearDetected,
    nearestDistanceMiles: {
      median: percentile(0.5),
      p90: percentile(0.9),
      p99: percentile(0.99),
      max: distances[distances.length - 1],
    },
    elapsedMs: Math.round(elapsedMs),
  },
};

mkdirSync("src/lib/data/generated", { recursive: true });
writeFileSync(
  "src/lib/data/generated/coverageStats.json",
  JSON.stringify(stats, null, 2),
);

// ---------- Report ----------
const pct = (n, d) => ((100 * n) / d).toFixed(1) + "%";
const date = stats.generatedAt.slice(0, 10);
const activeSystems = systemList
  .filter((s) => s.status === "active")
  .sort((a, b) => b.outlets - a.outlets);
const detectedSystems = systemList
  .filter((s) => s.status === "detected")
  .sort((a, b) => b.outlets - a.outlets);

const report = `# Event Calendar Coverage Report — ${date}

Data: IMLS PLS FY2022 (${libraries.length.toLocaleString()} library outlets, ${systemCounts.total.toLocaleString()} systems), GeoNames (${zipTotal.toLocaleString()} zips).

## Library coverage

| Status | Libraries | Share | Systems |
|---|---|---|---|
| Active (live events served) | ${libraryCounts.active.toLocaleString()} | ${pct(libraryCounts.active, libraries.length)} | ${systemCounts.active} |
| Detected (vendor found, needs config) | ${libraryCounts.detected.toLocaleString()} | ${pct(libraryCounts.detected, libraries.length)} | ${systemCounts.detected} |
| No coverage | ${libraryCounts.none.toLocaleString()} | ${pct(libraryCounts.none, libraries.length)} | ${systemCounts.none} |

## Pipeline decision tree — where each system is stuck and who can unblock it

Every system sits on exactly one branch. "Human action" is the concrete
next step; branches marked engineering are adapter work that amortizes
across all systems on that vendor.

| Branch | Systems | Libraries | Next action |
|---|---|---|---|
${pipelineRows
  .map((row) => `| ${row.stage} | ${row.systems.toLocaleString()} | ${row.libraries.toLocaleString()} | ${row.humanAction} |`)
  .join("\n")}

Known official domains: ${Object.keys(domains).length} systems (source: web search; IMLS publishes none).
Honest unknown: "never-probed" systems have NOT been checked at all — no
claim is made about whether they publish calendars.

## Vendor breakdown (event-calendar platforms)

| Vendor | Systems | Library outlets |
|---|---|---|
${Object.entries(byVendor)
  .sort((a, b) => b[1].systems - a[1].systems)
  .map(([vendor, v]) => `| ${vendor} | ${v.systems} | ${v.libraries} |`)
  .join("\n")}

## Zip-code analysis (all ${zipTotal.toLocaleString()} US zips)

- Nearest library has an **active** feed: **${zipNearActive.toLocaleString()} zips (${pct(zipNearActive, zipTotal)})**
- Nearest library is on a **detected** platform: ${zipNearDetected.toLocaleString()} (${pct(zipNearDetected, zipTotal)})
- Distance to nearest library: median ${stats.zipAnalysis.nearestDistanceMiles.median.toFixed(1)} mi, p90 ${stats.zipAnalysis.nearestDistanceMiles.p90.toFixed(1)} mi, p99 ${stats.zipAnalysis.nearestDistanceMiles.p99.toFixed(1)} mi, max ${stats.zipAnalysis.nearestDistanceMiles.max.toFixed(0)} mi
- Every zip resolved to a nearest library: ${zipFailures === 0 ? "yes ✅" : `${zipFailures} failures ❌`}
- Analysis runtime: ${Math.round(elapsedMs)} ms (grid-indexed)

## Active systems (${activeSystems.length})

| System | State | Outlets | Vendor |
|---|---|---|---|
${activeSystems.map((s) => `| ${s.system} (${s.systemKey}) | ${s.state} | ${s.outlets} | ${s.vendor} |`).join("\n")}

## Detected systems awaiting configuration (${detectedSystems.length})

| System | State | Outlets | Vendor |
|---|---|---|---|
${detectedSystems.slice(0, 30).map((s) => `| ${s.system} (${s.systemKey}) | ${s.state} | ${s.outlets} | ${s.vendor} |`).join("\n")}
${detectedSystems.length > 30 ? `\n…and ${detectedSystems.length - 30} more.` : ""}

## Human action queues (highest-leverage first)

### Adapter backlog (engineering — one adapter unlocks every system on the vendor)
${(() => {
  const adapterRows = pipelineRows.filter((r) => r.stage.startsWith("adapter-needed:"));
  if (adapterRows.length === 0) return "_None identified yet — run detectPlatforms after findDomains._";
  return adapterRows
    .map((row) => {
      const vendor = row.stage.split(":")[1];
      const examples = systemList
        .filter((s) => s.stage === row.stage)
        .sort((a, b) => b.outlets - a.outlets)
        .slice(0, 5)
        .map((s) => `${s.system} (${s.state}, ${s.outlets})`)
        .join("; ");
      return `- **${vendor}**: ${row.systems} systems / ${row.libraries} libraries. E.g. ${examples}`;
    })
    .join("\n");
})()}

### Calendar ids needed (5-minute manual task each)
${systemList
  .filter((s) => s.stage === "calendar-id-needed")
  .sort((a, b) => b.outlets - a.outlets)
  .slice(0, 15)
  .map((s) => `- ${s.system} (${s.systemKey}, ${s.state}, ${s.outlets} outlets)`)
  .join("\n") || "_None._"}

### Identity collisions to adjudicate
${systemList
  .filter((s) => s.stage === "identity-collision")
  .map((s) => `- ${s.system} (${s.systemKey}, ${s.state}): ${registry[s.systemKey]?.note ?? ""}`)
  .join("\n") || "_None._"}

## Largest uncovered systems (expansion targets)

| System | State | Outlets | Branch |
|---|---|---|---|
${stats.topUncoveredSystems.map((s) => `| ${s.system} (${s.systemKey}) | ${s.state} | ${s.outlets} | ${systems.get(s.systemKey)?.stage ?? "?"} |`).join("\n")}
`;

mkdirSync("reports", { recursive: true });
const reportPath = `reports/coverage-report-${date}.md`;
writeFileSync(reportPath, report);
console.log(`\nLibraries: ${libraries.length} | active ${libraryCounts.active} | detected ${libraryCounts.detected} | none ${libraryCounts.none}`);
console.log(`Zips: ${zipTotal} analyzed in ${Math.round(elapsedMs)}ms | nearest-active ${zipNearActive} (${pct(zipNearActive, zipTotal)}) | failures ${zipFailures}`);
console.log(`Wrote src/lib/data/generated/coverageStats.json and ${reportPath}`);
