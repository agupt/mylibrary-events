import { describe, expect, test, vi } from "vitest";
import {
  createGovCalProvider,
  parseGovCalResponse,
} from "../events/custom/govCalProvider";
import type { Library } from "../types";

const RESPONSE = JSON.stringify({
  Success: true,
  Value: [
    {
      Date: "2026-07-16T00:00:00Z",
      Events: [
        {
          Id: 1,
          Name: "Greenfield - Wee One's Wonderland!",
          Description: "A play space for babies and toddlers.",
          DateStart: "2026-07-16T10:00:00Z",
          DateEnd: "2026-07-16T11:00:00Z",
          AllDay: false,
          Labels: ["LibraryGreenfield", "MCFL"],
        },
        {
          Id: 2,
          Name: "Board of Supervisors Meeting",
          Description: "County business.",
          DateStart: "2026-07-16T14:00:00Z",
          AllDay: false,
          Labels: ["BoardOfSupervisors"],
        },
      ],
    },
  ],
});

const GREENFIELD: Library = {
  id: "CA0073-012",
  name: "Greenfield Branch Library",
  system: "Monterey County Free Libraries",
  address: "315 El Camino Real",
  city: "Greenfield",
  state: "CA",
  zipCode: "93927",
  coordinates: { latitude: 36.32, longitude: -121.24 },
};

const RANGE = {
  start: new Date("2026-07-16T00:00:00"),
  end: new Date("2026-07-30T00:00:00"),
};

describe("govCal parsing", () => {
  test("keeps only the labelled system's events and floats DateStart", () => {
    const events = parseGovCalResponse(RESPONSE, "MCFL");
    expect(events).toHaveLength(1); // board meeting filtered out
    expect(events[0]).toMatchObject({
      name: "Greenfield - Wee One's Wonderland!",
      startTime: "2026-07-16T10:00:00",
      labels: ["LibraryGreenfield", "MCFL"],
    });
  });
});

describe("createGovCalProvider", () => {
  test("POSTs the label filter, attributes branch from the name prefix", async () => {
    const postJson = vi.fn(async (_url: string, _body: unknown) => RESPONSE);
    const provider = createGovCalProvider({
      feeds: {
        CA0073:
          "https://calendar.countyofmonterey.gov/api/events/GetEventsByDay/CountyofMonterey?ppid=10171&label=MCFL&lat=36.6&lng=-121.6",
      },
      postJson,
      findLibraryById: (id) => (id === GREENFIELD.id ? GREENFIELD : undefined),
    });

    const events = await provider.getEvents([GREENFIELD.id], RANGE);

    expect(postJson).toHaveBeenCalledTimes(1);
    const [, body] = postJson.mock.calls[0];
    expect(body).toMatchObject({ ppid: 10171, search: "labels:MCFL" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      libraryId: GREENFIELD.id, // matched "Greenfield" prefix
      title: "Greenfield - Wee One's Wonderland!",
      startTime: "2026-07-16T10:00:00",
    });
    expect(events[0].ageGroups).toEqual(expect.arrayContaining(["baby", "toddler"]));
  });
});
