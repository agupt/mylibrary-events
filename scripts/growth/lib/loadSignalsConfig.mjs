/**
 * Loads and validates `docs/growth-agent/signals.yml`, the only place
 * trigger thresholds live (PLAN §7; schema in phase1-impact.md §3).
 *
 * An invalid file must fail the run before any issue is touched, so every
 * object is strict (a typo is an error, never a silently ignored key) and
 * cross-field rules are checked here rather than at evaluation time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";
import { SIGNAL_IDS } from "./snapshotSchema.mjs";

export const SIGNALS_CONFIG_PATH = path.resolve(
  import.meta.dirname,
  "../../../docs/growth-agent/signals.yml",
);

export const CONFIG_STATUSES = Object.freeze([
  "draft",
  "baselined",
  "disabled",
  "not-applicable",
]);

/** Statuses whose triggers are evaluated. */
export const ACTIVE_STATUSES = Object.freeze(["draft", "baselined"]);

export const RULE_KINDS = Object.freeze([
  "threshold",
  "rollingSum",
  "wowChange",
  "vsTrailingMedian",
  "consecutive",
  "newKey",
]);

export const COMPARATOR_OPS = Object.freeze(["gt", "gte", "lt", "lte", "eq"]);

const DEFAULT_TRIGGER = "default";
const MAX_WINDOW_DAYS = 90;

// ---- primitives -----------------------------------------------------------

const signalId = z.enum(SIGNAL_IDS);
/** `S3.missesBySystem`, `S2.byOutcome.not-found`: rooted at a signal block. */
const metricPath = z
  .string()
  .regex(/^[A-Z]\d{1,2}(\.[A-Za-z0-9_-]+)+$/, "expected a dotted path like S3.missesBySystem")
  .refine((value) => SIGNAL_IDS.includes(value.split(".")[0]), {
    message: "path must start with a Phase 1 signal ID",
  });
const metricPaths = z.union([metricPath, z.array(metricPath).min(1)]);
const fieldName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const days = z.number().int().min(1).max(MAX_WINDOW_DAYS);
const comparatorValue = z.union([z.number(), z.boolean()]);

const comparatorShape = Object.fromEntries(
  COMPARATOR_OPS.map((op) => [op, op === "eq" ? comparatorValue.optional() : z.number().optional()]),
);

function exactlyOneComparator(value, ctx) {
  const present = COMPARATOR_OPS.filter((op) => value[op] !== undefined);
  if (present.length !== 1) {
    ctx.addIssue({
      code: "custom",
      message: `needs exactly one comparator (${COMPARATOR_OPS.join("|")}), got ${present.length}`,
    });
  }
}

/** A standalone comparator, e.g. a `where` filter: `{ lte: 5 }`. */
const comparator = z.strictObject(comparatorShape).superRefine(exactlyOneComparator);

/** A rule object: `kind` + params + exactly one comparator. */
function ruleOf(kind, params) {
  return z
    .strictObject({ kind: z.literal(kind), ...params, ...comparatorShape })
    .superRefine(exactlyOneComparator);
}

const rule = z.discriminatedUnion("kind", [
  ruleOf("threshold", {}),
  ruleOf("rollingSum", {
    windowDays: days,
    requireFullWindow: z.boolean().default(false),
  }),
  ruleOf("wowChange", {
    aggregate: z.enum(["mean", "last"]).default("mean"),
    change: z.enum(["pct", "delta"]).default("pct"),
  }),
  ruleOf("vsTrailingMedian", {
    window: z.number().int().min(1).max(MAX_WINDOW_DAYS),
    minPrior: z.number().int().min(1).max(MAX_WINDOW_DAYS),
    compare: z.enum(["ratio", "delta"]).default("ratio"),
    /** Skip (insufficient-volume) when the median is below this: 2 → 0 is noise. */
    minBaseline: z.number().nonnegative().optional(),
  }),
  ruleOf("consecutive", {
    n: z.number().int().min(2).max(MAX_WINDOW_DAYS),
    over: z.enum(["days", "observations"]).default("days"),
  }),
  ruleOf("newKey", {
    lookbackDays: days,
    windowDays: days.default(1),
  }),
]);

