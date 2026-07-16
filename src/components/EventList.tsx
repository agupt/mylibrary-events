"use client";

import { AGE_GROUP_LABELS, EVENT_TYPE_LABELS } from "@/lib/constants";
import type { EventType, Library, StorytimeEvent } from "@/lib/types";

interface EventListProps {
  events: StorytimeEvent[];
  librariesById: Map<string, Library>;
}

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const TYPE_STYLES: Record<EventType, string> = {
  storytime: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  craft: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  stem: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  "music-movement": "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  "book-club": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export function EventList({ events, librariesById }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center dark:border-slate-700 dark:bg-slate-800/40">
        <p aria-hidden className="mb-2 text-3xl">
          🧸
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No events match these filters — try widening the age group or event
          type.
        </p>
      </div>
    );
  }

  // Group by calendar day for scannable headers
  const byDay = new Map<string, StorytimeEvent[]>();
  for (const event of events) {
    const key = event.startTime.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  // Wall-clock strings sort lexicographically within a day
  for (const dayEvents of byDay.values()) {
    dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  const sortedDays = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {sortedDays.map(([day, dayEvents]) => (
        <section key={day} aria-label={dayFormatter.format(new Date(`${day}T12:00:00`))}>
          <h4 className="mb-2 flex items-center gap-3 px-1 text-sm font-bold text-slate-800 dark:text-slate-200">
            {dayFormatter.format(new Date(`${day}T12:00:00`))}
            <span className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
          </h4>
          <ul className="space-y-2">
            {dayEvents.map((event) => {
              const library = librariesById.get(event.libraryId);
              const start = new Date(event.startTime);
              return (
                <li
                  key={`${event.libraryId}:${event.id}`}
                  className="group flex gap-4 rounded-xl border border-slate-200/80 bg-white/80 p-4 backdrop-blur transition hover:border-violet-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-violet-700"
                >
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-50 py-2 text-center dark:bg-slate-900/60">
                    {event.isAllDay ? (
                      <span className="text-[11px] font-semibold uppercase leading-tight text-slate-500 dark:text-slate-400">
                        All
                        <br />
                        day
                      </span>
                    ) : (
                      <>
                        <span className="text-sm font-bold tabular-nums">
                          {timeFormatter.format(start).replace(/ (AM|PM)/, "")}
                        </span>
                        <span className="text-[10px] font-medium uppercase text-slate-400">
                          {start.getHours() < 12 ? "AM" : "PM"}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{event.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {library ? `${library.name} · ${library.city}` : event.libraryId}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLES[event.eventType]}`}
                      >
                        {EVENT_TYPE_LABELS[event.eventType]}
                      </span>
                      {event.ageGroups.map((ageGroup) => (
                        <span
                          key={ageGroup}
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        >
                          {AGE_GROUP_LABELS[ageGroup]}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
