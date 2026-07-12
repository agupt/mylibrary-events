/**
 * BiblioCommons events RSS feeds, keyed by IMLS system key (FSCSKEY).
 * Each feed covers every branch in the system. All URLs verified live
 * 2026-07. Add systems here as they're discovered — most BiblioCommons
 * libraries expose /events/rss/all.
 */
export const CALENDAR_FEEDS: Record<string, string> = {
  CA0001: "https://aclibrary.bibliocommons.com/events/rss/all", // Alameda County
  CA0028: "https://ccclib.bibliocommons.com/events/rss/all", // Contra Costa County
  CA0081: "https://oaklandlibrary.bibliocommons.com/events/rss/all", // Oakland
  CA0091: "https://paloalto.bibliocommons.com/events/rss/all", // Palo Alto
  CA0120: "https://smcl.bibliocommons.com/events/rss/all", // San Mateo County
  CA0126: "https://sccl.bibliocommons.com/events/rss/all", // Santa Clara County
};
