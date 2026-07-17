import { describe, expect, test, vi } from "vitest";
import { ageGroupsFromRange } from "../events/classify";
import { parseLibcalRss } from "../events/libcal/parseLibcalRss";
import { createLibcalRssProvider } from "../events/libcal/rssProvider";
import type { Library } from "../types";

const RSS_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:libcal="https://www.springshare.com/libcal/">
<channel>
<title>Events - Cleveland Public Library</title>
<item>
<title>Crafts for Little Ones</title>
<link>https://cpl.libcal.com/event/111</link>
<libcal:eventid>111</libcal:eventid>
<libcal:date>2026-07-14</libcal:date>
<libcal:start>10:15:00</libcal:start>
<libcal:end>11:00:00</libcal:end>
<libcal:audience>Children Ages 0-5</libcal:audience>
<libcal:campus>Rice</libcal:campus>
<libcal:location>Rice - Main Floor</libcal:location>
<libcal:description>&#x3C;p&#x3E;Come pick up a craft!&#x3C;/p&#x3E;</libcal:description>
<category>Arts &#x26; Culture</category>
</item>
<item>
<title>Adult Job Help</title>
<link>https://cpl.libcal.com/event/222</link>
<libcal:eventid>222</libcal:eventid>
<libcal:date>2026-07-15</libcal:date>
<libcal:start>14:00:00</libcal:start>
<libcal:end>15:00:00</libcal:end>
<libcal:audience>Adults</libcal:audience>
<libcal:campus>Rice</libcal:campus>
</item>
<item>
<title>Storytime at Another Branch</title>
<link>https://cpl.libcal.com/event/333</link>
<libcal:eventid>333</libcal:eventid>
<libcal:date>2026-07-16</libcal:date>
<libcal:start>10:30:00</libcal:start>
<libcal:end>11:00:00</libcal:end>
<libcal:audience>Toddlers</libcal:audience>
<libcal:campus>Fleet</libcal:campus>
</item>
</channel>
</rss>`;

const RICE: Library = {
  id: "OH0051-020",
  name: "Rice Branch Library",
  system: "Cleveland Public Library",
  address: "1 Main St",
  city: "Cleveland",
  state: "OH",
  zipCode: "44113",
  coordinates: { latitude: 41.48, longitude: -81.68 },
};

const RANGE = {
  start: new Date("2026-07-12T00:00:00"),
  end: new Date("2026-07-26T00:00:00"),
};

describe("ageGroupsFromRange", () => {
  test("maps numeric ranges onto overlapping groups", () => {
    expect(ageGroupsFromRange("children ages 0-5")).toEqual([
      "baby",
      "toddler",
      "preschool",
    ]);
    expect(ageGroupsFromRange("ages 6 to 11")).toEqual(["school-age"]);
    expect(ageGroupsFromRange("grades k-5")).toBeNull(); // no numeric pair
  });
});

describe("parseLibcalRss", () => {
  test("parses structured libcal fields into floating local times", () => {
    const events = parseLibcalRss(RSS_FIXTURE);

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      id: "111",
      title: "Crafts for Little Ones",
      startTime: "2026-07-14T10:15:00",
      endTime: "2026-07-14T11:00:00",
      audiences: ["Children Ages 0-5"],
      campus: "Rice",
      categories: ["Arts & Culture"],
    });
    expect(events[0].description).toBe("Come pick up a craft!");
  });
});

describe("createLibcalRssProvider", () => {
  function buildProvider() {
    return createLibcalRssProvider({
      feeds: { OH0051: "https://cpl.libcal.com/rss.php?m=month&cid=8758" },
      fetchText: vi.fn(async () => RSS_FIXTURE),
      findLibraryById: (id) => (id === RICE.id ? RICE : undefined),
    });
  }

  test("maps ranged audiences precisely and attributes by campus", async () => {
    const events = await buildProvider().getEvents([RICE.id], RANGE);

    const craft = events.find((e) => e.id === "111");
    expect(craft).toBeDefined();
    expect(craft?.libraryId).toBe(RICE.id);
    expect(craft?.ageGroups).toEqual(["baby", "preschool", "toddler"]); // alphabetical
    expect(craft?.eventType).toBe("craft");
  });

  test("drops adult-only events and other branches' events", async () => {
    const events = await buildProvider().getEvents([RICE.id], RANGE);

    const titles = events.map((e) => e.title);
    expect(titles).not.toContain("Adult Job Help");
    expect(titles).not.toContain("Storytime at Another Branch"); // Fleet branch
  });

  test("attributes 'Central Library' campus events to the -002 outlet", async () => {
    const central: Library = {
      ...RICE,
      id: "OH0051-002",
      name: "Cleveland Public Library", // IMLS name shares no words with campus
    };
    const centralRss = RSS_FIXTURE.replace(
      "<libcal:campus>Fleet</libcal:campus>",
      "<libcal:campus>Central Library</libcal:campus>",
    );
    const provider = createLibcalRssProvider({
      feeds: { OH0051: "https://cpl.libcal.com/rss.php?m=month&cid=8758" },
      fetchText: vi.fn(async () => centralRss),
      findLibraryById: (id) => (id === central.id ? central : undefined),
    });

    const events = await provider.getEvents([central.id], RANGE);

    const storytime = events.find((e) => e.id === "333");
    expect(storytime?.libraryId).toBe(central.id);
  });

  // Single-outlet systems (e.g. Sunnyvale CA0143) tag events with a
  // department in libcal:campus ("Youth Services"), never a branch name.
  const SINGLE_OUTLET_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:libcal="https://www.springshare.com/libcal/">
<channel>
<title>Events - Sunnyvale Public Library</title>
<item>
<title>Baby Lapsit &#x26; Playtime</title>
<link>https://sunnyvale.libcal.com/event/900</link>
<libcal:eventid>900</libcal:eventid>
<libcal:date>2026-07-16</libcal:date>
<libcal:start>10:30:00</libcal:start>
<libcal:end>12:00:00</libcal:end>
<libcal:audience>Children</libcal:audience>
<libcal:campus>Youth Services</libcal:campus>
<category>Storytime</category>
</item>
<item>
<title>STAFF ONLY: Sewing Party</title>
<link>https://sunnyvale.libcal.com/event/901</link>
<libcal:eventid>901</libcal:eventid>
<libcal:date>2026-07-17</libcal:date>
<libcal:start>12:00:00</libcal:start>
<libcal:end>13:00:00</libcal:end>
<category>Meeting</category>
</item>
</channel>
</rss>`;

  const SUNNYVALE: Library = {
    ...RICE,
    id: "CA0143-002",
    name: "Sunnyvale Public Library",
  };

  function buildSingleOutletProvider() {
    return createLibcalRssProvider({
      feeds: { CA0143: "https://sunnyvale.libcal.com/rss.php?m=month&cid=13025" },
      fetchText: vi.fn(async () => SINGLE_OUTLET_RSS),
      findLibraryById: (id) => (id === SUNNYVALE.id ? SUNNYVALE : undefined),
      outletCountForSystem: () => 1,
    });
  }

  test("keeps departmental-campus events for single-outlet systems", async () => {
    const events = await buildSingleOutletProvider().getEvents(
      [SUNNYVALE.id],
      RANGE,
    );

    const lapsit = events.find((e) => e.id === "900");
    expect(lapsit).toBeDefined(); // not dropped despite "Youth Services" campus
    expect(lapsit?.libraryId).toBe(SUNNYVALE.id);
    expect(lapsit?.eventType).toBe("storytime");
  });

  test("drops STAFF ONLY internal events", async () => {
    const events = await buildSingleOutletProvider().getEvents(
      [SUNNYVALE.id],
      RANGE,
    );

    expect(events.map((e) => e.title)).not.toContain("STAFF ONLY: Sewing Party");
  });
});
