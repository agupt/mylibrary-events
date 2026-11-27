import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signalSchemas } from "../lib/snapshotSchema.mjs";
import { parseBingDate, parseF5 } from "../lib/parseBing.mjs";

function fixture(name) {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/bing", name), "utf8"));
}

function expectValid(block) {
  const result = signalSchemas.F5.safeParse(block);
  expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
}

describe("parseBingDate", () => {
  test("WCF /Date(ms±hhmm)/ → the local calendar date", () => {
    expect(parseBingDate("/Date(1795420800000-0800)/")).toBe("2026-11-23");
    expect(parseBingDate("/Date(1795420800000)/")).toBe("2026-11-23");
    expect(parseBingDate("/Date(1795449600000+0100)/")).toBe("2026-11-23");
  });

  test("rejects anything else", () => {
    expect(() => parseBingDate("2026-11-23")).toThrow(/Bing date/);
  });
});

describe("parseF5", () => {
  test("keeps the latest weekly bucket", () => {
    const block = parseF5(fixture("rank-traffic-weeks.json"));
    expect(block).toEqual({ status: "ok", weekOf: "2026-11-23", clicks: 7, impressions: 210 });
    expectValid(block);
  });

  test("an all-zero bucket is a zero-rows reading (today's live shape)", () => {
    const block = parseF5(fixture("rank-traffic-zero.json"));
    expect(block).toEqual({ status: "zero-rows", weekOf: "2026-11-23", clicks: 0, impressions: 0 });
    expectValid(block);
  });

  test("0 rows is a valid zero-rows reading, not an error", () => {
    const block = parseF5(fixture("rank-traffic-empty.json"));
    expect(block).toEqual({ status: "zero-rows", weekOf: null, clicks: 0, impressions: 0 });
    expectValid(block);
  });

  test("an error body is an error", () => {
    expect(() => parseF5(fixture("error.json"))).toThrow(/unexpected Bing response/);
  });
});
