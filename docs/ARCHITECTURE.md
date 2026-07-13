# Architecture

How Library Storytime turns "a zip code" into "live storytimes near you,"
and how coverage of US library calendars is measured and grown.

## The core data flow

```
 query ("94609" / "Portland, OR")
   │
   ▼
 ┌─────────────────────────┐   GeoNames zips.json (40,979 zips)
 │ Location matching       │◄── zip → lat/lng/city/state
 │ src/lib/locate.ts       │◄── city-centroid index (derived from zips)
 └───────────┬─────────────┘
             │ haversine ranking (src/lib/geo.ts)
             ▼
 ┌─────────────────────────┐   IMLS libraries.json (16,883 outlets)
 │ Library set             │◄── home = nearest in matched city+state
 │ (home + 5 nearest)      │    nearby = top 5 by distance
 └───────────┬─────────────┘
             │ libraryIds, date range
             ▼
 ┌─────────────────────────┐   feed registry (staticFeeds.json +
 │ Composite EventProvider │◄── generated/discoveredFeeds.json)
 │ src/lib/events/index.ts │    routes each system to its vendor adapter
 └───────────┬─────────────┘
             ▼
   vendor adapters (one per platform, all behind the
   EventProvider interface — see below)
             │
             ▼
 ┌─────────────────────────┐
 │ filterEvents.ts (pure)  │  age group ∧ event type ∧ library
 └───────────┬─────────────┘  (same function on server and client)
             ▼
   UI: StorytimeFinder → LibraryResults / EventFilterBar / EventList
```

Layering rule: `src/lib/` is framework-free TypeScript (fully unit-tested,
no jsdom). API routes (`src/app/api/`) and React components are thin layers
over it. Route handlers validate input with zod and return a
`{ success, data, error }` envelope (`apiResponse.ts`).

## Datasets (generated, committed)

`src/lib/data/generated/` — produced by `scripts/`, validated with zod at
import time (the trust boundary is the *import script*, not the runtime
loader):

| File | Source | Contents |
|---|---|---|
| `libraries.json` | IMLS Public Libraries Survey FY2022 outlet file | every US central (CE) / branch (BR) outlet: name, system, address, city/state/zip, coordinates |
| `zips.json` | GeoNames US postal dataset | zip → lat/lng/city/state |
| `domains.json` | web search (`findDomains.mjs`) | system → official website. **IMLS publishes no URLs** — this closes the biggest discovery gap |
| `discoveredFeeds.json` | discovery/activation scripts | system → feed entry (merged under `staticFeeds.json`, static wins) |
| `platformDetection.json` | `detectPlatforms.mjs` | per-system platform fingerprints + resolution (activated / adapter-needed / needs-scraper / …) |
| `coverageStats.json` | `coverageHarness.mjs` | totals, pipeline branches, per-state and zip analysis (consumed by `/status`) |

IMLS vocabulary: a **system** is the administrative entity (FSCSKEY, e.g.
`CA0081` = Oakland Public Library); an **outlet** is a physical building
(`CA0081-015` = Rockridge Branch). Feeds exist per system; sequence `-002`
is by convention the central outlet — several adapters map campus names
like "Central Library" onto it.

## The events problem, and the adapter model

**There is no universal API for US library event calendars.** Each system
buys a vendor platform or builds its own. Everything hangs off one
interface:

```ts
interface EventProvider {
  getEvents(libraryIds: string[], range: DateRange): Promise<StorytimeEvent[]>;
}
```

| Adapter | Platform | Source format | Age data | Branch attribution |
|---|---|---|---|---|
| `bibliocommons/` | BiblioCommons | events RSS (`/events/rss/all`) | audience tags ("Toddlers", "Birth to 5") | item location zip, then name |
| `libcal/rssProvider` | LibCal (Springshare) | `rss.php?m=month&cid=N` | `libcal:audience` ("Children Ages 0-5" → numeric range mapping) | `libcal:campus`; "Central/Main" → `-002` outlet |
| `libcal/provider` | generic iCal | RFC 5545 ICS | inferred from title text | LOCATION field |
| `communico/` | Communico | unauthenticated `eeventcaldata` JSON | structured `ages` field | `location` field |
| `custom/bklynProvider` | Brooklyn PL (Drupal+Solr) | custom search JSON | `ss_event_age` taxonomy | `ss_event_location` |
| `snapshot/` | bot-walled SSR (NYPL) | cron-scraped JSON snapshot | audience column ("Infant (0-18 months)") | location column; Schwarzman → `-002` |
| `mockEventProvider` | — | deterministic (FNV-1a hash) | — | **tests only, never runtime** |

Shared machinery: `classify.ts` (audience/type mapping — numeric age ranges
beat keywords; adult/teen-only events are dropped app-wide), `feedCache.ts`
(promise-level TTL cache — caching the *promise* rather than the value
prevents concurrent branch requests from stampeding one feed).

Hard-won adapter lessons (encoded in code + tests):

- LibCal's `ical_subscribe.php` is capped at 500 events *from the past* — a
  busy system's ICS is 100% stale. Always use the RSS month feed.
- LibCal has no cancelled flag; staff prefix titles with "CANCELLED".
- Vendor age labels are authoritative; text inference is the fallback.
- BiblioCommons WAF-blocks unthrottled probing (403s for hours).

## Coverage: the decision-tree model

Coverage is *measured*, not asserted. Every one of the ~9,200 systems sits
on exactly one branch of a pipeline decision tree; every branch is a debug
point naming the human or engineering action that unblocks it
(`stageForSystem()` in `scripts/coverageHarness.mjs`, rendered in the
report and on `/status`):

