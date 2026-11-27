# Phase 0 — Impact analysis & assumptions

Written 2026-11-24 before code, per the dev rules in `AGENTS.md`
(impact first, assumptions stated, one source of truth per fact).
Scope: PLAN §4 Phase 0 steps 0b–0e. Step 0a (GSC/Bing) is done by Amool
(API access verified 2026-11-26 — see PLAN §5).

**Status (2026-11-26):** deployed to Fly.io 2026-11-24 (~12:40 PST, release
v36) and verified live on mylibrary-events.com — see "Production
verification" below.

## What ships

| Step | Signal(s) | Where | Mechanism |
|---|---|---|---|
| 0b | S1, F7, F8 | every page | posthog-js `$pageview` (history_change), referrer captured by PostHog |
| 0b | S9 | `LibraryResults`, `StorytimeFinder` | `outbound_click` (library website link), `filter_changed` |
| 0c | S2 | `StorytimeFinder.handleSearch` | `search_performed` {query_kind, outcome, home_system} — **client-side** |
| 0c | S3, S4 | `StorytimeFinder` events effect | `search_results` {home_system, systems_without_feed, zero_event_systems, …} — **client-side**, once per search |
| 0d | F6 | `src/proxy.ts` | known AI-bot UA → per-bot per-minute `ai_bot_hits` {bot, hits, paths} via PostHog capture API, `waitUntil` |
| 0e | F10 | `FeedbackBox` on no-location / no-feed / no-events states | `feedback_submitted` {message (PII-scrubbed, ≤500 chars), context} |

Pure logic lives in `src/lib/analytics/` (unit-tested, 80% gate); wiring
(`browser.ts`, `proxy.ts`, components) is thin.

## Impact map (whole system)

- **Data model:** no new datastore. PostHog is the single store for all
  Phase 0 signals (decision 2026-11-23). FSCSKEY derivation moves from a
  private helper in `locate.ts` to `src/lib/libraryId.ts` so client analytics
  and server matching share one definition.
- **UI:** new `FeedbackBox`; website links gain an onClick tracker (no visual
  change); analytics loader component in root layout renders nothing.
- **API routes:** unchanged. Signals are client-side because Cloudflare caches
  `/api/location` (24h) and `/api/events` (15m) — server counters would only
  see cache misses.
- **Proxy (new):** `src/proxy.ts` runs on page/text routes (not `/_next`,
  `/api`, images). Cost per request: one case-insensitive substring scan of
  the UA. Network only for matched AI bots, off the response path.
- **Build/deploy:** `NEXT_PUBLIC_POSTHOG_TOKEN` as a build arg (Dockerfile
  ARG/ENV + `fly.toml [build.args]`), same pattern as AdSense. Next inlines
  `NEXT_PUBLIC_*` into server bundles too, so the proxy sees it without a
  runtime env var.
- **Performance (S7):** posthog-js is dynamically imported after `load` +
  idle, so it is not in the initial bundle and does not block LCP/INP.
- **Privacy page:** new analytics + feedback sections; children's section no
  longer claims "no forms"; effective date bumped.
- **Coverage pipeline / scripts / cron:** untouched.
- **SEO pages:** untouched except they now emit pageviews.

## Assumptions (flag any you disagree with)

1. **Analytics only in production with a token.** Dev/test send nothing.
2. **Cookieless mode must be enabled in PostHog project settings** —
   posthog-js docs: otherwise cookieless events are *dropped*. **Done:**
   Amool enabled it before the 2026-11-24 deploy.
3. **No raw query text** leaves the browser for S2: only `zip|city`, outcome,
   and the matched home FSCSKEY + state. City strings are not sent.
4. **HTTP status → outcome:** `/api/location` 404 = not-found, 400 =
   ambiguous (the form blocks empty input, so validation 400s are
   effectively only "too long"; accepted noise).
5. **S3/S4 fire once per search**, on the first events load — radius changes
   re-fetch but don't re-count (avoid inflating misses).
6. **S4 per system:** a system in scope with a feed and 0 returned kid events
   in the window. Branch attribution gaps can't cause this (events are keyed
   to some outlet of the system).
7. **Outbound click = library website link.** Events carry no URL today, so
   there's no per-event outbound link yet; S9's "job done" metric is the
   website click until events get links.
8. **AI-bot list is UA-substring based** — canonical list is `AI_BOTS` in
   `src/lib/analytics/aiBots.ts` (OpenAI, Anthropic, Perplexity, Meta,
   Amazon, ByteDance, Common Crawl, DuckDuckGo, Mistral, Cohere, You.com).
   Spoofed UAs count; accepted for a trend signal. Hits are aggregated per
   bot per minute (≤1 outbound capture per bot per window, ≤50 distinct
   paths each) so crawl bursts or spoofing can't burn event quota. Robots-only tokens (Google-Extended,
   Applebot-Extended) are not UAs and can't be counted here.
9. **Feedback** is free text, scrubbed client-side of emails, phone
   numbers (US, 7-digit, international) and long ID-like digit runs before
   sending, capped at 500 chars. Best-effort: names/addresses aren't
   detected, so UI + privacy page say so and ask users not to include them. No IP stored (project "discard IP").
