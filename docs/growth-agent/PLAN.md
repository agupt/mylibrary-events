# Growth Agent — Plan

An always-on loop that monitors mylibrary-events.com, grows its reach
(SEO + AEO), optimizes it, and proposes strategy toward performance and scale
goals. Metrics (or a human) trigger it; Amool approves strategy and plans;
agents execute.

- **Status:** Phase 0 live in production (2026-11-24). Phase 1 observer built and merged (2026-11-27; `scripts/growth/`, `.github/workflows/growth-observer.yml`): local dry run done, live runs not started (see `phase1-impact.md` Verification). Phase 1b+ not built. Nothing below exists yet unless marked.
- **Owner/approver:** Amool.
- **Companion:** [SIGNALS.md](./SIGNALS.md) — every signal ID (`S3`, `F9`, `W4`, `M1`…) referenced here is defined there.
- **Governed by:** AGENTS.md development rules — impact analysis first, assumptions surfaced, one source of truth per fact.

---

## 1. Why this design (read this before changing it)

### The core problem: you can't observe what you don't know

The first draft only watched the site itself (traffic, vitals, errors). That's
survivorship data: a parent who searched "toddler storytime Tulsa" and chose
another site never appears in our analytics. The largest growth opportunities
are invisible by construction. So the agent observes **three rings plus a meta
layer** (detail in SIGNALS.md):

```
        ┌──────────── WORLD (W): the market without us ─────────┐
        │   ┌────── FRONTIER (F): where the world touches us ─┐ │
        │   │   ┌──── SELF (S): the site itself ─────┐        │ │
        │   │   │ traffic, vitals, errors, misses,   │        │ │
        │   │   │ feed health, coverage, revenue     │        │ │
        │   │   └────────────────────────────────────┘        │ │
        │   │ GSC/Bing, AI-bot crawls, AI referrals, citations │ │
        │   └──────────────────────────────────────────────────┘ │
        │ demand, community asks, competitors, vendor shifts,    │
        │ platform rules, seasonality                            │
        └────────────────────────────────────────────────────────┘
  META (M): prediction error — when reality diverges from our forecast,
            something we don't model is acting on us.
```

