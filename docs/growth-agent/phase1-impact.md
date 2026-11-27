# Phase 1 — Impact analysis & build plan (Observer + baseline)

Written 2026-11-26 (updated 2026-11-27 with the first PostHog readout and
Amool's decisions of 2026-11-26) before any code, per the dev rules in `AGENTS.md` (impact first, assumptions stated,
one source of truth per fact). Scope: PLAN §4 Phase 1. **Status: proposal —
awaiting Amool's approval. Nothing below exists yet.**

Phase 1 has two halves:

- **The observer** (read-only). A deterministic job (no LLM, P1) collects
  every available signal once a day, commits a JSON snapshot, evaluates
  DRAFT thresholds, and opens deduped `signal` issues. **No agent acts on
  those issues in Phase 1.** Amool reads them to judge whether the triggers
  make sense.
- **Full-site instrumentation** (WS-D, Amool 2026-11-26). Page-type
  classification and action events on **every** page type (home, state,
  city, library, privacy, status), entry-source breakdown, an engaged-visit
  definition, and the `ai_bot_hits` `$ip` fix. **WS-D is the only Phase 1
  deploy**, and Amool approves it.

## What the first PostHog readout changes (2026-11-27 04:40 UTC)

The HogQL query API works with the personal key (17 queries, all HTTP 200).
What it showed reshapes the plan:

| Finding | Consequence for Phase 1 |
|---|---|
| 592 pageviews since 11-24 (349 www.google.com, 234 direct, 5 Bing, 3 DDG), but only 7 `search_performed`, 6 `filter_changed`, 1 `outbound_click`, 1 feedback. On 11-26/27: 283 pageviews, **0 searches**. Visitors land on the programmatic SEO pages and leave. | **Low counts are normal, not missing data.** The snapshot separates `0` (source OK, nothing happened) from `null` (not collected). Triggers get `minVolume` guards and report `insufficient-volume` instead of firing. Adds proposed **S12 landing engagement** (below). |
| Landing pages (`/storytimes/<st>/<city>`, `/library/<st>/<city>/<slug>`) emit **only `$pageview`**. Their "Visit library website" link is a plain `<a>` with no tracker (only `LibraryResults` tracks outbound clicks), and `LandingEventsWidget` emits nothing. | Most S12 is **not measurable today**, which is why **WS-D instruments every page type** (§1a). S12 reads WS-D's events. |
| AdSense rejected for **"Low value content"** (thin content, not enough curation or user interest). The likely cause is the ~8,766 generated pages. | S11 stays N/A. Adds proposed **S13 thin-page share** (a signal only) and **F1 impressions per page type**. AdSense re-review parked; revisit if Phase 1 data improves engagement. |
| CrUX key works and the origin **has field data**: p75 LCP 890 ms, CLS 0.01, no INP (too few interactions). PSI mobile score 98 (LCP 1.8 s, TBT 10 ms, CLS 0). | S6/S7 are live from day one. INP reads `insufficient-field-data`, not an error. |
| F6 has volume: 348 captures / 3,302 hits; OAI-SearchBot 2,097, Amazonbot 618, meta-externalagent 415, DuckAssistBot 131. F7 (AI referrals) is 0. | F6 thresholds come from the observed per-bot baseline, not a hand-picked list. F7 = 0 is a real reading. |
| **Privacy bug:** `ai_bot_hits` events carry `$ip`: the Fly server's own egress IP (1 distinct value). Browser events have none. | **Fixed in WS-D:** `src/proxy.ts` sends an empty `$ip`. Independently, the observer **never selects `$ip`** (or any free text), enforced by a unit test (assumption 9). Events already ingested keep the server IP; it's not a visitor's IP. |
| Phase 0 exit rule ("every signal non-null 3 consecutive days") is unrealistic at this volume. | **Pending Amool:** proposed replacement "every signal has arrived at least once and been verified". The observer's PostHog reader produces that check as its first output (WS-A1). |

---

## 1. What ships

One daily workflow run writes `reports/metrics/YYYY-MM-DD.json`. On Mondays
the same run also collects the weekly-cadence sources and writes the weekly
report. Every source records a `status`, so a missing number always says
*why* (P4):

`ok` · `zero-rows` (source fine, no data, e.g. Bing) · `insufficient-field-data` (CrUX) · `insufficient-volume` (trigger guard) · `not-configured` (secret absent) · `not-applicable` (S11) · `not-due` (weekly source on a non-Monday) · `error` (with message).

### Self ring

