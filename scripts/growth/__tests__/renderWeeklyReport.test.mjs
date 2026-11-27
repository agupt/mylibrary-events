import { describe, expect, test } from "vitest";
import { formatRunSummary, isoWeek, renderWeeklyReport, weeklyReportPath } from "../lib/renderWeeklyReport.mjs";
import { makeSnapshot, s1 } from "./helpers/snapshots.mjs";

const S12 = {
  status: "ok",
  visitsByEntry: { "www.google.com": { city: 40, library: 20 } },
  actionsByPageType: { city: { widget_loaded: 30 } },
  engagedRateByPageType: { city: 0.125, library: 0.05 },
  funnel: [
    { source: "www.google.com", pageType: "city", action: "none", visits: 35 },
    { source: "www.google.com", pageType: "city", action: "outbound_click", visits: 5 },
    { source: "$direct", pageType: "home", action: "search_performed", visits: 3 },
  ],
};

const config = {
  signals: [
    { id: "S1", name: "Traffic volume", status: "draft", metric: "S1.pageviews" },
    { id: "S4", name: "Zero-event result", status: "draft", metric: "S4.zeroEventBySystem", per: "system" },
  ],
};

const evaluation = {
  date: "2026-11-30",
  fired: [
    {
      signalId: "S4",
      name: "Zero-event result",
      key: "CA0114",
      severity: "info",
      rule: "consecutive",
      value: 3,
      threshold: { gte: 1 },
      evidence: { dates: ["2026-11-28", "2026-11-29", "2026-11-30"], values: [1, 1, 1] },
    },
  ],
  quiet: [{ signalId: "S1" }],
  notEvaluated: [
    { signalId: "S2", reason: "insufficient-volume" },
    { signalId: "S6", trigger: "lcp", reason: "not-configured" },
  ],
};

const snapshots = [
  makeSnapshot("2026-11-29", { S1: s1(100), F10: { status: "ok", submissions: 1, byContext: { "no-feed": 1 } } }),
  makeSnapshot("2026-11-30", {
    S1: s1(120),
    S12,
    S5: { status: "error", error: "probe API down" },
    F10: { status: "ok", submissions: 2, byContext: { "no-feed": 1, "no-events": 1 } },
  }),
];

function render(overrides = {}) {
  return renderWeeklyReport({
    date: "2026-11-30",
    snapshots,
    evaluation,
    config,
    needsData: [
      {
        issueNumber: 1,
        title: "SFPL coverage <script>",
        firing: true,
        links: [{ signalId: "S4", key: "CA0114", filter: null, firing: true, value: 1, notEvaluated: [], note: null }],
        errors: [],
      },
    ],
    falsePositives: { valid: 1, falsePositive: 0, unjudged: 2, rate: 0, hasEnoughEvidence: false },
    ...overrides,
  });
}

describe("isoWeek / weeklyReportPath", () => {
  test("uses ISO-8601 weeks (Monday start, week 1 holds Jan 4)", () => {
    expect(isoWeek("2026-11-30")).toBe("2026-W49");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(weeklyReportPath("2026-11-30")).toBe("reports/growth/weekly-2026-W49.md");
  });
});

describe("renderWeeklyReport", () => {
  test("states the observation-only rule and the window", () => {
    const md = render();
    expect(md).toContain("# Weekly growth report: 2026-W49");
    expect(md).toContain("2026-11-24 to 2026-11-30");
    expect(md).toMatch(/observation only/i);
  });

  test("prints the clean-day streak and why it broke", () => {
    const md = render();
    expect(md).toContain("Clean-day streak: **0/14**");
    expect(md).toContain("error: S5");
  });

  test("prints every not-evaluated reason, never dropping one", () => {
    const md = render();
    expect(md).toMatch(/\| S2 \| — \| insufficient-volume \|/);
    expect(md).toMatch(/\| S6 \| lcp \| not-configured \|/);
  });

  test("prints fired triggers with their keys as code", () => {
    expect(render()).toMatch(/\| S4 \| — \| `CA0114` \| 3 \| consecutive gte 1 \|/);
  });

  test("renders the S12 funnel: traffic source -> page type -> action", () => {
    const md = render();
    expect(md).toContain("## Landing funnel (S12)");
    expect(md).toMatch(/\| `www.google.com` \| city \| none \| 35 \|/);
    expect(md).toMatch(/\| city \| 12.5% \|/);
  });

  test("says why S12 is missing instead of printing zeros", () => {
    const md = render({ snapshots: [makeSnapshot("2026-11-30")] });
    expect(md).toContain("S12 has no reading this week (latest status: not-configured)");
  });

  test("sums F10 over the week and keeps feedback text out", () => {
    const md = render();
    expect(md).toContain("Submissions this week: **3**");
    expect(md).toMatch(/no-feed: 2/);
    expect(md).toMatch(/text stays in PostHog/i);
  });

  test("false-positive rate says when there is not enough evidence", () => {
    expect(render()).toMatch(/not enough evidence/i);
    expect(render({ falsePositives: null })).toMatch(/unavailable/i);
  });

  test("needs-data evidence escapes human-written titles", () => {
    const md = render();
    expect(md).toContain("#1");
    expect(md).not.toContain("<script>");
    expect(render({ needsData: null })).toMatch(/needs-data issues could not be read/);
  });

  test("baseline table prints p50/p95 per metric", () => {
    expect(render()).toMatch(/\| S1 \| — \| S1.pageviews \| 2 \| 110 \| 119 \|/);
  });
});

