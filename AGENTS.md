<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Library Storytime

Next.js app for finding kids' storytime events at US public libraries. Users enter a city or zip code (nationwide), get matched to a home library plus nearby branches from the real IMLS directory, and browse live event calendars filtered by age group, event type, and library.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (includes type checking)
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run all Vitest tests once (`test:watch`, `test:coverage` also available; 80% thresholds enforced on `src/lib/`)
- Single test file: `npx vitest run src/lib/__tests__/locate.test.ts`
- `npm run data:import` — regenerate both datasets below from their upstream sources

## Architecture

Data flows: **query → location match (real geo data) → library set (real IMLS directory) → event calendar (live vendor feeds) → client-side filters**.

### Real datasets (generated, committed)

`src/lib/data/generated/` holds two JSON files produced by `scripts/`; regenerate with `npm run data:import` (each script also accepts `--source` for a local copy):

- `libraries.json` (~17k records) — from the **IMLS Public Libraries Survey FY2022** outlet file (`scripts/importImlsLibraries.mjs`): every US central/branch library with name, system, address, city/state/zip, coordinates. Validated with zod at import time (the trust boundary is the import script, not the runtime loader).
- `zips.json` (~41k records) — from the **GeoNames US postal dataset** (`scripts/importZipCodes.mjs`): zip → lat/lng/city/state.

IMLS carries no website URLs, so `src/lib/data/systemWebsites.ts` is a hand-maintained overlay keyed by IMLS system key (FSCSKEY, e.g. `CA0081` = Oakland); `data/directory.ts` merges it into `Library.websiteUrl` at load. Loaders in `data/directory.ts` / `data/zipLookup.ts` are server-only (fs reads, cached per process).

### Location matching (`src/lib/locate.ts`)

Zip → `zips.json`; city → a city-centroid index derived from `zips.json`, supporting `"City, ST"`. Bare city names that exist in several states return `status: "ambiguous"` with suggestions ordered by city size (zip count as population proxy — this is why "portland" suggests OR before the tiny Portlands). Home library = nearest library in the matched city+state (falls back to nearest overall); nearby = top 5 by haversine distance (`geo.ts`). Deps are injectable (`LocateDeps`) so tests use fixtures, not the 17k-row dataset.

### Events (`src/lib/events/`)

There is **no universal API for library event calendars** (vendors: BiblioCommons, LibCal, Communico, Evanced). Everything hangs off the `EventProvider` interface (`eventProvider.ts`):

- **Runtime**: `bibliocommons/` — parses BiblioCommons events RSS (`parseFeed.ts`, fast-xml-parser), maps vendor audience labels ("Toddlers", "Birth to 5") to age groups and categories/title keywords to event types (`classify.ts`; adult/teen-only events are dropped), and attributes each event to an IMLS outlet by branch zip, then name (`provider.ts`). One feed covers a whole system; feeds are cached in-memory 15 min **by promise, not value** — caching the resolved value caused a stampede where concurrent branch requests double-fetched. `calendarFeeds.ts` maps FSCSKEY → feed URL (6 verified Bay Area systems; most BiblioCommons libraries expose `/events/rss/all` — add new systems there). Libraries without a feed are reported via `libraryIdsWithoutFeed` in the events API response and get an honest UI notice.
- **Tests only**: `mockEventProvider.ts` — deterministic seeded calendar (FNV-1a hash of library id → weekly slots). Never wired into runtime. Use `>>>` (unsigned shift) when deriving indexes from hashes — signed `>>` on large hashes produces negative array indexes.

`filterEvents.ts` is a pure AND-semantics filter shared by the events API route and the client — single source of truth for what filters mean.

### HTTP + UI layers

- `src/app/api/` — route handlers validate query params with zod and return the `{ success, data, error }` envelope from `src/lib/apiResponse.ts`. Location ambiguity → 400 with suggestions; unknown → 404.
- `src/components/StorytimeFinder.tsx` — client orchestrator holding all page state; `SearchForm`, `LibraryResults` (renders `websiteUrl` links), `EventFilterBar`, `EventList` are presentational.

Tests live in `src/lib/__tests__/` (fixtures under `fixtures/`); `dataIntegrity.test.ts` intentionally reads the real generated datasets to validate the import pipeline's output. `vitest.config.ts` maps the `@/` alias and enforces coverage thresholds; network wiring modules (`events/index.ts`, `calendarFeeds.ts`) are excluded from coverage and verified by exercising the live app instead.

## Coverage tooling

