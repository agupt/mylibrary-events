import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { buildS6Block, parseCruxResponse } from "../lib/parseCrux.mjs";
import { CRUX_ENDPOINT, collectS6 } from "../sources/crux.mjs";

const fixture = (name) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/crux", name), "utf8"));

const jsonResponse = (status, body) => ({ status, json: async () => body });

describe("parseCruxResponse", () => {
  test("reads p75s, CLS from its string form, and the collection period", () => {
    const parsed = parseCruxResponse(200, fixture("desktop-all.json"));
    expect(parsed).toEqual({
      ok: true,
      reading: { status: "ok", lcpP75: 1210, inpP75: 64, clsP75: 0.03 },
      collectionPeriod: { firstDate: "2026-10-29", lastDate: "2026-11-25" },
    });
  });

  test("missing INP (today's real data) reads null, other metrics kept", () => {
    const parsed = parseCruxResponse(200, fixture("phone-ok-no-inp.json"));
    expect(parsed.reading).toEqual({ status: "ok", lcpP75: 890, inpP75: null, clsP75: 0.01 });
  });

  test("HTTP 404 → insufficient-field-data, no period", () => {
    expect(parseCruxResponse(404, fixture("not-found.json"))).toEqual({
      ok: true,
      reading: { status: "insufficient-field-data", lcpP75: null, inpP75: null, clsP75: null },
      collectionPeriod: null,
    });
  });

  test("a 200 with no record, or a record with no metrics → insufficient-field-data", () => {
    expect(parseCruxResponse(200, {}).reading.status).toBe("insufficient-field-data");
    const bare = parseCruxResponse(200, { record: { metrics: {} } });
    expect(bare.reading.status).toBe("insufficient-field-data");
    expect(bare.collectionPeriod).toBeNull();
  });

  test("garbage p75 values read null", () => {
    const parsed = parseCruxResponse(200, {
      record: { metrics: { largest_contentful_paint: { percentiles: { p75: "abc" } },
        cumulative_layout_shift: { percentiles: { p75: "" } } } },
    });
    expect(parsed.reading.lcpP75).toBeNull();
    expect(parsed.reading.clsP75).toBeNull();
  });

  test("any other status is an error", () => {
    expect(parseCruxResponse(403, null)).toEqual({ ok: false, error: "CrUX HTTP 403" });
  });
});

describe("buildS6Block", () => {
  test("phone and desktop keep their own status", () => {
    const block = buildS6Block(
      parseCruxResponse(200, fixture("phone-ok-no-inp.json")),
      parseCruxResponse(404, null),
    );
    expect(block.status).toBe("ok");
    expect(block.phone.status).toBe("ok");
    expect(block.desktop.status).toBe("insufficient-field-data");
    expect(block.collectionPeriod).toEqual({ firstDate: "2026-10-29", lastDate: "2026-11-25" });
    expect(signalSchemas.S6.safeParse(block).success).toBe(true);
  });

  test("both 404 → block insufficient-field-data with a null period", () => {
    const empty = parseCruxResponse(404, null);
    const block = buildS6Block(empty, empty);
    expect(block.status).toBe("insufficient-field-data");
    expect(block.collectionPeriod).toBeNull();
    expect(signalSchemas.S6.safeParse(block).success).toBe(true);
  });

  test("either form factor failing makes the block an error", () => {
    const block = buildS6Block(parseCruxResponse(200, fixture("desktop-all.json")), {
      ok: false,
      error: "CrUX HTTP 500",
    });
    expect(block).toEqual({ status: "error", error: "CrUX HTTP 500" });
    expect(signalSchemas.S6.safeParse(block).success).toBe(true);
  });
});

describe("collectS6", () => {
  test("no key → not-configured, no network call", async () => {
    const fetch = vi.fn();
    const block = await collectS6({ env: {}, fetch });
    expect(block.status).toBe("not-configured");
    expect(fetch).not.toHaveBeenCalled();
    expect(signalSchemas.S6.safeParse(block).success).toBe(true);
  });

  test("queries PHONE and DESKTOP with the key in a header, never the URL", async () => {
    const fetch = vi.fn(async (url, init) => {
      const { formFactor } = JSON.parse(init.body);
      return formFactor === "PHONE"
        ? jsonResponse(200, fixture("phone-ok-no-inp.json"))
        : jsonResponse(404, fixture("not-found.json"));
    });
    const block = await collectS6({ env: { CRUX_API_KEY: "test-key-123" }, fetch });

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe(CRUX_ENDPOINT);
      expect(url).not.toContain("test-key-123");
      expect(init.headers["x-goog-api-key"]).toBe("test-key-123");
      expect(JSON.parse(init.body).origin).toBe("https://mylibrary-events.com");
    }
    expect(block.phone).toEqual({ status: "ok", lcpP75: 890, inpP75: null, clsP75: 0.01 });
    expect(block.desktop.status).toBe("insufficient-field-data");
    expect(signalSchemas.S6.safeParse(block).success).toBe(true);
  });

  test("a network error that mentions a key-bearing URL is sanitized", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("fetch failed https://chromeuxreport.googleapis.com/v1/x?key=SECRET123");
    });
    const block = await collectS6({ env: { CRUX_API_KEY: "k" }, fetch });
    expect(block.status).toBe("error");
    expect(block.error).not.toContain("SECRET123");
    expect(signalSchemas.S6.safeParse(block).success).toBe(true);
  });
});