```
system
├─ registry says active ────────────────────────► serving
├─ platform detected, adapter exists, feed bad ─► calendar-id-needed / feed-empty /
│                                                 feed-unverified / identity-collision
├─ platform detected, no adapter built ─────────► adapter-needed:<vendor>
├─ domain read, no vendor fingerprint ──────────► no-platform-found → needs-scraper
│                                                 (after manual DevTools adjudication)
├─ domain known but site down ──────────────────► site-unreachable
├─ probed by slug-guessing only, no domain ─────► domain-unknown-probed
└─ never examined at all ───────────────────────► never-probed  (honest unknown —
                                                  no claim about what they use)
```

Growth loop (each step is a script, each output is committed):

```
findDomains (web search) → detectPlatforms (fingerprint real sites)
     → activate{Libcal,Communico}Feeds (verify + promote)
     → verifyDiscoveredFeeds (purge false positives)
     → coverageHarness (reclassify everything, emit report + stats)
```

Verification discipline, learned the hard way: slug guessing produced
academic false positives (Trinity County ≠ Trinity University) and
same-name cross-state collisions (Houston TX ≠ Houston County GA) — so
activation requires either own-domain provenance or a majority-word title
match plus an academic-marker filter, and any instance claimed by two
systems is demoted rather than trusted.

For custom metro platforms, the repeatable playbook: open the events page
in Chrome DevTools → filter network to xhr/fetch → replicate the data call
with curl → ship an adapter (JSON API), a registry entry (known vendor on
an odd subdomain — LA County's `visit.*` Communico), or an honest
`needs-scraper` verdict with evidence (NYPL/Queens/Philadelphia are
bot-walled SSR).

## Zip analysis

`coverageHarness.mjs` computes the nearest library for **all 40,979 zips**
on every run using a 1° grid spatial index (~230 ms, 0 failures) — median
distance to the nearest library is 2.1 mi (p90: 10 mi). The same harness
reports what fraction of zips have an active-feed library as their nearest.

## Status page (`/status`)

Server-rendered, `force-dynamic`: stat tiles, the Albers-projected US dot
map (16k library dots drawn directly — green active / amber detected /
gray none, CVD-validated palette, AK/HI counted in tables), the pipeline
decision tree, vendor and state tables. Zip stats come from the committed
`coverageStats.json`; library stats are computed live from the registry.

## Runtime & operations

**Serving model.** This is a *dynamic* site, not a static export: `/api/*`
routes and `/status` (`force-dynamic`) execute per request, and event
freshness comes from pull-through fetching. It needs a long-lived Node.js
server (or containers) — plain static hosting won't work, and pure
edge/lambda runtimes are awkward because the app reads its datasets from
the filesystem and relies on **in-process memory caches**.

**Rendering.** React Server Components render everything on the server;
the only client components are the interactive islands (search/filter
state, the zoomable coverage map, ad slots). The map is precomputed
server-side and hydrated from serialized props, so server and client
render identically.

**Data store.** There is deliberately **no database**. Three layers:

| Layer | Store | Freshness |
|---|---|---|
| Seed data (IMLS libraries, GeoNames zips) | committed JSON in `src/lib/data/generated/`, loaded via `fs` and cached in process memory | IMLS: annual release; zips: quarterly is plenty (`npm run data:import`) |
| Feed registry + domains + detection + snapshots | committed JSON, same loading | weekly cron (see below) |
| **Events** | *never stored* — pulled live from vendor feeds per request, cached in memory 15 min per feed URL | real-time within the cache TTL |

**How events sync: dynamic pull-through, not a cron.** When a request
needs events for Oakland, the composite provider fetches Oakland's feed
*at that moment* (or serves the ≤15-min-old in-memory copy). There is no
events database to keep in sync and nothing to backfill. The one
exception is bot-walled sites (NYPL): a **daily cron** runs a headless
browser (`scripts/scrapeNyplSnapshot.mjs`) and commits a JSON snapshot
the `snapshot` adapter serves from disk.

**Recurring updates.** `.github/workflows/data-refresh.yml`:
daily → NYPL snapshot; weekly → findDomains → detectPlatforms →
activate (LibCal + Communico) → verify → coverage harness + report; both
jobs commit to `main`, so every deploy ships current registry data.

**Where to deploy cheapest.** Requirements: one small always-on Node
process, filesystem reads, outbound HTTP, ~256–512 MB RAM. Ranked:

1. **Fly.io / Railway / Render single small instance (~$0–5/mo)** — the
   recommended fit. One machine keeps the in-memory feed cache warm, so
   a popular system's feed is fetched once per 15 min *total*, not once
   per lambda instance. Fly's shared-cpu-1x or Render's free tier
   suffices at this traffic level.
2. **A $4–6/mo VPS (Hetzner/Lightsail) + `next start` under systemd** —
   cheapest at steady state, most ops effort.
3. **Vercel Hobby (free)** — works (datasets deploy with
   `outputFileTracingIncludes`), but every cold lambda re-reads the 6 MB
   datasets and has its *own* feed cache, multiplying vendor fetches; fine
   as a free demo, not the best citizen toward library feeds.
   Cloudflare Workers is a poor fit (no fs, no long-lived memory).

**Monetization.** `AdSlot` (client component) renders Google AdSense
responsive units when `NEXT_PUBLIC_ADSENSE_CLIENT` is set; without it,
production renders nothing and dev shows a placeholder. Placement: one
unit under the library results. Compliance note: caregivers are the
audience but the content is child-adjacent — keep AdSense's
child-directed treatment enabled and non-personalized ads on (COPPA).
At hobby traffic, expect ads to roughly offset a $5/mo host, not more.
