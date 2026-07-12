import type { StorytimeEvent } from "../types";

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Abstraction over a library system's activity calendar. Real
 * implementations would adapt vendor feeds (LibCal, Communico,
 * BiblioCommons, iCal exports); the app only depends on this interface.
 */
export interface EventProvider {
  getEvents(libraryIds: string[], range: DateRange): Promise<StorytimeEvent[]>;
}
