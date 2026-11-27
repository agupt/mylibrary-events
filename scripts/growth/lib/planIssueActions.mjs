/**
 * Pure issue dedupe for `signal` issues (docs/growth-agent/phase1-impact.md §3).
 *
 *   planIssueActions(evaluation, openSignalIssues, now, options?) →
 *     [{ action: create|comment|none, signalId, issueNumber, title, body, labels, reason }]
 *
 * No `gh` calls: WS-C executes the plan. Rules:
 * - One open issue per signal ID, found by the body marker
 *   `<!-- growth-observer:signal=S4 -->` (never by title, humans edit titles).
 * - Each observer post carries a state marker
 *   `<!-- growth-observer:state {"state","fingerprint","at"} -->`; the newest
 *   one is the issue's current state.
 * - Comment only when the fingerprint (sorted trigger/key pairs + severity)
 *   changes, on a re-fire after a clear, or as a heartbeat at most every
 *   HEARTBEAT_DAYS. Cleared → one "not firing since" comment, only when the
 *   signal was actually evaluated quiet (no data is not "cleared").
 * - No auto-close. A closed issue is absent from `openSignalIssues`, so a
 *   re-fire after a close opens a new issue.
 * - Bodies hold aggregates only (public repo).
 */
import { createHash } from "node:crypto";
import { SIGNAL_IDS } from "./snapshotSchema.mjs";

export const HEARTBEAT_DAYS = 7;
export const SIGNAL_LABEL = "signal";

const DAY_MS = 86_400_000;
const MAX_ROWS = 50;
const FINGERPRINT_LENGTH = 16;
const SEVERITY_RANK = Object.freeze({ info: 0, warn: 1 });
const STATE_MARKER = /<!-- growth-observer:state (\{[^\n]*?\}) -->/g;
const SIGNAL_MARKER = /<!-- growth-observer:signal=([A-Z]\d{1,2}) -->/;

/** The body marker that identifies a signal's issue. */
export function signalMarker(signalId) {
  return `<!-- growth-observer:signal=${signalId} -->`;
}

export function signalLabels(signalId) {
  return [SIGNAL_LABEL, `${SIGNAL_LABEL}:${signalId}`];
}

// ---- state ----------------------------------------------------------------

function topSeverity(fired) {
  return fired.reduce(
    (top, f) => ((SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[top] ?? 0) ? f.severity : top),
    "info",
  );
}

/** Sorted trigger/key pairs + top severity; values are excluded (they move daily). */
function fingerprint(fired) {
  const keys = [...new Set(fired.map((f) => `${f.trigger}:${f.key ?? ""}`))].sort();
  const text = `${topSeverity(fired)}|${keys.join(",")}`;
  return createHash("sha256").update(text).digest("hex").slice(0, FINGERPRINT_LENGTH);
}

function stateMarker(state) {
  return `<!-- growth-observer:state ${JSON.stringify(state)} -->`;
}

function parseState(json) {
  try {
    const value = JSON.parse(json);
    const isValid =
      (value?.state === "firing" || value?.state === "cleared") &&
      typeof value.fingerprint === "string" &&
      Number.isFinite(Date.parse(value.at));
    return isValid ? value : null;
  } catch {
    return null;
  }
}

/** Every trusted, well-formed, non-future state marker on an issue. */
function issueStates(issue, nowMs, observerLogin) {
  const posts = [
    { body: issue.body, author: issue.author },
    ...(issue.comments ?? []),
  ];
  return posts
    .filter((post) => observerLogin === undefined || post.author === observerLogin)
    .flatMap((post) => [...String(post.body ?? "").matchAll(STATE_MARKER)].map((m) => parseState(m[1])))
    .filter((state) => state !== null && Date.parse(state.at) <= nowMs);
}

function currentState(issue, nowMs, observerLogin) {
  const states = issueStates(issue, nowMs, observerLogin);
  if (states.length === 0) {
    // A marked issue with no readable state: assume firing, fingerprint unknown.
    return { state: "firing", fingerprint: null, at: null };
  }
  return states.reduce((latest, s) => (Date.parse(s.at) >= Date.parse(latest.at) ? s : latest));
}

function issuesBySignal(openSignalIssues, observerLogin) {
  const bySignal = new Map();
  const ordered = [...openSignalIssues].sort((a, b) => a.number - b.number);
  for (const issue of ordered) {
    if (observerLogin !== undefined && issue.author !== observerLogin) continue;
    const match = SIGNAL_MARKER.exec(String(issue.body ?? ""));
    if (match && !bySignal.has(match[1])) bySignal.set(match[1], issue);
  }
  return bySignal;
}

// ---- rendering ------------------------------------------------------------

