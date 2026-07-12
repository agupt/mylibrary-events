import type { EventFilters, StorytimeEvent } from "./types";

/** Applies age-group, event-type, and library filters with AND semantics. */
export function filterEvents(
  events: StorytimeEvent[],
  filters: EventFilters,
): StorytimeEvent[] {
  return events.filter((event) => {
    if (filters.ageGroup && !event.ageGroups.includes(filters.ageGroup)) {
      return false;
    }
    if (filters.eventType && event.eventType !== filters.eventType) {
      return false;
    }
    if (filters.libraryIds && !filters.libraryIds.includes(event.libraryId)) {
      return false;
    }
    return true;
  });
}
