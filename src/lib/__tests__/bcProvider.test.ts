import { describe, expect, test, vi } from "vitest";
import { createBiblioCommonsProvider } from "../events/bibliocommons/provider";
import type { Library } from "../types";
import { BC_FEED_FIXTURE } from "./fixtures/bcFeed";

const ROCKRIDGE: Library = {
  id: "CA0081-015",
  name: "Rockridge Branch Library",
  system: "Oakland Public Library",
  address: "5366 College Ave",
  city: "Oakland",
  state: "CA",
  zipCode: "94618",
  coordinates: { latitude: 37.8443, longitude: -122.2519 },
};

const MAIN: Library = {
  ...ROCKRIDGE,
  id: "CA0081-002",
  name: "Oakland Main Library",
  zipCode: "94612",
};

const LIBRARIES_BY_ID = new Map([
  [ROCKRIDGE.id, ROCKRIDGE],
  [MAIN.id, MAIN],
]);

const RANGE = {
  start: new Date("2026-07-12T00:00:00Z"),
  end: new Date("2026-07-26T00:00:00Z"),
};

function buildProvider(fetchText = vi.fn(async () => BC_FEED_FIXTURE)) {
  const provider = createBiblioCommonsProvider({
    feeds: { CA0081: "https://example.test/feed" },
    fetchText,
    findLibraryById: (id) => LIBRARIES_BY_ID.get(id),
  });
  return { provider, fetchText };
}

describe("createBiblioCommonsProvider", () => {
  test("attributes events to the right branch by zip", async () => {
    const { provider } = buildProvider();

    const events = await provider.getEvents([ROCKRIDGE.id], RANGE);

    expect(events.map((e) => e.title)).toEqual(["Toddler Storytime"]);
    expect(events[0].libraryId).toBe(ROCKRIDGE.id);
    expect(events[0].eventType).toBe("storytime");
    expect(events[0].ageGroups).toEqual(["toddler"]);
  });

  test("drops adult-only, cancelled, and out-of-range events", async () => {
    const { provider } = buildProvider();

    const events = await provider.getEvents([ROCKRIDGE.id, MAIN.id], RANGE);
    const titles = events.map((e) => e.title);

    expect(titles).not.toContain("Adult Tax Help");
    expect(titles).not.toContain("Cancelled Craft Hour");
    expect(titles).not.toContain("Out of Range Storytime");
    expect(titles).toContain("Main Library Lego Club");
  });

  test("fetches each feed once and serves repeat calls from cache", async () => {
    const { provider, fetchText } = buildProvider();

    await provider.getEvents([ROCKRIDGE.id, MAIN.id], RANGE);
    await provider.getEvents([ROCKRIDGE.id], RANGE);

    expect(fetchText).toHaveBeenCalledTimes(1);
  });

  test("returns empty for libraries whose system has no feed", async () => {
    const { provider, fetchText } = buildProvider();

    const events = await provider.getEvents(["TX9999-001"], RANGE);

    expect(events).toEqual([]);
    expect(fetchText).not.toHaveBeenCalled();
  });

  test("returns empty instead of throwing when the feed fetch fails", async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const { provider } = buildProvider(failingFetch);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const events = await provider.getEvents([ROCKRIDGE.id], RANGE);

    expect(events).toEqual([]);
    errorSpy.mockRestore();
  });
});
