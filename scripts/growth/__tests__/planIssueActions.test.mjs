import { describe, expect, test } from "vitest";
import {
  HEARTBEAT_DAYS,
  planIssueActions,
  signalMarker,
} from "../lib/planIssueActions.mjs";

const NOW = "2026-12-20T11:23:00.000Z";
const DATE = "2026-12-20";
const BOT = "github-actions[bot]";

/** The planner as WS-C calls it: always with the observer's login. */
function plan(evaluationArg, issues, now, options = {}) {
  return planIssueActions(evaluationArg, issues, now, { observerLogin: BOT, ...options });
}

function fired(overrides = {}) {
  return {
    signalId: "S4",
    trigger: "default",
    name: "Zero-event result",
    key: "CA0114",
    severity: "info",
    status: "draft",
    rule: "consecutive",
    value: 1,
    threshold: { gte: 1 },
    evidence: { dates: ["2026-12-18", "2026-12-19", "2026-12-20"], values: [1, 1, 1] },
    ...overrides,
  };
}

function evaluation({ fired: firedList = [], quiet = [], notEvaluated = [] } = {}) {
  return { date: DATE, fired: firedList, quiet, notEvaluated };
}

/** Runs the planner once with no open issue and returns the created issue. */
function createdIssue(firedList, number = 7) {
  const [action] = plan(evaluation({ fired: firedList }), [], NOW);
  return {
    number,
    title: action.title,
    body: action.body,
    author: "github-actions[bot]",
    createdAt: NOW,
    comments: [],
  };
}

