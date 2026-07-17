import { describe, expect, test, vi } from "vitest";
import {
  civicPlusToFloatingIso,
  createCivicPlusProvider,
  parseCivicPlusFeed,
} from "../events/custom/civicPlusProvider";
import type { Library } from "../types";

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Library Feed RSS Feed</title>
<item>
  <title>Toddler/Preschool Storytime @ Schaberg (07/22/2026 10:30 AM - 11:00 AM)</title>
  <description>Songs and stories for little ones.</description>
  <link>https://www.redwoodcity.org/Home/Components/Calendar/Event/100/</link>
  <guid>evt-100</guid>
  <eventStartDate>7/22/2026 10:30:00 AM</eventStartDate>
  <eventEndDate>7/22/2026 11:00:00 AM</eventEndDate>
</item>
<item>
  <title>Adult Book Club (07/23/2026 6:00 PM - 7:00 PM)</title>
  <description>For adults only.</description>
  <guid>evt-200</guid>
  <eventStartDate>7/23/2026 6:00:00 PM</eventStartDate>
  <eventEndDate>7/23/2026 7:00:00 PM</eventEndDate>
</item>
</channel></rss>`;

const SCHABERG: Library = {
  id: "CA0101-003",
  name: "Schaberg Branch Library",
  system: "Redwood City Public Library",
  address: "1 Main St",
  city: "Redwood City",
  state: "CA",
  zipCode: "94061",
  coordinates: { latitude: 37.48, longitude: -122.22 },
};

const RANGE = {
  start: new Date("2026-07-20T00:00:00"),
  end: new Date("2026-08-03T00:00:00"),
};

describe("civicPlus parsing helpers", () => {
  test("parses M/D/YYYY 12-hour datetime to floating ISO", () => {
    expect(civicPlusToFloatingIso("7/22/2026 10:30:00 AM")).toBe("2026-07-22T10:30:00");
    expect(civicPlusToFloatingIso("7/16/2026 8:30:00 PM")).toBe("2026-07-16T20:30:00");
    expect(civicPlusToFloatingIso("7/16/2026 12:00:00 PM")).toBe("2026-07-16T12:00:00");
    expect(civicPlusToFloatingIso("7/16/2026 12:15:00 AM")).toBe("2026-07-16T00:15:00");
    expect(civicPlusToFloatingIso("garbage")).toBeNull();
  });

  test("strips the date echo and extracts the @ branch", () => {
    const events = parseCivicPlusFeed(FEED);
    expect(events).toHaveLength(2);
    expect(events[0].title).toBe("Toddler/Preschool Storytime @ Schaberg");
    expect(events[0].branchHint).toBe("Schaberg");
    expect(events[0].startTime).toBe("2026-07-22T10:30:00");
  });

  test("extracts a CAPS: branch prefix (Santa Clara style)", () => {
    const feed = FEED.replace(
      "Toddler/Preschool Storytime @ Schaberg (07/22/2026 10:30 AM - 11:00 AM)",
      "NORTHSIDE: Family Storytime (07/22/2026 10:30 AM - 11:00 AM)",
    );
    const events = parseCivicPlusFeed(feed);
    expect(events[0].branchHint).toBe("NORTHSIDE");
    expect(events[0].title).toBe("NORTHSIDE: Family Storytime");
  });
});

describe("createCivicPlusProvider", () => {
  test("infers ages, attributes @ branch, drops adult-only", async () => {
    const fetchText = vi.fn(async () => FEED);
    const provider = createCivicPlusProvider({
      feeds: { CA0101: "https://www.redwoodcity.org/feed?id=4" },
      fetchText,
      findLibraryById: (id) => (id === SCHABERG.id ? SCHABERG : undefined),
    });

    const events = await provider.getEvents([SCHABERG.id], RANGE);

    expect(events).toHaveLength(1); // adult book club dropped
    expect(events[0]).toMatchObject({
      libraryId: SCHABERG.id,
      title: "Toddler/Preschool Storytime @ Schaberg",
      eventType: "storytime",
      startTime: "2026-07-22T10:30:00",
    });
    expect(events[0].ageGroups).toEqual(expect.arrayContaining(["toddler", "preschool"]));
  });
});