const minVolume = z
  .strictObject({
    metric: metricPaths,
    denominator: metricPaths.optional(),
    perKey: z.boolean().default(false),
    field: fieldName.optional(),
    windowDays: days,
    offsetDays: z.number().int().min(0).max(MAX_WINDOW_DAYS).default(0),
    ...comparatorShape,
  })
  .superRefine(exactlyOneComparator);

const entry = z
  .strictObject({
    id: signalId,
    trigger: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).default(DEFAULT_TRIGGER),
    name: z.string().min(1).max(80),
    status: z.enum(CONFIG_STATUSES),
    cadence: z.enum(["daily", "weekly"]).default("daily"),
    metric: metricPaths.optional(),
    denominator: metricPaths.optional(),
    per: z.union([z.literal("$key"), fieldName, z.array(fieldName).min(1)]).optional(),
    value: fieldName.optional(),
    valueDenominator: fieldName.optional(),
    where: z.record(fieldName, comparator).optional(),
    absentKey: z.enum(["zero", "null"]).default("null"),
    excludeKeys: z.array(z.string().min(1)).default([]),
    rule: rule.optional(),
    minVolume: minVolume.optional(),
    minHistoryDays: days.default(1),
    severity: z.enum(["info", "warn"]).default("info"),
    note: z.string().max(400).optional(),
  })
  .superRefine((value, ctx) => {
    if (!ACTIVE_STATUSES.includes(value.status)) return;
    for (const name of ["metric", "rule"]) {
      if (value[name] === undefined) {
        ctx.addIssue({ code: "custom", path: [name], message: `${name} is required when status is ${value.status}` });
      }
    }
    if (value.rule?.kind === "newKey" && value.per === undefined) {
      ctx.addIssue({ code: "custom", path: ["per"], message: "newKey requires per" });
    }
    if (value.minVolume?.perKey && value.per === undefined) {
      ctx.addIssue({ code: "custom", path: ["minVolume", "perKey"], message: "perKey requires per" });
    }
    if (value.per !== undefined && value.denominator !== undefined) {
      ctx.addIssue({ code: "custom", path: ["denominator"], message: "use valueDenominator with per" });
    }
    if (value.per !== undefined && Array.isArray(value.metric)) {
      ctx.addIssue({ code: "custom", path: ["metric"], message: "per needs a single metric path" });
    }
    if (value.minVolume?.perKey && Array.isArray(value.minVolume.metric)) {
      ctx.addIssue({ code: "custom", path: ["minVolume", "metric"], message: "perKey needs a single metric path" });
    }
  });

const configSchema = z
  .strictObject({
    version: z.literal(1),
    phase1Exit: z.boolean().default(false),
    signals: z.array(entry),
  })
  .superRefine((config, ctx) => {
    const seen = new Set();
    config.signals.forEach((signal, index) => {
      const id = `${signal.id}/${signal.trigger}`;
      if (seen.has(id)) {
        ctx.addIssue({ code: "custom", path: ["signals", index, "trigger"], message: `duplicate trigger ${id}` });
      }
      seen.add(id);
      if (config.phase1Exit && signal.status === "draft") {
        ctx.addIssue({
          code: "custom",
          path: ["signals", index, "status"],
          message: `${id} is still draft but phase1Exit is true (baseline or disable it)`,
        });
      }
    });
  });

function formatIssues(error) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Parses and validates signals.yml text.
 * Returns the repo's `{ success, data, error }` envelope; `data` has every
 * default applied, `error` is a one-line `path: message; ...` summary.
 */
export function parseSignalsConfig(yamlText) {
  let raw;
  try {
    raw = loadYaml(String(yamlText ?? ""));
  } catch (error) {
    return { success: false, data: null, error: `signals.yml is not valid YAML: ${error.message}` };
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    return { success: false, data: null, error: formatIssues(result.error) };
  }
  return { success: true, data: result.data, error: null };
}

/**
 * Reads and validates the signals config. Throws an Error naming the file
 * and every issue, so the run fails before any issue is touched.
 */
export function loadSignalsConfig(filePath = SIGNALS_CONFIG_PATH) {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${filePath}: ${error.message}`, { cause: error });
  }
  const result = parseSignalsConfig(text);
  if (!result.success) throw new Error(`${filePath}: ${result.error}`);
  return result.data;
}
