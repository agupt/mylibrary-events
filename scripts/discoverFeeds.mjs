/**
 * Probes library systems for public event-calendar feeds and writes
 * verified findings to src/lib/data/feedRegistry.json as
 * source:"discovered" entries (source:"verified" entries are never touched).
 *
 * Vendors probed:
 *  - BiblioCommons: https://<slug>.bibliocommons.com/events/rss/all
 *  - LibCal:        https://<slug>.libcal.com/ (+ calendar-id extraction)
 *
 * Slugs are guessed from system names, so every hit is verified by
 * checking the feed/page title shares a distinctive word with the
 * system's name before it is trusted.
 *
 * Usage: node scripts/discoverFeeds.mjs [--min-outlets 5] [--state CA]
 */
import { readFileSync } from "node:fs";
import { readRegistry, writeDiscovered } from "./lib/registry.mjs";

const MIN_OUTLETS_DEFAULT = 5;
const CONCURRENCY = 24;
const TIMEOUT_MS = 6000;

const argValue = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : fallback;
};
const minOutlets = Number(argValue("--min-outlets", MIN_OUTLETS_DEFAULT));
const stateFilter = argValue("--state", null);

const libraries = JSON.parse(
  readFileSync("src/lib/data/generated/libraries.json", "utf8"),
);
const registry = readRegistry();

// Group into systems
const systems = new Map();
for (const library of libraries) {
  const key = library.id.split("-")[0];
  const existing = systems.get(key);
  systems.set(key, {
    systemKey: key,
    system: library.system,
    state: library.state,
    outlets: (existing?.outlets ?? 0) + 1,
  });
}

const targets = [...systems.values()].filter(
  (s) =>
    s.outlets >= minOutlets &&
    !(registry[s.systemKey]?.source === "verified") &&
    !(registry[s.systemKey]?.status === "active") &&
    (!stateFilter || s.state === stateFilter),
);
console.log(
  `Probing ${targets.length} systems (>=${minOutlets} outlets${stateFilter ? `, state ${stateFilter}` : ""})`,
);

const STOP_WORDS = new Set([
  "public", "library", "libraries", "district", "system", "regional",
  "county", "city", "town", "free", "memorial", "the", "of", "and", "&",
]);

function slugCandidates(systemName) {
  const words = systemName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  const initials = words.map((w) => w[0]).join("");
  const candidates = [
    meaningful.join(""),
    words.join(""),
    initials.length >= 3 ? initials : null,
    initials.length >= 2 ? `${initials}lib` : null,
    meaningful[0] ? `${meaningful[0]}library` : null,
  ];
  return [...new Set(candidates.filter((c) => c && c.length >= 3 && c.length <= 40))];
}

/** Distinctive words from a system name for verifying a probe hit. */
function distinctiveWords(systemName) {
  return systemName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

const ACADEMIC_MARKERS = /universit|college|schools|academy|institute|community\s+college/i;

function titleMatchesSystem(pageText, systemName) {
  const haystack = pageText.toLowerCase();
  // LibCal is dominated by academic instances — "trinity.libcal.com" is
  // Trinity University, not Trinity County Library. Reject academic
  // titles unless the system itself is academic-named.
  if (ACADEMIC_MARKERS.test(haystack) && !ACADEMIC_MARKERS.test(systemName)) {
    return false;
  }
  const words = distinctiveWords(systemName);
  if (words.length === 0) return true;
  // Majority of distinctive words must appear — a single shared word like
  // "Santa" must not match Santa Maria against Santa Monica's feed.
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits * 2 > words.length;
}

async function fetchWithTimeout(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "library-storytime/1.0 (feed discovery)" },
    redirect: "follow",
  });
  return response;
}

async function probeBiblioCommons(slug, systemName) {
  const url = `https://${slug}.bibliocommons.com/events/rss/all`;
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    const body = await response.text();
    if (!body.includes("<rss")) return null;
    const titleTag = body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    if (!titleMatchesSystem(titleTag, systemName)) return null; // wrong library
    const hasItems = body.includes("<item>");
    return {
      vendor: "bibliocommons",
      status: hasItems ? "active" : "detected",
      ...(hasItems ? { url } : {}),
      note: `discovered: ${slug}.bibliocommons.com${hasItems ? "" : " (feed empty)"}`,
    };
  } catch {
    return null;
  }
}

async function probeLibCal(slug, systemName) {
  const base = `https://${slug}.libcal.com`;
  try {
    const response = await fetchWithTimeout(`${base}/`);
    if (!response.ok) return null;
    const body = await response.text();
    const titleTag = body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    // LibCal is huge in universities — require a name match to avoid
    // attributing a college's instance to a public library system.
    if (!titleMatchesSystem(titleTag, systemName)) return null;
    const calendarOptions = [
      ...body.matchAll(/cal_id="(\d+)"(?:[^>]*)>([^<]*)</g),
    ].filter(([, id]) => Number(id) > 0);
    const eventsCalendar =
      calendarOptions.find(([, , label]) => /event/i.test(label)) ??
      calendarOptions[0];
    if (eventsCalendar) {
      const icalUrl = `${base}/ical_subscribe.php?src=p&cid=${eventsCalendar[1]}`;
      const icalResponse = await fetchWithTimeout(icalUrl);
      const ical = icalResponse.ok ? await icalResponse.text() : "";
      if (ical.startsWith("BEGIN:VCALENDAR")) {
        return {
          vendor: "libcal",
          status: "active",
          url: icalUrl,
          note: `discovered: ${slug}.libcal.com cal ${eventsCalendar[1]} (${eventsCalendar[2].trim()})`,
        };
      }
    }
    return {
      vendor: "libcal",
      status: "detected",
      note: `discovered: ${slug}.libcal.com — needs calendar id`,
    };
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeSystem(system) {
  for (const slug of slugCandidates(system.system)) {
    // Politeness delay: every *.bibliocommons.com probe hits one WAF —
    // an unthrottled run gets the whole IP blocked with 403s.
    await sleep(400);
    const bibliocommons = await probeBiblioCommons(slug, system.system);
    if (bibliocommons) return { systemKey: system.systemKey, entry: bibliocommons };
    const libcal = await probeLibCal(slug, system.system);
    if (libcal) return { systemKey: system.systemKey, entry: libcal };
  }
  return null;
}

const results = {};
let processed = 0;
let activeCount = 0;
const queue = [...targets];

async function worker() {
  while (queue.length > 0) {
    const system = queue.shift();
    const found = await probeSystem(system);
    processed += 1;
    if (found) {
      results[found.systemKey] = found.entry;
      if (found.entry.status === "active") {
        activeCount += 1;
        console.log(
          `  ACTIVE   ${found.systemKey} ${system.system} → ${found.entry.url}`,
        );
      } else {
        console.log(`  detected ${found.systemKey} ${system.system} (${found.entry.vendor})`);
      }
    }
    if (processed % 50 === 0) {
      console.log(`... ${processed}/${targets.length} probed, ${activeCount} active so far`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const merged = writeDiscovered(results);
console.log(
  `\nDone. ${Object.keys(results).length} systems found this run ` +
    `(${activeCount} active). Registry now has ${Object.keys(merged).length} entries.`,
);
