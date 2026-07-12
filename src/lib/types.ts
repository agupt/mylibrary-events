export type AgeGroup =
  | "baby"
  | "toddler"
  | "preschool"
  | "school-age"
  | "all-ages";

export type EventType =
  | "storytime"
  | "craft"
  | "stem"
  | "music-movement"
  | "book-club"
  | "other";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Library {
  id: string;
  name: string;
  system: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  coordinates: Coordinates;
  websiteUrl?: string;
}

export interface StorytimeEvent {
  id: string;
  libraryId: string;
  title: string;
  eventType: EventType;
  ageGroups: AgeGroup[];
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  description: string;
}

export interface LibraryDistance {
  library: Library;
  distanceMiles: number;
}

export interface LocationMatch {
  query: string;
  matchedCity: string;
  matchedState: string;
  coordinates: Coordinates;
  homeLibrary: Library;
  nearbyLibraries: LibraryDistance[];
}

export type LocationResult =
  | { status: "ok"; match: LocationMatch }
  | { status: "not-found" }
  | { status: "ambiguous"; options: string[] };

export interface EventFilters {
  ageGroup?: AgeGroup;
  eventType?: EventType;
  libraryIds?: string[];
}
