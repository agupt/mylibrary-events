import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  createSfplProvider,
  parseSfplEvents,
  resolveSfplBranch,
  sfplFloatingIso,
} from "../events/custom/sfplProvider";
import type { Library } from "../types";

function card(opts: {
  date: string;
  slug: string;
  title: string;
  /** `<time datetime>` value: "START/END" ISO instants with offset. */
  range: string;
  audience: string;
  topic: string;
  location: string;
}): string {
  return `views-row"><article about="/events/${opts.date}/${opts.slug}" class="event event--teaser">
    <div class="event__date"><div class="field field--name-field-event-date-and-time field__item"><time datetime="${opts.range}">Weekday, x, h:mm - h:mm</time></div></div>
    <h2 class="event__title"><a href="/e" rel="bookmark"><span>${opts.title}</span></a></h2>
    <div class="event__audience"><div class="field field--name-field-event-audience field__items"><div class="field__item"><a href="/a" hreflang="en">${opts.audience}</a></div></div></div>
    <div class="event__topics"><div class="field field--name-field-event-topic field__items"><div class="field__item"><a href="/t" hreflang="en">${opts.topic}</a></div></div></div>
    <div class="event__location"><div class="field field--name-field-event-location field__items"><div class="field__item"><div about="/locations/${opts.location}"><a class="location--short-label" href="/l"> </a></div></div></div></div>
  </article>`;
}

const PAGE_HTML = [
  card({ date: "2026/07/17/storytime-glen", slug: "", title: "Storytime: For Families", range: "2026-07-17T13:15:00-07:00/2026-07-17T13:45:00-07:00", audience: "Babies, Toddlers or Preschoolers", topic: "Storytime for Preschoolers", location: "glen-park" }),
  card({ date: "2026/07/17/smartphone-class", slug: "", title: "Tutorial: Smartphone Class", range: "2026-07-17T13:00:00-07:00/2026-07-17T14:30:00-07:00", audience: "Adults", topic: "Tech Time", location: "glen-park" }),
  card({ date: "2026/07/18/lunch-main", slug: "", title: "Services: Lunch at the Library", range: "2026-07-18T12:15:00-07:00/2026-07-18T13:15:00-07:00", audience: "Families", topic: "Food", location: "main-library" }),
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
      startTime: "2026-07-17T13:15:00",
      endTime: "2026-07-17T13:45:00",
      audiences: ["Babies, Toddlers or Preschoolers"],
      locationSlug: "glen-park",
    });
  });

  test("floating ISO keeps local wall-clock and drops the offset", () => {
    expect(sfplFloatingIso("2026-07-17T08:30:00-07:00")).toBe("2026-07-17T08:30:00"); // early AM stays AM
    expect(sfplFloatingIso("2026-07-17T19:00:00-07:00")).toBe("2026-07-17T19:00:00");
    expect(sfplFloatingIso("2026-07-17T10:30")).toBe("2026-07-17T10:30:00");
    expect(sfplFloatingIso("bad")).toBeNull();
    expect(sfplFloatingIso("")).toBeNull();
  });

  test("instants in another offset are converted to San Francisco wall-clock", () => {
    // 18:30 UTC = 10:30 PST in November; 17:30 UTC = 10:30 PDT in July.
    expect(sfplFloatingIso("2026-11-24T18:30:00Z")).toBe("2026-11-24T10:30:00");
    expect(sfplFloatingIso("2026-07-17T17:30:00+00:00")).toBe("2026-07-17T10:30:00");
    // Crossing midnight moves the date too.
    expect(sfplFloatingIso("2026-11-25T03:00:00Z")).toBe("2026-11-24T19:00:00");
  });

  test("a card without a <time> range gets null times, not a guessed one", () => {
    const noTime = PAGE_HTML.split("views-row")[1].replace(/<time[^>]*>[^<]*<\/time>/, "");
    const [raw] = parseSfplEvents(`views-row${noTime}`);
    expect(raw).toMatchObject({ date: "2026-07-17", startTime: null, endTime: null });
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

  test("logs an error when cards parse but none carry a time (markup drift)", async () => {
    const noTimes = AJAX_JSON.replace(/<time[^>]*>[^<]*<\/time>/g, "");
    expect(noTimes).not.toEqual(AJAX_JSON);
    const fetchText = vi.fn(async (url: string) => {
      if (url.includes("/views/ajax")) {
        return url.includes("page=0") ? noTimes : EMPTY_JSON;
      }
      return EVENTS_PAGE;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = createSfplProvider({
      feeds: { CA0114: "https://sfpl.org/events" },
      fetchText,
      findLibraryById: (id) => (id === GLEN_PARK.id ? GLEN_PARK : undefined),
    });

    const events = await provider.getEvents([GLEN_PARK.id], RANGE);

    expect(events).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/SFPL: \d+ event cards parsed but none had a <time datetime>/),
    );
    errorSpy.mockRestore();
  });
});

// Real views/ajax response captured 2026-11-24, trimmed to 6 cards (image
// blocks stripped). SFPL replaced `<span class="date-display-range">` with
// `<time datetime="START/END">`, which zeroed the adapter in production: no
// clock matched, so every event was dropped as unparseable.
const LIVE_AJAX_2026_11 = readFileSync(
  path.join(__dirname, "fixtures/sfplEventsAjax-2026-11.json"),
  "utf8",
);

function sfOutlet(id: string, name: string): Library {
  return { ...GLEN_PARK, id, name };
}

const SF_OUTLETS: Library[] = [
  sfOutlet("CA0114-002", "San Francisco Main Library"),
  sfOutlet("CA0114-004", "Bernal Heights Branch Library"),
  sfOutlet("CA0114-008", "Glen Park Branch Library"),
  sfOutlet("CA0114-011", "Marina Branch Library"),
  sfOutlet("CA0114-026", "Bayview Linda Brooks-Burton Branch Library"),
];

