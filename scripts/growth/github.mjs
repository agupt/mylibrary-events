/**
 * The observer's thin `gh` wiring (docs/growth-agent/phase1-impact.md §3,
 * WS-C). This is the ONLY module that talks to GitHub. Every call goes
 * through an injected `runGh(args, { input })` so tests never touch the
 * network; bodies travel on stdin (`--body-file -`), never argv.
 *
 * Phase 1 writes: create `signal` issues, comment on them, create labels on
 * demand, and one comment per week on the rolling "Weekly growth report"
 * issue (decision 4). It never closes, edits or reopens an issue.
 */
import { spawn } from "node:child_process";

/** GitHub's maximum issue/comment body length. */
export const GITHUB_BODY_LIMIT = 65_536;
export const ISSUE_LIST_LIMIT = 200;
export const WEEKLY_REPORT_LABEL = "growth-report";
export const WEEKLY_REPORT_MARKER = "<!-- growth-observer:weekly-report -->";
const ISSUE_FIELDS = "number,title,body,author,comments,labels";
const TRUNCATION_NOTE = "\n\n…truncated (GitHub body limit). The full text is in the repo file.";
const ISSUE_URL = /\/issues\/(\d+)\s*$/;
const LABEL_COLORS = Object.freeze({ signal: "d93f0b", [WEEKLY_REPORT_LABEL]: "0e8a16" });
const SIGNAL_ID_LABEL_COLOR = "fbca04";

/** Runs the real `gh` CLI (GH_TOKEN from the environment). */
export function createGhRunner({ env = process.env } = {}) {
  return (args, { input } = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn("gh", args, { env, stdio: ["pipe", "pipe", "pipe"] });
      const stdout = [];
      const stderr = [];
      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
        else {
          const detail = Buffer.concat(stderr).toString("utf8").trim().split("\n").at(-1) ?? "";
          reject(new Error(`gh ${args.slice(0, 2).join(" ")} failed (exit ${code}): ${detail.slice(0, 200)}`));
        }
      });
      child.stdin.end(input ?? "");
    });
}

function fitBody(body) {
  const text = String(body ?? "");
  return text.length <= GITHUB_BODY_LIMIT ? text : text.slice(0, GITHUB_BODY_LIMIT - TRUNCATION_NOTE.length) + TRUNCATION_NOTE;
}

const loginOf = (author) => (typeof author === "string" ? author : (author?.login ?? ""));

/** gh's issue JSON → the `{ number, body, author, comments }` planIssueActions reads. */
export function toPlannerIssue(raw) {
  return {
    number: raw.number,
    title: raw.title ?? "",
    body: raw.body ?? "",
    author: loginOf(raw.author),
    comments: (raw.comments ?? []).map((c) => ({ body: c.body ?? "", author: loginOf(c.author), createdAt: c.createdAt })),
    labels: (raw.labels ?? []).map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean),
  };
}

const labelColor = (name) => LABEL_COLORS[name] ?? SIGNAL_ID_LABEL_COLOR;

/** The GitHub operations the observer needs, over an injected `runGh`. */
export function createGithub(runGh) {
  let knownLabels = null;
  return {
    async listIssues({ label, state }) {
      const out = await runGh([
        "issue", "list", "--label", label, "--state", state, "--limit", String(ISSUE_LIST_LIMIT), "--json", ISSUE_FIELDS,
      ]);
      return JSON.parse(out || "[]").map(toPlannerIssue);
    },
    async ensureLabels(names) {
      knownLabels ??= new Set(JSON.parse((await runGh(["label", "list", "--limit", "500", "--json", "name"])) || "[]").map((l) => l.name));
      for (const name of names) {
        if (knownLabels.has(name)) continue;
        await runGh(["label", "create", name, "--color", labelColor(name), "--description", "growth observer (Phase 1)"]);
        knownLabels.add(name);
      }
    },
    async createIssue({ title, body, labels }) {
      const out = await runGh(
        ["issue", "create", "--title", title, "--body-file", "-", ...labels.flatMap((l) => ["--label", l])],
        { input: fitBody(body) },
      );
      const match = ISSUE_URL.exec(out.trim());
      if (!match) throw new Error("gh issue create printed no issue number");
      return Number(match[1]);
    },
    async commentIssue(number, body) {
      await runGh(["issue", "comment", String(number), "--body-file", "-"], { input: fitBody(body) });
    },
    async pinIssue(number) {
      await runGh(["issue", "pin", String(number)]);
    },
  };
}

