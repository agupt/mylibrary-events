/**
 * Links parked `needs-data` issues (#1–#3) to the signals that would justify
 * working on them (docs/growth-agent/phase1-impact.md §3).
 *
 * Each such issue names its signals in a body line, e.g.
 *
 *   Signals: S4 CA0114, S2 home_system=CA0114
 *
 * so the issue owns its own link (no parallel mapping file). The weekly
 * report uses `needsDataEvidence` to print today's numbers for those keys
 * and to flag when a parked issue's signal fires. The observer never
 * comments on these issues.
 */
import { SIGNAL_IDS } from "./snapshotSchema.mjs";
import { readKeyValue } from "./evaluateTriggers.mjs";

/** `Signals:` at the start of a line, optionally bulleted and/or bold. */
const SIGNALS_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?signals:(?:\*\*)?[ \t]*(.*)$/gim;
const ITEM = /^([A-Za-z]\d{1,2})(?:\s+(\S+))?$/;
const FILTER = /^([A-Za-z_][\w.-]*)=([^\s=]+)$/;
const KEY = /^[^\s=]+$/;
const SHAPE_HINT = 'expected "<ID>", "<ID> <key>" or "<ID> <field>=<value>"';

function parseItem(raw) {
  const match = ITEM.exec(raw);
  if (!match) return { error: `cannot parse "${raw}" (${SHAPE_HINT})` };
  const signalId = match[1].toUpperCase();
  const selector = match[2];
  if (!SIGNAL_IDS.includes(signalId)) {
    return { error: `unknown signal ID "${signalId}" (not observed in Phase 1)` };
  }
  if (selector === undefined) return { link: { signalId, key: null, filter: null } };
  const filter = FILTER.exec(selector);
  if (filter) return { link: { signalId, key: null, filter: { field: filter[1], value: filter[2] } } };
  if (KEY.test(selector)) return { link: { signalId, key: selector, filter: null } };
  return { error: `cannot parse "${raw}" (${SHAPE_HINT})` };
}

const linkId = (link) => `${link.signalId}|${link.key ?? ""}|${link.filter?.field ?? ""}=${link.filter?.value ?? ""}`;

/**
 * Parses every `Signals:` line in an issue body.
 * @returns {{ links: { signalId, key: string|null, filter: { field, value }|null }[], errors: string[] }}
 */
export function parseSignalsLine(body) {
  const links = [];
  const errors = [];
  const seen = new Set();
  for (const line of String(body ?? "").matchAll(SIGNALS_LINE)) {
    const items = line[1].split(",").map((item) => item.trim()).filter(Boolean);
    for (const item of items) {
      const parsed = parseItem(item);
      if (parsed.error) {
        errors.push(parsed.error);
      } else if (!seen.has(linkId(parsed.link))) {
        seen.add(linkId(parsed.link));
        links.push(parsed.link);
      }
    }
  }
  return { links, errors };
}

const toArray = (value) => (Array.isArray(value) ? value : [value]);

/** The `per` fields of a signal's per-key entries (null: no config to check). */
function perFieldsOf(config, signalId) {
  if (config === undefined) return null;
  return new Set(
    config.signals.filter((e) => e.id === signalId && e.per !== undefined).map((e) => toArray(e.per).join("+")),
  );
}

function matchesLink(link, fired, perFields) {
  if (fired.signalId !== link.signalId) return false;
  if (link.key !== null) return fired.key === link.key;
  if (link.filter !== null) {
    const isFieldKnown = perFields === null || perFields.has(link.filter.field);
    return isFieldKnown && fired.key === link.filter.value;
  }
  return true;
}

/** Why a filter link can never fire or show a number, so silence isn't read as "fine". */
function linkNote(link, perFields) {
  if (link.filter === null || perFields === null || perFields.has(link.filter.field)) return null;
  return `${link.signalId} has no per-${link.filter.field} breakdown in the snapshot`;
}

/** Today's value for a keyed link, via the signal's per-key signals.yml entry. */
function linkValue(link, config, snapshot) {
  if (config === undefined || snapshot === undefined) return null;
  const entries = config.signals.filter((e) => e.id === link.signalId && e.per !== undefined);
  if (link.key !== null) {
    const entry = entries[0];
    return entry === undefined ? null : readKeyValue(entry, snapshot, link.key);
  }
  if (link.filter !== null) {
    const entry = entries.find((e) => e.per === link.filter.field);
    return entry === undefined ? null : readKeyValue(entry, snapshot, link.filter.value);
  }
  return null;
}

/**
 * Evidence for each needs-data issue: which of its linked signals fire
 * today, today's value where the snapshot has a per-key breakdown (null =
 * unknown, never 0), and why a linked signal was not evaluated.
 *
 * @param {{ number: number, title?: string, body: string }[]} issues  open `needs-data` issues
 * @param {{ evaluation: object, config?: object, snapshot?: object }} context
 */
export function needsDataEvidence(issues, { evaluation, config, snapshot }) {
  return issues.map((issue) => {
    const { links, errors } = parseSignalsLine(issue.body);
    const enriched = links.map((link) => {
      const perFields = perFieldsOf(config, link.signalId);
      const fired = (evaluation.fired ?? []).filter((f) => matchesLink(link, f, perFields));
      const notEvaluated = (evaluation.notEvaluated ?? [])
        .filter((n) => n.signalId === link.signalId)
        .map((n) => n.reason);
      return {
        ...link,
        firing: fired.length > 0,
        fired,
        value: linkValue(link, config, snapshot),
        notEvaluated: [...new Set(notEvaluated)],
        note: linkNote(link, perFields),
      };
    });
    return {
      issueNumber: issue.number,
      title: issue.title ?? null,
      firing: enriched.some((link) => link.firing),
      links: enriched,
      errors,
    };
  });
}
