import { describe, expect, test } from "vitest";
import {
  argValue,
  assertIsoDate,
  collectBlock,
  errorBlock,
  hasErrors,
  isWeeklyRun,
  request,
  safeDetail,
  shiftDate,
  statusBlocks,
  toCount,
  todayUtc,
} from "../lib/collectBlock.mjs";

describe("dates", () => {
  test("shiftDate moves whole UTC days", () => {
    expect(shiftDate("2026-11-27", -1)).toBe("2026-11-26");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("weekly sources run on Mondays (UTC)", () => {
    expect(isWeeklyRun("2026-11-30")).toBe(true);
    expect(isWeeklyRun("2026-11-27")).toBe(false);
  });

  test("assertIsoDate rejects anything but a real YYYY-MM-DD", () => {
    expect(assertIsoDate("2026-11-27")).toBe("2026-11-27");
    expect(() => assertIsoDate("2026-02-30")).toThrow(/ISO date/);
    expect(() => assertIsoDate("27/11/2026")).toThrow(/ISO date/);
    expect(() => assertIsoDate(undefined)).toThrow(/ISO date/);
  });
});

describe("collectBlock", () => {
  test("returns a block that passes the signal schema", async () => {
    const block = await collectBlock("F7", async () => ({ status: "ok", visitsByEngine: { chatgpt: 1 } }));
    expect(block).toEqual({ status: "ok", visitsByEngine: { chatgpt: 1 } });
  });

  test("a thrown error becomes a sanitized error block", async () => {
    const block = await collectBlock("F7", async () => {
      throw new Error("fetch https://api.example/x?apikey=SECRET123 failed");
    });
    expect(block.status).toBe("error");
    expect(block.error).not.toContain("SECRET123");
    expect(block.error).toContain("https://api.example/x");
  });

  test("a block that fails the schema becomes an error, never a bad snapshot", async () => {
    const block = await collectBlock("F7", async () => ({ status: "ok", visitsByEngine: { "a b": 1 } }));
    expect(block).toEqual({ status: "error", error: expect.stringMatching(/^invalid F7 block: visitsByEngine/) });
  });

  test("statusBlocks fills several ids with one status", () => {
    expect(statusBlocks(["F2", "F3"], "not-due")).toEqual({
      F2: { status: "not-due" },
      F3: { status: "not-due" },
    });
  });
});

describe("plumbing helpers", () => {
  test("SITE_HOSTS are SITE_ORIGIN's host with and without www", async () => {
    const { SITE_HOSTS } = await import("../lib/collectBlock.mjs");
    const { SITE_ORIGIN } = await import("../lib/snapshotSchema.mjs");
    const host = new URL(SITE_ORIGIN).hostname;
    expect([...SITE_HOSTS]).toEqual([host, `www.${host}`]);
  });

  test("toCount keeps non-negative integers only", () => {
    expect([toCount("7"), toCount(2.6), toCount(-1), toCount(null), toCount("x")]).toEqual([7, 3, 0, 0, 0]);
  });

  test("errorBlock redacts secrets of 8+ chars and accepts non-Error values", () => {
    expect(errorBlock(new Error("bad key abcdefgh1234"), ["abcdefgh1234", "short", null]).error).toBe(
      "bad key [redacted]",
    );
    expect(errorBlock(undefined)).toEqual({ status: "error", error: expect.any(String) });
  });

  test("safeDetail reduces vendor details to plain short tokens", () => {
    expect(safeDetail("PERMISSION_DENIED <b>x</b>")).toBe("PERMISSION_DENIED bxb");
    expect(safeDetail({ nested: true })).toBe("");
    expect(safeDetail("a".repeat(200))).toHaveLength(80);
  });

  test("hasErrors is true only when some block reads error", () => {
    expect(hasErrors({ F1: { status: "ok" }, F2: { status: "error", error: "x" } })).toBe(true);
    expect(hasErrors({ F1: { status: "ok" } })).toBe(false);
  });

  test("argValue reads --name value, else the fallback", () => {
    expect(argValue(["--date", "2026-11-27"], "--date", "d")).toBe("2026-11-27");
    expect(argValue(["--date"], "--date", "d")).toBe("d");
    expect(argValue([], "--date", "d")).toBe("d");
  });

  test("todayUtc is the UTC calendar date", () => {
    expect(todayUtc(new Date("2026-11-27T23:59:59-08:00"))).toBe("2026-11-28");
  });

  test("request parses JSON, tolerates non-JSON and passes a timeout signal", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init);
      return { ok: url !== "bad", status: url === "bad" ? 502 : 200, text: async () => (url === "json" ? '{"a":1}' : url === "bad" ? "<html>" : "") };
    };
    expect(await request(fetchImpl, "json")).toEqual({ ok: true, status: 200, body: { a: 1 }, text: '{"a":1}' });
    expect(await request(fetchImpl, "bad")).toEqual({ ok: false, status: 502, body: null, text: "<html>" });
    expect(await request(fetchImpl, "empty", { method: "POST" })).toMatchObject({ body: null, text: "" });
    // Credentials (bearer tokens, query-string keys) never follow a redirect.
    expect(calls[2]).toMatchObject({ method: "POST", redirect: "error", signal: expect.any(AbortSignal) });
    await request(fetchImpl, "json", { redirect: "follow" });
    expect(calls[3].redirect).toBe("follow");
  });
});
