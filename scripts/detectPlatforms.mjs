/**
 * Detects each system's event-calendar platform by reading its REAL
 * website (from generated/domains.json) — no slug guessing. Fingerprints
 * vendor links on the homepage and /events page, then activates feeds
 * where an adapter exists (BiblioCommons, LibCal) and records
 * adapter-needed evidence for vendors we don't speak yet (Communico,
 * Evanced, Assabet, EventKeeper, Localist, LibraryMarket).
 *
 * Writes generated/platformDetection.json; merges verified activations
 * into feedRegistry.json (collision-guarded; verified entries untouched).
 *
 * Usage: node scripts/detectPlatforms.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readRegistry, writeDiscovered } from "./lib/registry.mjs";
import {
  activateLibcalInstance,
  fetchText,
  sleep,
  verifyBcFeed,
} from "./lib/probeHelpers.mjs";

const CONCURRENCY = 6;
const BC_VERIFY_DELAY_MS = 1500; // BiblioCommons WAF is trigger-happy

const domains = JSON.parse(readFileSync("src/lib/data/generated/domains.json", "utf8"));
const feeds = readRegistry();

const FINGERPRINTS = [
  { vendor: "bibliocommons", pattern: /([a-z0-9-]+)\.bibliocommons\.com/i },
  { vendor: "libcal", pattern: /([a-z0-9-]+)\.libcal\.com/i },
  { vendor: "communico", pattern: /(attend\.[a-z0-9.-]+)|([a-z0-9-]+\.communico\.(?:co|app))/i },
  { vendor: "evanced", pattern: /([a-z0-9-]+)\.evanced\.info|signupware/i },
  { vendor: "assabet", pattern: /assabetinteractive\.com/i },
  { vendor: "eventkeeper", pattern: /eventkeeper\.com/i },
  { vendor: "localist", pattern: /([a-z0-9-]+)\.enterprise\.localist\.com|localist-images/i },
  // libnet.info is Communico's hosted domain (verified: Berkeley's
  // libnet site serves the eeventcaldata endpoint)
  { vendor: "communico", pattern: /([a-z0-9-]+)\.libnet\.info/i },
];

async function fetchPages(domain) {
  const pages = [];
  for (const path of ["", "/events", "/events-classes", "/calendar"]) {
    try {
      pages.push(await fetchText(`https://${domain}${path}`, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"));
      if (pages.length >= 2) break; // homepage + first events-ish page
    } catch {
      // try next path
    }
  }
  return pages.join("\n");
}

async function detectSystem(systemKey, info) {
  const registryEntry = feeds[systemKey];
  if (registryEntry?.status === "active") {
    return { systemKey, domain: info.domain, resolution: "already-active" };
  }
  const html = await fetchPages(info.domain);
  if (!html) {
    return { systemKey, domain: info.domain, resolution: "site-unreachable" };
  }
  const platforms = [];
  for (const { vendor, pattern } of FINGERPRINTS) {
    const match = html.match(pattern);
    if (match) {
      platforms.push({ vendor, evidence: match[0].toLowerCase() });
    }
  }
  return { systemKey, domain: info.domain, system: info.system, platforms, html };
}

const detection = {};
const bcQueue = [];
const queue = Object.entries(domains);
let activated = 0;

async function worker() {
  while (queue.length > 0) {
    const [systemKey, info] = queue.shift();
    let result;
    try {
      result = await detectSystem(systemKey, info);
    } catch (error) {
      detection[systemKey] = { domain: info.domain, resolution: "error", note: String(error.message) };
      continue;
    }
    if (result.resolution) {
      detection[systemKey] = { domain: result.domain, resolution: result.resolution };
      continue;
    }
    const { platforms, html } = result;
    if (platforms.length === 0) {
      detection[systemKey] = { domain: result.domain, resolution: "no-platform-found" };
      continue;
    }

    const bc = platforms.find((p) => p.vendor === "bibliocommons");
    const libcal = platforms.find((p) => p.vendor === "libcal");
    const other = platforms.find((p) => !["bibliocommons", "libcal"].includes(p.vendor));

    if (bc) {
      const slug = html.match(/([a-z0-9-]+)\.bibliocommons\.com/i)?.[1]?.toLowerCase();
      bcQueue.push({ systemKey, slug, system: info.system, domain: info.domain, platforms });
      continue; // verified serially to respect the WAF
    }
    if (libcal) {
      const host = html.match(/([a-z0-9-]+)\.libcal\.com/i)?.[0]?.toLowerCase();
      const verified = await activateLibcalInstance(`https://${host}`);
      if (verified) {
        feeds[systemKey] = {
          vendor: verified.vendor,
          status: "active",
          url: verified.url,
          note: `via own-domain link on ${result.domain}: ${host} cal ${verified.cid} "${verified.name}" (${verified.eventCount} events)`,
        };
        activated += 1;
        detection[systemKey] = { domain: result.domain, resolution: "activated", vendor: verified.vendor, platforms };
        console.log(`  ACTIVE ${systemKey} (${info.system}) → ${verified.url}`);
        continue;
      }
      detection[systemKey] = {
        domain: result.domain, resolution: "calendar-id-needed", vendor: "libcal",
        note: `libcal instance ${host} linked from own site, no verifiable calendar found`, platforms,
      };
      if (!feeds[systemKey]) {
        feeds[systemKey] = { vendor: "libcal", status: "detected", note: `own-domain link: ${host} — needs calendar id` };
      }
      continue;
    }
    detection[systemKey] = {
      domain: result.domain,
      resolution: `adapter-needed:${other.vendor}`,
      vendor: other.vendor,
      note: `evidence: ${other.evidence}`,
      platforms,
    };
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// BiblioCommons verifications — serial + throttled
for (const item of bcQueue) {
  await sleep(BC_VERIFY_DELAY_MS);
  const verified = item.slug ? await verifyBcFeed(item.slug, item.system) : null;
  if (verified && verified.eventCount > 0) {
    feeds[item.systemKey] = {
      vendor: "bibliocommons",
      status: "active",
      url: verified.url,
      note: `via own-domain link on ${item.domain} (${verified.eventCount} items)`,
    };
    activated += 1;
    detection[item.systemKey] = { domain: item.domain, resolution: "activated", vendor: "bibliocommons", platforms: item.platforms };
    console.log(`  ACTIVE ${item.systemKey} (${item.system}) → ${verified.url}`);
  } else {
    detection[item.systemKey] = {
      domain: item.domain,
      resolution: verified ? "feed-empty" : "feed-unverified",
      vendor: "bibliocommons",
      note: `slug ${item.slug} from own-domain link`,
      platforms: item.platforms,
    };
    if (!feeds[item.systemKey]) {
      feeds[item.systemKey] = { vendor: "bibliocommons", status: "detected", note: `own-domain link: ${item.slug}.bibliocommons.com (feed empty/unverified — possibly WAF)` };
    }
  }
}

// Collision guard on this run's activations
const hosts = new Map();
for (const [key, entry] of Object.entries(feeds)) {
  if (entry.status === "active" && entry.url) {
    const host = new URL(entry.url).host + new URL(entry.url).search;
    hosts.set(host, [...(hosts.get(host) ?? []), key]);
  }
}
for (const [host, keys] of hosts) {
  if (keys.length > 1) {
    for (const key of keys) {
      if (feeds[key]?.source !== "verified") {
        feeds[key] = { vendor: feeds[key].vendor, status: "detected", note: `demoted, collision: ${host} claimed by ${keys.join(", ")}` };
        activated -= 1;
      }
    }
    console.log(`  COLLISION ${host}: ${keys.join(", ")}`);
  }
}

writeDiscovered(Object.fromEntries(
  Object.entries(feeds).filter(([, v]) => v.source !== "verified"),
));
writeFileSync(
  "src/lib/data/generated/platformDetection.json",
  JSON.stringify(detection, null, 1),
);
const byResolution = {};
for (const entry of Object.values(detection)) {
  byResolution[entry.resolution] = (byResolution[entry.resolution] ?? 0) + 1;
}
console.log(`\nActivated ${activated} systems this run.`);
console.log("Resolutions:", JSON.stringify(byResolution, null, 1));
