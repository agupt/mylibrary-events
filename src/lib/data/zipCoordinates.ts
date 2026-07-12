import type { Coordinates } from "../types";

/**
 * Zip → centroid lookup for the demo metro, including residential zips
 * that have no library of their own. Swap for a geocoding service or a
 * full ZCTA dataset to support arbitrary zip codes.
 */
export const ZIP_COORDINATES: Record<string, Coordinates> = {
  // San Francisco
  "94102": { latitude: 37.7793, longitude: -122.4157 },
  "94110": { latitude: 37.7485, longitude: -122.4184 },
  "94117": { latitude: 37.7692, longitude: -122.4449 },
  "94158": { latitude: 37.7706, longitude: -122.3893 },
  // Oakland
  "94607": { latitude: 37.8126, longitude: -122.2965 },
  "94609": { latitude: 37.8362, longitude: -122.2648 },
  "94612": { latitude: 37.8014, longitude: -122.2727 },
  "94618": { latitude: 37.8443, longitude: -122.2519 },
  // Berkeley
  "94704": { latitude: 37.8699, longitude: -122.2686 },
  // Palo Alto
  "94301": { latitude: 37.4443, longitude: -122.1598 },
  "94303": { latitude: 37.4443, longitude: -122.14 },
  // Mountain View
  "94041": { latitude: 37.3913, longitude: -122.0827 },
  // San Jose
  "95113": { latitude: 37.3352, longitude: -121.8852 },
  // Sunnyvale
  "94086": { latitude: 37.3688, longitude: -122.0363 },
};

export const ZIP_CITIES: Record<string, string> = {
  "94102": "San Francisco",
  "94110": "San Francisco",
  "94117": "San Francisco",
  "94158": "San Francisco",
  "94607": "Oakland",
  "94609": "Oakland",
  "94612": "Oakland",
  "94618": "Oakland",
  "94704": "Berkeley",
  "94301": "Palo Alto",
  "94303": "Palo Alto",
  "94041": "Mountain View",
  "95113": "San Jose",
  "94086": "Sunnyvale",
};
