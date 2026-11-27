import { describe, expect, test } from "vitest";
import { needsDataEvidence, parseSignalsLine } from "../lib/needsDataLinks.mjs";
import { loadSignalsConfig } from "../lib/loadSignalsConfig.mjs";

describe("parseSignalsLine", () => {
  test("parses the documented example", () => {
    expect(parseSignalsLine("Context…\n\nSignals: S4 CA0114, S2 home_system=CA0114\n")).toEqual({
      links: [
        { signalId: "S4", key: "CA0114", filter: null },
        { signalId: "S2", key: null, filter: { field: "home_system", value: "CA0114" } },
      ],
      errors: [],
    });
  });

  test("a bare signal ID links the whole signal", () => {
    expect(parseSignalsLine("Signals: F3").links).toEqual([{ signalId: "F3", key: null, filter: null }]);
  });

  test("tolerates markdown decoration, case and extra whitespace", () => {
    const body = "- **Signals:**   s4  CA0114 ,S5 PA0385,";
    expect(parseSignalsLine(body)).toEqual({
      links: [
        { signalId: "S4", key: "CA0114", filter: null },
        { signalId: "S5", key: "PA0385", filter: null },
      ],
      errors: [],
    });
  });

  test("collects several Signals: lines and de-duplicates links", () => {
    const body = "Signals: S4 CA0114\nmore text\nSignals: S4 CA0114, S3 CA0114";
    expect(parseSignalsLine(body).links.map((l) => `${l.signalId} ${l.key}`)).toEqual([
      "S4 CA0114",
      "S3 CA0114",
    ]);
  });

  test("reports unknown IDs and malformed items without dropping the good ones", () => {
    const result = parseSignalsLine("Signals: S4 CA0114, W5 Oakland, S4 a b, S2 =x");
    expect(result.links).toEqual([{ signalId: "S4", key: "CA0114", filter: null }]);
    expect(result.errors).toEqual([
      'unknown signal ID "W5" (not observed in Phase 1)',
      'cannot parse "S4 a b" (expected "<ID>", "<ID> <key>" or "<ID> <field>=<value>")',
      'cannot parse "S2 =x" (expected "<ID>", "<ID> <key>" or "<ID> <field>=<value>")',
    ]);
  });

  test("no Signals: line → nothing, no errors; mentions mid-sentence don't count", () => {
    expect(parseSignalsLine("We should watch the Signals: S4 numbers")).toEqual({ links: [], errors: [] });
    expect(parseSignalsLine(null)).toEqual({ links: [], errors: [] });
  });
});

describe("needsDataEvidence", () => {
  const config = loadSignalsConfig();
  const issues = [
    { number: 1, title: "SFPL ~7-day coverage", body: "Signals: S4 CA0114, S2 home_system=CA0114, S3" },
    { number: 2, title: "Classifier mislabels", body: "no line yet" },
  ];
  const snapshot = {
    date: "2026-12-20",
    S3: { status: "ok", missesBySystem: [] },
    S4: { status: "ok", zeroEventBySystem: [{ system: "CA0114", count: 2 }] },
  };
  const evaluation = {
    date: "2026-12-20",
    fired: [
      { signalId: "S4", trigger: "default", key: "CA0114", value: 2, severity: "info" },
      { signalId: "S4", trigger: "default", key: "NY0778", value: 1, severity: "info" },
    ],
    quiet: [{ signalId: "S3", trigger: "default" }],
    notEvaluated: [{ signalId: "S2", trigger: "default", reason: "insufficient-volume" }],
  };

  test("flags when a parked issue's own signal key fires, with today's number", () => {
    const [first, second] = needsDataEvidence(issues, { evaluation, config, snapshot });
    expect(first).toMatchObject({ issueNumber: 1, title: "SFPL ~7-day coverage", firing: true, errors: [] });
    expect(first.links).toEqual([
      {
        signalId: "S4",
        key: "CA0114",
        filter: null,
        firing: true,
        fired: [expect.objectContaining({ key: "CA0114" })],
        value: 2,
        notEvaluated: [],
        note: null,
      },
      {
        signalId: "S2",
        key: null,
        filter: { field: "home_system", value: "CA0114" },
        firing: false,
        fired: [],
        value: null, // no per-home_system breakdown in the snapshot: unknown, not 0
        notEvaluated: ["insufficient-volume"],
        note: "S2 has no per-home_system breakdown in the snapshot",
      },
      {
        signalId: "S3",
        key: null,
        filter: null,
        firing: false,
        fired: [],
        value: null,
        notEvaluated: [],
        note: null,
      },
    ]);
    expect(second).toMatchObject({ issueNumber: 2, firing: false, links: [], errors: [] });
  });

  test("a filter value matches a fired key", () => {
    const [result] = needsDataEvidence(
      [{ number: 3, title: "t", body: "Signals: S4 system=NY0778" }],
      { evaluation, config, snapshot },
    );
    expect(result.firing).toBe(true);
  });

  test("a filter on a field the signal isn't broken down by never matches by accident", () => {
    const [result] = needsDataEvidence(
      [{ number: 4, title: "t", body: "Signals: S4 home_system=NY0778" }],
      { evaluation, config, snapshot },
    );
    expect(result.firing).toBe(false);
    expect(result.links[0].note).toBe("S4 has no per-home_system breakdown in the snapshot");
  });

  test("works without a config or snapshot (values unknown)", () => {
    const [result] = needsDataEvidence([issues[0]], { evaluation });
    expect(result.links[0]).toMatchObject({ firing: true, value: null });
  });
});
