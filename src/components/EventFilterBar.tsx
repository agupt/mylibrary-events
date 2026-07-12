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
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

export function EventFilterBar({
  libraries,
  filters,
  onChange,
}: EventFilterBarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-label="Event filters"
    >
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        Age group
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
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        Event type
        <select
          className={selectClass}
          value={filters.eventType}
          onChange={(event) =>
            onChange({ ...filters, eventType: event.target.value as ActiveFilters["eventType"] })
          }
        >
          <option value="">All types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        Library
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
      </label>
    </div>
  );
}
