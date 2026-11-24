# Growth Agent — Signals Catalog

The single list of everything the growth agent observes. Each signal has a
stable ID so triggers, proposals, ledger entries, and issues can reference it
(`signal:F2`). Companion to [PLAN.md](./PLAN.md).

## The three rings (+ meta)

| Ring | Question it answers | Bias it corrects |
|---|---|---|
| **S — Self** | How is the site itself behaving? | — (the default view) |
| **F — Frontier** | Where does the world touch us (search, AI engines, referrers)? | We only see people who arrived |
| **W — World** | What is happening out there *without* us? | Survivorship: demand we never captured is invisible in our own data |
| **M — Meta** | Is our model of the world wrong? | Unknown unknowns: surprises nobody thought to scout for |

## Status legend

- `available` — data exists today, just needs collecting
- `needs-setup` — requires instrumentation, an account, or a secret (Phase 0)
- `needs-build` — requires an agent/script that doesn't exist yet
- `paid` — needs a paid API; deferred until value is proven
- `blind-spot` — cannot be observed automatically; documented so absence of data is never read as absence of signal

Triggers below are **drafts**. They become real thresholds in `signals.yml`
(Phase 1) after a ≥14-day baseline; until then treat every number as a guess.

---

## S — Self

| ID | Signal & description | Metric(s) | Source | Cadence | Draft trigger | Status · Phase |
|---|---|---|---|---|---|---|
| S1 | **Traffic volume** — are people using the site, and which page types carry it (home, city, library, state, status). | Visits, pageviews, unique visitors per page group | PostHog `$pageview` (cookieless, `history_change`) | daily | Visits WoW −25% beyond seasonal baseline (see M1) | needs-setup · 0 |
| S2 | **Search usage** — how people search; ambiguous-city rate shows where location UX hurts. | Searches/day, zip-vs-city split, `ambiguous` rate, 404 rate | PostHog `search_performed` {query_kind, outcome, home_system} — client-side (CF caches `/api/location` 24h, so a server counter only sees misses) | daily | Ambiguous+404 > 15% of searches | built · 0 (deploy pending) |
| S3 | **Search miss** — users landing on a home system with no feed. The highest-value coverage signal: real demand naming the exact library to add. | Misses per FSCSKEY (from `libraryIdsWithoutFeed`) | PostHog `search_results.systems_without_feed` — client-side, once per search | daily | ≥20 misses / 14d on one system → `/add-library` candidate | built · 0 (deploy pending) |
| S4 | **Zero-event result** — feed is active but returns 0 kid events in the window. Either broken feed or a truly quiet library; both matter. | Searches with active feed and 0 events, per FSCSKEY | PostHog `search_results.zero_event_systems` — client-side, once per search | daily | Same system 0-events ≥3 consecutive days | built · 0 (deploy pending) |
| S5 | **Feed health** — per active system, is the vendor feed reachable and producing a normal volume. | `feedReachable`, event count vs trailing 4-wk median | `/api/libraries/<id>/analysis`, coverage harness | daily | Count −70% vs median, or unreachable 2 consecutive days | available · 1 |
| S6 | **Field Core Web Vitals** — real-user speed; a Google ranking input. | LCP, INP, CLS at p75, mobile & desktop | CrUX API (needs traffic threshold); analytics RUM if vendor supports | weekly | LCP p75 > 2.5s or INP p75 > 200ms | needs-setup · 1 |
| S7 | **Lab performance** — regression catcher before field data notices. | Lighthouse perf/SEO/a11y scores on 5 representative URLs | Lighthouse CI in GitHub Actions | weekly + per deploy | Any score −10 vs last run | needs-build · 1 |
| S8 | **Server health** — errors and slow vendor fetches degrade UX and crawl budget. | 5xx rate, p95 latency of `/api/events`, cold-fetch time | Fly.io metrics (Prometheus endpoint) | daily | 5xx > 1% or p95 > 8s | available · 1 |
| S9 | **Engagement** — did the visit succeed? Outbound click to a library event is the "job done" moment. | Outbound event clicks / search, filter usage, return-visitor rate | PostHog `outbound_click` (library website link), `filter_changed` | daily | Clicks/search −30% WoW | needs-setup · 0 |
| S10 | **Coverage reach** — supply side of the product. | ZIP reach %, active systems, decision-tree branch counts | `generated/coverageStats.json` (existing harness) | weekly | Reach drops, or a branch grows >10% | available · 1 |
| S11 | **Revenue** — AdSense health; sustainability of the site. | RPM, ad impressions, policy warnings | AdSense Management API | weekly | RPM −30% or any policy notice | needs-setup · 1 |

