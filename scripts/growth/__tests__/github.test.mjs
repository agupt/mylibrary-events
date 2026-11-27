import { describe, expect, test, vi } from "vitest";
import {
  GITHUB_BODY_LIMIT,
  WEEKLY_REPORT_LABEL,
  WEEKLY_REPORT_MARKER,
  createGithub,
  dryRunGithub,
  executeIssuePlan,
  postWeeklyReport,
  toPlannerIssue,
} from "../github.mjs";

/** A fake `gh`: records every call, answers from `responses` by subcommand. */
function fakeGh(responses = {}) {
  const calls = [];
  const runGh = vi.fn(async (args, options = {}) => {
    calls.push({ args, input: options.input });
    const key = args.slice(0, 2).join(" ");
    const response = responses[key];
    if (response instanceof Error) throw response;
    return typeof response === "function" ? response(args) : (response ?? "");
  });
  return { runGh, calls };
}

const RAW_ISSUE = {
  number: 7,
  title: "signal S4: Zero-event result",
  body: "<!-- growth-observer:signal=S4 -->",
  author: { login: "app/github-actions" },
  comments: [{ author: { login: "app/github-actions" }, body: "c", createdAt: "2026-11-29T11:23:00Z" }],
  labels: [{ name: "signal" }],
};

describe("toPlannerIssue", () => {
  test("flattens gh JSON to planIssueActions' shape", () => {
    expect(toPlannerIssue(RAW_ISSUE)).toEqual({
      number: 7,
      title: "signal S4: Zero-event result",
      body: "<!-- growth-observer:signal=S4 -->",
      author: "app/github-actions",
      comments: [{ body: "c", author: "app/github-actions", createdAt: "2026-11-29T11:23:00Z" }],
      labels: ["signal"],
    });
  });
});

describe("createGithub", () => {
  test("lists open issues by label with explicit JSON fields", async () => {
    const { runGh, calls } = fakeGh({ "issue list": JSON.stringify([RAW_ISSUE]) });
    const issues = await createGithub(runGh).listIssues({ label: "signal", state: "open" });
    expect(issues[0].author).toBe("app/github-actions");
    expect(calls[0].args).toEqual([
      "issue", "list", "--label", "signal", "--state", "open", "--limit", "200",
      "--json", "number,title,body,author,comments,labels",
    ]);
  });

  test("creates an issue with the body on stdin and returns its number", async () => {
    const { runGh, calls } = fakeGh({ "issue create": "https://github.com/o/r/issues/42\n" });
    const number = await createGithub(runGh).createIssue({ title: "t", body: "b", labels: ["signal", "signal:S4"] });
    expect(number).toBe(42);
    expect(calls[0].args).toEqual(["issue", "create", "--title", "t", "--body-file", "-", "--label", "signal", "--label", "signal:S4"]);
    expect(calls[0].input).toBe("b");
  });

  test("throws when gh create prints no issue URL", async () => {
    const { runGh } = fakeGh({ "issue create": "oops" });
    await expect(createGithub(runGh).createIssue({ title: "t", body: "b", labels: [] })).rejects.toThrow(/issue number/);
  });

  test("comments with the body on stdin and truncates oversized bodies", async () => {
    const { runGh, calls } = fakeGh();
    await createGithub(runGh).commentIssue(7, "x".repeat(GITHUB_BODY_LIMIT + 10));
    expect(calls[0].args).toEqual(["issue", "comment", "7", "--body-file", "-"]);
    expect(calls[0].input.length).toBeLessThanOrEqual(GITHUB_BODY_LIMIT);
    expect(calls[0].input).toMatch(/truncated/);
  });

  test("ensureLabels creates only the missing labels", async () => {
    const { runGh, calls } = fakeGh({ "label list": JSON.stringify([{ name: "signal" }]) });
    const github = createGithub(runGh);
    await github.ensureLabels(["signal", "signal:S4"]);
    await github.ensureLabels(["signal:S4"]); // cached: no second list/create
    const creates = calls.filter((c) => c.args[1] === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0].args.slice(0, 3)).toEqual(["label", "create", "signal:S4"]);
    expect(calls.filter((c) => c.args[1] === "list")).toHaveLength(1);
  });
});

