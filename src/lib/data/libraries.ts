import type { Library } from "../types";

/**
 * Seed dataset covering the SF Bay Area demo metro. Coordinates are
 * approximate branch locations. Replace or extend with a real library
 * directory source (e.g. IMLS Public Library Survey) for production.
 */
export const LIBRARIES: Library[] = [
  {
    id: "sfpl-main",
    name: "Main Library",
    system: "San Francisco Public Library",
    address: "100 Larkin St",
    city: "San Francisco",
    zipCode: "94102",
    coordinates: { latitude: 37.7793, longitude: -122.4157 },
  },
  {
    id: "sfpl-mission-bay",
    name: "Mission Bay Branch",
    system: "San Francisco Public Library",
    address: "960 4th St",
    city: "San Francisco",
    zipCode: "94158",
    coordinates: { latitude: 37.7706, longitude: -122.3893 },
  },
  {
    id: "opl-main",
    name: "Main Library",
    system: "Oakland Public Library",
    address: "125 14th St",
    city: "Oakland",
    zipCode: "94612",
    coordinates: { latitude: 37.8014, longitude: -122.2727 },
  },
  {
    id: "opl-rockridge",
    name: "Rockridge Branch",
    system: "Oakland Public Library",
    address: "5366 College Ave",
    city: "Oakland",
    zipCode: "94618",
    coordinates: { latitude: 37.8443, longitude: -122.2519 },
  },
  {
    id: "bpl-central",
    name: "Central Library",
    system: "Berkeley Public Library",
    address: "2090 Kittredge St",
    city: "Berkeley",
    zipCode: "94704",
    coordinates: { latitude: 37.8699, longitude: -122.2686 },
  },
  {
    id: "papl-rinconada",
    name: "Rinconada Library",
    system: "Palo Alto City Library",
    address: "1213 Newell Rd",
    city: "Palo Alto",
    zipCode: "94303",
    coordinates: { latitude: 37.4443, longitude: -122.14 },
  },
  {
    id: "mvpl-main",
    name: "Mountain View Public Library",
    system: "Mountain View Public Library",
    address: "585 Franklin St",
    city: "Mountain View",
    zipCode: "94041",
    coordinates: { latitude: 37.3913, longitude: -122.0827 },
  },
  {
    id: "sjpl-mlk",
    name: "Dr. Martin Luther King Jr. Library",
    system: "San José Public Library",
    address: "150 E San Fernando St",
    city: "San Jose",
    zipCode: "95113",
    coordinates: { latitude: 37.3352, longitude: -121.8852 },
  },
  {
    id: "svpl-main",
    name: "Sunnyvale Public Library",
    system: "Sunnyvale Public Library",
    address: "665 W Olive Ave",
    city: "Sunnyvale",
    zipCode: "94086",
    coordinates: { latitude: 37.3688, longitude: -122.0363 },
  },
];
