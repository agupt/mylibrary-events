import { describe, expect, test, vi } from "vitest";
import {
  createSfplProvider,
  parseSfplEvents,
  sfplFloatingIso,
} from "../events/custom/sfplProvider";
import type { Library } from "../types";

function card(opts: {
  date: string;
  slug: string;
  title: string;
  range: string;
  audience: string;
  topic: string;
  location: string;
}): string {
  return `views-row"><article about="/events/${opts.date}/${opts.slug}" class="event event--teaser">
    <div class="event__date"><div class="field field--name-field-event-date-and-time field__item"><span class="date-display-range">Weekday, x, ${opts.range}</span></div></div>
    <h2 class="event__title"><a href="/e" rel="bookmark"><span>${opts.title}</span></a></h2>
    <div class="event__audience"><div class="field field--name-field-event-audience field__items"><div class="field__item"><a href="/a" hreflang="en">${opts.audience}</a></div></div></div>
    <div class="event__topics"><div class="field field--name-field-event-topic field__items"><div class="field__item"><a href="/t" hreflang="en">${opts.topic}</a></div></div></div>
    <div class="event__location"><div class="field field--name-field-event-location field__items"><div class="field__item"><div about="/locations/${opts.location}"><a class="location--short-label" href="/l"> </a></div></div></div></div>
  </article>`;
}

const PAGE_HTML = [
  card({ date: "2026/07/17/storytime-glen", slug: "", title: "Storytime: For Families", range: "1:15 - 1:45", audience: "Babies, Toddlers or Preschoolers", topic: "Storytime for Preschoolers", location: "glen-park" }),
  card({ date: "2026/07/17/smartphone-class", slug: "", title: "Tutorial: Smartphone Class", range: "1:00 - 2:30", audience: "Adults", topic: "Tech Time", location: "glen-park" }),
  card({ date: "2026/07/18/lunch-main", slug: "", title: "Services: Lunch at the Library", range: "12:15 - 1:15", audience: "Families", topic: "Food", location: "main-library" }),
].join("\n");

const AJAX_JSON = JSON.stringify([
  { command: "settings", data: [] },
  { command: "insert", method: "replaceWith", data: PAGE_HTML },
]);
const EMPTY_JSON = JSON.stringify([{ command: "insert", data: "<div></div>" }]);
const EVENTS_PAGE = `<script>window.drupalSettings={"ajaxPageState":{"libraries":"TESTTOKEN","theme":"sfpl_2019"}};</script>`;

const GLEN_PARK: Library = {
  id: "CA0114-005",
  name: "Glen Park Branch Library",
  system: "San Francisco Public Library",
  address: "2825 Diamond St",
  city: "San Francisco",
  state: "CA",
  zipCode: "94131",
  coordinates: { latitude: 37.73, longitude: -122.43 },
};

const RANGE = {
  start: new Date("2026-07-16T00:00:00"),
  end: new Date("2026-07-30T00:00:00"),
};

describe("sfpl parsing helpers", () => {
  test("parses teaser cards into raw events", () => {
    const events = parseSfplEvents(PAGE_HTML);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      date: "2026-07-17",
      title: "Storytime: For Families",
      startClock: "1:15",
      endClock: "1:45",
      audiences: ["Babies, Toddlers or Preschoolers"],
      locationSlug: "glen-park",
    });
  });

  test("library-hours heuristic disambiguates AM/PM", () => {
    expect(sfplFloatingIso("2026-07-17", "10:30")).toBe("2026-07-17T10:30:00"); // AM
    expect(sfplFloatingIso("2026-07-17", "12:15")).toBe("2026-07-17T12:15:00"); // noon
    expect(sfplFloatingIso("2026-07-17", "1:15")).toBe("2026-07-17T13:15:00"); // PM
    expect(sfplFloatingIso("2026-07-17", "bad")).toBeNull();
  });
});

describe("createSfplProvider", () => {
  test("scrapes token, maps ages, drops adults and unselected branches", async () => {
    const fetchText = vi.fn(async (url: string) => {
      if (url.includes("/views/ajax")) {
        return url.includes("page=0") ? AJAX_JSON : EMPTY_JSON;
      }
      return EVENTS_PAGE; // the events page carrying the token
    });
    const provider = createSfplProvider({
      feeds: { CA0114: "https://sfpl.org/events" },
      fetchText,
      findLibraryById: (id) => (id === GLEN_PARK.id ? GLEN_PARK : undefined),
    });

    const events = await provider.getEvents([GLEN_PARK.id], RANGE);

    // Only the Glen Park storytime survives: the smartphone class is adult-only,
    // and the main-library lunch is a branch the user didn't select.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      libraryId: GLEN_PARK.id,
      title: "Storytime: For Families",
      eventType: "storytime",
      startTime: "2026-07-17T13:15:00",
    });
    expect(events[0].ageGroups).toEqual(["baby", "toddler", "preschool"]);
    // token page + page 0 (cards) + page 1 (empty → stop)
    expect(fetchText).toHaveBeenCalledWith("https://sfpl.org/events");
  });
});