| ID | Source | Collection method | Cadence | Output field(s) |
|---|---|---|---|---|
| S1 | PostHog `$pageview` | HogQL: `count()`, `uniq(distinct_id)` grouped by `properties.page_type` (WS-D). For events before WS-D's deploy, the same classifier (`src/lib/analytics/pageType.ts`, run via `tsx`) is applied to `$pathname`. **One classifier for events and GSC URLs.** Day D-1 UTC | daily | `S1.pageviews`, `S1.visitors` (cookieless daily hash, so per day only), `S1.byPageGroup{}` |
| S2 | PostHog `search_performed` | HogQL count by `query_kind`, `outcome` | daily | `S2.searches`, `S2.byKind{zip,city}`, `S2.byOutcome{ok,ambiguous,not-found,error}` |
| S3 | PostHog `search_results.systems_without_feed` | HogQL `arrayJoin` over the array, count per FSCSKEY | daily | `S3.missesBySystem[{system,count}]` (every system with ≥1 miss, capped at 500) |
| S4 | PostHog `search_results.zero_event_systems` | same as S3 | daily | `S4.zeroEventBySystem[{system,count}]` |
| S5 | Production `GET /api/libraries/<main-outlet>/analysis` | Probe set = systems seen as `home_system` in the last 7 days, plus a rotating slice so all ~927 active systems are probed weekly (~140/day), plus yesterday's failures re-queued. Concurrency 2, cache-buster query param (assumption 6) | daily | `S5.probes[{system,outlet,feedReachable,httpStatus,eventCount30d,error?}]`, `S5.probed`, `S5.activeTotal` |
| S6 | CrUX API `records:queryRecord` (origin, `PHONE` and `DESKTOP`) | `CRUX_API_KEY`. A 404 / no record → `insufficient-field-data`. A metric missing from the record (INP today) → that metric is `null` with the same status | weekly (Mon) | `S6.phone{lcpP75,inpP75,clsP75}`, `S6.desktop{…}`, `S6.collectionPeriod` |
| S7 | PageSpeed Insights v5 `runPagespeed` (`lighthouseResult`) | Same key. 5 representative URLs (home, 1 state, 1 city, 1 library, `/status`) × mobile/desktop × **median of 3 runs** (lab noise) = 30 calls | weekly (Mon) | `S7.runs[{url,strategy,performance,seo,accessibility,bestPractices,lcpMs,tbtMs,cls}]` |
| S8 | Fly Prometheus `api.fly.io/prometheus/<org>/api/v1/query` | `fly_app_http_responses_count{status}` and `fly_app_http_response_time_seconds_bucket`. **Needs a new read-only Fly token** (decision 7). App-level only: Fly has no per-route split, so "p95 of `/api/events`" becomes app-wide p95. Requests served from Cloudflare's cache never reach Fly | daily | `S8.requests`, `S8.rate5xx`, `S8.p95Seconds` |
| S9 | PostHog `outbound_click`, `filter_changed` | HogQL counts; clicks/search computed in the evaluator | daily | `S9.outboundClicks`, `S9.filterChanges{filter: n}`. **Return-visitor rate is not measurable** under cookieless mode (the daily hash rotates; to verify), so it's recorded as a blind spot, not a 0 |
| S10 | `src/lib/data/generated/coverageStats.json` (committed weekly by data-refresh) | Read the file. **Don't rerun the harness**: data-refresh owns that fact | daily read (changes Mondays) | `S10.coverageGeneratedAt`, `S10.zipReachPct`, `S10.systemsActive`, `S10.pipeline{stage: systems}` |
| S11 | AdSense | **NOT APPLICABLE**: AdSense was never approved (rejected for "Low value content"). Dropped from Phase 1. SIGNALS.md row is updated to `not-applicable` in WS-C | — | `S11.status = "not-applicable"` |
| **S12 (proposed)** | **WS-D events** (§1a): `$pageview.page_type`, `page_action`, `outbound_click`, entry-source properties | HogQL per visit (`$session_id`; assumption 8): entry source → landing `page_type` → first action. Engaged-visit rate per page type (definition in §1a). Before WS-D's deploy, every field reads `not-configured`; afterwards they're measurable | daily; funnel in the weekly report | `S12.visitsByEntry{source:{pageType:n}}`, `S12.actionsByPageType{pageType:{action:n}}`, `S12.engagedRateByPageType{}`, `S12.funnel[{source,pageType,action,visits}]` (top 50 rows) |
| **S13 (proposed)** | S5 probe results joined to the page manifest | `npx tsx` script imports `getActiveLibraryPages()`/`getActiveCityPages()` from `src/lib/seo/pages.ts` (**the eligibility gate stays its own source of truth**; no re-implementation). Each page maps to its system → latest S5 `eventCount30d`. Weighted by sitemap URL and by F4-sampled indexed URLs | weekly (Mon) | `S13.pages`, `S13.zeroEventPages`, `S13.zeroEventShare`, `S13.indexedZeroEventShare`, `S13.unprobedPages`. AdSense re-review parked; revisit if Phase 1 data improves engagement |

