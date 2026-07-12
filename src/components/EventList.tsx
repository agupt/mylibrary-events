"use client";

import { AGE_GROUP_LABELS, EVENT_TYPE_LABELS } from "@/lib/constants";
import type { Library, StorytimeEvent } from "@/lib/types";

interface EventListProps {
  events: StorytimeEvent[];
  librariesById: Map<string, Library>;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function EventList({ events, librariesById }: EventListProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No events match these filters. Try widening the age group or event
        type.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((event) => {
        const library = librariesById.get(event.libraryId);
        const start = new Date(event.startTime);
        return (
          <li
            key={event.id}
            className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {event.title}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {library ? `${library.name} · ${library.city}` : event.libraryId}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                  {EVENT_TYPE_LABELS[event.eventType]}
                </span>
                {event.ageGroups.map((ageGroup) => (
                  <span
                    key={ageGroup}
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                  >
                    {AGE_GROUP_LABELS[ageGroup]}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-sm text-slate-700 sm:text-right dark:text-slate-300">
              <p className="font-medium">{dateFormatter.format(start)}</p>
              <p>
                {timeFormatter.format(start)} –{" "}
                {timeFormatter.format(new Date(event.endTime))}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
