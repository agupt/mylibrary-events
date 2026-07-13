/**
 * Promotes "detected" LibCal systems to "active" by finding their public
 * events calendar id — fully automated, no browser required.
 *
 * How (pattern learned by inspecting LibCal pages in Chrome DevTools):
 *  1. GET the instance homepage; collect candidate calendars from
 *     /calendar/<name> links, rss.php?iid=..&cid=.. autodiscovery links,
 *     and classic-UI <option cal_id="..."> tags.
 *  2. For each candidate page, extract the cid from its RSS <link> or
 *     <body id="calendar_<cid>">.
 *  3. Prefer calendars named like events/programs; verify the
 *     ical_subscribe.php export returns VEVENTs before promoting.
 *
 * Usage: node scripts/activateLibcalFeeds.mjs
 */
import { readRegistry, writeDiscovered } from "./lib/registry.mjs";

const CONCURRENCY = 12;
const TIMEOUT_MS = 10000;
const MAX_CALENDAR_PAGES = 6;
const MAX_ICAL_CHECKS = 3;

const feeds = readRegistry();

const targets = Object.entries(feeds).filter(
  ([, entry]) =>
    entry.vendor === "libcal" &&
    entry.status === "detected" &&
    entry.source === "discovered",
);
console.log(`Attempting activation for ${targets.length} detected LibCal systems`);

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "library-storytime/1.0 (feed activation)" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

const isEventish = (text) => /event|program|workshop|activit|storytime/i.test(text);

function candidatesFromHomepage(base, html) {
  const candidates = [];
  // RSS autodiscovery on the homepage itself
  for (const m of html.matchAll(/rss\.php\?iid=\d+(?:&(?:amp;)?m=\w+)?&(?:amp;)?cid=(\d+)/g)) {
    candidates.push({ cid: m[1], label: "homepage rss", score: 1 });
  }
  // Classic UI calendar <option>s
  for (const m of html.matchAll(/cal_id="(\d+)"[^>]*>([^<]*)/g)) {
    if (Number(m[1]) > 0) {
      candidates.push({ cid: m[1], label: m[2].trim(), score: isEventish(m[2]) ? 3 : 1 });
    }
  }
  // Named calendar pages to visit
  const pages = [
    ...new Set(
      [...html.matchAll(/\/calendar\/([a-z0-9-]+)/gi)]
        .map((m) => m[1].toLowerCase())
        .filter((name) => !["list", "index"].includes(name)),
    ),
  ];
  pages.sort((a, b) => Number(isEventish(b)) - Number(isEventish(a)));
  return { candidates, pages: pages.slice(0, MAX_CALENDAR_PAGES).map((p) => `${base}/calendar/${p}`) };
}

function cidFromCalendarPage(html, pageUrl) {
  const cid =
    html.match(/rss\.php\?iid=\d+&(?:amp;)?m=\w+&(?:amp;)?cid=(\d+)/)?.[1] ??
    html.match(/<body id="calendar_(\d+)"/)?.[1] ??
    html.match(/data-cal_id="(\d+)"/)?.[1];
  if (!cid) return null;
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return {
    cid,
    label: title || pageUrl,
    score: isEventish(pageUrl) || isEventish(title) ? 3 : 2,
  };
}

/**
 * Prefers the RSS month feed: it is upcoming-oriented with structured
 * audience/branch fields, while ical_subscribe is capped at 500 events
 * from the past — a busy system's ICS can be 100% stale.
 */
async function verifyFeed(base, cid) {
  const rssUrl = `${base}/rss.php?m=month&cid=${cid}`;
  try {
    const rss = await fetchText(rssUrl);
    const eventCount = (rss.match(/<item>/g) ?? []).length;
    const name = rss.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? "";
    if (rss.includes("<rss") && eventCount > 0) {
      return { vendor: "libcal", url: rssUrl, eventCount, name };
    }
  } catch {
    // fall through to ICS
  }
  const icalUrl = `${base}/ical_subscribe.php?src=p&cid=${cid}`;
  try {
    const ics = await fetchText(icalUrl);
    if (!ics.startsWith("BEGIN:VCALENDAR")) return null;
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const name = ics.match(/X-WR-CALNAME:(.*)/)?.[1]?.trim() ?? "";
    return eventCount > 0 ? { vendor: "ical", url: icalUrl, eventCount, name } : null;
  } catch {
    return null;
  }
}

async function activate(systemKey, entry) {
  const slug = entry.note?.match(/([a-z0-9-]+)\.libcal\.com/)?.[1];
  if (!slug) return null;
  const base = `https://${slug}.libcal.com`;

  let homepage;
  try {
    homepage = await fetchText(`${base}/`);
  } catch {
    return null;
  }
  const { candidates, pages } = candidatesFromHomepage(base, homepage);

  for (const pageUrl of pages) {
    try {
      const found = cidFromCalendarPage(await fetchText(pageUrl), pageUrl);
      if (found) candidates.push(found);
    } catch {
      // page missing — keep going
    }
  }

  const unique = [...new Map(candidates.map((c) => [c.cid, c])).values()].sort(
    (a, b) => b.score - a.score,
  );
  for (const candidate of unique.slice(0, MAX_ICAL_CHECKS)) {
    const verified = await verifyFeed(base, candidate.cid);
    if (verified) {
      return {
        vendor: verified.vendor,
        status: "active",
        url: verified.url,
        note: `auto-activated: ${slug}.libcal.com cal ${candidate.cid} "${verified.name}" (${verified.eventCount} events at activation)`,
      };
    }
  }
  return null;
}

let activated = 0;
let processed = 0;
const queue = [...targets];

async function worker() {
  while (queue.length > 0) {
    const [systemKey, entry] = queue.shift();
    const result = await activate(systemKey, entry);
    processed += 1;
    if (result) {
      feeds[systemKey] = result;
      activated += 1;
      console.log(`  ACTIVE ${systemKey}: ${result.note}`);
    }
    if (processed % 25 === 0) {
      console.log(`... ${processed}/${targets.length}, ${activated} activated`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Collision guard: two systems claiming one LibCal instance means slug
// guessing matched a same-named library in another state (Houston TX vs
// Houston County GA). None of the claimants can be trusted automatically.
const claimants = new Map();
for (const [systemKey, entry] of Object.entries(feeds)) {
  if (entry.status === "active" && entry.vendor === "libcal" && entry.url && entry.source !== "verified") {
    const host = new URL(entry.url).host;
    claimants.set(host, [...(claimants.get(host) ?? []), systemKey]);
  }
}
for (const [host, keys] of claimants) {
  if (keys.length > 1) {
    for (const key of keys) {
      feeds[key] = {
        vendor: "libcal",
        status: "detected",
        note: `demoted, collision: ${host} claimed by ${keys.join(", ")} — needs manual confirmation`,
      };
      activated -= 1;
    }
    console.log(`  COLLISION ${host}: demoted ${keys.join(", ")}`);
  }
}

writeDiscovered(Object.fromEntries(
  Object.entries(feeds).filter(([, v]) => v.source !== "verified"),
));
console.log(`\nActivated ${activated} of ${targets.length} detected LibCal systems`);
