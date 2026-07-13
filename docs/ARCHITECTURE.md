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
 ┌─────────────────────────┐   feed registry (feedRegistry.json,
 │ Composite EventProvider │◄── provenance per entry)
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
| `../feedRegistry.json` | humans AND scripts (one store) | system → feed entry with `source: "verified" \| "discovered"`; scripts may only mutate discovered entries |
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
| `custom/flpProvider` | Free Library of Philadelphia | Cloudflare-exempt RSS (`rss/eventsrss.cfm?age=`) | which age feed it appeared in (stacked + merged) | " - Branch" title suffix |
| `snapshot/` | bot-walled SSR (NYPL) | cron-scraped JSON snapshot | audience column ("Infant (0-18 months)") | location column; Schwarzman → `-002` |
| `mockEventProvider` | — | deterministic (FNV-1a hash) | — | **tests only, never runtime** |

Shared machinery: `nameMatch.ts` (ONE branch-name matcher for all adapters, folding diacritics and okina so "Hawaiʻi" ≡ "Hawaii"), `classify.ts` (audience/type mapping — numeric age ranges
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

## Caching layers & deployment, revisited (mylibrary-events.com)

Three cache layers now sit between a visitor and a library's calendar
server — this section supersedes the earlier serverless caveats:

| Layer | Where | TTL | Survives |
|---|---|---|---|
| **Edge** — Cloudflare in front of `mylibrary-events.com` (orange-cloud proxy) | CDN POPs worldwide | `/api/events`: 15 min via `s-maxage=900` + SWR; `/api/location`: 24 h | everything — even app downtime, within SWR |
| **Memory** — per-process promise cache | Node process | 15 min | until restart |
| **Disk** — `.cache/feeds/` (`FEED_CACHE_DIR`) | instance filesystem | fresh ≤ 15 min for cold starts; **any age** as fallback when a vendor fetch fails | restarts; vendor outages |

**"What if the server dies?"** Nothing is lost — events were never *our*
data. A restarted server serves the fresh disk copy without refetching;
if a vendor feed is down, the last-known-good disk copy is served with a
logged warning (stale storytimes beat an empty page). During the outage
window Cloudflare keeps serving edge-cached responses anyway.

**Why not a once-daily sync?** Deliberately rejected for feeds we can
reach: (a) libraries cancel/add events same-day — a daily copy shows
kids' events that were cancelled at breakfast; (b) it turns stateless
pull-through into a stateful pipeline (store, backfill, monitor) for no
gain; (c) vendor load is already bounded by the three cache layers. The
one place daily sync is *forced* on us is bot-walled sites (NYPL
snapshot), and that's exactly the cron in `data-refresh.yml`.

**Why not AWS?** AWS is fine — the earlier ranking was about cost/effort
shape, not vendor. On AWS specifically:
- **Lightsail** ($5/mo container or $3.50 nano instance) *is* AWS and is
  the best AWS fit — always-on Node, disks work, zero surprise billing.
- **App Runner / ECS Fargate** work but idle at ~$9+/mo for the smallest
  always-on task — more than the app needs.
- **Lambda + API Gateway** is now *viable* (Cloudflare edge absorbs most
  traffic; `FEED_CACHE_DIR=/tmp` gives warm instances the disk layer),
  but each cold instance still re-reads 6 MB of datasets, and per-instance
  caches multiply vendor fetches. Choose it only if Lambda is already
  your operational home.

**DNS setup (domain on Cloudflare).** Point `mylibrary-events.com` at the
host (CNAME to the Fly/Render/Lightsail endpoint), enable the proxy
(orange cloud) so `s-maxage` takes effect at the edge, set SSL mode
"Full (strict)", and add a cache rule "Cache Eligible: /api/*" if the
zone's default ignores query-string URLs. No code changes needed — the
API already emits the right `Cache-Control` headers.