const WRITE_METHODS = ["createIssue", "commentIssue", "ensureLabels", "pinIssue"];

/**
 * Dry run: reads pass through, writes are recorded and logged, never run.
 * `writes` holds what a live run would have done.
 */
export function dryRunGithub(github, { log = console.log } = {}) {
  const writes = [];
  const recorded = Object.fromEntries(
    WRITE_METHODS.map((kind) => [
      kind,
      async (...args) => {
        writes.push({ kind, args });
        const target = typeof args[0] === "object" && !Array.isArray(args[0]) ? (args[0]?.title ?? "") : JSON.stringify(args[0]);
        log(`growth-observer: dry run: would ${kind} ${target}`);
        return null;
      },
    ]),
  );
  return { ...github, ...recorded, writes };
}

/**
 * Runs planIssueActions' plan. Each step is independent: one failure is
 * recorded and the rest still run (the job then exits non-zero).
 */
export async function executeIssuePlan(plan, github, { log = console.log } = {}) {
  const result = { created: [], commented: [], skipped: 0, errors: [] };
  for (const step of plan) {
    try {
      if (step.action === "create") {
        await github.ensureLabels(step.labels);
        const issueNumber = await github.createIssue({ title: step.title, body: step.body, labels: step.labels });
        result.created.push({ signalId: step.signalId, issueNumber });
        log(`growth-observer: created issue #${issueNumber} for ${step.signalId}`);
      } else if (step.action === "comment") {
        await github.commentIssue(step.issueNumber, step.body);
        result.commented.push({ signalId: step.signalId, issueNumber: step.issueNumber });
        log(`growth-observer: commented on #${step.issueNumber} for ${step.signalId} (${step.reason})`);
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.errors.push({ signalId: step.signalId, action: step.action, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

const normalizeLogin = (login) =>
  String(login ?? "").trim().toLowerCase().replace(/^app\//, "").replace(/\[bot\]$/, "");

/**
 * Posts the weekly report as a comment on the rolling report issue, which
 * is found by its marker + the observer's login (anyone can open issues on
 * a public repo), or created and pinned on first use.
 */
export async function postWeeklyReport(github, { markdown, date, observerLogin, warn = console.warn }) {
  const login = normalizeLogin(observerLogin);
  const open = await github.listIssues({ label: WEEKLY_REPORT_LABEL, state: "open" });
  const existing = open
    .filter((issue) => normalizeLogin(issue.author) === login && issue.body.includes(WEEKLY_REPORT_MARKER))
    .sort((a, b) => a.number - b.number)[0];
  if (existing) {
    await github.commentIssue(existing.number, markdown);
    return { issueNumber: existing.number, created: false };
  }
  await github.ensureLabels([WEEKLY_REPORT_LABEL]);
  const issueNumber = await github.createIssue({
    title: "Weekly growth report",
    body: [
      WEEKLY_REPORT_MARKER,
      `Rolling weekly growth report (started ${date}). The observer comments here every Monday; the same text is committed under \`reports/growth/\`.`,
      "Phase 1: observation only. No agent acts on this issue.",
    ].join("\n\n"),
    labels: [WEEKLY_REPORT_LABEL],
  });
  try {
    await github.pinIssue(issueNumber);
  } catch (error) {
    warn(`growth-observer: could not pin the weekly report issue: ${error instanceof Error ? error.message : error}`);
  }
  await github.commentIssue(issueNumber, markdown);
  return { issueNumber, created: true };
}