## F — Frontier

| ID | Signal & description | Metric(s) | Source | Cadence | Draft trigger | Status · Phase |
|---|---|---|---|---|---|---|
| F1 | **Search performance** — how Google sees and serves us. | Impressions, clicks, CTR, avg position by page and query | Google Search Console API (2–3 day lag) | daily | Clicks WoW −25% on a page group | needs-setup · 0 |
| F2 | **Striking-distance queries** — queries where we rank 8–30: cheapest SEO wins. | Queries with position 8–30 and ≥N impressions | GSC API (derived) | weekly | New query enters list with ≥100 impr/wk | needs-setup · 1 |
| F3 | **CTR anomaly** — we rank but nobody clicks: title/snippet/rich-result problem. | Actual CTR vs expected CTR for position | GSC API (derived) | weekly | CTR < 50% of expected at position ≤5 | needs-setup · 1 |
| F4 | **Index coverage** — the 6.6k SEO pages only help if indexed. | Indexed vs submitted (sitemap), crawl errors | GSC API (sitemaps + URL inspection sample) | weekly | Indexed/submitted < 70% | needs-setup · 1 |
| F5 | **Bing performance** — Bing's index feeds Copilot, ChatGPT search, DuckDuckGo: an AEO proxy. | Impressions, clicks, crawl errors | Bing Webmaster Tools API | weekly | Same as F1 | needs-setup · 0 |
| F6 | **AI crawler activity** — are answer engines reading us at all. | Hits by GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, etc. on `llms.txt` + landing pages | `src/proxy.ts` UA match → PostHog `ai_bot_hits` {bot, hits, paths} aggregated per bot per minute (HTML is not CF-cached, origin sees every hit) | weekly | A major bot drops to 0 for 2 weeks | built · 0 (deploy pending) |
| F7 | **AI referrals** — answer engines sending users to us. | Visits referred by chatgpt.com, perplexity.ai, copilot, gemini, claude.ai | Analytics referrers | daily | Trend signal (no threshold) | needs-setup · 0 |
| F8 | **Referrers & links** — who points people at us (Reddit, library sites, parent blogs). | Referring domains, new referrers | Analytics referrers. Backlinks: no GSC API → paid tool | weekly | New referrer with ≥20 visits | needs-setup · 0 (backlinks: paid) |
| F9 | **Answer-engine citation share** — when a parent asks an AI for storytime, are we cited. | % of mystery-shopper probes citing us, per engine | Mystery shopper (PLAN §Roles) | weekly | Citation share −50% vs 4-wk avg | needs-build · 1b |
| F10 | **Direct user feedback** — users telling us what's missing, in their words. | "Didn't find what you needed?" submissions, tagged | `FeedbackBox` on no-location / no-feed / no-events states → PostHog `feedback_submitted` (PII-scrubbed client-side) | continuous | Any submission → triaged weekly | built · 0 (deploy pending) |

## W — World