S12 and S13 need SIGNALS.md rows before code (PLAN §7: "don't add a signal
without a SIGNALS.md row"). WS-C adds them in the same PR as the first code.
Note: library/city pages exist only for systems whose registry status is
`active` (`pages.ts` gate), so "no feed" pages should be ~0 by construction.
The thin-content risk is **active-but-empty** systems, plus the fact that
the widget fetches events client-side, so the server-rendered HTML Google
sees carries no events. That's recorded as a hypothesis only; Phase 1 doesn't
plan a fix.

### 1a. Full-site instrumentation (WS-D: the only Phase 1 deploy)

WS-D reuses the Phase 0 pattern:

- **Pure builders** in `src/lib/analytics/`, with thin wiring in components.
- **Cookieless and prod-only**, with posthog-js lazy-loaded as today.
- **No free text:** every property is an enum, a boolean, a count, or an id
  derived from our own URL or IMLS data.
- **A deny-list privacy test:** every builder's output keys must be on an
  allowlist, and no value may come from user input or carry `$ip`, a query,
  a message or a full URL.

| Piece | What | Properties (enums/ids only) |
|---|---|---|
| Page-type classification | Every `$pageview` carries the page type, via the pure `classifyPath(pathname)` in `src/lib/analytics/pageType.ts` (also used by the observer for GSC URLs and pre-deploy events: one source of truth) | `page_type` ∈ `home, storytimes-index, state, city, library, privacy, status, other`; `page_state` (2-letter); `page_city` (our URL slug); `page_library` (IMLS outlet id, library pages only) |
| Landing widget | `LandingEventsWidget` load outcome and event-list interactions (inventory the widget's controls first; instrument the ones that exist) | `page_action` {`action`: `widget_loaded` / `event_open` / `widget_more` …, `page_type`, `outcome`: ready/empty/error, `event_count`} |
| Outbound links | "Visit library website" on library pages, and any event/outbound link on landing pages | extend `outbound_click` with placement `landing_library` / `landing_event` (+ `library_id`, `page_type`) |
| Internal navigation | sibling branches, nearby cities, breadcrumbs, state links, finder links | `page_action` {`action`: `nav_click`, `page_type`, `target_page_type`, `slot`: sibling/nearby_city/breadcrumb/state/finder} |
| FAQ expands | only if `FaqSection` exposes a toggle cheaply (e.g. a `<details>` toggle) | `page_action` {`action`: `faq_expand`, `page_type`, `index`} |
| Entry source | posthog-js records `$referring_domain` and campaign (`utm_*`) properties on pageviews (to verify on a real event). WS-D adds no code unless verification shows a gap | referring **domain** only; `utm_source/medium/campaign` as sent |
| Engaged visit | Defined, not emitted. A visit (`$session_id`) is engaged if it has ≥ 1 of: `search_performed`, `outbound_click`, a `page_action` other than `widget_loaded`, or ≥ 2 pageviews. No time-on-page (`capture_pageleave` stays off) | computed by the observer (A1); the definition text lives in the SIGNALS.md S12 row |
| `$ip` fix | `src/proxy.ts` sends `$ip: ""` on `ai_bot_hits` | unit test: the capture body's `$ip` is empty |

The privacy page's analytics section is updated for page-type and click
events (copy reviewed by Amool). The deploy follows the Phase 0 path (build
arg token, `fly deploy`) **after Amool approves**, and gets a production
verification section like Phase 0's. S12 collection days count from the
deploy date.

### Frontier ring

| ID | Source | Collection method | Cadence | Output field(s) |
|---|---|---|---|---|
| F1 | GSC `searchAnalytics.query` | Service-account JWT → OAuth token. Day D-3 (final data), dimension `date`, and dimension `page` (rowLimit 25,000) → aggregated locally into page groups. **One-time `--backfill` from 2026-10-30** so F1 starts with ~4 weeks of history | daily | `F1.dataDate`, `F1.clicks`, `F1.impressions`, `F1.ctr`, `F1.position`, `F1.byPageGroup{group:{clicks,impressions,pagesWithImpressions}}` (**= impressions per page type**) |
| F2 | GSC, dimensions `query,page`, last 7 final days | Derived locally: rows with position 8–30 and ≥N impressions. **Only aggregates and our own page URLs are kept; query strings are dropped in memory** (decision 3) | weekly | `F2.strikingQueryCount`, `F2.strikingImpressions`, `F2.topPages[{page,strikingImpressions,queryCount}]` (25) |
| F3 | GSC, same pull as F2 | Expected CTR per position = **the site's own** CTR-by-position curve over 28 days (no invented industry curve) | weekly | `F3.anomalies[{page,position,ctr,expectedCtr,impressions}]` (page level) |
| F4 | GSC URL Inspection API `urlInspection.index.inspect` | Sitemap `indexed` reads 0 (unpopulated), so sample instead: 100 URLs/day from the **live** `/sitemap.xml`, stratified by page type, throttled to 1 request/second. Quota is 2,000/day and 600/min per site. The weekly estimate pools 7 days (~700 samples, ±~4 pts at 95%). Response fields (`indexStatusResult.verdict`, `coverageState`) to be verified on first call | daily sample, weekly estimate | `F4.sampled`, `F4.indexedByType{}`, `F4.coverageStates{}`, weekly `F4.indexedShareEstimate{value,ci95}` |
| F5 | Bing `ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats` (+ `GetQueryStats` counts only) | `BING_WEBMASTER_API_KEY`. No date params: it returns all history in weekly buckets, so keep the latest bucket. Today this is `zero-rows`, which is **not a broken signal**. No published read quota, so one call per week | weekly | `F5.weekOf`, `F5.clicks`, `F5.impressions`, `F5.status` |
| F6 | PostHog `ai_bot_hits` | HogQL `sum(properties.hits)` by `properties.bot`; count of `llms.txt` among `properties.paths` | daily | `F6.hitsByBot{}`, `F6.llmsTxtHits` |
| F7 | PostHog `$pageview.$referring_domain` | Matched against the AI-referrer domain list in `scripts/growth/lib/aiReferrers.mjs` (chatgpt.com, perplexity.ai, copilot.microsoft.com, gemini.google.com, claude.ai) | daily | `F7.visitsByEngine{}` (0 today: a real reading) |
| F8 | PostHog `$referring_domain` | Top 25 referring **domains** (never full URLs), self excluded | daily | `F8.topReferrers[{domain,pageviews}]` |
| F10 | PostHog `feedback_submitted` | **`count()` by `properties.context` only. `properties.message` is never selected** | daily | `F10.submissions`, `F10.byContext{}` |

**How feedback text reaches Amool:** it doesn't go through the observer. The
weekly report links to a saved PostHog view of `feedback_submitted` (Amool
reads the text in PostHog behind his login). If one is actionable, he files
an issue himself. The text never lands in the public repo or in a public
issue.

**Low-volume reality:** at roughly 2–3 searches/day, S2/S3/S4/S9 will mostly
read `insufficient-volume` during the baseline. That's the honest state. The
landing-page traffic (S1, S12, F1) is where the volume is.

---

## 2. Impact map (whole system)

- **Repo / data model.** New `reports/metrics/YYYY-MM-DD.json` (one per day)
  and `reports/growth/weekly-YYYY-Www.md`. There's no new datastore: PostHog,
  GSC, CrUX, Bing and Fly stay the sources of truth, and the snapshot is a
  dated *reading* of them (P2). Query-level GSC detail stays in GSC (16-month
  retention), not duplicated here.
  - **Size:** ~25–40 KB/day uncompressed (S5 probes ~15 KB, PostHog
    aggregates ~5 KB, GSC page groups and F4 ~5 KB, weekly extras on
    Mondays). That's ≈ 9–15 MB/year in the working tree, and JSON packs ~5×,
    so ≈ 2–3 MB/year of `.git` growth (the current pack is 330 KB). Acceptable.
    If it ever matters, roll files older than 90 days into monthly
    `.json.gz`. Not built now (YAGNI).
- **Merge races with the data-refresh bot.** data-refresh pushes to `main`
  daily (09:17 UTC, NYPL snapshot) and on Mondays (07:43 UTC, coverage). Both
  use a bare `git push` with **no retry**. An observer push landing between
  their checkout and push would make *their* push fail non-fast-forward.
  Strategy:
  1. **Disjoint paths:** the observer only writes `reports/metrics/**` and
     `reports/growth/**`; the bot writes `src/lib/data/generated/**` and
     `reports/coverage-report-*`. A rebase can never conflict.
  2. **Time separation:** observer cron at 11:23 UTC, ≥2 h after both bot
     slots (decision 6).
  3. **One commit per run** (`chore: growth observer YYYY-MM-DD`), pushed
     with `git pull --rebase` + up to 3 retries with backoff, plus a
     workflow `concurrency: growth-observer` group.
  4. Add the same 3-line rebase-retry to data-refresh's two push steps
     (decision 9).
  Pushes made with `GITHUB_TOKEN` don't trigger other workflows, and deploys
  are manual (`fly deploy`), so commits don't cause deploys.
- **Workflows.** New `.github/workflows/growth-observer.yml`: daily
  schedule + `workflow_dispatch` (inputs: `dry_run`, `no_issues`,
  `backfill_from`). `permissions: contents: write, issues: write`. Node 22,
  `npm ci`, `timeout-minutes: 20`. A source `error` doesn't stop the run: the
  snapshot is still written and committed, then the job exits non-zero so
  GitHub's failed-run email reaches Amool. data-refresh gets only the
  decision-10 retry.
- **Scripts.** New `scripts/growth/` (orchestrator, `sources/*`, pure
  `lib/*`). Existing pipeline scripts are untouched. `coverageHarness.mjs` is
  read via its output, never re-run.
- **Tests / tooling.** `vitest.config.ts` only includes `src/**/*.test.ts`,
  and coverage only covers `src/lib/**`. Extend `include` with
  `scripts/growth/**/*.test.mjs` and coverage with `scripts/growth/lib/**`
  (80% gate). data-refresh's weekly job runs `npm test`, so **every observer
  test must be offline** (recorded fixtures, injected `fetch`). New devDeps:
  `js-yaml` for `signals.yml` (already in the tree transitively; make it
  explicit) and `tsx` for the S13 page manifest. `package-lock.json` changes
  only through `npm install` (the protect-generated hook blocks hand edits).
  The global branch-coverage gate already fails on `main` (72.5%). New files
  must meet 80% on their own; fixing the global number is out of scope.
- **`/status` page.** **Out of scope** (decision 5). It's public and
  server-rendered; adding a tab means a deploy and putting traffic numbers on
  a public page. The weekly report covers the need.
- **Docs.** New `docs/growth-agent/signals.yml`. SIGNALS.md: S11 →
  `not-applicable`, S8 source note (app-level, needs Fly token), new S12 and
  S13 rows, status columns updated as sources go live. PLAN.md: Phase 1
  status + §5 decision rows. This file gets a "Verification" section after
  the build. `AGENTS.md`: a short "Growth observer" note **only if Amool asks**
  (this plan doesn't touch it).
- **Secrets / config.**

  | Name | Kind | Used by | State |
  |---|---|---|---|
  | `GSC_SITE_URL` | var | F1–F4 | set |
  | `GSC_SERVICE_ACCOUNT_JSON` | secret | F1–F4 | set (read-only `siteRestrictedUser`) |
  | `BING_WEBMASTER_API_KEY` | secret | F5 | set |
  | `POSTHOG_PROJECT_ID` | var | S1–S4, S9, S12, F6–F8, F10 | set (764013) |
  | `POSTHOG_PERSONAL_API_KEY` | secret | same | set, Query Read verified |
  | `CRUX_API_KEY` | secret | S6 (CrUX) + S7 (PSI) | set, verified |
  | `FLY_API_TOKEN` + var `FLY_ORG_SLUG` | secret + var | S8 | **missing**: decision 7 |
  | `GITHUB_TOKEN` | built-in | commits, issues | — |

  Local runs read a gitignored `.env.local` (`.env*` is already ignored);
  `--dry-run` writes to a temp dir and never touches issues.
- **API quotas & cost** (all free tiers; Actions minutes are free on a public repo).

  | API | Phase 1 usage | Documented limit | Headroom |
  |---|---|---|---|
  | PostHog `/api/projects/:id/query/` (host `us.posthog.com`) | ~15 queries/day, sequential | 240/min, 2,400/h, **3 concurrent**, 10 s max execution, 100 rows without `LIMIT` (50k with). Legacy accounts: 120/h | large. Always set `LIMIT`; keep windows ≤ 8 days so queries stay under 10 s |
  | GSC Search Analytics | ~3/day, +2 on Mondays, +~30 once for backfill | 1,200/min per site | large |
  | GSC URL Inspection | 100/day | 2,000/day, 600/min per site | 20× |
  | CrUX | 2/week | 150/min per project | large |
  | PSI | 30/week | **to verify** in the GCP console quota page | expected large |
  | Bing Webmaster stats | 2/week | **not published** (throttles with ThrottleUser/ThrottleHost) | keep minimal |
  | Fly Prometheus | ~3/day | **to verify** | expected large |
  | Production `/analysis` (S5) | ~140–200/day, concurrency 2 | our own app + vendor WAFs | **WAF risk** (risk R3) |
- **Privacy** (this is a **public repo**: every committed file and every
  issue is world-readable).
  - Never stored: PostHog `properties.message` (F10 text), `$ip` (assumption
    9), raw search text (never collected), full referrer URLs (domains only),
    GSC query strings (decision 3).
  - Stored: aggregate counts, our own page URLs, public IMLS FSCSKEYs. Per-system
    daily search counts are coarse (system level, not ZIP) and are accepted
    (assumption 10).
  - Publishing aggregate traffic in a public repo is a business-visibility
    choice for Amool (decision 2).
- **App runtime / UI / proxy (WS-D only).** Changes are limited to WS-D.
  - New pure modules `src/lib/analytics/pageType.ts` and builders in
    `events.ts`. Click/action handlers go in the landing pages,
    `LandingEventsWidget`, `FaqSection` and the internal link slots, with no
    visual change.
  - `browser.ts` attaches `page_type` to pageviews.
  - `src/proxy.ts` sends an empty `$ip`.
  - The privacy page copy is updated.
  - Performance: the handlers are tiny and posthog-js stays lazy-loaded.
    S7 (PSI) checks this the following Monday.
  - PostHog volume: more events per visit (~1–3), still far under the
    1M/month free tier at ~200 pageviews/day.
  - API routes are unchanged. Beyond WS-D, the only production load is the
    S5 probe traffic on `/analysis`.
- **Deploy:** exactly one in Phase 1 (WS-D), approved by Amool. The observer
  workstreams ship no runtime code.

---

## 3. Trigger evaluation

### `docs/growth-agent/signals.yml` (schema)

The only place thresholds live (PLAN §7). It's validated with zod on load,
and an invalid file fails the run before any issue is touched.

```yaml
version: 1
signals:
  - id: S3                       # must exist in SIGNALS.md (test checks)
    name: Search miss
    status: draft                # draft | baselined | disabled | not-applicable
    metric: S3.missesBySystem    # dotted path into the snapshot
    per: system                  # optional: evaluate per key in an array/map
    rule:
      kind: rollingSum           # threshold | rollingSum | wowChange | vsTrailingMedian | consecutive | newKey
      windowDays: 14
      gte: 20
    minVolume: { metric: S2.searches, windowDays: 14, gte: 50 }   # else insufficient-volume
    minHistoryDays: 1            # else insufficient-history
    severity: info               # info | warn
    note: "DRAFT: revise after the 14-day baseline"
```

Rule kinds (closed set; a new kind needs a test):

- `threshold`: the latest value against a comparison.
- `rollingSum`: the sum over N days.
- `wowChange`: the last 7 days vs the prior 7, as %.
- `vsTrailingMedian`: the latest against the median of the last N days.
- `consecutive`: a condition true for N consecutive snapshots.
- `newKey`: a key not present in the prior N days that crosses a floor.

### `scripts/growth/lib/evaluateTriggers.mjs` (pure, TDD)

`evaluateTriggers(config, snapshots, today) → { fired[], notEvaluated[] }`.
It takes no I/O and no clock (`today` is injected). It's a function over the
snapshot history that the orchestrator loads.

- `fired[]`: `{ signalId, key?, severity, value, threshold, evidence: {dates, values}, status }`.
- `notEvaluated[]`: `{ signalId, reason }`, where `reason` is one of
  `insufficient-history`, `insufficient-volume`, `insufficient-field-data`,
  `source-error`, `not-applicable`, `disabled` or `not-due`. These are
  reported in the weekly report, never silently dropped (P4).
- `null` (not collected) never satisfies a rule; `0` with `status: ok` does.
  Test cases cover S4's `consecutive` across a missing day (missing breaks
  the streak), S5 with a rotating probe (it uses that system's last *probes*,
  not calendar days), and F5 `zero-rows` (never fires).

### Draft thresholds (ALL DRAFT, to revise after the 14-day baseline)

| Signal | Draft rule | Guard | Expectation at today's volume |
|---|---|---|---|
| S1 | Visits `wowChange` ≤ −25% | ≥ 200 pageviews/wk | evaluates after day 14 |
| S2 | (ambiguous + not-found) / searches > 15% over 7 d | ≥ 50 searches/wk | `insufficient-volume` |
| S3 | `rollingSum` 14 d ≥ 20 per system | ≥ 50 searches/14 d | won't fire; expected |
| S4 | same system in `zeroEventBySystem` `consecutive` 3 d | — | can fire on a single search/day |
| S5 | eventCount30d ≤ 30% of that system's trailing probe median (≥ 3 prior probes), **or** `feedReachable=false` on 2 consecutive probes | — | fires from week 2 |
| S6 | phone LCP p75 > 2500 ms, INP p75 > 200 ms, or CLS p75 > 0.1 (Google's "good" bounds) | `insufficient-field-data` skips that metric | baseline LCP 890 ms |
| S7 | any category score drops ≥ 10 vs last week's median-of-3 | — | baseline mobile 98 |
| S8 | 5xx rate > 1% or app p95 > 8 s (daily) | ≥ 500 requests/day | needs Fly token |
| S9 | outbound clicks / search `wowChange` ≤ −30% | ≥ 50 searches/wk | `insufficient-volume` |
| S10 | ZIP reach drops > 0.5 pt, or any pipeline branch grows > 10% wk/wk | — | weekly |
| S12 | engaged-visit rate per page type `wowChange` ≤ −30% | ≥ 200 pageviews/wk on that page type | `not-configured` until WS-D deploys |
| S13 | `zeroEventShare` > 25%, or +5 pts wk/wk | ≥ 50% of pages probed | number unknown; first reading sets baseline |
| F1 | clicks `wowChange` ≤ −25% per page group | ≥ 50 clicks/wk in group | evaluates day 1 (backfill) |
| F2 | `newKey`: a page enters the striking-distance list with ≥ 100 impressions/wk | — | weekly |
| F3 | CTR < 50% of expected at position ≤ 5 | ≥ 100 impressions | weekly |
| F4 | indexed share estimate < 70% (upper CI bound < 70%, to avoid noise) | ≥ 300 samples | first estimate at day 7 |
| F5 | same as F1 | dormant while `zero-rows` | dormant |
| F6 | a bot with ≥ 100 hits/wk in the baseline reads 0 for 14 days | — | baseline: OAI-SearchBot, Amazonbot, meta-externalagent, DuckAssistBot |
| F7 | none (trend only) | — | 0 today |
| F8 | `newKey` referrer with ≥ 20 pageviews/wk | — | weekly |
| F10 | none: weekly count in the report, text read in PostHog | — | — |

### Issue dedupe: `scripts/growth/lib/planIssueActions.mjs` (pure) + `gh` wiring

`planIssueActions(fired, openSignalIssues, now) → [{ action: create|comment|none, signalId, title, body, labels }]`.

- **One open issue per signal ID.** It's identified by a body marker
  `<!-- growth-observer:signal=S4 -->` and the `signal` label (not by title,
  which humans may edit). Per-key detail (systems, pages) goes in the body
  and comments, not in separate issues.
- **Comment instead of duplicating**, only when the fingerprint (sorted
  fired keys + severity) changes, or as a "still firing" heartbeat at most
  once every 7 days. That's no daily spam.
- **Cleared** → one "not firing since <date>" comment. **No auto-close in
  Phase 1**: Amool closes and judges. A re-fire after a close opens a new
  issue (a close is a human judgment, so it isn't overridden).
- **Labels** (PLAN lifecycle): `signal` + `signal:<ID>`, created on demand.
  New judgment labels `signal-valid` / `false-positive` are for Amool
  (decision 8).
- Every issue body ends with: *"Phase 1: observation only. No agent will act
  on this issue. Evidence: `reports/metrics/<date>.json`."* Bodies hold
  aggregates only (public repo).
- **`needs-data` issues (#1–#3):** the observer doesn't comment on them. The
  weekly report has a "needs-data evidence" section. Each `needs-data` issue
  names its signals in a body line like `Signals: S4 CA0114, S2 home_system=CA0114`,
  so **the issue owns its own link** (no parallel mapping file). The report
  prints the current numbers for those keys. That's how "fix only when the
  data shows the need" gets its data.

---

## 4. Assumptions (flag any you disagree with)

1. **The snapshot is a reading, not a store.** If wrong (someone treats
   `reports/metrics` as authoritative and edits it), history diverges from
   the sources. Mitigation: files are bot-written only, and the source
   systems stay authoritative.
2. **GSC final data lags ~3 days**, so F1 for day D is collected on D+3. If
   wrong (later finalization), recent days are undercounted. Mitigation: record
   `F1.dataDate` and re-pull the last 3 days weekly (to verify the lag on
   first run).
3. **CrUX "no record" comes back as HTTP 404.** It's observed by the owner
   but not documented on the API page. If wrong (another code or an empty
   body), the fallback misfires. Mitigation: treat 404 and an empty `record`
   as `insufficient-field-data`; anything else is `error`.
4. **The URL Inspection response carries `indexStatusResult.verdict` and
   `coverageState`** (to verify on the first call). If wrong, F4's
   classification is off. Mitigation: store the raw verdict counts until
   verified.
5. **PSI lab noise is about ±5 points.** If it's larger, S7 false-positives.
   Mitigation: median of 3, and a −10 threshold.
6. **`/api/libraries/<id>/analysis` isn't served from Cloudflare's cache**
   (to verify). If it is, S5 reads stale probes. Mitigation: a per-day
   cache-buster query param (the route ignores query params).
7. **The S5 reachability check uses a bot UA** (`library-storytime/1.0`), but
   providers fetch with their own headers. Some WAFs soft-block bot UAs with
   200 + empty (memory: feed-fetch-browser-ua-waf). If that bites,
   `feedReachable=true` + `eventCount=0` looks like a quiet library. That's
   why S5's count rule uses each system's own trailing median, not absolute
   zero.
8. **Cookieless PostHog has a per-day visitor hash and a per-page-load
   `$session_id`** (to verify). If there's no session id, S12's
   landing→finder rate can't be computed and reads `not-configured`.
9. **`$ip` and `properties.message` are never selected.** HogQL uses
   explicit column lists, and a unit test fails if any query in
   `sources/posthogQueries.mjs` mentions `$ip`, `message` or `SELECT *`. If
   wrong, PII lands in a public repo.
10. **Per-system daily counts aren't identifying.** A system covers a whole
    town or county, and there's no ZIP or time-of-day detail. If Amool
    disagrees, add a k≥3 floor on per-system counts in committed files
    (S3/S4 then accumulate more slowly).
11. **`pages.ts` runs outside Next under `tsx`.** It only uses `node:fs` and
    relative imports, with no `server-only`. If wrong, S13 needs a different
    manifest path, and it must still be the same gate, never a re-implemented
    one.
12. **Holiday baseline.** The 14 days span Thanksgiving into December. If
    the baseline is atypical, the revised thresholds are mis-set. Mitigation:
    the F1 backfill gives a pre-holiday comparison; thresholds are revisited
    once more in January.

---

## 5. Decisions for Amool

1. **Where snapshots live:** recommend **committed JSON on `main`** under
   `reports/metrics/`, one commit per run with rebase-retry. A separate data
   branch avoids main-history noise but breaks P2's "strategist reads the
   checkout" and needs its own tooling.
2. **Public-repo exposure:** recommend **yes, aggregates are OK to publish**
   (no query text, no feedback text, no IPs). If no, use a private
   `mylibrary-growth-data` repo with a fine-grained PAT; that changes WS-C
   only.
3. **GSC top queries:** recommend **don't store query strings** in Phase 1.
   Store counts plus page-level F2/F3. GSC keeps query detail for 16 months
   and is the source of truth; the Phase 2 strategist reads it live.
4. **Weekly report:** recommend **both**: a markdown file
   `reports/growth/weekly-YYYY-Www.md` (diffable, P2) plus a comment on one
   pinned rolling "Weekly growth report" issue, so you get a notification.
5. **`/status` tab:** recommend **out of scope** for Phase 1 (needs a deploy;
   public page). Revisit in Phase 2.
6. **Cron time:** recommend **daily 11:23 UTC** (03:23 PST). That's after
   CrUX's ~04:00 UTC refresh and ≥2 h clear of data-refresh (07:43 Mon,
   09:17 daily). Weekly sources run in the Monday run.
7. **S8 Fly metrics:** recommend **creating a read-only Fly token** (`fly
   tokens create readonly`, command to verify) as `FLY_API_TOKEN`, plus
   variable `FLY_ORG_SLUG`. Without it, S8 reads `not-configured`.
8. **False-positive accounting:** recommend labels **`signal-valid` /
   `false-positive`** that you apply when closing a `signal` issue. The FP
   rate is computed from them.
9. **data-refresh push retry:** recommend **adding `git pull --rebase` +
   retry** to data-refresh's two push steps (3 lines each), so observer
   commits can never fail the bot's run.
10. **Phase 0 exit rule (pending):** recommend **accepting "every Phase 0
    signal arrived at least once and verified"**, with the observer's first
    run as the check. "Non-null 3 days" can't pass at 0–3 searches/day.

Decided by Amool (2026-11-26), no longer open:

- **Full-site instrumentation is core Phase 1** (WS-D, §1a). It's the only
  Phase 1 deploy, and Amool approves it.
- **AdSense is parked.** There's no thin-page workstream: S13 is a signal
  only, and no separate issues are opened.

---

## 6. Build plan: 5 parallel workstreams (subagents, one worktree each)

Interfaces are fixed **in this doc**:

- the snapshot fields in §1;
- the WS-D event schema in §1a;
- `signals.yml` in §3;
- the function signatures below.

So workstreams start in parallel against fixtures. **B0 lands first**
(small), because the observer workstreams need the test wiring. WS-D works
inside `src/` with the existing test config and doesn't wait for B0.

| WS | Owns (exclusive) | Tests (offline, TDD) | Depends on |
|---|---|---|---|
| **B0: scaffolding** (≈1 h, merge first) | `vitest.config.ts` (include + coverage for `scripts/growth/**`), `package.json`/lock (`js-yaml`, `tsx` devDeps via `npm install`), `scripts/growth/lib/snapshotSchema.mjs` (zod schema of §1, incl. the status enum) | schema accepts a full fixture and rejects missing `status` | — |
| **A1: external analytics** | `scripts/growth/sources/{posthog,posthogQueries,gsc,gscAuth,bing}.mjs`, `scripts/growth/lib/{aiReferrers,parsePosthog,parseGsc,parseBing,f2f3,engagement}.mjs` (S12 funnel + engaged-visit queries over WS-D's schema), fixtures `scripts/growth/__tests__/fixtures/{posthog,gsc,bing}/` | parsers vs recorded responses; page types via WS-D's `classifyPath` (imported, not re-implemented); S12 funnel/engaged-visit from fixture rows; F2/F3 derivation drops query strings; **`$ip`/`message`/`SELECT *` deny-list test**; JWT assertion built with `node:crypto` (no Google SDK); F4 stratified sampler is deterministic per date | B0; WS-D's `pageType.ts` (lands in D's first PR, before the deploy) |
| **A2: self signals** | `scripts/growth/sources/{coverage,feedHealth,crux,psi,fly,pageManifest}.mjs` (`pageManifest` is `.ts`, run by `tsx`), `scripts/growth/lib/{probeSelection,parseCrux,parsePsi,parseFly,thinPages}.mjs`, fixtures `…/fixtures/{crux,psi,fly,analysis}/` | probe rotation covers all active systems in 7 days and re-queues failures; CrUX 404 / missing INP → `insufficient-field-data`; PSI median-of-3; Fly PromQL result parsing; S13 join incl. unprobed pages counted as unknown, not 0 | B0 |
| **B: triggers** | `docs/growth-agent/signals.yml`, `scripts/growth/lib/{loadSignalsConfig,evaluateTriggers,planIssueActions,needsDataLinks}.mjs` | every rule kind; `null` vs `0`; min-volume/min-history; consecutive across gaps; every signal ID in `signals.yml` exists in SIGNALS.md; dedupe: create / comment-on-change / 7-day heartbeat / cleared / re-fire after close; `Signals:` line parsing | B0 |
| **C: orchestration & delivery** | `scripts/growth/collectMetrics.mjs` (CLI: `--date`, `--dry-run`, `--no-issues`, `--backfill-from`), `scripts/growth/lib/{history,renderWeeklyReport,baselineStats}.mjs`, `scripts/growth/github.mjs` (thin `gh` wiring), `.github/workflows/growth-observer.yml`, data-refresh retry (if decision 9), docs: SIGNALS.md (S11 N/A, S8 note, S12/S13 rows), PLAN.md status/§5, this file's Verification section | orchestrator with stub sources: one source throwing → snapshot still written with `status:error`, exit code 1; history loader skips malformed files with a warning; report renders `notEvaluated` reasons, the clean-day streak, and the **S12 funnel (traffic source → page type → action)** | B0; wires A1/A2/B at integration |
| **D: instrumentation (the deploy)** | `src/lib/analytics/{pageType,events}.ts` (+ tests in `src/lib/__tests__/`), `src/lib/analytics/browser.ts`, `src/proxy.ts`, `src/components/{LandingEventsWidget,FaqSection}.tsx`, the landing pages under `src/app/{storytimes,library}/**`, link slots on the home/status/privacy pages as needed, the privacy page copy, a Production verification section in this file | `classifyPath` for every route + `other`; each builder's output against a key allowlist (**deny-list privacy test**: no `$ip`, query, message or URL values); proxy capture body has an empty `$ip`; Playwright smoke with PostHog intercepted (as in Phase 0, masking `navigator.webdriver`) showing a `page_type` on pageviews and one event per click | none (starts immediately); **deploy gated on Amool's approval** |

**Shared rule:** no workstream edits another's files. A cross-cutting need
goes to the owning WS as a message, or lands after integration.

### Integration order

1. **B0** merges. A1, A2, B and C rebase onto it.
2. **A1's PostHog reader first** (it unblocks the Phase 0 exit check): a
   one-off `node scripts/growth/sources/posthog.mjs --phase0-check` prints
   per-signal first-seen dates, and the result goes into `phase0-impact.md`.
3. **WS-D:**
   1. The first PR ships `pageType.ts` (pure, no runtime effect) so A1 can
      import it.
   2. The full PR goes through `code-reviewer` and a local production-build
      smoke.
   3. **Amool approves the deploy**, then `fly deploy`.
   4. Production verification, recorded here.
   S12 days count from that date.
4. A1, A2 and B merge in any order (disjoint files, fixture-tested).
5. **C** merges last and wires the real sources. Then:
   1. a local `--dry-run` with `.env.local`;
   2. `workflow_dispatch` with `no_issues=true` and `backfill_from=2026-10-30`
      (F1 history), then inspect the JSON;
   3. one dispatch with issues enabled;
   4. the cron goes on.
6. `code-reviewer` on each WS PR (security focus on A1 for tokens and PII, and on D for PII in events);
   0 CRITICAL/HIGH before merge.

### Exit criteria (PLAN §4) and how each is measured

| Criterion | Measurement |
|---|---|
| **14 days of clean collection** | 14 consecutive daily snapshots where every source's `status` is in the expected set (`ok`, `zero-rows`, `insufficient-field-data`, `insufficient-volume`, `not-due`, `not-applicable`, plus `not-configured` only for sources Amool chose not to configure) and none is `error`. The weekly report prints the "clean-day streak N/14", computed by `baselineStats.mjs` from the files. Earliest: ~14 days after the cron is enabled. For S12, the 14 days count from WS-D's deploy. |
| **Thresholds revised against the baseline** | A PR moving each `signals.yml` entry from `status: draft` to `baselined` (or `disabled`, with a reason). Each entry's `note` cites the 14-day p50/p95 that the weekly report prints per metric. A test fails the PR while any entry is still `draft` once the file sets `phase1Exit: true`. |
| **False-positive rate acceptable to Amool** | FP rate = `false-positive` / (`false-positive` + `signal-valid`) over `signal` issues closed during the window, printed in the weekly report. Amool states the bar. Suggested: ≤ 1 in 4, with ≥ 4 judged issues. Fewer than 4 judged issues = "not enough evidence", not a pass. |

---

## 7. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Observer commits make data-refresh's bare `git push` fail | medium | disjoint paths, time separation, rebase-retry in both workflows (decision 9) |
| R2 | PII in a public repo (`$ip`, feedback text, query strings) | low with controls, high impact | explicit HogQL columns + deny-list test; no query strings stored; reviewer pass on A1 |
| R3 | S5 probe traffic gets a vendor WAF to block the production IP (BiblioCommons history) | medium | demand-weighted + weekly rotation instead of all 927 daily; concurrency 2; jitter; a source-level circuit breaker after 5 consecutive 403s |
| R4 | Low volume makes most triggers meaningless during the baseline | certain | `minVolume` guards with explicit `insufficient-volume`; the volume is in S1/S12/F1, which is where the evaluation focuses |
| R5 | Holiday-season baseline sets thresholds wrong | medium | F1 backfill for pre-holiday comparison; re-review in January (assumption 12) |
| R6 | Alert fatigue: daily issue noise makes Amool ignore issues | medium | one issue per signal ID, comments only on change or a 7-day heartbeat, no auto-reopen |
| R7 | Undocumented API behavior (CrUX 404, URL Inspection shape, PSI/Fly/Bing quotas) | medium | marked "to verify"; raw-ish storage until verified; `error` status keeps failures visible |
| R8 | Ad blockers undercount PostHog signals (known Phase 0 gap) | certain | every client-side count is a lower bound and labelled so; F6/F1 are unaffected |
| R9 | WS-D's deploy slips or regresses the site (it's the only Phase 1 runtime change) | low–medium | small handlers, posthog-js stays lazy, Playwright smoke before deploy, S6/S7 checked the next Monday; until the deploy, S12 reads `not-configured`, never 0 |
| R10 | Scope creep into fixing (thin pages, SFPL follow-ups) | medium | Phase 1 measures only (AdSense parked; S13 is a signal only); fixes route via `needs-data` issues with the evidence section |
| R11 | Instrumentation leaks PII through an event property | low, high impact | enum/id-only builders, key-allowlist test, empty `$ip` from the proxy, reviewer pass |
