/**
 * Zod schema for the growth observer's daily snapshot
 * (`reports/metrics/YYYY-MM-DD.json`), as specified in
 * docs/growth-agent/phase1-impact.md §1.
 *
 * Shape: top-level metadata plus one block per signal ID, so the dotted
 * metric paths in `signals.yml` (e.g. `S3.missesBySystem`) resolve directly
 * against the snapshot.
 *
 * Every block carries a `status` (P4: a missing number always says why).
 * `null` means "not collected"; `0` means "source OK, nothing happened".
 * When a block's status is a DATA status, every field must be present (it
 * may be `null`, never absent). Any other status may omit its fields.
 *
 * Public repo: string fields are constrained to ids, enums, our own URLs
 * and bare domains, and every object is strict, so free text (search text,
 * feedback messages, `$ip`) cannot ride along.
 */
import { z } from "zod";

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** The per-signal status enum, in the order §1 lists it. */
export const SIGNAL_STATUSES = Object.freeze([
  "ok",
  "zero-rows",
  "insufficient-field-data",
  "insufficient-volume",
  "not-configured",
  "not-applicable",
  "not-due",
  "error",
]);

/** Statuses that come with a reading: every field must be present. */
export const DATA_STATUSES = Object.freeze([
  "ok",
  "zero-rows",
  "insufficient-field-data",
  "insufficient-volume",
]);

/**
 * Statuses that count toward the "clean collection" exit criterion (§6).
 * `not-configured` is included; whether it was a deliberate choice is the
 * baseline report's call, not the schema's.
 */
export const CLEAN_STATUSES = Object.freeze(
  SIGNAL_STATUSES.filter((status) => status !== "error"),
);

/** Every signal block a snapshot must contain (F9 is not in Phase 1). */
export const SIGNAL_IDS = Object.freeze([
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12", "S13",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F10",
]);

/** Page types from WS-D's `classifyPath` (phase1-impact.md §1a). */
export const PAGE_TYPES = Object.freeze([
  "home",
  "storytimes-index",
  "state",
  "city",
  "library",
  "privacy",
  "status",
  "other",
]);

/** The only origin whose page URLs a snapshot may carry. */
export const SITE_ORIGIN = "https://mylibrary-events.com";

const MAX_ERROR_LENGTH = 200;
const MAX_SYSTEM_ROWS = 500; // S3/S4 cap
const MAX_FUNNEL_ROWS = 50; // S12
const MAX_TOP_PAGES = 25; // F2
const MAX_TOP_REFERRERS = 25; // F8

export const signalStatusSchema = z.enum(SIGNAL_STATUSES);

// ---- primitives -----------------------------------------------------------

const count = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1);
const nonNegative = z.number().nonnegative();
const isoDate = z.iso.date();
/**
 * A map key: an id-like token (bot names, pipeline stages, filter names,
 * referring domains, utm values). No spaces, so no sentences of free text.
 */
const key = z.string().regex(/^[A-Za-z0-9$][A-Za-z0-9._:-]{0,63}$/);
/** A vendor-defined label (GSC coverage states contain spaces). */
const label = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ,._:()-]{0,79}$/);
const pageType = z.enum(PAGE_TYPES);
const countMap = z.record(key, count);
const pageTypeMap = (value) => z.partialRecord(pageType, value);

/** IMLS system key (FSCSKEY), e.g. CA0114. */
const systemId = z.string().regex(/^[A-Z]{2}\d{4}$/);
/** IMLS outlet id, e.g. CA0114-002. */
const outletId = z.string().regex(/^[A-Z]{2}\d{4}-\d{3}$/);
/**
 * A referring host (never a URL): hostnames incl. `localhost`, IPs, an
 * optional port. `$direct` is PostHog's sentinel; collectors map anything
 * else that doesn't fit to `$other` rather than failing the snapshot.
 */
const domain = z
  .string()
  .regex(/^(\$direct|\$other|(?=.{1,253}(:|$))[a-z0-9_-]+(\.[a-z0-9_-]+)*(:\d{1,5})?)$/i);
