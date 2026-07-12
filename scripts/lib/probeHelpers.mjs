/** Shared helpers for feed discovery/activation scripts. */

export const TIMEOUT_MS = 10000;

export const STOP_WORDS = new Set([
  "public", "library", "libraries", "district", "system", "regional",
  "county", "city", "town", "free", "memorial", "the", "of", "and", "&",
]);

export const ACADEMIC_MARKERS =
  /universit|college|schools|academy|institute/i;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchText(url, userAgent = "library-storytime/1.0") {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": userAgent },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export function distinctiveWords(systemName) {
  return systemName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

export function titleMatchesSystem(pageText, systemName) {
  const haystack = pageText.toLowerCase();
  if (ACADEMIC_MARKERS.test(haystack) && !ACADEMIC_MARKERS.test(systemName)) {
    return false;
  }
  const words = distinctiveWords(systemName);
  if (words.length === 0) return true;
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits * 2 > words.length;
}

const isEventish = (text) => /event|program|workshop|activit|storytime/i.test(text);

/** Candidate LibCal calendars from an instance homepage. */
export function libcalCandidatesFromHomepage(base, html) {
  const candidates = [];
  for (const m of html.matchAll(/rss\.php\?iid=\d+(?:&(?:amp;)?m=\w+)?&(?:amp;)?cid=(\d+)/g)) {
    candidates.push({ cid: m[1], label: "homepage rss", score: 1 });
  }
  for (const m of html.matchAll(/cal_id="(\d+)"[^>]*>([^<]*)/g)) {
    if (Number(m[1]) > 0) {
      candidates.push({ cid: m[1], label: m[2].trim(), score: isEventish(m[2]) ? 3 : 1 });
    }
  }
  const pages = [
    ...new Set(
      [...html.matchAll(/\/calendar\/([a-z0-9-]+)/gi)]
        .map((m) => m[1].toLowerCase())
        .filter((name) => !["list", "index"].includes(name)),
    ),
  ];
  pages.sort((a, b) => Number(isEventish(b)) - Number(isEventish(a)));
  return { candidates, pages: pages.slice(0, 6).map((p) => `${base}/calendar/${p}`) };
}

export function libcalCidFromCalendarPage(html, pageUrl) {
  const cid =
    html.match(/rss\.php\?iid=\d+&(?:amp;)?m=\w+&(?:amp;)?cid=(\d+)/)?.[1] ??
    html.match(/<body id="calendar_(\d+)"/)?.[1] ??
    html.match(/data-cal_id="(\d+)"/)?.[1];
  if (!cid) return null;
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return { cid, label: title || pageUrl, score: isEventish(pageUrl) || isEventish(title) ? 3 : 2 };
}

/** Verifies a LibCal calendar: prefers the upcoming RSS month feed. */
export async function verifyLibcalFeed(base, cid) {
  const rssUrl = `${base}/rss.php?m=month&cid=${cid}`;
  try {
    const rss = await fetchText(rssUrl);
    const eventCount = (rss.match(/<item>/g) ?? []).length;
    const name = rss.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? "";
    if (rss.includes("<rss") && eventCount > 0) {
      return { vendor: "libcal", url: rssUrl, eventCount, name };
    }
  } catch {
    // fall through
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

/** Full LibCal activation attempt for one instance host. */
export async function activateLibcalInstance(base) {
  let homepage;
  try {
    homepage = await fetchText(`${base}/`);
  } catch {
    return null;
  }
  const { candidates, pages } = libcalCandidatesFromHomepage(base, homepage);
  for (const pageUrl of pages) {
    try {
      const found = libcalCidFromCalendarPage(await fetchText(pageUrl), pageUrl);
      if (found) candidates.push(found);
    } catch {
      // missing page — keep going
    }
  }
  const unique = [...new Map(candidates.map((c) => [c.cid, c])).values()].sort(
    (a, b) => b.score - a.score,
  );
  for (const candidate of unique.slice(0, 3)) {
    const verified = await verifyLibcalFeed(base, candidate.cid);
    if (verified) return { ...verified, cid: candidate.cid };
  }
  return null;
}

/** Verifies a BiblioCommons events RSS feed with an identity check. */
export async function verifyBcFeed(slugOrUrl, systemName) {
  const url = slugOrUrl.startsWith("http")
    ? slugOrUrl
    : `https://${slugOrUrl}.bibliocommons.com/events/rss/all`;
  try {
    const body = await fetchText(url);
    if (!body.includes("<rss")) return null;
    const title = body.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    if (!titleMatchesSystem(title, systemName)) return null;
    const eventCount = (body.match(/<item>/g) ?? []).length;
    return { vendor: "bibliocommons", url, eventCount, name: title.trim() };
  } catch {
    return null;
  }
}
