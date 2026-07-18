"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_LIBRARIES_PER_REQUEST } from "@/lib/constants";
import { dateRangeForPreset } from "@/lib/datePresets";
import { filterEvents } from "@/lib/filterEvents";
import type { Library, LocationMatch, StorytimeEvent } from "@/lib/types";
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

const DEFAULT_RADIUS = 10;
const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
// Bump when the /api/location response shape changes, to sidestep any
// long-lived edge-cached copies of the old shape. (v2: deep nearby list;
// v3: isHomeSystem flag + whole home-system always in scope.)
const LOCATION_API_VERSION = "3";

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

function DistanceControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (miles: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
      <span className="whitespace-nowrap">Within</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="appearance-none rounded-lg border border-violet-200 bg-violet-50/80 py-1.5 pl-2.5 pr-7 text-xs font-semibold text-violet-700 shadow-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
        >
          {RADIUS_OPTIONS.map((miles) => (
            <option key={miles} value={miles}>
              {miles} miles
            </option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-violet-400">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </span>
    </label>
  );
}

export function StorytimeFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<LocationMatch | null>(null);
  const [events, setEvents] = useState<StorytimeEvent[]>([]);
  const [libraryIdsWithoutFeed, setLibraryIdsWithoutFeed] = useState<string[]>([]);
  const [filters, setFilters] = useState<ActiveFilters>(NO_FILTERS);
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);
  const fetchSeq = useRef(0);

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const location = await fetchJson<LocationMatch>(
        `/api/location?q=${encodeURIComponent(query)}&v=${LOCATION_API_VERSION}`,
      );
      setMatch(location);
      setEvents([]);
      setFilters(NO_FILTERS);
      setRadius(DEFAULT_RADIUS);
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

  // Libraries within the chosen radius, plus home and every branch of home's
  // system (they share one calendar, so they stay in scope regardless of the
  // radius). Bounded by the events API's request cap.
  const scopeLibraries = useMemo(() => {
    if (!match) return [] as Library[];
    const inScope = match.nearbyLibraries
      .filter((entry) => entry.isHomeSystem || entry.distanceMiles <= radius)
      .map((entry) => entry.library);
    return [match.homeLibrary, ...inScope].slice(0, MAX_LIBRARIES_PER_REQUEST);
  }, [match, radius]);

  const nearbyInScope = useMemo(() => {
    if (!match) return [];
    const scopeIds = new Set(scopeLibraries.map((l) => l.id));
    return match.nearbyLibraries.filter((entry) => scopeIds.has(entry.library.id));
  }, [match, scopeLibraries]);

  // Fetch events for every in-scope library whenever the location or radius
  // changes; a sequence guard drops responses from superseded requests.
  useEffect(() => {
    if (!match || scopeLibraries.length === 0) return;
    const ids = scopeLibraries.map((library) => library.id);
    const seq = (fetchSeq.current += 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a location/radius-driven refetch; cleared in finally()
    setIsLoadingEvents(true);
    fetchJson<{ events: StorytimeEvent[]; libraryIdsWithoutFeed: string[] }>(
      `/api/events?libraryIds=${ids.join(",")}`,
    )
      .then((calendar) => {
        if (seq !== fetchSeq.current) return;
        setEvents(calendar.events);
        setLibraryIdsWithoutFeed(calendar.libraryIdsWithoutFeed);
      })
      .catch(() => {
        if (seq !== fetchSeq.current) return;
        setEvents([]);
        setLibraryIdsWithoutFeed([]);
      })
      .finally(() => {
        if (seq === fetchSeq.current) setIsLoadingEvents(false);
      });
  }, [match, scopeLibraries]);

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
          <aside className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <LibraryResults
              homeLibrary={match.homeLibrary}
              matchedCity={match.matchedCity}
              matchedState={match.matchedState}
              nearbyLibraries={nearbyInScope}
              selectedLibraryId={filters.libraryId}
              onSelectLibrary={(id) =>
                setFilters((current) => ({
                  ...current,
                  libraryId: current.libraryId === id ? "" : id,
                }))
              }
            />
          </aside>

          <section aria-label="Upcoming events" className="space-y-3">
            <div className="sticky top-0 z-20 -mx-1 space-y-2 rounded-xl border border-slate-200/70 bg-white/85 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-base font-bold">Upcoming events</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {isLoadingEvents
                      ? "loading…"
                      : `${visibleEvents.length} at ${scopeLibraries.length} ${scopeLibraries.length === 1 ? "library" : "libraries"}`}
                  </span>
                </div>
                <DistanceControl value={radius} onChange={setRadius} />
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
