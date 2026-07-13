"use client";

import { AGE_GROUP_LABELS, EVENT_TYPE_LABELS } from "@/lib/constants";
import type { AgeGroup, EventType, Library } from "@/lib/types";

export interface ActiveFilters {
  ageGroup: AgeGroup | "";
  eventType: EventType | "";
  libraryId: string | "";
}

interface EventFilterBarProps {
  libraries: Library[];
  filters: ActiveFilters;
  onChange: (filters: ActiveFilters) => void;
}

const selectClass =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-2 pl-3 pr-8 text-sm font-medium shadow-sm outline-none backdrop-blur transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-800/90 dark:focus:border-violet-500 dark:focus:ring-violet-500/20";

function Chevron() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

export function EventFilterBar({
  libraries,
  filters,
  onChange,
}: EventFilterBarProps) {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      role="group"
      aria-label="Event filters"
    >
      <label className="relative block">
        <span className="sr-only">Age group</span>
        <select
          className={selectClass}
          value={filters.ageGroup}
          onChange={(event) =>
            onChange({ ...filters, ageGroup: event.target.value as ActiveFilters["ageGroup"] })
          }
        >
          <option value="">All ages</option>
          {Object.entries(AGE_GROUP_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Chevron />
      </label>

      <label className="relative block">
        <span className="sr-only">Event type</span>
        <select
          className={selectClass}
          value={filters.eventType}
          onChange={(event) =>
            onChange({ ...filters, eventType: event.target.value as ActiveFilters["eventType"] })
          }
        >
          <option value="">All event types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Chevron />
      </label>

      <label className="relative block">
        <span className="sr-only">Library</span>
        <select
          className={selectClass}
          value={filters.libraryId}
          onChange={(event) =>
            onChange({ ...filters, libraryId: event.target.value })
          }
        >
          <option value="">All libraries</option>
          {libraries.map((library) => (
            <option key={library.id} value={library.id}>
              {library.name} ({library.city})
            </option>
          ))}
        </select>
        <Chevron />
      </label>
    </div>
  );
}