/** One of our own page URLs (on SITE_ORIGIN or site-relative), no query. */
const pageUrl = z
  .string()
  .regex(/^(https:\/\/(www\.)?mylibrary-events\.com)?\/[^\s?#]*$/);

/**
 * Fragments that look like a credential or a URL query string:
 * `api_key=…`, `token=…`, `Bearer …`, `Authorization: …`, `?a=b`.
 * (A bare word like "token" is fine: "Unexpected token in JSON".)
 */
const SECRET_SOURCE =
  String.raw`\S*(key|token|password|secret)=\S*|\bbearer\s+\S+|\bauthorization:\s*\S+(\s+\S+)?|\?\S*=\S*`;
const SECRET_PATTERN = new RegExp(SECRET_SOURCE, "i");

/**
 * An error message for a public file: short, and never something that
 * looks like a credential or a query string. Collectors must pass raw
 * errors through `sanitizeError()` first.
 */
const errorMessage = z
  .string()
  .min(1)
  .max(MAX_ERROR_LENGTH)
  .refine((message) => !SECRET_PATTERN.test(message), {
    message: "error message looks like it carries a secret or query string",
  });

/**
 * Turns a raw error (Error, string, anything) into a message that always
 * passes the schema: URL query strings and fragments dropped, credential-
 * like fragments redacted, whitespace collapsed, truncated.
 */
export function sanitizeError(raw) {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  const cleaned = text
    .replace(/(https?:\/\/[^\s?#]*)[?#]\S*/gi, "$1")
    .replace(new RegExp(SECRET_SOURCE, "gi"), "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_LENGTH);
  return cleaned || "unknown error";
}

const systemCountRows = z
  .array(z.strictObject({ system: systemId, count }))
  .max(MAX_SYSTEM_ROWS);

// ---- block builder --------------------------------------------------------

/**
 * Builds a signal block: `{ status, error?, ...fields }`.
 * Each field is nullable; with a DATA status it must also be present
 * (except keys listed in `optional`, e.g. weekly-only extras).
 */
export function signalBlock(fields, { optional = [] } = {}) {
  const optionalKeys = new Set(optional);
  const shape = Object.fromEntries(
    Object.entries(fields).map(([name, schema]) => [
      name,
      schema.nullable().optional(),
    ]),
  );

  return z
    .strictObject({
      status: signalStatusSchema,
      error: errorMessage.optional(),
      ...shape,
    })
    .superRefine((block, ctx) => {
      if (block.status === "error" && block.error === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["error"],
          message: "status 'error' requires an error message",
        });
      }
      if (block.status !== "error" && block.error !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["error"],
          message: "error message is only allowed with status 'error'",
        });
      }
      if (!DATA_STATUSES.includes(block.status)) return;
      for (const name of Object.keys(fields)) {
        if (!optionalKeys.has(name) && block[name] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `required with status '${block.status}' (use null if not collected)`,
          });
        }
      }
    });
}

// ---- Self ring ------------------------------------------------------------

const cruxFormFactor = z.strictObject({
  status: z.enum(["ok", "insufficient-field-data"]),
  lcpP75: nonNegative.nullable(),
  inpP75: nonNegative.nullable(),
  clsP75: nonNegative.nullable(),
});

const S1 = signalBlock({
  pageviews: count,
  visitors: count,
  byPageGroup: pageTypeMap(count),
});

const S2 = signalBlock({
  searches: count,
  byKind: z.strictObject({ zip: count, city: count }),
  byOutcome: z.strictObject({
    ok: count,
    ambiguous: count,
    "not-found": count,
    error: count,
  }),
});

const S3 = signalBlock({ missesBySystem: systemCountRows });
const S4 = signalBlock({ zeroEventBySystem: systemCountRows });

const S5 = signalBlock({
  probes: z.array(
    z.strictObject({
      system: systemId,
      outlet: outletId,
      feedReachable: z.boolean().nullable(),
      httpStatus: z.number().int().min(100).max(599).nullable(),
      eventCount30d: count.nullable(),
      error: errorMessage.optional(),
    }),
  ),
  probed: count,
  activeTotal: count,
});

const S6 = signalBlock({
  phone: cruxFormFactor,
  desktop: cruxFormFactor,
  collectionPeriod: z.strictObject({ firstDate: isoDate, lastDate: isoDate }),
});

const lighthouseScore = z.number().min(0).max(100).nullable();

