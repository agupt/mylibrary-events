import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SIGNALS_CONFIG_PATH,
  loadSignalsConfig,
  parseSignalsConfig,
} from "../lib/loadSignalsConfig.mjs";
import { SIGNAL_IDS } from "../lib/snapshotSchema.mjs";

const REPO_ROOT = path.join(import.meta.dirname, "../../..");
const SIGNALS_MD = path.join(REPO_ROOT, "docs/growth-agent/SIGNALS.md");

/**
 * Signals proposed in phase1-impact.md §1 whose SIGNALS.md rows are added by
 * WS-C (§1: "WS-C adds them in the same PR as the first code"). Once those
 * rows land this list can be emptied; the test never requires it.
 */
const PENDING_SIGNALS_MD_ROWS = ["S12", "S13"];

function signalsMdIds() {
  const text = readFileSync(SIGNALS_MD, "utf8");
  return new Set(
    [...text.matchAll(/^\|\s*\**([SFWM]\d{1,2})\**\s*\|/gm)].map((m) => m[1]),
  );
}

const MINIMAL = `
version: 1
signals:
  - id: S4
    name: Zero-event result
    status: draft
    metric: S4.zeroEventBySystem
    per: system
    rule: { kind: consecutive, n: 3, gte: 1 }
    severity: info
`;

function expectInvalid(yamlText, ...fragments) {
  const result = parseSignalsConfig(yamlText);
  expect(result.success).toBe(false);
  expect(result.data).toBeNull();
  for (const fragment of fragments) expect(result.error).toContain(fragment);
  return result;
}

describe("the committed signals.yml", () => {
  const config = loadSignalsConfig();

  test("loads and validates", () => {
    expect(config.version).toBe(1);
    expect(config.signals.length).toBeGreaterThan(20);
  });

  test("every signal ID is in SIGNAL_IDS", () => {
    for (const entry of config.signals) {
      expect(SIGNAL_IDS, entry.id).toContain(entry.id);
    }
  });

  test("every signal ID has a SIGNALS.md row (or a pending WS-C row)", () => {
    const documented = signalsMdIds();
    for (const entry of config.signals) {
      const known =
        documented.has(entry.id) || PENDING_SIGNALS_MD_ROWS.includes(entry.id);
      expect(known, `${entry.id} missing from SIGNALS.md`).toBe(true);
    }
  });

  test("every Phase 1 signal has an entry, so none is silently missing", () => {
    const ids = new Set(config.signals.map((entry) => entry.id));
    for (const id of SIGNAL_IDS) expect(ids, id).toContain(id);
  });

  test("every active threshold is labelled DRAFT until the baseline", () => {
    for (const entry of config.signals.filter((e) => e.status === "draft")) {
      expect(entry.note, `${entry.id}/${entry.trigger}`).toMatch(/^DRAFT/);
    }
  });

  test("S11 is not-applicable; F7 and F10 have no trigger", () => {
    const byId = (id) => config.signals.filter((entry) => entry.id === id);
    expect(byId("S11").map((e) => e.status)).toEqual(["not-applicable"]);
    expect(byId("F7").map((e) => e.status)).toEqual(["disabled"]);
    expect(byId("F10").map((e) => e.status)).toEqual(["disabled"]);
  });

  test("defaults are applied", () => {
    const s4 = config.signals.find((entry) => entry.id === "S4");
    expect(s4.cadence).toBe("daily");
    expect(s4.absentKey).toBe("zero");
    const s5 = config.signals.find((entry) => entry.id === "S5");
    expect(s5.absentKey).toBe("null");
    expect(s5.excludeKeys).toEqual([]);
  });

  test("the default path points at the docs file", () => {
    expect(SIGNALS_CONFIG_PATH).toMatch(/docs\/growth-agent\/signals\.yml$/);
  });
});