- `npm run data:discover` — probes library systems for BiblioCommons/LibCal feeds (slug guessing + title verification with an academic-instance filter; throttled — an unthrottled run got the IP 403-blocked by BiblioCommons' WAF). Writes `generated/discoveredFeeds.json`.
- `node scripts/verifyDiscoveredFeeds.mjs` — re-verifies every discovered entry against the live page title and purges false positives; run after tightening guards.
- `npm run coverage` — the coverage harness: classifies all ~17k libraries against the feed registry AND computes the nearest library for **every** zip (grid spatial index, ~250 ms). Writes `generated/coverageStats.json` + `reports/coverage-report-<date>.md`.
- `GET /api/libraries/<id>/analysis` — per-library coverage + live feed probe (event counts, type/age distribution, feed reachability — a blocked feed reports `feedReachable: false`, never "0 events").
- `/status` — dashboard: stat tiles, Albers-projected US dot map (`albersProjection.ts`, dots colored by coverage status; AK/HI noted, not mapped), vendor/state tables. Server-rendered, `force-dynamic`.

Feed registry semantics: `active` = URL verified and serving events; `detected` = vendor platform identified but needs manual config (usually a LibCal calendar id). LibCal discovery caveat: LibCal is dominated by universities — any slug match must pass the academic-marker title check or it's a false positive (Trinity County vs Trinity University).

## LibCal activation pipeline

`npm run data:activate` (scripts/activateLibcalFeeds.mjs) promotes detected LibCal systems to active without a browser. The extraction pattern (learned via Chrome DevTools on denverlibrary.libcal.com): homepage → `/calendar/<name>` links → each calendar page embeds its id in an RSS autodiscovery `<link>` (`rss.php?iid=N&cid=N`) and `<body id="calendar_<cid>">`. **Use the RSS month feed (`rss.php?m=month&cid=N`), never `ical_subscribe.php`** — the ICS export is capped at 500 events from the past (a busy system's ICS is 100% stale), while RSS month is upcoming-oriented and carries structured `libcal:audience` ("Children Ages 0-5" → numeric-range age mapping in `classify.ts#ageGroupsFromRange`) and `libcal:campus` (branch attribution; "Central/Main Library" maps to the `-002` outlet per IMLS FSCS convention). LibCal RSS has no cancelled flag — staff prefix titles with "CANCELLED", which the provider filters. Slug collisions (same instance claimed by same-named systems in different states, e.g. Houston TX vs Houston County GA) are auto-demoted to detected — never trust a multi-claimant activation.

## Domain-first discovery + decision-tree coverage

The IMLS dataset has no web addresses — the root cause of low discovery recall. The pipeline is now domain-first:

1. `npm run data:domains` (findDomains.mjs) — web search (DuckDuckGo HTML, throttled) → `generated/domains.json`. 100% hit rate on the top 150 systems.
2. `npm run data:platforms` (detectPlatforms.mjs) — fetches each system's REAL site, fingerprints vendor links (BiblioCommons/LibCal/Communico/Evanced/Assabet/EventKeeper/Localist/LibraryMarket), and activates feeds where an adapter exists. Own-domain links make identity checks unnecessary (provenance beats title matching).
3. `npm run data:communico` (activateCommunicoFeeds.mjs) — probes attend hosts (attend.<domain>, events.<domain>, own domain).

The Communico adapter (`src/lib/events/communico/provider.ts`) uses the unauthenticated `eeventcaldata` JSON endpoint (found via Chrome DevTools network inspection on attend.cuyahogalibrary.org): structured ages, branch names, wall-clock times. Vendor age labels are authoritative even when a title suggests otherwise.

Coverage is reported as a DECISION TREE (per Amool's direction): every system sits on exactly one branch (`serving`, `calendar-id-needed`, `adapter-needed:<vendor>`, `no-platform-found`, `domain-unknown-probed`, `never-probed`, …) and each branch names the human/engineering action that unblocks it — see `stageForSystem()` in coverageHarness.mjs, the report's "Pipeline decision tree" section, and the /status page table. State unknowns as unknowns: never assert what unprobed systems do.

## Metro custom-platform findings (2026-07-12 DevTools sessions)

- **Brooklyn (NY0004)**: custom Drupal+Solr — adapter `src/lib/events/custom/bklynProvider.ts`. API: `discover.bklynlibrary.org/api/search/index.php?event=true&eventdate=MM-DD-YYYY&eventage=A||B&pagination=N` (requires browser UA + Referer; fixed 20/page; `ss_event_age` values: "Birth to Five Years", "Kids", "Teens & Young Adults", "Adults", "Older Adults").
- **LA County (CA0062)**: Communico on `visit.lacountylibrary.org` (not `attend.*`) — config-only, existing adapter. Activation script now probes `visit.<domain>` too.
- **NYPL (NY0778)**: needs-scraper. SSR + Imperva; `drupal.nypl.org` JSON:API is open but stale (2022) + beta test data — NOT the production source.
- **Queens (NY0562)**: needs-scraper. Server-rendered behind F5 WAF ("Request Rejected" on API paths).
- **Philadelphia (PA0385)**: needs-scraper. Cloudflare 403s all non-browser clients; clean URL taxonomy (`/calendar/age/<x>`, `/calendar/event/<id>`) once past CF.

Pattern for future metros: open the events page in Chrome DevTools, filter network to xhr/fetch, replicate the data call with curl, verify shape, then adapter (JSON API) or config (known vendor on odd subdomain) or needs-scraper (bot-walled SSR).

## Development rules (established by Amool, 2026-07-13)

**Before building any feature: analyze its impact on the complete website, discuss assumptions, then edit.**

1. **Impact analysis first.** Map what the feature touches across the whole
   system — data model, UI, API, coverage pipeline, scripts, docs, ops/cron —
   and write it down before changing code.
2. **Surface assumptions for discussion.** Anything assumed (trust levels,
   data freshness, who consumes a field) gets stated explicitly and agreed
   on, not silently embedded in an implementation.
3. **One source of truth per fact.** Features built at different times must
   not diverge in data model. If new data overlaps an existing concept,
   extend the existing model; overrides express trust tiers
   (hand-verified > machine-derived), never parallel stores.

Origin: website links (UI) and searched domains (pipeline) were built days
apart as two disconnected stores of the same fact — the app knew domains it
never showed users. Divergence was a process failure, not a trust necessity.
