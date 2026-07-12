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
  | "book-club";

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
  zipCode: string;
  coordinates: Coordinates;
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
  coordinates: Coordinates;
  homeLibrary: Library;
  nearbyLibraries: LibraryDistance[];
}

export interface EventFilters {
  ageGroup?: AgeGroup;
  eventType?: EventType;
  libraryIds?: string[];
}
