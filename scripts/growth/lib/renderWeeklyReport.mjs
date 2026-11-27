/**
 * The weekly growth report (`reports/growth/weekly-YYYY-Www.md`) and the
 * per-run console summary (docs/growth-agent/phase1-impact.md §1, §6;
 * decision 4). Pure: no I/O, no clock.
 *
 * Public repo: the report holds aggregates, our own page types and public
 * IMLS keys only. Every value from data or from a human-written issue goes
 * through `cell()`/`code()` so it can never inject markup or a mention.
 */
import { shiftDate } from "./collectBlock.mjs";
import { cleanDayStreak, metricStats, statusTally } from "./baselineStats.mjs";
import { DATA_STATUSES, SIGNAL_IDS } from "./snapshotSchema.mjs";

const WEEK_DAYS = 7;
const MAX_FUNNEL_ROWS = 20;
const DAY_MS = 86_400_000;
const THURSDAY = 4;
const PERCENT = 100;
const FOOTER = "Phase 1: observation only. No agent acts on this report or on `signal` issues.";

const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;

/** Text safe inside a markdown table cell (no HTML, no code breaks, no pipes). */
function cell(value) {
  return String(value ?? "—")
    .replace(/[<>`]/g, "")
    .replace(/\|/g, "\\|")
    .replace(/@/g, "@\u200b")
    .replace(LINE_BREAKS, " ");
}

/** A data key as a code span: never a link, mention or issue reference. */
function code(value) {
  return `\`${String(value).replace(/[`]/g, "").replace(LINE_BREAKS, " ").replace(/\|/g, "\\|")}\``;
}

const table = (header, rows) =>
  [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join(
    "\n",
  );

const hasData = (block) => DATA_STATUSES.includes(block?.status);
const pct = (ratio) => `${Number((ratio * PERCENT).toFixed(1))}%`;

// ---- dates ----------------------------------------------------------------

/** ISO-8601 week, e.g. "2026-W49". */
export function isoWeek(date) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  const thursday = new Date(day.getTime() + (THURSDAY - weekday) * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / WEEK_DAYS);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weeklyReportPath(date) {
  return `reports/growth/weekly-${isoWeek(date)}.md`;
}

// ---- sections -------------------------------------------------------------

function tallyText(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, n]) => `${status} ×${n}`)
    .join(", ");
}

function healthSection({ date, from, snapshots }) {
  const streak = cleanDayStreak(snapshots, date);
  const broken = streak.brokenBy ? ` Last break: ${streak.brokenBy.date} (${cell(streak.brokenBy.reason)}).` : "";
  const today = snapshots.find((s) => s.date === date);
  const tally = statusTally(snapshots, { from, to: date });
  const rows = SIGNAL_IDS.map((id) => [id, cell(today?.[id]?.status ?? "no snapshot"), cell(tallyText(tally[id]) || "—")]);
  return [
    "## Collection health",
    `Clean-day streak: **${streak.days}/${streak.target}** (days in a row with no source \`error\`; \`not-configured\` counts as clean only for sources Amool chose not to configure).${broken}`,
    table(["Signal", "Today", "Last 7 days"], rows),
  ].join("\n\n");
}

function formatThreshold(threshold) {
  return Object.entries(threshold ?? {})
    .map(([op, limit]) => `${op} ${limit}`)
    .join(", ");
}

function triggersSection(evaluation) {
  const fired = evaluation.fired.length
    ? table(
        ["Signal", "Trigger", "Key", "Value", "Rule", "Severity"],
        evaluation.fired.map((f) => [
          f.signalId,
          cell(f.trigger),
          f.key === undefined ? "—" : code(f.key),
          cell(f.value),
          cell(`${f.rule} ${formatThreshold(f.threshold)}`),
          cell(f.severity),
        ]),
      )
    : "Nothing fired.";
  const quiet = (evaluation.quiet ?? []).map((q) => (q.trigger ? `${q.signalId}/${q.trigger}` : q.signalId));
  const notEvaluated = (evaluation.notEvaluated ?? []).length
    ? table(
        ["Signal", "Trigger", "Reason"],
        evaluation.notEvaluated.map((n) => [n.signalId, cell(n.trigger), cell(n.reason)]),
      )
    : "Every trigger was evaluated.";
  return [
    `## Triggers (${evaluation.date})`,
    "### Fired",
    fired,
    "### Evaluated, quiet",
    quiet.length ? cell(quiet.join(", ")) : "None.",
    "### Not evaluated (and why)",
    notEvaluated,
  ].join("\n\n");
}

