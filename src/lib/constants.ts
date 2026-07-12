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
export const DEFAULT_EVENT_RANGE_DAYS = 14;