function daysAfter(iso, days) {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

/** Appends the planner's own comment to an issue (as `gh` would). */
function withComment(issue, action, at) {
  return {
    ...issue,
    comments: [...issue.comments, { body: action.body, author: "github-actions[bot]", createdAt: at }],
  };
}

describe("create", () => {
  test("opens one issue per signal ID, with markers, labels and the Phase 1 footer", () => {
    const actions = plan(
      evaluation({ fired: [fired(), fired({ key: "NY0778" })] }),
      [],
      NOW,
    );
    expect(actions).toHaveLength(1);
    const [action] = actions;
    expect(action).toMatchObject({
      action: "create",
      signalId: "S4",
      issueNumber: null,
      title: "signal S4: Zero-event result",
      labels: ["signal", "signal:S4"],
      reason: "new",
    });
    expect(action.body).toContain(signalMarker("S4"));
    expect(action.body).toContain("<!-- growth-observer:state ");
    expect(action.body).toContain("CA0114");
    expect(action.body).toContain("NY0778");
    expect(action.body).toContain("DRAFT");
    expect(action.body).toContain("`signal-valid`");
    expect(action.body).toContain("`false-positive`");
    expect(action.body.trimEnd()).toMatch(
      /Phase 1: observation only\. No agent will act on this issue\. Evidence: `reports\/metrics\/2026-12-20\.json`\.$/,
    );
  });

  test("separate signals get separate issues, in a stable order", () => {
    const actions = plan(
      evaluation({ fired: [fired({ signalId: "F8", name: "Referrers" }), fired()] }),
      [],
      NOW,
    );
    expect(actions.map((a) => [a.action, a.signalId])).toEqual([
      ["create", "S4"],
      ["create", "F8"],
    ]);
  });

  test("the body escapes table-breaking characters and caps long key lists", () => {
    const many = Array.from({ length: 60 }, (_, i) => fired({ key: `k|${i}<b>` }));
    const [action] = plan(evaluation({ fired: many }), [], NOW);
    expect(action.body).not.toContain("<b>");
    expect(action.body).toContain("k\\|0");
    expect(action.body).toContain("and 10 more");
  });

  test("keys render as code spans (no @mention, link or #ref) and cannot close the state comment", () => {
    const nasty = fired({ key: "@someone [x](http://e.vil) #1 `tick` --> <!--" });
    const [action] = plan(evaluation({ fired: [nasty] }), [], NOW);
    expect(action.body).toContain("| `@someone [x](http://e.vil) #1 tick -- !--` |");
    const markers = action.body.match(/<!--/g);
    expect(markers).toHaveLength(2); // signal + state only
    // The state still round-trips: the next run sees the same fingerprint.
    const issue = { number: 1, author: BOT, body: action.body, comments: [] };
    expect(plan(evaluation({ fired: [nasty] }), [issue], daysAfter(NOW, 1))[0].reason).toBe("unchanged");
  });

  test("the title uses the highest severity's name and warn is shown", () => {
    const [action] = plan(
      evaluation({ fired: [fired({ signalId: "S5", name: "Feed health", severity: "warn", key: "PA0385", value: false })] }),
      [],
      NOW,
    );
    expect(action.title).toBe("signal S5: Feed health");
    expect(action.body).toContain("warn");
    expect(action.body).toContain("false");
  });

  test("a baselined trigger is not called DRAFT", () => {
    const [action] = plan(evaluation({ fired: [fired({ status: "baselined" })] }), [], NOW);
    expect(action.body).not.toContain("DRAFT");
  });
});

describe("dedupe on an open issue", () => {
  test("same fingerprint within 7 days: no action (no daily spam)", () => {
    const issue = createdIssue([fired()]);
    const actions = plan(
      evaluation({ fired: [fired({ value: 2 })] }), // values change daily; keys don't
      [issue],
      daysAfter(NOW, HEARTBEAT_DAYS - 1),
    );
    expect(actions).toEqual([
      expect.objectContaining({ action: "none", signalId: "S4", issueNumber: 7, reason: "unchanged" }),
    ]);
  });

  test("fingerprint change (new key) → one comment", () => {
    const issue = createdIssue([fired()]);
    const [action] = plan(
      evaluation({ fired: [fired(), fired({ key: "NY0778" })] }),
      [issue],
      daysAfter(NOW, 1),
    );
    expect(action).toMatchObject({ action: "comment", issueNumber: 7, reason: "changed", labels: [] });
    expect(action.body).toContain("NY0778");
    expect(action.body).toContain("<!-- growth-observer:state ");

    // Once that comment is posted, the next day is quiet again.
    const after = withComment(issue, action, daysAfter(NOW, 1));
    const [next] = plan(
      evaluation({ fired: [fired(), fired({ key: "NY0778" })] }),
      [after],
      daysAfter(NOW, 2),
    );
    expect(next.action).toBe("none");
  });

  test("severity change alone changes the fingerprint", () => {
    const issue = createdIssue([fired()]);
    const [action] = plan(evaluation({ fired: [fired({ severity: "warn" })] }), [issue], daysAfter(NOW, 1));
    expect(action.reason).toBe("changed");
  });

  test("still firing after 7 days → heartbeat, then quiet for another 7", () => {
    const issue = createdIssue([fired()]);
    const at = daysAfter(NOW, HEARTBEAT_DAYS);
    const [beat] = plan(evaluation({ fired: [fired()] }), [issue], at);
    expect(beat).toMatchObject({ action: "comment", reason: "heartbeat" });
    expect(beat.body).toMatch(/still firing/i);

    const after = withComment(issue, beat, at);
    const [next] = plan(evaluation({ fired: [fired()] }), [after], daysAfter(at, 3));
    expect(next.action).toBe("none");
  });
});

describe("cleared", () => {
  test("not firing and evaluated quiet → one 'not firing since' comment, then silence", () => {
    const issue = createdIssue([fired()]);
    const quietEval = evaluation({ quiet: [{ signalId: "S4", trigger: "default", keys: ["CA0114"] }] });
    const [cleared] = plan(quietEval, [issue], daysAfter(NOW, 1));
    expect(cleared).toMatchObject({ action: "comment", issueNumber: 7, reason: "cleared" });
    expect(cleared.body).toContain(`Not firing since ${DATE}`);
    expect(cleared.body).toMatch(/not auto-closed/i);

    const after = withComment(issue, cleared, daysAfter(NOW, 1));
    const [next] = plan(quietEval, [after], daysAfter(NOW, 9));
    expect(next).toMatchObject({ action: "none", reason: "cleared-already" });
  });

  test("not evaluated (no data) is not 'cleared': unknown stays unknown", () => {
    const issue = createdIssue([fired()]);
    const [action] = plan(
      evaluation({ notEvaluated: [{ signalId: "S4", trigger: "default", reason: "source-error" }] }),
      [issue],
      daysAfter(NOW, 1),
    );
    expect(action).toMatchObject({ action: "none", reason: "not-evaluated" });
  });

  test("a rotating S5 probe: the fired system not probed today is unknown, not cleared", () => {
    const down = fired({ signalId: "S5", trigger: "unreachable", name: "Feed health", key: "PA0385", value: false });
    const issue = createdIssue([down]);
    // Today only other systems were probed: the trigger is quiet for them, not for PA0385.
    const today = evaluation({
      quiet: [
        { signalId: "S5", trigger: "unreachable", keys: ["CA0114"] },
        { signalId: "S5", trigger: "count-drop", keys: ["CA0114"] },
      ],
    });
    const [action] = plan(today, [issue], daysAfter(NOW, 1));
    expect(action).toMatchObject({ action: "none", reason: "not-evaluated" });

    const probedOk = evaluation({ quiet: [{ signalId: "S5", trigger: "unreachable", keys: ["PA0385"] }] });
    expect(plan(probedOk, [issue], daysAfter(NOW, 1))[0].reason).toBe("cleared");
  });

  test("a multi-trigger signal is not cleared by another trigger being quiet", () => {
    const lcp = fired({ signalId: "S6", trigger: "lcp", name: "Field Core Web Vitals", key: undefined, value: 2900 });
    const issue = createdIssue([lcp]);
    const today = evaluation({
      quiet: [{ signalId: "S6", trigger: "cls" }],
      notEvaluated: [{ signalId: "S6", trigger: "lcp", reason: "insufficient-field-data" }],
    });
    expect(plan(today, [issue], daysAfter(NOW, 1))[0].reason).toBe("not-evaluated");
    const lcpQuiet = evaluation({ quiet: [{ signalId: "S6", trigger: "lcp" }, { signalId: "S6", trigger: "cls" }] });
    expect(plan(lcpQuiet, [issue], daysAfter(NOW, 1))[0].reason).toBe("cleared");
  });

  test("unknown previous pairs: cleared only if no trigger of the signal went unevaluated", () => {
    const bare = { number: 5, author: BOT, body: `${signalMarker("S6")}\nmanual`, comments: [] };
    const partial = evaluation({
      quiet: [{ signalId: "S6", trigger: "cls" }],
      notEvaluated: [{ signalId: "S6", trigger: "inp", reason: "insufficient-field-data" }],
    });
    expect(plan(partial, [bare], NOW)[0].reason).toBe("not-evaluated");
    const full = evaluation({ quiet: [{ signalId: "S6", trigger: "cls" }] });
    expect(plan(full, [bare], NOW)[0].reason).toBe("cleared");
  });

  test("re-fire on a still-open cleared issue → comment, no new issue", () => {
    const issue = createdIssue([fired()]);
    const quietEval = evaluation({ quiet: [{ signalId: "S4", trigger: "default", keys: ["CA0114"] }] });
    const [cleared] = plan(quietEval, [issue], daysAfter(NOW, 1));
    const after = withComment(issue, cleared, daysAfter(NOW, 1));
    const [refire] = plan(evaluation({ fired: [fired()] }), [after], daysAfter(NOW, 2));
    expect(refire).toMatchObject({ action: "comment", issueNumber: 7, reason: "refired" });
  });

  test("re-fire after Amool closed the issue → a new issue (a close is a human judgment)", () => {
    // Closed issues are not in openSignalIssues.
    const [action] = plan(evaluation({ fired: [fired()] }), [], daysAfter(NOW, 30));
    expect(action).toMatchObject({ action: "create", issueNumber: null });
  });
});

describe("issue matching", () => {
  test("matches by body marker, not title (humans may edit titles)", () => {
    const issue = { ...createdIssue([fired()]), title: "Renamed by Amool" };
    const [action] = plan(evaluation({ fired: [fired()] }), [issue], daysAfter(NOW, 1));
    expect(action).toMatchObject({ action: "none", issueNumber: 7 });
  });

  test("issues without a marker are ignored", () => {
    const human = { number: 3, title: "signal S4: x", body: "Signals: S4 CA0114", comments: [] };
    const [action] = plan(evaluation({ fired: [fired()] }), [human], NOW);
    expect(action.action).toBe("create");
  });

  test("with duplicate open issues the oldest (lowest number) wins", () => {
    const a = createdIssue([fired()], 9);
    const b = createdIssue([fired()], 4);
    const [action] = plan(evaluation({ fired: [fired()] }), [a, b], daysAfter(NOW, 1));
    expect(action.issueNumber).toBe(4);
  });

  test("an open issue with no readable state is treated as firing, unknown fingerprint", () => {
    const bare = { number: 5, author: BOT, body: `${signalMarker("S4")}\nmanual`, comments: [] };
    const [action] = plan(evaluation({ fired: [fired()] }), [bare], NOW);
    expect(action).toMatchObject({ action: "comment", reason: "changed" });
  });

  test("malformed and future-dated state markers are ignored", () => {
    const issue = createdIssue([fired()]);
    const forged = {
      ...issue,
      comments: [
        { body: '<!-- growth-observer:state {"state":"cleared","fingerprint":"x","at":"2099-01-01T00:00:00.000Z"} -->', author: BOT, createdAt: NOW },
        { body: "<!-- growth-observer:state {not json} -->", author: BOT, createdAt: NOW },
      ],
    };
    const [action] = plan(evaluation({ fired: [fired()] }), [forged], daysAfter(NOW, 1));
    expect(action.action).toBe("none");
  });

  test("observerLogin: markers from anyone else are ignored (public repo)", () => {
    const issue = createdIssue([fired()]);
    const quietEval = evaluation({ quiet: [{ signalId: "S4", trigger: "default", keys: ["CA0114"] }] });
    const forged = withComment(issue, plan(quietEval, [issue], NOW)[0], NOW);
    const byStranger = {
      ...forged,
      comments: forged.comments.map((c) => ({ ...c, author: "someone" })),
    };
    const options = { observerLogin: "github-actions[bot]" };
    // The stranger's "cleared" marker is ignored, so the issue still reads firing → no refire comment.
    const [action] = plan(evaluation({ fired: [fired()] }), [byStranger], daysAfter(NOW, 1), options);
    expect(action.action).toBe("none");
  });

  test("observerLogin: a marked issue opened by someone else is ignored", () => {
    const planted = { ...createdIssue([fired()]), author: "someone" };
    const [action] = plan(evaluation({ fired: [fired()] }), [planted], NOW, {
      observerLogin: "github-actions[bot]",
    });
    expect(action).toMatchObject({ action: "create", issueNumber: null });
  });

  test("accepts a Date for now", () => {
    const [action] = plan(evaluation({ fired: [fired()] }), [], new Date(NOW));
    expect(action.body).toContain(NOW);
  });

  test("a non-firing signal with no open issue produces no action", () => {
    expect(plan(evaluation({ quiet: [{ signalId: "S4", trigger: "default", keys: ["CA0114"] }] }), [], NOW)).toEqual([]);
  });

  test("tolerates sparse inputs (missing lists, bodies, comments, evidence)", () => {
    const sparse = {
      date: DATE,
      fired: [{ signalId: "S8", trigger: "latency", name: "Server health", severity: "warn", status: "draft", rule: "threshold", value: 9 }],
    };
    const [created] = plan(sparse, undefined, NOW);
    expect(created).toMatchObject({ action: "create", signalId: "S8" });
    expect(created.body).toContain("| latency | — | 9 | threshold  | warn |  |");

    expect(plan({ date: DATE }, [{ number: 2 }], NOW)).toEqual([]);
  });

  test("an unknown severity ranks as info; signals outside SIGNAL_IDS sort last", () => {
    const actions = plan(
      evaluation({ fired: [fired({ signalId: "Z1", severity: "odd" }), fired()] }),
      [],
      NOW,
    );
    expect(actions.map((a) => a.signalId)).toEqual(["S4", "Z1"]);
    expect(actions[1].body).toContain("Severity: **info**");
  });

  test("the newest of several state markers wins, whatever the post order", () => {
    const issue = createdIssue([fired()]);
    const quietEval = evaluation({ quiet: [{ signalId: "S4", trigger: "default", keys: ["CA0114"] }] });
    const [cleared] = plan(quietEval, [issue], daysAfter(NOW, 1));
    const [older] = plan(evaluation({ fired: [fired({ key: "X" })] }), [issue], NOW);
    const shuffled = {
      ...issue,
      comments: [
        { body: cleared.body, author: BOT, createdAt: daysAfter(NOW, 1) },
        { body: older.body, author: BOT, createdAt: NOW },
      ],
    };
    const [next] = plan(quietEval, [shuffled], daysAfter(NOW, 2));
    expect(next.reason).toBe("cleared-already");
  });

  test("observerLogin is required (fail closed on a public repo)", () => {
    expect(() => planIssueActions(evaluation(), [], NOW)).toThrow(/observerLogin is required/);
    expect(() => planIssueActions(evaluation(), [], NOW, { observerLogin: " " })).toThrow(/observerLogin/);
  });

  test("bot login forms match each other (no duplicate issue per run)", () => {
    const issue = { ...createdIssue([fired()]), author: "app/github-actions" };
    const [action] = plan(evaluation({ fired: [fired()] }), [issue], daysAfter(NOW, 1));
    expect(action).toMatchObject({ action: "none", issueNumber: 7 });
  });

  test("rejects an invalid now", () => {
    expect(() => plan(evaluation(), [], "yesterday")).toThrow(/now/);
  });
});
