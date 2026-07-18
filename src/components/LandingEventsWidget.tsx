"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_LIBRARIES_PER_REQUEST } from "@/lib/constants";
import { buildEventItemList } from "@/lib/seo/jsonLd";
import type { Library, StorytimeEvent } from "@/lib/types";
import { EventList } from "./EventList";

interface LandingEventsWidgetProps {
  /** Libraries whose calendars this page previews (home branch + siblings). */
  libraries: Library[];
  /** Root-relative path of the host page, for Event offers/mainEntity URLs. */
  pagePath: string;
}

interface EventsResponse {
  events: StorytimeEvent[];
  libraryIdsWithoutFeed: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

type Status = "loading" | "ready" | "error";

function relativeTime(from: Date): string {
  const minutes = Math.round((Date.now() - from.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  return "over an hour ago";
}

export function LandingEventsWidget({
  libraries,
  pagePath,
}: LandingEventsWidgetProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [events, setEvents] = useState<StorytimeEvent[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const ids = useMemo(
    () => libraries.map((library) => library.id).slice(0, MAX_LIBRARIES_PER_REQUEST),
    [libraries],
  );

  const librariesById = useMemo(
    () => new Map(libraries.map((library) => [library.id, library])),
    [libraries],
  );

  useEffect(() => {
    if (ids.length === 0) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to the loading state for a prop-driven refetch; resolved in the fetch callbacks
    setStatus("loading");
    fetch(`/api/events?libraryIds=${ids.join(",")}`)
      .then((response) => response.json() as Promise<ApiEnvelope<EventsResponse>>)
      .then((body) => {
        if (!active) return;
        if (!body.success || body.data === null) {
          setStatus("error");
          return;
        }
        setEvents(body.data.events);
        setFetchedAt(new Date());
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [ids]);

  const eventJsonLd = useMemo(() => {
    if (events.length === 0) return null;
    return buildEventItemList(events, librariesById, pagePath);
  }, [events, librariesById, pagePath]);

  return (
    <section aria-label="Upcoming events" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Upcoming events</h2>
        {status === "ready" && fetchedAt && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {events.length} {events.length === 1 ? "event" : "events"} · updated{" "}
            {relativeTime(fetchedAt)}
          </span>
        )}
      </div>

      {status === "loading" && (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60"
            />
          ))}
        </div>
      )}

      {status === "error" && (
        <p className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          We could not load the live calendar right now. Please try again in a
          few minutes, or check the library&apos;s own website.
        </p>
      )}

      {status === "ready" && events.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          No upcoming kids&apos; events are listed right now. New events are
          added regularly — check back soon.
        </p>
      )}

      {status === "ready" && events.length > 0 && (
        <>
          <EventList events={events} librariesById={librariesById} />
          {eventJsonLd && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(eventJsonLd).replace(/</g, "\\u003c"),
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
