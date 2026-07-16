"use client";

import { useCallback, useMemo, useState } from "react";
import { filterEvents } from "@/lib/filterEvents";
import type { LocationMatch, StorytimeEvent } from "@/lib/types";
import { AdSlot } from "./AdSlot";
import type { ActiveFilters } from "./EventFilterBar";
import { EventFilterBar } from "./EventFilterBar";
import { EventList } from "./EventList";
import { LibraryResults } from "./LibraryResults";
import { SearchForm } from "./SearchForm";

const NO_FILTERS: ActiveFilters = { ageGroup: "", eventType: "", libraryId: "" };

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

export function StorytimeFinder() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<LocationMatch | null>(null);
  const [events, setEvents] = useState<StorytimeEvent[]>([]);
  const [libraryIdsWithoutFeed, setLibraryIdsWithoutFeed] = useState<string[]>([]);
  const [filters, setFilters] = useState<ActiveFilters>(NO_FILTERS);

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const location = await fetchJson<LocationMatch>(
        `/api/location?q=${encodeURIComponent(query)}`,
      );
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

  const allLibraries = useMemo(
    () =>
      match
        ? [
            match.homeLibrary,
            ...match.nearbyLibraries.map((entry) => entry.library),
          ]
        : [],
    [match],
  );

  const librariesById = useMemo(
    () => new Map(allLibraries.map((library) => [library.id, library])),
    [allLibraries],
  );

  const visibleEvents = useMemo(
    () =>
      filterEvents(events, {
        ageGroup: filters.ageGroup || undefined,
        eventType: filters.eventType || undefined,
        libraryIds: filters.libraryId ? [filters.libraryId] : undefined,
      }),
    [events, filters],
  );

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
            <LibraryResults match={match} />
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70">
              <h3 className="mb-2 px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                Filter events
              </h3>
              <EventFilterBar
                libraries={allLibraries}
                filters={filters}
                onChange={setFilters}
              />
            </div>
            <AdSlot slot="finder-results" />
          </aside>

          <section aria-label="Upcoming events" className="space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-lg font-bold">Upcoming events</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                next 2 weeks · {visibleEvents.length} shown
              </span>
            </div>
            {libraryIdsWithoutFeed.length > 0 && (
              <p className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                No public calendar feed is connected yet for:{" "}
                {libraryIdsWithoutFeed
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
