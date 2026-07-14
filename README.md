# 📚 Library Storytime

Find storytimes and kids' events at US public libraries. Enter a city or zip
code, get matched to your home library plus nearby branches, and browse live
event calendars filtered by **age group**, **event type**, and **library**.

Built on real data end to end:

- **16,883 library outlets** from the IMLS Public Libraries Survey (every US
  central/branch library, with coordinates)
- **40,979 zip codes** from the GeoNames US postal dataset
- **Live events** aggregated from the calendar platforms libraries actually
  use — BiblioCommons, LibCal (Springshare), Communico, and custom APIs —
  currently ~1,400 branches across ~110 systems (Chicago, Boston, Brooklyn,
  LA County, Miami-Dade, King County, Denver, Cleveland, the Bay Area, …)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together and
[`/status`](http://localhost:3000/status) for live coverage (US map + the
pipeline decision tree).

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
```

Try: `94609` (Oakland), `11238` (Brooklyn), `60614` (Chicago), `Portland, OR`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve |
| `npm test` | Vitest suite (incl. exhaustive all-zip validation) |
| `npm run test:coverage` | Coverage with 80% thresholds on `src/lib/` |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |

### Data & coverage pipeline

| Command | What it does |
|---|---|
| `npm run data:import` | Regenerate the IMLS library directory + GeoNames zip database |
| `npm run data:domains` | Web-search official websites for library systems (IMLS has none) |
| `npm run data:platforms` | Fingerprint each system's event platform from its real website; activate feeds |
| `npm run data:discover` | Slug-guess BiblioCommons/LibCal instances (legacy, lower recall) |
| `npm run data:activate` | Auto-find LibCal calendar ids and activate feeds |
| `npm run data:communico` | Probe/activate Communico attend sites |
| `npm run coverage` | Coverage harness: classify all libraries + nearest-library for **every** zip; writes `reports/coverage-report-<date>.md` |

## API

All responses use a `{ success, data, error }` envelope.

- `GET /api/location?q=<zip | city | "city, ST">` — home library + 5 nearest
  (ambiguous city names return suggestions ranked by city size)
- `GET /api/events?libraryIds=A,B&days=14&ageGroup=toddler&eventType=storytime`
  — live events; `libraryIdsWithoutFeed` reports gaps honestly
- `GET /api/libraries/<id>/analysis` — coverage status + live feed probe
  (event counts, age/type distribution, feed reachability)

## Pages

- `/` — the finder: search → libraries → filterable event list
- `/status` — coverage dashboard: stat tiles, Albers US dot map, the
  pipeline decision tree (every system on one branch with a named next
  action), vendor/state tables

## Deploying (mylibrary-events.com)

The app is a standalone Next.js server (`output: "standalone"`, datasets
traced into the bundle). Recommended host: **Fly.io** (one always-warm
machine keeps the feed cache hot) fronted by **Cloudflare** (the API
emits `s-maxage` so the edge caches events for 15 min).

```bash
fly auth login
fly apps create mylibrary-events       # or: fly launch --copy-config --no-deploy
fly volumes create feed_cache --size 1 --region sjc
fly deploy
fly certs add mylibrary-events.com && fly certs add www.mylibrary-events.com
```

Deployed 2026-07-14 (Fly account amoolgupta@outlook.com, app
`mylibrary-events`, region sjc). Cloudflare setup as executed:

- The domain is on **Cloudflare Registrar** (with iCloud custom-domain
  mail — keep the MX/SPF/DKIM/apple-domain records). The registrar's
  parking page auto-creates a locked apex CNAME; disable it first under
  **Domain Registration → Manage domains → Configuration → Parking page**
  or every apex record add fails with "already exists".
- DNS records: `CNAME @ → mylibrary-events.fly.dev` and `CNAME www → …`
  (grey-cloud until `fly certs check` shows Issued, then orange), plus
  two permanently grey validation records:
  `CNAME _acme-challenge → mylibrary-events.com.<app-id>.flydns.net` and
  `TXT _fly-ownership → app-<app-id>` (required once proxied).
- **Cache Rule (required for edge caching)**: Cloudflare treats JSON/HTML
  as DYNAMIC and ignores `s-maxage` unless opted in. Rule "Cache API
  responses": URI Path **wildcard `/api/*`** (a bare `/api/` matches
  nothing, and "URI Full" never starts with a slash) → Eligible for
  cache, Edge TTL "use cache-control header". Verify with
  `curl -sI …/api/location?q=94110 | grep cf-cache-status` → MISS then HIT.
- Privacy contact: `privacy@mylibrary-events.com` (iCloud mail alias),
  referenced by `/privacy` — the page AdSense review expects.

| Env var | Purpose |
|---|---|
| `FEED_CACHE_DIR` | disk cache location (set in Dockerfile; volume-backed on Fly) |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | `ca-pub-…` — activates ad slots (unset = no ads) |
| `ADSENSE_PUBLISHER_ID` | `pub-…` — serves `/ads.txt` (unset = 404) |

Ads note: audience is caregivers but content is child-adjacent — keep
AdSense child-directed treatment ON and personalized ads OFF (COPPA).
