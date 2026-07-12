import { describe, expect, test, vi } from "vitest";
import {
  createBklynProvider,
  mapBklynDoc,
  parseBklynResponse,
} from "../events/custom/bklynProvider";
import type { Library } from "../types";

const DOC = {
  id: "drupal_node_829071",
  item_id: "829071",
  ts_title: "Storytime",
  ts_body: "<p>Enjoy stories, songs, and rhymes in the Youth Wing!</p>",
  ds_event_start_date: "2026-07-13T11:30:00Z",
  ds_event_end_date: "2026-07-13T12:00:00Z",
  ss_event_location: "Central Library, Youth Wing",
  ss_event_age: "Birth to Five Years",
  sm_event_tags: "['early literacy', 'storytime']",
  is_event_canceled: "0",
};

const RESPONSE = JSON.stringify({
  grouped: {
    ss_grouping: {
      matches: 2,
      groups: [
        { doclist: { docs: [DOC] } },
        {
          doclist: {
            docs: [
              {
                ...DOC,
                item_id: "999",
                ts_title: "Resume Help",
                ss_event_age: "Adults",
                ss_event_location: "Flatlands Library",
              },
            ],
          },
        },
      ],
    },
  },
});

const CENTRAL: Library = {
  id: "NY0004-002",
  name: "Brooklyn Public Library", // IMLS central name
  system: "Brooklyn Public Library",
  address: "10 Grand Army Plaza",
  city: "Brooklyn",
  state: "NY",
  zipCode: "11238",
  coordinates: { latitude: 40.6727, longitude: -73.9682 },
};

const RANGE = {
  start: new Date("2026-07-12T00:00:00Z"),
  end: new Date("2026-07-26T00:00:00Z"),
};

describe("parseBklynResponse / mapBklynDoc", () => {
  test("flattens Solr groups and maps 'Birth to Five Years' precisely", () => {
    const docs = parseBklynResponse(RESPONSE);
    expect(docs).toHaveLength(2);

    const event = mapBklynDoc(docs[0], CENTRAL.id);
    expect(event).toMatchObject({
      id: "829071",
      title: "Storytime",
      eventType: "storytime",
      startTime: "2026-07-13T11:30:00.000Z",
    });
    expect(event?.ageGroups).toEqual(["baby", "preschool", "toddler"]);
    expect(event?.description).toBe(
      "Enjoy stories, songs, and rhymes in the Youth Wing!",
    );
  });

  test("drops adult-only and cancelled docs", () => {
    const adult = parseBklynResponse(RESPONSE)[1];
    expect(mapBklynDoc(adult, CENTRAL.id)).toBeNull();
    expect(mapBklynDoc({ ...DOC, is_event_canceled: "1" }, CENTRAL.id)).toBeNull();
  });
});

describe("createBklynProvider", () => {
  test("sends browser headers, paginates, and attributes Central to -002", async () => {
    const fetchText = vi.fn(
      async (url: string, _headers?: Record<string, string>) =>
        url.includes("pagination=1")
          ? RESPONSE
          : JSON.stringify({ grouped: { ss_grouping: { groups: [] } } }),
    );
    const provider = createBklynProvider({
      feeds: { NY0004: "https://discover.bklynlibrary.org" },
      fetchText,
      findLibraryById: (id) => (id === CENTRAL.id ? CENTRAL : undefined),
    });

    const events = await provider.getEvents([CENTRAL.id], RANGE);

    const [url, headers] = fetchText.mock.calls[0];
    expect(url).toContain("eventdate=07-12-2026");
    expect(headers?.referer).toContain("discover.bklynlibrary.org");
    expect(events).toHaveLength(1); // storytime kept, Flatlands (unselected) dropped
    expect(events[0].libraryId).toBe(CENTRAL.id);
  });
});