/** Escapes text for a markdown table cell; strips anything HTML-like. */
function cell(value) {
  return String(value)
    .replace(/[<>]/g, "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function formatThreshold(threshold) {
  return Object.entries(threshold ?? {})
    .map(([op, limit]) => `${op} ${limit}`)
    .join(", ");
}

function firedTable(fired) {
  const rows = [...fired]
    .sort((a, b) => `${a.trigger} ${a.key ?? ""}`.localeCompare(`${b.trigger} ${b.key ?? ""}`))
    .map(
      (f) =>
        `| ${cell(f.trigger)} | ${cell(f.key ?? "—")} | ${cell(f.value)} | ${cell(`${f.rule} ${formatThreshold(f.threshold)}`)} | ${cell(f.severity)} | ${cell((f.evidence?.dates ?? []).join(", "))} |`,
    );
  const shown = rows.slice(0, MAX_ROWS);
  const more = rows.length > MAX_ROWS ? [`\n…and ${rows.length - MAX_ROWS} more (see the snapshot).`] : [];
  return [
    "| Trigger | Key | Value | Rule | Severity | Evidence dates |",
    "|---|---|---|---|---|---|",
    ...shown,
    ...more,
  ].join("\n");
}

function footer(date) {
  return `Phase 1: observation only. No agent will act on this issue. Evidence: \`reports/metrics/${date}.json\`.`;
}

function draftNote(fired) {
  return fired.some((f) => f.status === "draft")
    ? "**DRAFT thresholds**: guesses made before the 14-day baseline; they will be revised."
    : null;
}

function issueBody(signalId, fired, date, state) {
  return [
    signalMarker(signalId),
    stateMarker(state),
    `Signal **${signalId}** (${cell(fired[0].name)}) fired on ${date}. Severity: **${topSeverity(fired)}**.`,
    draftNote(fired),
    firedTable(fired),
    "When closing, label it `signal-valid` or `false-positive` so the false-positive rate can be measured.",
    footer(date),
  ]
    .filter((part) => part !== null)
    .join("\n\n");
}

const COMMENT_LEADS = Object.freeze({
  changed: "What is firing changed.",
  refired: "Firing again after it had cleared.",
  heartbeat: `Still firing (heartbeat, at most every ${HEARTBEAT_DAYS} days).`,
});

function firingComment(reason, fired, date, state) {
  return [stateMarker(state), `${COMMENT_LEADS[reason]} (${date})`, draftNote(fired), firedTable(fired), footer(date)]
    .filter((part) => part !== null)
    .join("\n\n");
}

function clearedComment(date, state) {
  return [
    stateMarker(state),
    `Not firing since ${date}. The issue is not auto-closed: closing it is Amool's call.`,
    footer(date),
  ].join("\n\n");
}

// ---- planning -------------------------------------------------------------

function action(kind, signalId, fields) {
  return { action: kind, signalId, issueNumber: null, title: null, body: null, labels: [], ...fields };
}

function planFiring(signalId, fired, issue, ctx) {
  const state = { state: "firing", fingerprint: fingerprint(fired), at: ctx.nowIso };
  if (issue === undefined) {
    return action("create", signalId, {
      title: `signal ${signalId}: ${fired[0].name}`,
      body: issueBody(signalId, fired, ctx.date, state),
      labels: signalLabels(signalId),
      reason: "new",
    });
  }
  const previous = currentState(issue, ctx.nowMs, ctx.observerLogin);
  let reason = null;
  if (previous.state !== "firing") reason = "refired";
  else if (previous.fingerprint !== state.fingerprint) reason = "changed";
  else if (ctx.nowMs - Date.parse(previous.at) >= HEARTBEAT_DAYS * DAY_MS) reason = "heartbeat";

  if (reason === null) return action("none", signalId, { issueNumber: issue.number, reason: "unchanged" });
  return action("comment", signalId, {
    issueNumber: issue.number,
    body: firingComment(reason, fired, ctx.date, state),
    reason,
  });
}

function planNotFiring(signalId, issue, ctx) {
  const previous = currentState(issue, ctx.nowMs, ctx.observerLogin);
  if (previous.state === "cleared") return action("none", signalId, { issueNumber: issue.number, reason: "cleared-already" });
  if (!ctx.quietSignals.has(signalId)) return action("none", signalId, { issueNumber: issue.number, reason: "not-evaluated" });
  const state = { state: "cleared", fingerprint: "", at: ctx.nowIso };
  return action("comment", signalId, {
    issueNumber: issue.number,
    body: clearedComment(ctx.date, state),
    reason: "cleared",
  });
}

function signalOrder(a, b) {
  const rank = (id) => (SIGNAL_IDS.includes(id) ? SIGNAL_IDS.indexOf(id) : SIGNAL_IDS.length);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/**
 * Plans what the observer should do on GitHub for today's evaluation.
 *
 * @param {{ date: string, fired: object[], quiet?: object[] }} evaluation  evaluateTriggers() output
 * @param {{ number: number, body: string, author?: string,
 *           comments?: { body: string, author?: string, createdAt?: string }[] }[]} openSignalIssues
 *        OPEN issues labelled `signal` (closed ones must not be passed)
 * @param {string|Date} now  the run time
 * @param {{ observerLogin?: string }} [options]  only trust issues and state markers
 *        authored by this login (recommended: anyone can open issues and comment
 *        on a public repo)
 */
export function planIssueActions(evaluation, openSignalIssues, now, { observerLogin } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error(`now must be a date, got ${JSON.stringify(now)}`);

  const ctx = {
    date: evaluation.date,
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    observerLogin,
    quietSignals: new Set((evaluation.quiet ?? []).map((q) => q.signalId)),
  };
  const firedBySignal = new Map();
  for (const f of evaluation.fired ?? []) {
    firedBySignal.set(f.signalId, [...(firedBySignal.get(f.signalId) ?? []), f]);
  }
  const issues = issuesBySignal(openSignalIssues ?? [], observerLogin);

  const signalIds = [...new Set([...firedBySignal.keys(), ...issues.keys()])].sort(signalOrder);
  return signalIds.map((signalId) => {
    const fired = firedBySignal.get(signalId);
    const issue = issues.get(signalId);
    return fired ? planFiring(signalId, fired, issue, ctx) : planNotFiring(signalId, issue, ctx);
  });
}