| ID | Signal & description | Metric(s) | Source | Cadence | Draft trigger | Status · Phase |
|---|---|---|---|---|---|---|
| W1 | **Search demand** — how much demand exists per metro and intent ("storytime near me", "baby events <city>", "free toddler activities <city>"). | Relative interest (Trends) or absolute volume (keyword API) | Google Trends (unofficial, relative only); DataForSEO-class API (paid) | monthly | — (input to W2) | paid / unofficial · 4 |
| W2 | **Share of search** — our impressions ÷ market demand. Reveals metros with demand where we're absent. | F1 impressions / W1 volume per metro | Derived | monthly | High-demand metro in bottom quartile of share | paid · 4 |
| W3 | **Answer landscape** — what a parent actually gets told, and whether it's right. | Answers per probe: recommended sources, correctness vs our event data | Mystery shopper | weekly | Wrong/stale answer pattern in a metro we cover | needs-build · 1b |
| W4 | **Competitor set** — who wins the query when we don't (library sites, Macaroni KID, Mommy Poppins, Patch, Eventbrite, new entrants). Measured, not assumed. | Cited-domain frequency; new domains appearing | Mystery shopper + competitor scout | weekly | New domain cited in ≥10% of probes | needs-build · 1b |
| W5 | **Unmet community asks** — parents asking "storytime in X?" where nobody (or we) answered. | Posts/threads asking for kid events, by city | Reddit API (rate limits + ToS apply), HN, Product Hunt | weekly (scout) | Ask in a city we cover → outreach candidate; uncovered → coverage candidate | needs-build · 2b |
| W6 | **Feature demand** — what people want that we don't do (e.g. teen events — see memory `teen-events-demand`). | Tagged feature asks, frequency | Scout (W5 sources) + F10 | weekly | Same ask ≥3 independent sources / month | needs-build · 2b |
| W7 | **Library vendor shifts** — systems switching platforms (BiblioCommons → Communico), site redesigns. Catch *before* feeds break. | Fingerprint diffs, vendor changelog items | Re-run `detectPlatforms.mjs` diff + supply scout | weekly | Fingerprint changed on an active system | available (diff) · 2b |
| W8 | **New supply** — new IMLS survey release, new event vendors, libraries newly publishing calendars. | New dataset/vendor/library events | Supply scout | quarterly | New IMLS FY published → re-import | needs-build · 2b |
| W9 | **Platform rule changes** — Google core updates, AI crawler policies, Event schema changes, AdSense policy. | Announcements | Google Search Central blog RSS, Search Status Dashboard, AI vendor crawler docs | weekly (scout) | Core update announced → watch F1 closely for 3 weeks | needs-build · 2b |
| W10 | **Seasonality** — summer reading, school breaks, holidays shift demand; act ahead of them. | Calendar of known seasonal peaks, lead time | Static `seasonality.md` calendar + W1 | monthly lookahead | Peak within 8 weeks → prep proposal | needs-build · 2 |
| W11 | **Library-staff intel** — staff know about vendor switches and new programs first. | Messages from library contacts | Manual channel (contact page / newsletter) | continuous | Any message → triaged weekly | needs-build · 4 |

### Known blind spots (W-ring)

Recorded so silence here is never read as "no signal":

- **Facebook parent groups, Nextdoor** — likely the largest venue for these conversations; closed to automated access.
- **Google AI Overviews** — not checkable without scraping Google (ToS). F9/W3 cover API-accessible engines only.
- **Backlinks** — GSC has no links API; only paid tools (Ahrefs-class). F8 covers referrers only.
- **Word of mouth / private messaging** — unobservable; at best inferred from direct-traffic spikes (M1).
- **Ad-blocked visitors** (S-ring) — ad blockers commonly block `us.i.posthog.com`, so every client-side PostHog signal (S1, S2–S4, S9, F7, F8, F10) is a lower bound. Fix if it matters: first-party reverse proxy. F6 is server-side and unaffected.

## M — Meta (observing our model of the world)

| ID | Signal & description | Metric(s) | Source | Cadence | Draft trigger | Status · Phase |
|---|---|---|---|---|---|---|
| M1 | **Forecast surprise** — actual vs a baseline forecast (trailing 4 wk, seasonally adjusted). Large error = something we don't model is acting on us; the strategist must explain it. | z-score of actual vs forecast for S1, F1, F7, F9 | Derived from daily metrics | weekly | \|z\| > 2 | needs-build · 1b (after ≥4 wk data) |
| M2 | **Proposal prediction error** — did shipped changes move their metric as predicted. Calibrates the strategist. | Predicted vs actual delta per proposal | Verifier → `ledger.md` | per proposal | Error > 2× predicted, either direction | needs-build · 3 |
| M3 | **Scout novelty rate** — share of scout findings not already in `known-facts.md`. ~0 → scouts stale (rotate beats/prompts); high → under-invested area. | New findings / total findings, per beat | Scout output | weekly | Beat novelty 0 for 4 weeks | needs-build · 2b |
| M4 | **Gate latency** — how long proposals/plans/PRs wait on the human. The human is part of the loop. | Median hours per gate | GitHub issue/PR timestamps | weekly | Any gate > 7 days median | needs-build · 2 |

---

## Privacy rules for collected signals

- Search signals (S2–S4) are **anonymous events keyed by FSCSKEY** (cookieless, no person profiles), never raw query strings, IPs, or per-user logs.
- Feedback (F10) is free text the user chose to send; stored without IP; PII scrubbed before it reaches any LLM.
- Mystery-shopper and scout prompts never include user data — only synthetic parent questions and public sources.

## Adding a signal

1. Add a row here with the next ID in its ring and an honest status.
2. Name the source and whether it needs a secret (secrets go in GitHub Actions secrets, never the repo).
3. If it has a trigger, add it to `signals.yml` (Phase 1+) — the observer reads thresholds there, not from this file.
4. If it can't be observed, add it to **Known blind spots** instead of omitting it.
