import { describe, expect, test, vi } from "vitest";
import {
  createMyLibraryDigitalProvider,
  parseMyLibraryDigitalDateTime,
  parseMyLibraryDigitalFeed,
} from "../events/custom/myLibraryDigitalProvider";
import type { Library } from "../types";

const DESC_KID =
  "&lt;p&gt;&lt;strong&gt;Date/Time:&lt;/strong&gt; Fri, 17 Jul 2026, 10:30am - 11:00am&lt;/p&gt;&lt;p&gt;Songs and stories for children ages 2-3 years old.&lt;/p&gt;";
const DESC_ADULT =
  "&lt;p&gt;&lt;strong&gt;Date/Time:&lt;/strong&gt; Sat, 18 Jul 2026, 2:00pm - 3:00pm&lt;/p&gt;&lt;p&gt;Tax help for adults.&lt;/p&gt;";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Events | Alameda Free Library</title>
<item>
  <title>Toddler Plus Storytime</title>
  <link>https://alamedafree.events.mylibrary.digital/event?id=307223</link>
  <guid isPermaLink="true">evt-307223</guid>
  <description>${DESC_KID}</description>
  <pubDate>Wed, 15 Jul 2026 18:03:42 -0700</pubDate>
</item>
<item>
  <title>Adult Tax Help</title>
  <guid>evt-999</guid>
  <description>${DESC_ADULT}</description>
  <pubDate>Wed, 15 Jul 2026 18:03:42 -0700</pubDate>
</item>
</channel></rss>`;

const MAIN: Library = {
  id: "CA0002-002",
  name: "Alameda Free Library",
  system: "Alameda Free Library",
  address: "1550 Oak St",
  city: "Alameda",
  state: "CA",
  zipCode: "94501",
  coordinates: { latitude: 37.76, longitude: -122.24 },
};

const RANGE = {
  start: new Date("2026-07-16T00:00:00"),
  end: new Date("2026-07-30T00:00:00"),
};

describe("mylibrary.digital parsing", () => {
  test("parses the event date/time out of the description HTML", () => {
    expect(parseMyLibraryDigitalDateTime(DESC_KID)).toEqual({
      startTime: "2026-07-17T10:30:00",
      endTime: "2026-07-17T11:00:00",
    });
    expect(parseMyLibraryDigitalDateTime(DESC_ADULT)).toEqual({
      startTime: "2026-07-18T14:00:00",
      endTime: "2026-07-18T15:00:00",
    });
    expect(parseMyLibraryDigitalDateTime("no date here")).toBeNull();
  });

  test("parses feed items and skips undated ones", () => {
    const events = parseMyLibraryDigitalFeed(FEED);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: "Toddler Plus Storytime",
      startTime: "2026-07-17T10:30:00",
    });
  });
});

describe("createMyLibraryDigitalProvider", () => {
  test("attributes to the main outlet, infers ages, drops adult-only", async () => {
    const fetchText = vi.fn(async () => FEED);
    const provider = createMyLibraryDigitalProvider({
      feeds: { CA0002: "https://alamedafree.events.mylibrary.digital/rss" },
      fetchText,
      findLibraryById: (id) => (id === MAIN.id ? MAIN : undefined),
    });

    const events = await provider.getEvents([MAIN.id], RANGE);

    expect(events).toHaveLength(1); // adult tax help dropped
    expect(events[0]).toMatchObject({
      libraryId: MAIN.id,
      title: "Toddler Plus Storytime",
      eventType: "storytime",
      startTime: "2026-07-17T10:30:00",
    });
    expect(events[0].ageGroups).toContain("toddler");
  });
});