describe("renderWeeklyReport edge cases", () => {
  const quietEvaluation = { date: "2026-11-30", fired: [], quiet: [{ signalId: "S13", trigger: "share" }], notEvaluated: [] };

  test("a quiet week says so instead of printing empty tables", () => {
    const md = render({ evaluation: quietEvaluation, needsData: [], snapshots: [makeSnapshot("2026-11-30")] });
    expect(md).toContain("Nothing fired.");
    expect(md).toContain("S13/share");
    expect(md).toContain("Every trigger was evaluated.");
    expect(md).toContain("No open `needs-data` issues.");
    expect(md).toContain("No F10 reading this week.");
  });

  test("an S12 reading with no rows says so", () => {
    const empty = { status: "zero-rows", visitsByEntry: {}, actionsByPageType: {}, engagedRateByPageType: {}, funnel: [] };
    const md = render({ snapshots: [makeSnapshot("2026-11-30", { S12: empty })] });
    expect(md).toContain("No visits.");
    expect(md).toContain("No page types.");
  });

  test("needs-data rows cover filter links, unparsable lines and enough FP evidence", () => {
    const md = render({
      needsData: [
        {
          issueNumber: 2,
          title: "Classifier",
          firing: false,
          links: [
            {
              signalId: "S2",
              key: null,
              filter: { field: "home_system", value: "CA0114" },
              firing: false,
              value: null,
              notEvaluated: ["insufficient-volume"],
              note: "S2 has no per-home_system breakdown in the snapshot",
            },
            { signalId: "F1", key: null, filter: null, firing: false, value: null, notEvaluated: [], note: null },
          ],
          errors: [],
        },
        { issueNumber: 3, title: "Parser", firing: false, links: [], errors: ['cannot parse "X"'] },
      ],
      falsePositives: { valid: 3, falsePositive: 1, unjudged: 0, rate: 0.25, hasEnoughEvidence: true },
    });
    expect(md).toMatch(/\| #2 \| Classifier \| S2 `home_system=CA0114` \| quiet \| unknown \| insufficient-volume; S2 has no per-home_system/);
    expect(md).toMatch(/\| #2 \| Classifier \| F1 \| quiet \| unknown \| — \|/);
    expect(md).toMatch(/\| #3 \| Parser \| no `Signals:` line \| — \| — \| cannot parse "X" \|/);
    expect(md).toContain("Rate: **25%**.");
    expect(md).not.toMatch(/not enough evidence/i);
  });

  test("an F10 block without contexts prints just the count", () => {
    const md = render({ snapshots: [makeSnapshot("2026-11-30", { F10: { status: "ok", submissions: 0, byContext: {} } })] });
    expect(md).toContain("Submissions this week: **0**.");
  });
});

describe("formatRunSummary", () => {
  test("lists each signal's status, fired triggers and planned issue actions", () => {
    const text = formatRunSummary({
      snapshot: snapshots[1],
      evaluation,
      plan: [{ action: "create", signalId: "S4", issueNumber: null, title: "signal S4: Zero-event result", reason: "new" }],
      dryRun: true,
    });
    expect(text).toMatch(/DRY RUN/);
    expect(text).toMatch(/S1\s+ok/);
    expect(text).toMatch(/S5\s+error\s+probe API down/);
    expect(text).toMatch(/fired: S4 CA0114/);
    expect(text).toMatch(/create\s+S4/);
  });

  test("says when issues were skipped", () => {
    const text = formatRunSummary({ snapshot: snapshots[1], evaluation, plan: null, dryRun: false });
    expect(text).toMatch(/issues: skipped/);
  });
});