const S7 = signalBlock({
  runs: z.array(
    z.strictObject({
      url: pageUrl,
      strategy: z.enum(["mobile", "desktop"]),
      performance: lighthouseScore,
      seo: lighthouseScore,
      accessibility: lighthouseScore,
      bestPractices: lighthouseScore,
      lcpMs: nonNegative.nullable(),
      tbtMs: nonNegative.nullable(),
      cls: nonNegative.nullable(),
    }),
  ),
});

const S8 = signalBlock({
  requests: nonNegative, // PromQL increase() can be fractional
  rate5xx: ratio,
  p95Seconds: nonNegative,
});

const S9 = signalBlock({
  outboundClicks: count,
  filterChanges: countMap,
});

const S10 = signalBlock({
  coverageGeneratedAt: z.iso.datetime({ offset: true }),
  zipReachPct: z.number().min(0).max(100), // percent (0-100), as named
  systemsActive: count,
  pipeline: countMap,
});

/** AdSense was never approved: the only valid reading is not-applicable. */
const S11 = z.strictObject({ status: z.literal("not-applicable") });

const S12 = signalBlock({
  visitsByEntry: z.record(key, pageTypeMap(count)),
  actionsByPageType: pageTypeMap(countMap),
  engagedRateByPageType: pageTypeMap(ratio),
  funnel: z
    .array(
      z.strictObject({
        source: key,
        pageType,
        action: key,
        visits: count,
      }),
    )
    .max(MAX_FUNNEL_ROWS),
});

const S13 = signalBlock({
  pages: count,
  zeroEventPages: count,
  zeroEventShare: ratio,
  indexedZeroEventShare: ratio,
  unprobedPages: count,
});

// ---- Frontier ring --------------------------------------------------------

const F1 = signalBlock({
  dataDate: isoDate,
  clicks: count,
  impressions: count,
  ctr: ratio,
  position: nonNegative,
  byPageGroup: pageTypeMap(
    z.strictObject({
      clicks: count,
      impressions: count,
      pagesWithImpressions: count,
    }),
  ),
});

const F2 = signalBlock({
  strikingQueryCount: count,
  strikingImpressions: count,
  topPages: z
    .array(
      z.strictObject({
        page: pageUrl,
        strikingImpressions: count,
        queryCount: count,
      }),
    )
    .max(MAX_TOP_PAGES),
});

const F3 = signalBlock({
  anomalies: z.array(
    z.strictObject({
      page: pageUrl,
      position: nonNegative,
      ctr: ratio,
      expectedCtr: ratio,
      impressions: count,
    }),
  ),
});

const F4 = signalBlock(
  {
    sampled: count,
    indexedByType: pageTypeMap(count),
    coverageStates: z.record(label, count),
    indexedShareEstimate: z.strictObject({
      value: ratio,
      ci95: z.strictObject({ low: ratio, high: ratio }),
    }),
  },
  { optional: ["indexedShareEstimate"] }, // weekly estimate only
);

const F5 = signalBlock({
  weekOf: isoDate,
  clicks: count,
  impressions: count,
});

const F6 = signalBlock({
  hitsByBot: countMap,
  llmsTxtHits: count,
});

const F7 = signalBlock({ visitsByEngine: countMap });

const F8 = signalBlock({
  topReferrers: z
    .array(z.strictObject({ domain, pageviews: count }))
    .max(MAX_TOP_REFERRERS),
});

const F10 = signalBlock({
  submissions: count,
  byContext: countMap,
});

// ---- snapshot -------------------------------------------------------------

export const signalSchemas = Object.freeze({
  S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13,
  F1, F2, F3, F4, F5, F6, F7, F8, F10,
});

export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  /** The run date (UTC), matching the file name. */
  date: isoDate,
  generatedAt: z.iso.datetime({ offset: true }),
  /**
   * Set only on files written by `collectMetrics --backfill-from`: they hold
   * a history-only reading (F1) and never count as a clean collection day.
   */
  backfill: z.literal(true).optional(),
  ...signalSchemas,
});

/**
 * Validates an unknown value as a snapshot.
 * Returns the repo's `{ success, data, error }` envelope; `error` is a
 * one-line summary of every issue (`path: message; ...`).
 */
export function validateSnapshot(value) {
  const result = snapshotSchema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data, error: null };
  }
  const error = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { success: false, data: null, error };
}