10. **Bot events are anonymous:** `distinct_id = bot:<name>`,
    `$process_person_profile: false`, path without query string.

## Not changed (reported only)

- Cloudflare Browser Cache TTL override: live API responses show
  `max-age=14400` although code sends `max-age=0`. Users may see 4h-stale
  API responses. Fix is a CF dashboard setting ("Respect existing headers").

## Verification (2026-11-24, local production build)

- `npm test` 219 pass; `lint` clean; `build` green. `src/lib/analytics/`
  coverage 100% lines / 96% branches.
- Pre-existing, not from this change: `typecheck` errors in
  `eventsCalendar.test.ts:175`, and global branch coverage 72.5% (< 80%
  gate) on `main` before this branch (73.1% after).
- Proxy (standalone server + fetch spy): GPTBot on `/storytimes/ca?x=1` →
  one capture with `path: /storytimes/ca`; ClaudeBot on `/llms.txt` →
  one; Safari UA and `/api/*` → none. (Run before per-minute aggregation
  was added; aggregation itself is unit-tested and re-smoked below.)
- Browser (Playwright, PostHog requests intercepted locally): posthog chunk
  requested ~40 ms after `load`; zero cookies, localStorage, sessionStorage;
  `$pageview` with `distinct_id: $posthog_cookieless`; `search_performed`
  carries `query_kind/outcome` only (no query text); feedback email/phone
  arrive as `[email]`/`[phone]`; radius change → one `filter_changed`, no
  duplicate `search_results`.
- posthog-js drops events from headless/automated browsers (UA filter,
  `navigator.webdriver`). Desired in production; test harnesses must mask it.

## Production verification (2026-11-24, mylibrary-events.com)

Deployed commit f8f1448 to Fly.io (release v36, ~12:40 PST) after cookieless
mode was enabled in PostHog.

- PostHog token is inlined in the production JS; PostHog returned 200 for
  every batch.
- Arriving: `$pageview`, `search_performed` (query_kind + outcome only,
  never query text), `search_results`, `filter_changed`, and
  `feedback_submitted` (an email and phone number in the message arrived as
  `[email] [phone]`).
- No first-party cookies, localStorage, or sessionStorage. The only cookie is
  Cloudflare's `cf_clearance`.
- F6 `ai_bot_hits`: three GPTBot-UA requests over 2 minutes returned 200 with
  no send failures logged. **Arrival in PostHog not yet confirmed** — PostHog
  can't be queried from the dev machine yet.

**Exit criterion** (PLAN §4: every Phase-0 signal non-null for 3 consecutive
days): earliest possible pass ~2026-11-27 midday PST. **Not yet checked.**
Checking needs PostHog query access — the project ID is still unrecorded and
the personal API key exists only as a GitHub secret.

## First signal caught

S4 fired on its first real search (94110): **CA0114 San Francisco** — feed
active and reachable (HTTP 200) but 0 events over 30 days per
`/api/libraries/CA0114-002/analysis` — a real production outage.

Root cause: SFPL switched its markup to `<time datetime="START/END">`.
**Fixed and deployed 2026-11-26** (commits 4c6c2f3 + 9100b99, Fly v38). Live:
115 events across 26 SF branches over a 14-day search. The parser now logs
an error when cards parse without times, so silent markup drift is visible.

Parked follow-ups (label `needs-data` — fix only if PostHog data shows the
need): #1 SFPL covers only ~7 days (8-page cap), #3 SFPL parser hardening
(review items M3/M4/L1/L3).

## Post-deploy findings

- **Feed-cache volume full (found during deploy verification).**
  The 1 GB `feed_cache` Fly volume was 100% full (ENOSPC): no eviction, and
  cache files are date-keyed so they accumulate. Fixed by fbf892c (Fly v37):
  cleanup plus automatic eviction (7-day max age, 500 MB cap, swept at most
  every 6 h) and atomic cache writes. Disk 100% → 13%.
- **Event-type classifier mislabels** (e.g. a Xiangqi tournament typed as
  storytime) — parked as #2, `needs-data`.

## Code review (code-reviewer agent, 2026-11-24)

0 CRITICAL / 0 HIGH. Fixed before merge: M1 no-events feedback gated on
real absence (not filter-narrowed results); M2 `track()` can't throw; M3
scrub input capped + boundary lookbehinds (100k chars < 200 ms, tested); M4
more redactions + honest privacy/UI wording; M5 per-minute bot aggregation;
L2 per-search feedback-box keys; L6 comment/doc sync. Deferred (LOW):
stale-closure filter updates on same-tick double clicks (L1); a failed first
events fetch is counted as `fetch_failed` even if a radius re-fetch succeeds
(L3); no sequence guard on overlapping searches (L4, pre-existing);
case-sensitive image exclusion in the proxy matcher (L5).

## Known undercount

Ad blockers commonly block `us.i.posthog.com`, so S1/S2–S4/S9/F10 are lower
bounds. A first-party reverse proxy (e.g. `/ingest` → PostHog) would fix it;
not done in Phase 0. F6 is server-side and unaffected.
