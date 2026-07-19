import { describe, expect, test, vi } from "vitest";
import {
  createLaplProvider,
  parseLaplPage,
  teaserCount,
} from "../events/custom/laplProvider";
import type { AgeGroup, Library } from "../types";

/** A faithful (trimmed) LAPL teaser, matching the live Drupal markup. */
function teaser(opts: {
  slug: string;
  title: string;
  date: string;
  time: string;
  location: string;
  desc?: string;
}): string {
  return `
<article class="c-teaser-standard c-teaser-standard--event">
  <div class="c-teaser-standard__content">
    <h3 class="c-teaser-standard__heading">
      <a href="/events/${opts.slug}" class="e-link e-link--draw">
        <span class="e-link__text">${opts.title}</span>
      </a>
    </h3>
    <div class="c-teaser-standard__text"><p>${opts.desc ?? ""}</p></div>
    <div class="c-teaser-standard__meta">
      <div class="c-teaser-standard__date"><span class="visually-hidden">Date:</span> ${opts.date} </div>
      <div class="c-teaser-standard__time"><span class="visually-hidden">Time:</span> ${opts.time} </div>
      <div class="c-teaser-standard__location"><span class="visually-hidden">Location:</span> ${opts.location} </div>
    </div>
  </div>
</article>`;
}

function pageOf(teasers: string[]): string {
  return `<!doctype html><html><body>${teasers.join("\n")}</body></html>`;
}

/** A full 24-teaser page (triggers blind pagination to the next page). */
function fullPage(prefix: string): string {
  return pageOf(
    Array.from({ length: 24 }, (_, i) =>
      teaser({
        slug: `${prefix}-${i}`,
        title: `${prefix} ${i}`,
        date: "7/20/2026",
        time: "10:00 AM",
        location: "Central Library",
      }),
    ),
  );
}

const CENTRAL: Library = {
  id: "CA0063-002",
  name: "Central Library",
  system: "Los Angeles Public Library",
  address: "630 W 5th St",
  city: "Los Angeles",
  state: "CA",
  zipCode: "90071",
  coordinates: { latitude: 34.05, longitude: -118.25 },
};
const BRENTWOOD: Library = {
  id: "CA0063-009",
  name: "Donald Bruce Kaufman Brentwood Branch",
  system: "Los Angeles Public Library",
  address: "11820 San Vicente Blvd",
  city: "Los Angeles",
  state: "CA",
  zipCode: "90049",
  coordinates: { latitude: 34.05, longitude: -118.47 },
};
const BY_ID: Record<string, Library> = {
  [CENTRAL.id]: CENTRAL,
  [BRENTWOOD.id]: BRENTWOOD,
};

const RANGE = {
  start: new Date("2026-07-18T00:00:00"),
  end: new Date("2026-08-01T00:00:00"),
};

describe("parseLaplPage", () => {
  test("extracts fields and tags the passed age groups", () => {
    const html = pageOf([
      teaser({
        slug: "summer-preschool-storytime",
        title: "Summer Preschool Storytime",
        date: "7/20/2026",
        time: "10:30 AM - 11:00 AM",
        location: "North Hollywood",
        desc: "Songs &amp; books.",
      }),
    ]);
    const groups: AgeGroup[] = ["preschool", "school-age"];
    const events = parseLaplPage(html, groups);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      slug: "summer-preschool-storytime",
      title: "Summer Preschool Storytime",
      startTime: "2026-07-20T10:30:00",
      endTime: "2026-07-20T11:00:00",
      location: "North Hollywood",
      description: "Songs & books.",
      ageGroups: groups,
    });
  });

  test("handles a start-only time (end == start)", () => {
    const html = pageOf([
      teaser({
        slug: "read-star",
        title: "Read With STAR Volunteer",
        date: "7/20/2026",
        time: "10:00 AM",
        location: "Brentwood",
      }),
    ]);
    const events = parseLaplPage(html, ["all-ages"]);
    expect(events[0].startTime).toBe("2026-07-20T10:00:00");
    expect(events[0].endTime).toBe("2026-07-20T10:00:00");
  });
});

describe("teaserCount", () => {
  test("counts event teasers on a page", () => {
    expect(teaserCount(fullPage("x"))).toBe(24);
    expect(teaserCount(pageOf([]))).toBe(0);
  });
});

describe("createLaplProvider", () => {
  function providerFor(fetchText: (url: string) => Promise<string>) {
    return createLaplProvider({
      feeds: {
        CA0063: "https://www.lapl.org/events/search?category=All",
      },
      fetchText: (url) => fetchText(url),
      findLibraryById: (id) => BY_ID[id],
    });
  }

  test("dedups an event across audiences and unions age groups", async () => {
    const shared = teaser({
      slug: "baby-storytime",
      title: "Baby Storytime",
      date: "7/20/2026",
      time: "10:30 AM",
      location: "Central Library",
    });
    const kidsOnly = teaser({
      slug: "kids-craft",
      title: "Kids Craft",
      date: "7/21/2026",
      time: "2:00 PM",
      location: "Brentwood",
    });
    const fetchText = vi.fn(async (url: string) => {
      const audience = new URL(url).searchParams.get("audience");
      if (audience === "1555") return pageOf([shared]); // Babies & Toddlers
      if (audience === "1556") return pageOf([shared, kidsOnly]); // Kids
      return pageOf([]); // 2976 All Ages — empty
    });

    const events = await providerFor(fetchText).getEvents(
      [CENTRAL.id, BRENTWOOD.id],
      RANGE,
    );

    expect(events.map((e) => e.title)).toEqual(["Baby Storytime", "Kids Craft"]);
    // shared event carries the union of both audiences' groups
    expect(events[0]).toMatchObject({
      libraryId: "CA0063-002",
      ageGroups: ["baby", "preschool", "school-age", "toddler"],
    });
    // kids-only event attributed to Brentwood by location text
    expect(events[1]).toMatchObject({
      libraryId: "CA0063-009",
      ageGroups: ["preschool", "school-age"],
    });
  });

  test("blind-paginates: a full page 0 pulls page 1, a short page stops", async () => {
    // audience 1555: page0 full (24) → page1 fetched; page1 short (1) → stop.
    const page1 = pageOf([
      teaser({
        slug: "last-page-event",
        title: "Last Page Event",
        date: "7/21/2026",
        time: "10:00 AM",
        location: "Central Library",
      }),
    ]);
    const fetchText = vi.fn(async (url: string) => {
      const audience = new URL(url).searchParams.get("audience");
      const page = new URL(url).searchParams.get("page");
      if (audience !== "1555") return pageOf([]); // 1556/2976 single short page
      if (page === null) return fullPage("babies"); // page 0: 24 → keep going
      if (page === "1") return page1; // short → last
      return pageOf([]);
    });

    const events = await providerFor(fetchText).getEvents([CENTRAL.id], RANGE);

    // 24 from page 0 + 1 from page 1 (+ empty pages 2-4 in the same batch) = 25
    expect(events).toHaveLength(25);
    expect(events.some((e) => e.title === "Last Page Event")).toBe(true);
    // The short page 1 ends pagination — no SECOND batch (page 5+) is fetched.
    const pageIndexes = fetchText.mock.calls
      .map((c) => new URL(c[0] as string))
      .filter((u) => u.searchParams.get("audience") === "1555")
      .map((u) => Number(u.searchParams.get("page") ?? 0));
    expect(Math.max(...pageIndexes)).toBe(4); // first batch [0..4] only
  });
});
