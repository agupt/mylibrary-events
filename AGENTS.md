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
