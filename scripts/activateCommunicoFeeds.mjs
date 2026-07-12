/**
 * Activates Communico systems found by detectPlatforms.mjs by probing
 * the conventional attend host (attend.<domain>) for the unauthenticated
 * eeventcaldata endpoint and verifying it returns events.
 *
 * Usage: node scripts/activateCommunicoFeeds.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fetchText } from "./lib/probeHelpers.mjs";

const detection = JSON.parse(
  readFileSync("src/lib/data/generated/platformDetection.json", "utf8"),
);
const feedsPath = "src/lib/data/generated/discoveredFeeds.json";
const feeds = JSON.parse(readFileSync(feedsPath, "utf8"));

const targets = Object.entries(detection).filter(
  ([, entry]) => entry.resolution === "adapter-needed:communico",
);
console.log(`Probing ${targets.length} Communico systems`);

function eventDataUrl(base) {
  const today = new Date().toISOString().slice(0, 10);
  const req = JSON.stringify({
    private: false, date: today, days: 14, locations: [], ages: [], types: [],
  });
  return `${base}/eeventcaldata?event_type=0&req=${encodeURIComponent(req)}`;
}

async function probeAttendHost(entry, domain) {
  // Prefer an attend.* host seen in the site HTML evidence, else convention
  const evidenced = entry.platforms
    ?.map((p) => p.evidence?.match(/attend\.[a-z0-9.-]+[a-z]/)?.[0])
    .find(Boolean);
  const candidates = [
    ...new Set(
      [
        evidenced,
        `attend.${domain}`,
        `events.${domain}`,
        domain, // some libraries mount the Communico SPA on their own domain
        `www.${domain}`,
      ].filter((h) => h && !h.endsWith(".the") && h.includes(".")),
    ),
  ];
  for (const host of candidates) {
    const base = `https://${host}`;
    try {
      const body = await fetchText(eventDataUrl(base));
      const events = JSON.parse(body);
      if (Array.isArray(events)) {
        return { base, eventCount: events.length };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

let activated = 0;
for (const [systemKey, entry] of targets) {
  const verified = await probeAttendHost(entry, entry.domain);
  if (verified) {
    feeds[systemKey] = {
      vendor: "communico",
      status: "active",
      url: verified.base,
      note: `communico attend site (${verified.eventCount} events in next 14d at activation)`,
    };
    detection[systemKey] = { ...entry, resolution: "activated", vendor: "communico" };
    activated += 1;
    console.log(`  ACTIVE ${systemKey}: ${verified.base} (${verified.eventCount} events)`);
  } else {
    console.log(`  no attend endpoint found for ${systemKey} (${entry.domain})`);
  }
}

writeFileSync(feedsPath, JSON.stringify(feeds, null, 1));
writeFileSync(
  "src/lib/data/generated/platformDetection.json",
  JSON.stringify(detection, null, 1),
);
console.log(`\nActivated ${activated} of ${targets.length} Communico systems`);