function funnelSection(week) {
  const latest = [...week].reverse().find((s) => hasData(s.S12));
  if (latest === undefined) {
    const status = week.at(-1)?.S12?.status ?? "no snapshot";
    return `## Landing funnel (S12)\n\nS12 has no reading this week (latest status: ${cell(status)}). It is never shown as 0.`;
  }
  const { funnel, engagedRateByPageType } = latest.S12;
  const rows = [...(funnel ?? [])]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, MAX_FUNNEL_ROWS)
    .map((r) => [code(r.source), cell(r.pageType), cell(r.action), cell(r.visits)]);
  const rates = Object.entries(engagedRateByPageType ?? {}).map(([type, rate]) => [cell(type), pct(rate)]);
  return [
    `## Landing funnel (S12)`,
    `Traffic source → landing page type → first action, from ${latest.date} (top ${MAX_FUNNEL_ROWS}).`,
    rows.length ? table(["Source", "Page type", "First action", "Visits"], rows) : "No visits.",
    "Engaged-visit rate by landing page type:",
    rates.length ? table(["Page type", "Engaged"], rates) : "No page types.",
  ].join("\n\n");
}

function feedbackSection(week) {
  const blocks = week.map((s) => s.F10).filter(hasData);
  if (blocks.length === 0) return "## Feedback (F10)\n\nNo F10 reading this week.";
  const submissions = blocks.reduce((sum, b) => sum + (b.submissions ?? 0), 0);
  const byContext = blocks.reduce((acc, b) => {
    for (const [context, n] of Object.entries(b.byContext ?? {})) acc[context] = (acc[context] ?? 0) + n;
    return acc;
  }, {});
  const contexts = Object.entries(byContext).map(([context, n]) => `${cell(context)}: ${n}`).join(", ");
  return [
    "## Feedback (F10)",
    `Submissions this week: **${submissions}**${contexts ? ` (${contexts})` : ""}.`,
    "The text stays in PostHog (`feedback_submitted` events, behind Amool's login); it never lands in this repo or an issue.",
  ].join("\n\n");
}

function falsePositiveSection(stats) {
  if (stats === null) return "## False-positive rate\n\nUnavailable: closed `signal` issues could not be read.";
  const rate = stats.rate === null ? "n/a" : pct(stats.rate);
  const verdict = stats.hasEnoughEvidence ? "" : " **Not enough evidence** (fewer than 4 judged issues): not a pass.";
  return [
    "## False-positive rate",
    `Closed \`signal\` issues: ${stats.valid} \`signal-valid\`, ${stats.falsePositive} \`false-positive\`, ${stats.unjudged} unlabelled. Rate: **${rate}**.${verdict}`,
  ].join("\n\n");
}

function linkText(link) {
  if (link.key) return `${link.signalId} ${code(link.key)}`;
  if (link.filter) return `${link.signalId} ${code(`${link.filter.field}=${link.filter.value}`)}`;
  return link.signalId;
}

function needsDataSection(needsData) {
  if (needsData === null) return "## needs-data evidence\n\nUnavailable: needs-data issues could not be read.";
  if (needsData.length === 0) return "## needs-data evidence\n\nNo open `needs-data` issues.";
  const rows = needsData.flatMap((issue) => {
    const links = issue.links.length ? issue.links : [null];
    return links.map((link) => [
      `#${issue.issueNumber}`,
      cell(issue.title),
      link ? linkText(link) : "no `Signals:` line",
      link ? (link.firing ? "**firing**" : "quiet") : "—",
      link ? cell(link.value ?? "unknown") : "—",
      link ? cell([...link.notEvaluated, link.note].filter(Boolean).join("; ") || "—") : cell(issue.errors.join("; ") || "—"),
    ]);
  });
  return ["## needs-data evidence", table(["Issue", "Title", "Signal", "Today", "Value", "Notes"], rows)].join("\n\n");
}

