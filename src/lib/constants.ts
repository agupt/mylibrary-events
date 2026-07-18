import type { AgeGroup, EventType } from "./types";

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  baby: "Baby (0–18 months)",
  toddler: "Toddler (18 months–3 years)",
  preschool: "Preschool (3–5 years)",
  "school-age": "School Age (5–12 years)",
  "all-ages": "All Ages",
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  storytime: "Storytime",
  craft: "Arts & Crafts",
  stem: "STEM",
  "music-movement": "Music & Movement",
  "book-club": "Book Club",
  other: "Other Programs",
};

export const AGE_GROUPS = Object.keys(AGE_GROUP_LABELS) as AgeGroup[];
export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

export const NEARBY_LIBRARY_LIMIT = 5;
/**
 * The locator returns every library within MAX_RADIUS_MILES plus ALL branches
 * of the home library's system (which share one feed — nearly free), capped at
 * MAX_NEARBY_LIBRARIES so the client's distance control can pull in far-away
 * libraries. The events API request is bounded by MAX_LIBRARIES_PER_REQUEST
 * (home + nearby); the cap accommodates large multi-branch systems since one
 * feed covers the whole system regardless of how many branches are requested.
 */
export const MAX_RADIUS_MILES = 60;
export const MAX_NEARBY_LIBRARIES = 60;
export const MAX_LIBRARIES_PER_REQUEST = 61;
export const DEFAULT_RADIUS_MILES = 10;
export const DEFAULT_EVENT_RANGE_DAYS = 14;
