import type { EventFilters, StorytimeEvent } from "./types";

/** Applies age-group, event-type, library, and date-range filters (AND semantics). */
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
    // startTime is a floating ISO ("YYYY-MM-DDT…"); its first 10 chars are the
    // local calendar day, which sorts/compares lexicographically against bounds.
    const day = event.startTime.slice(0, 10);
    if (filters.dateStart && day < filters.dateStart) {
      return false;
    }
    if (filters.dateEnd && day > filters.dateEnd) {
      return false;
    }
    return true;
  });
}
