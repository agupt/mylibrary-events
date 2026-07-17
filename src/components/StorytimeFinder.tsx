"use client";

import { useCallback, useMemo, useState } from "react";
import { dateRangeForPreset } from "@/lib/datePresets";
import { filterEvents } from "@/lib/filterEvents";
import type { Library, LocationMatch, StorytimeEvent } from "@/lib/types";
import { AdSlot } from "./AdSlot";
import type { ActiveFilters } from "./EventFilterBar";
import { EventFilterBar } from "./EventFilterBar";
import { EventList } from "./EventList";
import { LibraryResults } from "./LibraryResults";
import { SearchForm } from "./SearchForm";

const NO_FILTERS: ActiveFilters = {
  ageGroup: "",
  eventType: "",
  libraryId: "",
  datePreset: "any",
};

/** null = the nearest five; a number = every library within that many miles. */
type Radius = number | null;

const RADIUS_OPTIONS: Array<{ value: Radius; label: string }> = [
  { value: null, label: "Nearest 5" },
  { value: 10, label: "Within 10 mi" },
  { value: 25, label: "Within 25 mi" },
  { value: 50, label: "Within 50 mi" },
];

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success || body.data === null) {
    throw new Error(body.error ?? "Something went wrong. Please try again.");
  }
  return body.data;
}

function RadiusControl({ value, onChange }: { value: Radius; onChange: (r: Radius) => void }) {
  return (
    <label className="relative">
      <span className="sr-only">Search radius</span>
      <select
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        className="appearance-none rounded-lg border border-slate-200 bg-white/90 py-1 pl-2.5 pr-7 text-xs font-medium shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-800/90 dark:focus:border-violet-500"
      >
        {RADIUS_OPTIONS.map((option) => (
          <option key={option.label} value={option.value === null ? "" : option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}

export function StorytimeFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<LocationMatch | null>(null);
  const [events, setEvents] = useState<StorytimeEvent[]>([]);
  const [libraryIdsWithoutFeed, setLibraryIdsWithoutFeed] = useState<string[]>([]);
  const [filters, setFilters] = useState<ActiveFilters>(NO_FILTERS);
  const [radius, setRadius] = useState<Radius>(null);

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const location = await fetchJson<LocationMatch>(
        `/api/location?q=${encodeURIComponent(query)}`,
      );
      // Fetch events for the home library and every returned nearby library
      // (the API caps at 20 ids); the radius control then narrows the view
      // client-side without another round-trip.
      const libraryIds = [
        location.homeLibrary.id,
        ...location.nearbyLibraries.map((entry) => entry.library.id),
      ];
      const calendar = await fetchJson<{
        events: StorytimeEvent[];
        libraryIdsWithoutFeed: string[];
      }>(`/api/events?libraryIds=${libraryIds.join(",")}`);
      setMatch(location);
      setEvents(calendar.events);
      setLibraryIdsWithoutFeed(calendar.libraryIdsWithoutFeed);
      setFilters(NO_FILTERS);
      setRadius(null);
    } catch (caught) {
      setMatch(null);
      setEvents([]);
      setLibraryIdsWithoutFeed([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Nearby libraries within the chosen radius (or the nearest five by default).
  const nearbyInScope = useMemo(() => {
    if (!match) return [];
    if (radius === null) return match.nearbyLibraries.slice(0, 5);
    return match.nearbyLibraries.filter((entry) => entry.distanceMiles <= radius);
  }, [match, radius]);

  const scopeLibraries = useMemo(
    () => (match ? [match.homeLibrary, ...nearbyInScope.map((entry) => entry.library)] : []),
    [match, nearbyInScope],
  );

  const librariesById = useMemo(() => {
    const all: Library[] = match
      ? [match.homeLibrary, ...match.nearbyLibraries.map((entry) => entry.library)]
      : [];
    return new Map(all.map((library) => [library.id, library]));
  }, [match]);

  const scopeIds = useMemo(() => new Set(scopeLibraries.map((l) => l.id)), [scopeLibraries]);

  const visibleEvents = useMemo(() => {
    const inScopeSelected = filters.libraryId && scopeIds.has(filters.libraryId);
    return filterEvents(events, {
      ageGroup: filters.ageGroup || undefined,
      eventType: filters.eventType || undefined,
      libraryIds: inScopeSelected ? [filters.libraryId] : [...scopeIds],
      ...dateRangeForPreset(filters.datePreset),
    });
  }, [events, filters, scopeIds]);

  const missingFeedInScope = libraryIdsWithoutFeed.filter((id) => scopeIds.has(id));

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl">
        <SearchForm isLoading={isLoading} onSearch={handleSearch} />

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {isLoading && !match && (
          <div className="mt-4 space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60"
              />
            ))}
          </div>
        )}
      </div>

      {match && (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <LibraryResults
              homeLibrary={match.homeLibrary}
              matchedCity={match.matchedCity}
              matchedState={match.matchedState}
              nearbyLibraries={nearbyInScope}
              radiusControl={<RadiusControl value={radius} onChange={setRadius} />}
            />
            {/* House / AdSense slot lives here so widening the radius never
                shifts it out of view. */}
            <AdSlot slot="finder-results" />
          </aside>

          <section aria-label="Upcoming events" className="space-y-3">
            <div className="sticky top-0 z-20 -mx-1 space-y-2 rounded-xl border border-slate-200/70 bg-white/85 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
              <div className="flex items-baseline justify-between px-0.5">
                <h3 className="text-base font-bold">Upcoming events</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {visibleEvents.length} shown
                </span>
              </div>
              <EventFilterBar
                libraries={scopeLibraries}
                filters={filters}
                onChange={setFilters}
              />
            </div>
            {missingFeedInScope.length > 0 && (
              <p className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                No public calendar feed is connected yet for:{" "}
                {missingFeedInScope
                  .map((id) => librariesById.get(id)?.name ?? id)
                  .join(", ")}
                . Check their websites for events.
              </p>
            )}
            <EventList events={visibleEvents} librariesById={librariesById} />
          </section>
        </div>
      )}
    </div>
  );
}