describe("parseSignalsConfig", () => {
  test("accepts a minimal valid file", () => {
    const result = parseSignalsConfig(MINIMAL);
    expect(result).toMatchObject({ success: true, error: null });
    expect(result.data.signals[0]).toMatchObject({
      id: "S4",
      trigger: "default",
      minHistoryDays: 1,
    });
  });

  test("reports YAML syntax errors clearly", () => {
    expectInvalid("version: 1\nsignals: [", "signals.yml is not valid YAML");
  });

  test("rejects an empty file and a non-mapping root", () => {
    expectInvalid("", "signals.yml");
    expectInvalid("- just\n- a list\n", "(root)");
  });

  test("rejects an unknown signal ID with its path", () => {
    expectInvalid(MINIMAL.replace("id: S4", "id: S99"), "signals.0.id");
  });

  test("rejects a metric rooted at an unknown signal block", () => {
    expectInvalid(
      MINIMAL.replace("metric: S4.zeroEventBySystem", "metric: X1.count"),
      "signals.0.metric",
    );
  });

  test("rejects an unknown rule kind", () => {
    expectInvalid(MINIMAL.replace("consecutive", "median"), "signals.0.rule");
  });

  test("rejects a rule without exactly one comparator", () => {
    expectInvalid(
      MINIMAL.replace("gte: 1 }", "gte: 1, lte: 4 }"),
      "exactly one comparator",
    );
    expectInvalid(
      MINIMAL.replace("n: 3, gte: 1 }", "n: 3 }"),
      "exactly one comparator",
    );
  });

  test("rejects unknown keys (typos never pass silently)", () => {
    expectInvalid(MINIMAL.replace("severity: info", "severty: info"), "severty");
  });

  test("an active entry needs a metric and a rule", () => {
    const withoutRule = MINIMAL.split("\n")
      .filter((line) => !line.includes("rule:"))
      .join("\n");
    expectInvalid(withoutRule, "rule is required");
  });

  test("a disabled entry may omit metric and rule", () => {
    const result = parseSignalsConfig(`
version: 1
signals:
  - id: F7
    name: AI referrals
    status: disabled
    note: trend only
`);
    expect(result.success).toBe(true);
  });

  test("a signal with several triggers needs distinct trigger names", () => {
    const twice = `${MINIMAL}${MINIMAL.split("signals:")[1]}`;
    expectInvalid(twice, "duplicate trigger S4/default");
  });

  test("newKey requires per", () => {
    expectInvalid(
      MINIMAL.replace("    per: system\n", "").replace(
        "{ kind: consecutive, n: 3, gte: 1 }",
        "{ kind: newKey, lookbackDays: 28, gte: 1 }",
      ),
      "newKey requires per",
    );
  });

  test("a perKey guard requires per", () => {
    expectInvalid(
      MINIMAL.replace("    per: system\n", "").replace(
        "severity: info",
        "severity: info\n    minVolume: { metric: S1.byPageGroup, perKey: true, windowDays: 7, gte: 1 }",
      ),
      "perKey requires per",
    );
  });

  test("per-key entries need a single metric path and valueDenominator", () => {
    expectInvalid(
      MINIMAL.replace("metric: S4.zeroEventBySystem", "metric: [S4.a, S4.b]"),
      "per needs a single metric path",
    );
    expectInvalid(
      MINIMAL.replace("severity: info", "severity: info\n    denominator: S2.searches"),
      "use valueDenominator with per",
    );
    expectInvalid(
      MINIMAL.replace(
        "severity: info",
        "severity: info\n    minVolume: { metric: [S1.a, S1.b], perKey: true, windowDays: 7, gte: 1 }",
      ),
      "perKey needs a single metric path",
    );
  });

  test("where filters need exactly one comparator", () => {
    expectInvalid(
      MINIMAL.replace("severity: info", "severity: info\n    where: { position: { lte: 5, gt: 1 } }"),
      "signals.0.where.position",
    );
  });

  test("phase1Exit rejects any entry still in draft", () => {
    expectInvalid(
      MINIMAL.replace("version: 1", "version: 1\nphase1Exit: true"),
      "still draft",
    );
  });

  test("rejects an unsupported version", () => {
    expectInvalid(MINIMAL.replace("version: 1", "version: 2"), "version");
  });
});

describe("loadSignalsConfig", () => {
  test("throws with the file path and the issues when invalid", () => {
    expect(() =>
      loadSignalsConfig(path.join(import.meta.dirname, "fixtures/signals/invalid.yml")),
    ).toThrow(/invalid\.yml: .*signals\.0\.id/);
  });

  test("throws a clear error when the file is missing", () => {
    expect(() => loadSignalsConfig("/nonexistent/signals.yml")).toThrow(
      /cannot read \/nonexistent\/signals\.yml/,
    );
  });
});
