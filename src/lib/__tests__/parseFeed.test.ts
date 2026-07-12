import { describe, expect, test } from "vitest";
import { parseBcFeed } from "../events/bibliocommons/parseFeed";
import { BC_FEED_FIXTURE } from "./fixtures/bcFeed";

describe("parseBcFeed", () => {
  test("parses every item with dates, location, and categories", () => {
    const events = parseBcFeed(BC_FEED_FIXTURE);

    expect(events).toHaveLength(5);
    const first = events[0];
    expect(first.title).toBe("Toddler Storytime");
    expect(first.startTime).toBe("2026-07-15T17:30:00Z");
    expect(first.locationName).toBe("Rockridge Branch");
    expect(first.locationZip).toBe("94618");
    expect(first.audiences).toEqual(["Toddlers"]);
    expect(first.categories).toEqual(["Storytimes"]);
  });

  test("strips HTML and entities from descriptions", () => {
    const events = parseBcFeed(BC_FEED_FIXTURE);
    expect(events[0].description).toBe("Songs & stories for little ones.");
  });

  test("flags cancelled events", () => {
    const events = parseBcFeed(BC_FEED_FIXTURE);
    expect(events.find((e) => e.title === "Cancelled Craft Hour")?.isCancelled).toBe(
      true,
    );
  });

  test("returns empty array for a feed with no items", () => {
    const emptyFeed = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>`;
    expect(parseBcFeed(emptyFeed)).toEqual([]);
  });

  test("skips items without a parseable start date", () => {
    const badFeed = `<?xml version="1.0"?>
<rss xmlns:bc="http://bibliocommons.com/rss/1.0/modules/event/" version="2.0">
<channel><item><title>No date</title></item></channel></rss>`;
    expect(parseBcFeed(badFeed)).toEqual([]);
  });
});