const LIVE_RANGE = {
  start: new Date("2026-11-24T00:00:00"),
  end: new Date("2026-12-08T00:00:00"),
};

function liveHtml(): string {
  const commands = JSON.parse(LIVE_AJAX_2026_11) as { data?: unknown }[];
  const insert = commands.find(
    (c) => typeof c.data === "string" && c.data.includes("views-row"),
  );
  return String(insert?.data ?? "");
}

describe("sfpl live markup (2026-11, <time datetime> range)", () => {
  test("parses date and clocks from the <time datetime> attribute", () => {
    const events = parseSfplEvents(liveHtml());

    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({
      id: "tutorial-meet-one-one-financial-counselor",
      title: "Tutorial: Meet One-on-One with a Financial Counselor",
      date: "2026-11-24",
      startTime: "2026-11-24T09:00:00",
      endTime: "2026-11-24T17:00:00",
      audiences: ["Adults"],
      locationSlug: "main-library",
    });
  });

  test("emits kid events with real times, ages and branches; drops adult-only", async () => {
    const provider = createSfplProvider({
      feeds: { CA0114: "https://sfpl.org/events" },
      fetchText: async (url: string) => {
        if (!url.includes("/views/ajax")) return EVENTS_PAGE;
        return url.includes("page=0") ? LIVE_AJAX_2026_11 : EMPTY_JSON;
      },
      findLibraryById: (id) => SF_OUTLETS.find((library) => library.id === id),
    });

    const events = await provider.getEvents(
      SF_OUTLETS.map((library) => library.id),
      LIVE_RANGE,
    );

    const summary = events.map((e) => [e.libraryId, e.title, e.startTime, e.endTime]);
    expect(summary).toEqual([
      ["CA0114-011", "Storytime: For Families", "2026-11-24T10:30:00", "2026-11-24T11:00:00"],
      ["CA0114-002", "Storytime: For Families", "2026-11-24T10:30:00", "2026-11-24T11:00:00"],
      ["CA0114-008", "Storytime: For Toddlers", "2026-11-24T11:00:00", "2026-11-24T11:30:00"],
      ["CA0114-026", "Workshop: Faux Stained Glass Bookmark", "2026-12-01T15:30:00", "2026-12-01T17:00:00"],
      ["CA0114-004", "Activity: Tinkering Tuesdays", "2026-12-01T16:00:00", "2026-12-01T17:00:00"],
    ]);
    // "Families" + "Babies, Toddlers or Preschoolers" → union of both.
    expect(new Set(events[0].ageGroups)).toEqual(
      new Set(["baby", "toddler", "preschool", "all-ages"]),
    );
    expect(events[0].eventType).toBe("storytime");
    expect(events[2].ageGroups).toEqual(["baby", "toddler", "preschool"]);
    expect(events[4].ageGroups).toEqual(["school-age"]);
    // The adult-only financial tutorial at Main never surfaces.
    expect(events.some((e) => e.title.includes("Financial Counselor"))).toBe(false);
  });
});

describe("sfpl branch resolution", () => {
  // Real IMLS names; Park/Parkside and Mission/Mission Bay overlap as
  // substrings, which first-match attribution got wrong in production.
  const OUTLETS: Library[] = [
    sfOutlet("CA0114-002", "San Francisco Main Library"),
    sfOutlet("CA0114-005", "Chinatown - Him Mark Lai Branch Library"),
    sfOutlet("CA0114-013", "Mission Branch Library"),
    sfOutlet("CA0114-018", "Park Branch Library"),
    sfOutlet("CA0114-038", "Mission Bay Branch Library"),
    sfOutlet("CA0114-041", "Parkside Branch Library"),
  ];

  test.each([
    ["parkside", "CA0114-041"],
    ["park", "CA0114-018"],
    ["mission-bay", "CA0114-038"],
    ["mission", "CA0114-013"],
    ["main-library", "CA0114-002"],
    ["chinatown", "CA0114-005"],
  ])("%s → %s", (slug, id) => {
    expect(resolveSfplBranch(slug, OUTLETS)?.id).toBe(id);
  });

  test("unmapped outreach slugs resolve to nothing", () => {
    expect(resolveSfplBranch("bookmobiles-mobile-outreach", OUTLETS)).toBeUndefined();
    expect(resolveSfplBranch("", OUTLETS)).toBeUndefined();
  });

  test("a Mission Bay event is not credited to a requested Mission", async () => {
    const page = (slug: string) =>
      JSON.stringify([
        {
          command: "insert",
          data: card({ date: "2026/07/17/storytime-x", slug: "", title: "Storytime: For Toddlers", range: "2026-07-17T10:30:00-07:00/2026-07-17T11:00:00-07:00", audience: "Babies, Toddlers or Preschoolers", topic: "Storytime for Toddlers", location: slug }),
        },
      ]);
    const providerFor = (slug: string) =>
      createSfplProvider({
        feeds: { CA0114: "https://sfpl.org/events" },
        fetchText: async (url: string) => {
          if (!url.includes("/views/ajax")) return EVENTS_PAGE;
          return url.includes("page=0") ? page(slug) : EMPTY_JSON;
        },
        findLibraryById: (id) => OUTLETS.find((library) => library.id === id),
        outletsForSystem: () => OUTLETS,
      });

    const atMissionBay = await providerFor("mission-bay").getEvents(["CA0114-013"], RANGE);
    const atMission = await providerFor("mission").getEvents(["CA0114-013"], RANGE);

    expect(atMissionBay).toEqual([]);
    expect(atMission.map((e) => e.libraryId)).toEqual(["CA0114-013"]);
  });
});