Unknown unknowns can't be listed ahead of time, only run into. Three
mechanisms do that:
1. **Outward probes** (mystery shopper, scouts) look at the world directly.
2. **Prediction error** (M1, M2) turns "we didn't expect that" into a signal.
3. **Humans** (feedback box F10, library staff W11, Amool's issues) report what no probe covers.

### Design principles

| # | Principle | Why |
|---|---|---|
| P1 | **The observer has no LLM.** Threshold checks are code. | Cheap, deterministic, unit-testable (Vitest). LLM spend only when there's something to reason about. |
| P2 | **The repo is the source of truth.** Metrics are committed as daily JSON, decisions as issues/PRs, learnings in markdown. | Diffable history the strategist can read; matches the existing `coverageStats.json` → `/status` pattern; no parallel store (AGENTS.md rule 3). |
| P3 | **Every proposal predicts a number.** Signal ID, expected delta, measurement window. | Without a prediction there's nothing to verify, so the loop never learns (M2). |
| P4 | **Unknowns are stated as unknowns.** Unprobed areas and blind spots are recorded, never shown as "zero." | Same rule as the coverage decision tree. |
| P5 | **Humans gate; autonomy is earned per category.** | Trust comes from a track record, not from configuration. |
| P6 | **Privacy by aggregation.** Counters keyed by FSCSKEY, no raw queries or IPs; no user data in LLM prompts. | Parents' locations are sensitive; consent flow already exists. |

---

## 2. Roles

| Role | LLM? | Wakes on | Reads | Writes | Signals |
|---|---|---|---|---|---|
| **Observer** | No | Daily cron | Sources in SIGNALS.md, `signals.yml` | `reports/metrics/YYYY-MM-DD.json`; `signal` issues (deduped) | S*, F1–F8, F10, M1, M4 |
| **Mystery shopper** | Yes (via engine APIs) | Weekly cron | Random population-weighted ZIPs, our `/api/events` | `reports/mystery-shopper/YYYY-WW.json` | F9, W3, W4 |
| **Scouts** | Yes | Weekly, rotating beat | Public sources per beat, `known-facts.md` | `scout` issues for *novel* findings only | W5–W9, M3 |
| **Strategist** | Yes | `signal`/`scout`/`agent` issue, or weekly review | Metrics history, `ledger.md`, `known-facts.md`, goals | `proposal` on the issue: hypothesis, signal IDs, predicted delta, cost, window | — |
| **Planner** | Yes | Gate 1 approval | Approved proposal, codebase | Plan comment: impact analysis + assumptions (AGENTS.md format) | — |
| **Doer** | Yes | Gate 2 approval | Approved plan | Branch/worktree, tests (TDD), PR; reuses `/add-library`, `feed-probe`, `code-reviewer`, `tdd-guide` | — |
| **Verifier** | Yes | Proposal's window elapses after merge | Metrics before/after, prediction | `ledger.md` entry; `known-facts.md` updates; closes issue | M2 |

### Three kinds of trigger

1. **Metric trigger:** observer threshold crossed (`signals.yml`).
2. **Surprise trigger:** M1 forecast error |z| > 2, which the strategist must *explain* before proposing.
3. **External trigger:** a scout finding, or a human-filed issue labeled `agent` (Amool, or routed from F10/W11).

### Issue lifecycle (GitHub labels)

```
signal | scout | agent ──► proposal ──[Gate 1: Amool approves strategy]──► approved-strategy
   ──► plan ──[Gate 2: Amool approves plan]──► approved-plan
   ──► PR ──[Gate 3: Amool merges]──► shipped ──► verifying ──► verified | refuted
Rejections: wontfix (reason recorded in ledger.md so it isn't re-proposed)
```

---

## 3. Files (planned)

| Path | Purpose | Written by |
|---|---|---|
| `docs/growth-agent/PLAN.md` | This document | Humans / agents via PR |
| `docs/growth-agent/SIGNALS.md` | Signal catalog (human-readable) | Humans / agents via PR |
| `docs/growth-agent/signals.yml` | Machine-readable thresholds the observer evaluates | Phase 1 |
| `docs/growth-agent/goals.md` | Target metrics + dates (**pending Amool**) | Amool |
| `docs/growth-agent/ledger.md` | Every proposal: prediction, outcome, lesson; rejected ideas + why | Verifier, strategist |
| `docs/growth-agent/known-facts.md` | What we've learned about the world; scouts dedupe against it | Verifier, scouts |
| `docs/growth-agent/seasonality.md` | Known demand peaks + prep lead times (W10) | Phase 2 |
| `scripts/growth/collectMetrics.mjs` | Observer entrypoint (collect → snapshot → triggers → issues; `--dry-run`, `--no-issues`, `--backfill-from`) | Phase 1 (built) |
| `scripts/growth/lib/evaluateTriggers.mjs` | Pure trigger evaluation (unit-tested) | Phase 1 (built) |
| `scripts/growth/github.mjs` | The only module that talks to GitHub (`gh`) | Phase 1 (built) |
| `reports/metrics/`, `reports/growth/`, `reports/mystery-shopper/` | Committed daily snapshots, weekly reports, shopper runs | Observer, shopper |
| `.github/workflows/growth-observer.yml` | Daily observer cron (shopper/scouts later) | Phase 1 (built) |

---

## 4. Sequence

Order is chosen by **dependency first, then information per dollar**. Each
phase has exit criteria; don't start the next until they're met (or the
reason for skipping is written here).

### Phase 0 — Give the agent data to read (instrumentation)

**Why first:** no data, no agent. Search Console / Bing history only builds up after connecting, so every day of delay is baseline lost.

| Step | Deliverable | Signals unlocked | Needs from Amool | Status |
|---|---|---|---|---|
| 0a | Verify GSC (domain property) + Bing Webmaster; service-account API access | F1, F2–F5 | Account access; secrets in GH Actions | **Verified 2026-11-26** (GSC + Bing APIs return 200) |
| 0b | Analytics beacon (vendor decision) with custom events (outbound click, filter use) | S1, S9, F7, F8 | Vendor choice; consent-flow review | **Live 2026-11-24** |
| 0c | Client-side PostHog events after each search (search, miss, zero-event) — not server counters: CF caches the APIs | S2, S3, S4 | — | **Live 2026-11-24** |
| 0d | AI-bot UA counter (`src/proxy.ts`, anonymous PostHog event) | F6 | — | **Live 2026-11-24** (PostHog arrival unconfirmed) |
| 0e | "Didn't find what you needed?" box on no-result / no-feed states | F10 | Copy + privacy note review | **Live 2026-11-24** |

**Exit:** every Phase-0 signal reports a non-null value for 3 consecutive days.
Earliest pass ~2026-11-27 midday PST; **not yet checked** — needs PostHog
query access (project ID unrecorded; personal API key is only a GitHub secret).

### Phase 1 — Observer + baseline (read-only)

**Why now:** thresholds can't be set without a baseline; a read-only report is useful to Amool right away with no risk.

- `collectMetrics.mjs`, `evaluateTriggers.mjs` (pure, TDD), `signals.yml`, daily committed JSON, weekly markdown report (and/or a `/status` tab).
- Wire available signals: S5, S8, S10 (existing harness), S6/S7 (CrUX, Lighthouse CI), S11 (AdSense API).
- Observer opens deduped `signal` issues but **no agent acts on them yet**: Amool reads them to check that triggers are sensible.

**Exit:** 14 days of clean collection; draft thresholds in `signals.yml` revised against the real baseline; false-positive rate judged acceptable by Amool.

### Phase 1b — First look outward (cheapest outer-ring signals)

**Why before the strategist:** the strategist should start with outside data, not only self-metrics. These two cover the most ground for the least cost, and the shopper tells us who the competitors really are, so later scouts aren't guessing.

- **Mystery shopper** (F9, W3, W4): weekly, ~10 population-weighted random ZIPs × parent-style questions × API-accessible answer engines (with web search). Records: cited domains, correctness vs our data, whether we appear.
- **Forecast surprise** (M1): baseline forecast per key signal; needs ≥4 weeks of data, so it switches on partway through this phase.
- Re-run `detectPlatforms.mjs` weekly and diff fingerprints (W7, already possible).

**Exit:** 4 weekly shopper runs committed; named competitor set recorded in `known-facts.md`; M1 producing z-scores.

### Phase 2 — Strategist + Gate 1

- Strategist wakes on `signal`/`agent` issues and a weekly review; writes proposals per P3; must explain any M1 surprise before proposing.
- Create `goals.md` (blocking: proposals are judged against goals), `ledger.md`, `seasonality.md` (W10), gate-latency tracking (M4).

**Exit:** 5 proposals through Gate 1 (approved or rejected with reasons in ledger).

### Phase 2b — Scouts (open-ended outward search)

**Why after the strategist:** scout findings need someone to act on them; otherwise they pile up unread.

- Rotating beats: **conversations** (W5, W6), **competitors** (W4 deepening), **library supply** (W7, W8), **platform rules** (W9), **calendar** (W10).
- Every finding is deduped against `known-facts.md`; only novel findings open `scout` issues. Track novelty per beat (M3).
- Blind spots (Facebook groups, Nextdoor, AI Overviews) stay documented as blind spots, not scouted by ToS-violating means.

**Exit:** each beat run ≥2 times; M3 baseline recorded; ≥1 scout finding reached a proposal.

### Phase 3 — Planner + Doer + Verifier (close the loop)

**Why together:** a doer without a verifier is an open loop, because changes ship and nobody learns whether they worked.

- Planner posts the impact analysis + assumptions (Gate 2). Doer works in a worktree branch, TDD, `code-reviewer`, opens PR (Gate 3).
- Verifier checks after each proposal's window; writes `ledger.md` (M2) and `known-facts.md`.

**Exit:** 3 shipped changes verified (confirmed or refuted, both count).

### Phase 4 — Earned autonomy + deeper world data

- **Autonomy promotion:** a category with ≥5 clean shipped+verified changes (e.g. "registry fix for a broken feed", "add-library for a system with S3 ≥ threshold") may skip Gate 1; later Gate 2. **Gate 3 (prod merge) stays human.** Promotions are recorded here with date + evidence.
- **Paid demand data** (W1, W2 share-of-search): only once the free signals stop finding opportunities. Decide with the ledger as evidence.
- **Library-staff channel** (W11): contact page / newsletter.

### Dependency graph

```
0a GSC/Bing ─┐
0b analytics ┼─► 1 Observer+baseline ─► 1b Shopper + M1 ─► 2 Strategist ─► 2b Scouts
0c counters ─┤                                              │
0d bot UA  ──┤                                              └─► 3 Planner/Doer/Verifier ─► 4 Autonomy + paid data
0e feedback ─┘
```

---

## 5. Decision log

| Date | Decision | Status | Rationale |
|---|---|---|---|
| 2026-11-23 | Observer is deterministic (no LLM) | Agreed in design | P1 |
| 2026-11-23 | Watch three rings + meta, not self-metrics only | Agreed (Amool raised the gap) | §1 |
| 2026-11-23 | Mystery shopper + M1 are the first outward signals | Proposed | Widest coverage per dollar; names competitors |
| 2026-11-23 | Verifier ships with the doer, not later | Proposed | Avoid an open loop |
| 2026-11-23 | Orchestration: **GitHub-native** (Issues/PRs as gates + scheduled Claude Code routines / Actions) vs **Paperclip** | **Pending Amool** | GitHub-native keeps state in repo (P2), no new service; Paperclip offers built-in budgets/governance and is familiar. Phases 0–1 are the same either way, so this can be decided before Phase 2. |
| 2026-11-23 | Analytics vendor: **PostHog Cloud (US)**, cookieless, autocapture off, anonymous events only, server-side events for S2–S4 | **Decided (Amool)** | Usage-based (1M events/mo free, no card). The agent must read via API: Umami Hobby and Plausible below Business have no API, and CF Web Analytics has no custom events (S9). Server-side events keep search counters in the same store (no new datastore). Load after interactive; S7 watches the perf cost. |
| 2026-11-23 | Privacy: cookieless analytics, aggregate counters, feedback stored without IP, PII scrubbed before LLM | **Approved (Amool)** | Plain-language privacy page update ships with Phase 0. |
| 2026-11-24 | S2–S4 move **client-side** (PostHog events after each search) | **Approved (Amool)** | Cloudflare caches `/api/location` (24h) and `/api/events` (15m); server counters would only count cache misses. Supersedes "server-side events for S2–S4" above. |
| 2026-11-24 | Phase 0 built: posthog-js 1.447.4 (prod-only, cookieless, autocapture/replay/flags off, lazy-loaded after `load`+idle), F6 in `src/proxy.ts`, F10 feedback box, privacy page | **Merged** (deployed 2026-11-24, see below) | See `phase0-impact.md`. Requires PostHog project setting "cookieless mode" ON or events are dropped. |
| 2026-11-23 | GSC is a **Domain** property (`sc-domain:mylibrary-events.com`); sitemap shows Success; read-only service account + Bing API key in GH secrets | **Done (Amool)** | Unblocks F1–F5. AdSense API (S11) needs OAuth, not a service account; handle in Phase 1. |
| 2026-11-24 | Phase 0 (f8f1448) **deployed** to Fly.io (release v36, ~12:40 PST) after Amool enabled PostHog cookieless mode | **Live** | Verified on mylibrary-events.com: PostHog 200 on every batch; `$pageview`, `search_performed`, `search_results`, `filter_changed`, `feedback_submitted` arriving (PII scrubbed); no first-party cookies/storage. F6 sends without errors; PostHog arrival unconfirmed. See `phase0-impact.md`. |
| 2026-11-26 | SFPL (CA0114) outage caught by S4 (0 events in prod): SFPL moved to `<time datetime="START/END">` markup. Fixed in 4c6c2f3 + 9100b99 (Fly v38) | **Deployed** | First Phase-0 signal paid off. Live: 115 events / 26 SF branches / 14 days. Parser now logs an error when cards parse without times. |
| 2026-11-26 | `feed_cache` Fly volume (1 GB) was 100% full (ENOSPC): no eviction, date-keyed files. Fixed in fbf892c (Fly v37): eviction (7-day max age, 500 MB cap, swept ≤ every 6 h) + atomic writes | **Deployed** | Found during deploy verification. Disk 100% → 13%. |
| 2026-11-26 | Follow-ups are fixed **only if PostHog data shows the need** (label `needs-data`): #1 SFPL ~7-day coverage (8-page cap), #2 event-type classifier mislabels (e.g. Xiangqi tournament → storytime), #3 SFPL parser hardening (review M3/M4/L1/L3) | **Parked** | Let real usage decide priority instead of guessing. |
| 2026-11-26 | Step 0a verified (GitHub Actions run 45939997301): GSC service account `growth-observer@mylibrary-growth.iam.gserviceaccount.com` is `siteRestrictedUser` (read-only) on `sc-domain:mylibrary-events.com`; searchAnalytics 200 (2026-10-30..11-24: 26 daily rows, 3,116 clicks, 104,705 impressions); sitemap 8,766 submitted, 0 errors, last downloaded 2026-11-18. Bing site verified, query stats 200 with 0 rows | **Done** | F4 should sample the URL Inspection API: sitemap `indexed=0` is likely unpopulated by Google. F5 reads 0 until Bing has traffic — 0 is not a broken signal. |

| 2026-11-26 | Phase 1 plan (`phase1-impact.md`) approved with all its recommendations: snapshots committed on `main` (1), aggregates OK in the public repo (2), no GSC query strings stored (3), weekly report as a file + a comment on a pinned rolling issue (4), no `/status` tab (5), cron 11:23 UTC (6), read-only Fly token for S8 (7), `signal-valid` / `false-positive` judgment labels (8), rebase-retry on data-refresh pushes (9) | **Approved (Amool)** | Decision 7 still needs the token itself; S8 reads `not-configured` until then. Decision 10 (Phase 0 exit rule) is tracked in `phase0-impact.md`. |
| 2026-11-27 | Phase 1 observer built: collectors (A1, A2), triggers (B), instrumentation (D), orchestration + workflow (C) | **Merged**; live runs pending | C's dry run and what the first live dispatch needs: `phase1-impact.md` Verification. |

Phase 0 build notes: `docs/growth-agent/phase0-impact.md` (impact map, assumptions, verification).

## 6. Open questions (blocking where noted)

1. **Goals** (blocks Phase 2): target numbers + dates, e.g. monthly visitors, GSC clicks, ZIP reach %, citation share F9.
2. **Orchestration** (blocks Phase 2): GitHub-native or Paperclip.
3. **Analytics vendor** (blocks 0b).
4. **Monthly LLM/API budget** (blocks 1b): shopper, scouts, strategist, doer runs; a per-run cap is enforced either way.
5. **Paid data appetite** (Phase 4): keyword volume, backlinks.

## 7. For future agents

- Start from the issue's signal IDs → SIGNALS.md → this plan's phase → `ledger.md` (has this been tried or rejected?) → `known-facts.md`.
- Don't add a signal without a SIGNALS.md row; don't add a threshold outside `signals.yml`.
- If something can't be observed, add it to blind spots instead of skipping it.
- Changes to this plan go through a PR Amool reviews; record why in §5.
