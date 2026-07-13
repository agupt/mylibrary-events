/**
 * Scrapes NYPL's children's events into generated/snapshots/NY0778.json.
 * NYPL's calendar is server-rendered behind Imperva bot protection, so a
 * real browser is required — run via the data-refresh GitHub Action
 * (or locally after `npx playwright install chromium`).
 *
 * Usage: node scripts/scrapeNyplSnapshot.mjs [--days 14]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const argValue = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? Number(process.argv[index + 1]) : fallback;
};
const days = argValue("--days", 14);
const MAX_PAGES = 40;

const today = new Date();
const cutoff = new Date(today.getTime() + days * 86_400_000);
const mmddyyyy = `${String(today.getMonth() + 1).padStart(2, "0")}%2F${String(
  today.getDate(),
).padStart(2, "0")}%2F${today.getFullYear()}`;
const BASE =
  `https://www.nypl.org/events/calendar?keyword=&target%5B0%5D=cr&date_op=GREATER_EQUAL` +
  `&date1=${mmddyyyy}&location=&type=&topic=&audience=&series=`;

const browser = await chromium.launch();
const page = await browser.newPage({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
});
// First navigation solves the Imperva challenge and sets cookies
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector("td.event-time", { timeout: 30_000 });

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseDate(time, todayIso, year) {
  if (time.startsWith("Today")) return todayIso;
  const m = time.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (!m) return null;
  return `${year}-${String(MONTHS[m[1].toLowerCase().slice(0, 3)]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

const todayIso = today.toISOString().slice(0, 10);
const all = [];
let stop = false;
for (let pageNum = 1; pageNum <= MAX_PAGES && !stop; pageNum += 1) {
  const url = pageNum === 1 ? BASE : `${BASE}&page=${pageNum}`;
  // Subsequent pages fetched in-page so Imperva cookies ride along
  const rows = await page.evaluate(async (fetchUrl) => {
    const html = await (await fetch(fetchUrl)).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll("tr")]
      .filter((tr) => tr.querySelector(".event-name a"))
      .map((tr) => ({
        title: tr.querySelector(".event-name a")?.textContent?.trim() ?? "",
        link: tr.querySelector(".event-name a")?.getAttribute("href") ?? "",
        time: tr.querySelector(".event-time")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        location: tr.querySelector(".event-location")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        audience: tr.querySelector(".event-audience")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        description: (tr.querySelector(".description")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240),
      }));
  }, url);
  if (rows.length === 0) break;
  for (const row of rows) {
    const date = parseDate(row.time, todayIso, today.getFullYear());
    if (date && new Date(date) >= cutoff) {
      stop = true;
      break;
    }
    if (date) all.push({ ...row, date });
  }
  console.log(`page ${pageNum}: total ${all.length}`);
}
await browser.close();

mkdirSync("src/lib/data/generated/snapshots", { recursive: true });
writeFileSync(
  "src/lib/data/generated/snapshots/NY0778.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      systemKey: "NY0778",
      source: "nypl.org/events/calendar (children filter target[]=cr), scraped via headless browser",
      events: all,
    },
    null,
    0,
  ),
);
console.log(`Wrote ${all.length} events to snapshots/NY0778.json`);
