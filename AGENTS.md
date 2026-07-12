<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Library Storytime

Next.js app for finding kids' storytime events at Bay Area public libraries. Users enter a city or zip code, get matched to a home library plus nearby branches, and browse each library's activity calendar filtered by age group, event type, and library.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (includes type checking)
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run all Vitest tests once
- `npm run test:watch` — watch mode
- `npm run test:coverage` — coverage with 80% thresholds enforced on `src/lib/`
- Single test file: `npx vitest run src/lib/__tests__/locate.test.ts`

## Architecture

Data flows: **query → location match → library set → event calendar → client-side filters**.

- `src/lib/` is the framework-free core (plain TS, fully unit-tested, Node environment — no jsdom needed). API routes and components are thin layers over it.
  - `locate.ts` — resolves a city name or 5-digit zip to a `LocationMatch`: home library (nearest library in the matched city) + nearby libraries sorted by haversine distance (`geo.ts`).
  - `data/` — seed datasets: `libraries.ts` (Bay Area branches) and `zipCoordinates.ts` (zip → centroid + city). These are the only places to touch to expand geographic coverage.
  - `events/eventProvider.ts` — the `EventProvider` interface. There is **no universal API for library event calendars** (vendors: LibCal, Communico, BiblioCommons, Evanced); real integrations should be written as adapters implementing this interface. `mockEventProvider.ts` is the current implementation: a deterministic seeded calendar (FNV-1a hash of library id → weekly recurring slots), so the same library always shows the same schedule. Use `>>>` (unsigned shift) when deriving indexes from hashes — signed `>>` on large hashes produces negative array indexes.
  - `filterEvents.ts` — pure AND-semantics filter shared by the events API route and the client (single source of truth for filtering).
- `src/app/api/` — route handlers validate query params with zod and return the `{ success, data, error }` envelope built by `src/lib/apiResponse.ts`. All responses go through that envelope.
- `src/components/StorytimeFinder.tsx` — client orchestrator holding all page state; `SearchForm`, `LibraryResults`, `EventFilterBar`, `EventList` are presentational. Events are fetched once per library set; filters apply client-side via the shared `filterEvents`.

Tests live in `src/lib/__tests__/` and cover only the core library; `vitest.config.ts` maps the `@/` alias and enforces coverage thresholds.