describe("executeIssuePlan", () => {
  const plan = [
    { action: "create", signalId: "S4", title: "signal S4: x", body: "body", labels: ["signal", "signal:S4"], reason: "new" },
    { action: "comment", signalId: "S5", issueNumber: 9, body: "update", labels: [], reason: "changed" },
    { action: "none", signalId: "F1", issueNumber: 3, reason: "unchanged" },
  ];

  test("creates, comments and skips per the plan", async () => {
    const github = {
      ensureLabels: vi.fn(async () => {}),
      createIssue: vi.fn(async () => 50),
      commentIssue: vi.fn(async () => {}),
    };
    const result = await executeIssuePlan(plan, github, { log: vi.fn() });
    expect(github.ensureLabels).toHaveBeenCalledWith(["signal", "signal:S4"]);
    expect(github.createIssue).toHaveBeenCalledWith({ title: "signal S4: x", body: "body", labels: ["signal", "signal:S4"] });
    expect(github.commentIssue).toHaveBeenCalledWith(9, "update");
    expect(result).toEqual({ created: [{ signalId: "S4", issueNumber: 50 }], commented: [{ signalId: "S5", issueNumber: 9 }], skipped: 1, errors: [] });
  });

  test("one failing step does not stop the others", async () => {
    const github = {
      ensureLabels: vi.fn(async () => {}),
      createIssue: vi.fn(async () => {
        throw new Error("HTTP 502");
      }),
      commentIssue: vi.fn(async () => {}),
    };
    const result = await executeIssuePlan(plan, github, { log: vi.fn() });
    expect(result.errors).toEqual([{ signalId: "S4", action: "create", error: "HTTP 502" }]);
    expect(github.commentIssue).toHaveBeenCalledOnce();
  });
});

describe("dryRunGithub", () => {
  test("passes reads through and records writes without running them", async () => {
    const { runGh, calls } = fakeGh({ "issue list": "[]" });
    const log = vi.fn();
    const github = dryRunGithub(createGithub(runGh), { log });
    expect(await github.listIssues({ label: "signal", state: "open" })).toEqual([]);
    const number = await github.createIssue({ title: "t", body: "b", labels: ["signal"] });
    await github.commentIssue(3, "c");
    await github.ensureLabels(["signal"]);
    await github.pinIssue(3);
    expect(number).toBeNull();
    expect(calls.map((c) => c.args.slice(0, 2).join(" "))).toEqual(["issue list"]);
    expect(github.writes.map((w) => w.kind)).toEqual(["createIssue", "commentIssue", "ensureLabels", "pinIssue"]);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/would createIssue/));
  });
});

describe("postWeeklyReport", () => {
  const observerLogin = "github-actions[bot]";

  test("comments on the open rolling report issue the observer created", async () => {
    const github = {
      listIssues: vi.fn(async () => [
        { number: 4, body: `${WEEKLY_REPORT_MARKER}`, author: "someone-else", comments: [], labels: [] },
        { number: 5, body: `intro\n${WEEKLY_REPORT_MARKER}`, author: "app/github-actions", comments: [], labels: [] },
      ]),
      commentIssue: vi.fn(async () => {}),
      createIssue: vi.fn(),
      ensureLabels: vi.fn(),
      pinIssue: vi.fn(),
    };
    const result = await postWeeklyReport(github, { markdown: "# report", date: "2026-11-30", observerLogin });
    expect(github.listIssues).toHaveBeenCalledWith({ label: WEEKLY_REPORT_LABEL, state: "open" });
    expect(github.commentIssue).toHaveBeenCalledWith(5, "# report");
    expect(github.createIssue).not.toHaveBeenCalled();
    expect(result).toEqual({ issueNumber: 5, created: false });
  });

  test("creates and pins the rolling issue when none exists", async () => {
    const github = {
      listIssues: vi.fn(async () => []),
      commentIssue: vi.fn(async () => {}),
      createIssue: vi.fn(async () => 11),
      ensureLabels: vi.fn(async () => {}),
      pinIssue: vi.fn(async () => {}),
    };
    const result = await postWeeklyReport(github, { markdown: "# report", date: "2026-11-30", observerLogin });
    expect(github.ensureLabels).toHaveBeenCalledWith([WEEKLY_REPORT_LABEL]);
    const created = github.createIssue.mock.calls[0][0];
    expect(created.title).toBe("Weekly growth report");
    expect(created.body).toContain(WEEKLY_REPORT_MARKER);
    expect(created.labels).toEqual([WEEKLY_REPORT_LABEL]);
    expect(github.pinIssue).toHaveBeenCalledWith(11);
    expect(github.commentIssue).toHaveBeenCalledWith(11, "# report");
    expect(result).toEqual({ issueNumber: 11, created: true });
  });

  test("a failed pin is not fatal", async () => {
    const github = {
      listIssues: vi.fn(async () => []),
      commentIssue: vi.fn(async () => {}),
      createIssue: vi.fn(async () => 11),
      ensureLabels: vi.fn(async () => {}),
      pinIssue: vi.fn(async () => {
        throw new Error("pin limit");
      }),
    };
    const warn = vi.fn();
    await postWeeklyReport(github, { markdown: "# r", date: "2026-11-30", observerLogin, warn });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/pin/));
    expect(github.commentIssue).toHaveBeenCalled();
  });
});