function baselineSection(config, snapshots, date) {
  const rows = metricStats(config, snapshots, date).map((s) => [
    s.signalId,
    cell(s.trigger),
    cell(s.metric),
    cell(s.n),
    cell(s.p50 ?? "—"),
    cell(s.p95 ?? s.note ?? "—"),
  ]);
  return [
    "## Baseline (last 14 days)",
    "p50/p95 of each trigger's metric over the days it had a reading; cite these when moving a `signals.yml` entry from `draft` to `baselined`.",
    table(["Signal", "Trigger", "Metric", "Days", "p50", "p95"], rows),
  ].join("\n\n");
}

/**
 * @param {object} input
 * @param {string} input.date             run date (the report covers the 7 days ending here)
 * @param {object[]} input.snapshots      history including today's snapshot
 * @param {object} input.evaluation       evaluateTriggers() output for `date`
 * @param {object} input.config           signals config
 * @param {object[]|null} input.needsData needsDataEvidence() output, null if unreadable
 * @param {object|null} input.falsePositives falsePositiveStats(), null if unreadable
 */
export function renderWeeklyReport({ date, snapshots, evaluation, config, needsData, falsePositives }) {
  const from = shiftDate(date, -(WEEK_DAYS - 1));
  const week = snapshots.filter((s) => s.date >= from && s.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  return [
    `# Weekly growth report: ${isoWeek(date)}`,
    `Window: ${from} to ${date} (UTC). Evidence: \`reports/metrics/<date>.json\`. Every number is a dated reading of its source; a missing number says why. Client-side PostHog counts are lower bounds (ad blockers).`,
    healthSection({ date, from, snapshots }),
    triggersSection(evaluation),
    funnelSection(week),
    feedbackSection(week),
    falsePositiveSection(falsePositives),
    needsDataSection(needsData),
    baselineSection(config, snapshots, date),
    `---\n\n${FOOTER}`,
  ].join("\n\n") + "\n";
}

// ---- console summary ------------------------------------------------------

const plainText = (value) => String(value ?? "").replace(LINE_BREAKS, " ");

/** The run's summary for the job log (and the dry-run output). */
export function formatRunSummary({ snapshot, evaluation, plan, dryRun }) {
  const lines = [`growth-observer ${snapshot.date}${dryRun ? " (DRY RUN: nothing committed, no GitHub writes)" : ""}`];
  for (const id of SIGNAL_IDS) {
    const block = snapshot[id];
    lines.push(`  ${id.padEnd(4)} ${block.status.padEnd(24)} ${plainText(block.error)}`.trimEnd());
  }
  const fired = evaluation.fired.map((f) => `${f.signalId}${f.trigger ? `/${f.trigger}` : ""}${f.key ? ` ${f.key}` : ""}`);
  lines.push(`fired: ${fired.length ? fired.join(", ") : "none"}`);
  const reasons = (evaluation.notEvaluated ?? []).reduce((acc, n) => ({ ...acc, [n.reason]: (acc[n.reason] ?? 0) + 1 }), {});
  lines.push(`not evaluated: ${tallyText(reasons) || "none"}`);
  lines.push(`quiet: ${(evaluation.quiet ?? []).length}`);
  if (plan === null) {
    lines.push("issues: skipped (--no-issues)");
  } else {
    lines.push(`issues: ${plan.length} planned${dryRun ? " (not executed)" : ""}`);
    for (const step of plan) {
      lines.push(`  ${step.action.padEnd(8)} ${step.signalId.padEnd(4)} ${step.issueNumber ? `#${step.issueNumber} ` : ""}${plainText(step.reason)}`);
    }
  }
  return lines.join("\n");
}
