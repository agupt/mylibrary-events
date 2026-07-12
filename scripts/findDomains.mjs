/**
 * Finds official websites for library systems via web search (DuckDuckGo
 * HTML endpoint, throttled). Closes the biggest gap in the IMLS dataset:
 * it has no web addresses, and without a domain we can only guess vendor
 * slugs. Writes src/lib/data/generated/domains.json.
 *
 * Usage: node scripts/findDomains.mjs [--top 150] [--all-min-outlets 3]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { sleep } from "./lib/probeHelpers.mjs";

const SEARCH_DELAY_MS = 1500;
const TIMEOUT_MS = 12000;

const argValue = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? Number(process.argv[index + 1]) : fallback;
};
const topN = argValue("--top", 150);

const libraries = JSON.parse(readFileSync("src/lib/data/generated/libraries.json", "utf8"));
const outputPath = "src/lib/data/generated/domains.json";
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : {};

// Systems ranked by outlet count
const systems = new Map();
for (const library of libraries) {
  const key = library.id.split("-")[0];
  const entry = systems.get(key) ?? {
    systemKey: key, system: library.system, state: library.state, outlets: 0,
  };
  systems.set(key, { ...entry, outlets: entry.outlets + 1 });
}
const targets = [...systems.values()]
  .filter((s) => !(s.systemKey in existing))
  .sort((a, b) => b.outlets - a.outlets)
  .slice(0, topN);

console.log(`Searching domains for ${targets.length} systems (throttled ${SEARCH_DELAY_MS}ms)`);

const REJECT_DOMAINS =
  /facebook|instagram|linkedin|twitter|x\.com|wikipedia|wikidata|yelp|google|youtube|tripadvisor|mapquest|city-data|foursquare|publiclibraries\.com|librarytechnology|worldcat|imls\.gov|niche\.com|indeed|glassdoor|zippia|duckduckgo/i;

async function searchDomain(system) {
  const query = encodeURIComponent(`${system.system} ${system.state} library website`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  const urls = [...body.matchAll(/uddg=([^"&]+)/g)]
    .map((m) => decodeURIComponent(m[1]))
    .filter((u) => u.startsWith("http"));
  for (const candidate of urls) {
    try {
      const host = new URL(candidate).host.replace(/^www\./, "");
      if (REJECT_DOMAINS.test(host)) continue;
      return host;
    } catch {
      continue;
    }
  }
  return null;
}

let found = 0;
let failed = 0;
for (const [index, system] of targets.entries()) {
  try {
    const domain = await searchDomain(system);
    if (domain) {
      existing[system.systemKey] = {
        domain,
        source: "web-search",
        system: system.system,
        state: system.state,
      };
      found += 1;
    } else {
      failed += 1;
    }
  } catch (error) {
    failed += 1;
    console.error(`  search failed for ${system.systemKey}: ${error.message}`);
  }
  if ((index + 1) % 25 === 0) {
    console.log(`... ${index + 1}/${targets.length} (${found} found)`);
    writeFileSync(outputPath, JSON.stringify(existing, null, 1));
  }
  await sleep(SEARCH_DELAY_MS);
}

writeFileSync(outputPath, JSON.stringify(existing, null, 1));
console.log(`Done: ${found} domains found, ${failed} failed. Total known: ${Object.keys(existing).length} → ${outputPath}`);
