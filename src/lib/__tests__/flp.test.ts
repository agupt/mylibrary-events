import { describe, expect, test, vi } from "vitest";
import {
  createFlpProvider,
  flpStartIso,
  parseFlpFeed,
  splitFlpTitle,
} from "../events/custom/flpProvider";
import type { Library } from "../types";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Upcoming toddler Events at the Free Library</title>
<item>
  <title>07/14/26: Family Storytime - Bustleton Library</title>
  <description>&#60;p&#62;Stories and songs for little ones.&#60;/p&#62;</description>
  <link>https://libwww.freelibrary.org/calendar/event/170542</link>
  <startdate>07/14/26</startdate>
  <starttime>10:30 A.M.</starttime>
</item>
<item>
  <title>07/14/26: Chess Night - Parkway Central Library</title>
  <description>Chess for everyone.</description>
  <link>https://libwww.freelibrary.org/calendar/event/999</link>
  <startdate>07/14/26</startdate>
  <starttime>5:30 P.M.</starttime>
</item>
</channel></rss>`;

const BUSTLETON: Library = {
  id: "PA0385-010",
  name: "Bustleton Library",
  system: "Free Library Of Philadelphia",
  address: "1 Main St",
  city: "Philadelphia",
  state: "PA",
  zipCode: "19115",
  coordinates: { latitude: 40.09, longitude: -75.04 },
};

const RANGE = {
  start: new Date("2026-07-13T00:00:00"),
  end: new Date("2026-07-27T00:00:00"),
};

describe("flp parsing helpers", () => {
  test("parses custom startdate/starttime tags", () => {
    const events = parseFlpFeed(FEED);
    expect(events).toHaveLength(2);
    expect(events[0].startdate).toBe("07/14/26");
    expect(events[0].description).toBe("Stories and songs for little ones.");
  });

  test("converts date and 12-hour time to floating ISO", () => {
    expect(flpStartIso("07/14/26", "10:30 A.M.")).toBe("2026-07-14T10:30:00");
    expect(flpStartIso("07/14/26", "5:30 P.M.")).toBe("2026-07-14T17:30:00");
    expect(flpStartIso("bad", "5 P.M.")).toBeNull();
  });

  test("splits the date-prefixed title and branch suffix", () => {
    expect(splitFlpTitle("07/14/26: Family Storytime - Bustleton Library")).toEqual({
      title: "Family Storytime",
      branch: "Bustleton Library",
    });
  });
});

describe("createFlpProvider", () => {
  test("stacks age feeds, attributes branches, drops unselected ones", async () => {
    const fetchText = vi.fn(async (_url: string, _headers?: Record<string, string>) => FEED);
    const provider = createFlpProvider({
      feeds: { PA0385: "https://libwww.freelibrary.org" },
      fetchText,
      findLibraryById: (id) => (id === BUSTLETON.id ? BUSTLETON : undefined),
    });

    const events = await provider.getEvents([BUSTLETON.id], RANGE);

    // 4 age feeds fetched; same event merged by link with unioned ages
    expect(fetchText).toHaveBeenCalledTimes(4);
    expect(events).toHaveLength(1); // Parkway Central dropped (unselected)
    expect(events[0]).toMatchObject({
      title: "Family Storytime",
      libraryId: BUSTLETON.id,
      eventType: "storytime",
      startTime: "2026-07-14T10:30:00",
    });
    expect(events[0].ageGroups).toEqual(["baby", "preschool", "school-age", "toddler"]);
  });
});
