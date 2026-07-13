/**
 * Re-verifies every source:"discovered" registry entry against the
 * live page/feed title and removes entries that fail — used after guard
 * improvements to purge earlier false positives (e.g. academic LibCal
 * instances matched by a shared town name).
 *
 * Usage: node scripts/verifyDiscoveredFeeds.mjs
 */
import { readFileSync } from "node:fs";
import { readRegistry, writeDiscovered } from "./lib/registry.mjs";

const CONCURRENCY = 16;
const TIMEOUT_MS = 8000;
const ACADEMIC_MARKERS = /universit|college|schools|academy|institute/i;

const STOP_WORDS = new Set([
  "public", "library", "libraries", "district", "system", "regional",
  "county", "city", "town", "free", "memorial", "the", "of", "and", "&",
]);

const libraries = JSON.parse(
  readFileSync("src/lib/data/generated/libraries.json", "utf8"),
);
const systemNames = new Map();
for (const library of libraries) {
  systemNames.set(library.id.split("-")[0], library.system);
}

const feeds = Object.fromEntries(
  Object.entries(readRegistry()).filter(([, v]) => v.source === "discovered"),
);

function distinctiveWords(systemName) {
  return systemName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

function titleOk(title, systemName) {
  const haystack = title.toLowerCase();
  if (ACADEMIC_MARKERS.test(haystack) && !ACADEMIC_MARKERS.test(systemName)) {
    return false;
  }
  const words = distinctiveWords(systemName);
  if (words.length === 0) return true;
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits * 2 > words.length;
}

function probeUrl(entry) {
  // LibCal identity lives on the instance homepage — the ical_subscribe
  // URL returns ICS with no <title>, so always probe the homepage.
  if (entry.vendor === "libcal") {
    const slug = (entry.url ?? entry.note ?? "").match(/([a-z0-9-]+)\.libcal\.com/)?.[1];
    return slug ? `https://${slug}.libcal.com/` : null;
  }
  return entry.url ?? null;
}

const entries = Object.entries(feeds);
const removed = [];
const queue = [...entries];

async function worker() {
  while (queue.length > 0) {
    const [systemKey, entry] = queue.shift();
    const systemName = systemNames.get(systemKey) ?? "";
    const url = probeUrl(entry);
    if (!url) continue;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "library-storytime/1.0 (feed verification)" },
      });
      if (response.status === 403 || response.status === 429) {
        continue; // rate-limited — keep, cannot judge
      }
      if (!response.ok) {
        removed.push([systemKey, `HTTP ${response.status}`]);
        delete feeds[systemKey];
        continue;
      }
      const body = await response.text();
      const title = body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
      if (!titleOk(title, systemName)) {
        removed.push([systemKey, `title mismatch: "${title}" vs "${systemName}"`]);
        delete feeds[systemKey];
      }
    } catch {
      // transient network error — keep the entry
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

writeDiscovered(Object.fromEntries(
  entries.map(([key]) => [key, key in feeds ? feeds[key] : null]),
));
console.log(`Checked ${entries.length}. Removed ${removed.length}:`);
for (const [key, reason] of removed) {
  console.log(`  ${key} (${systemNames.get(key)}): ${reason}`);
}
console.log(`Remaining: ${Object.keys(feeds).length}`);
