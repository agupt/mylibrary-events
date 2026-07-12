import type { Coordinates } from "./types";

/**
 * Spherical Albers equal-area conic projection with the standard
 * conterminous-US parameters (parallels 29.5°/45.5°, origin 23°N 96°W).
 * Returns unitless x/y suitable for scaling into an SVG viewBox.
 */
const PARALLEL_1 = (29.5 * Math.PI) / 180;
const PARALLEL_2 = (45.5 * Math.PI) / 180;
const ORIGIN_LAT = (23 * Math.PI) / 180;
const ORIGIN_LNG = (-96 * Math.PI) / 180;

const N = (Math.sin(PARALLEL_1) + Math.sin(PARALLEL_2)) / 2;
const C = Math.cos(PARALLEL_1) ** 2 + 2 * N * Math.sin(PARALLEL_1);
const RHO_0 = Math.sqrt(C - 2 * N * Math.sin(ORIGIN_LAT)) / N;

export interface ProjectedPoint {
  x: number;
  y: number;
}

export function projectAlbersUsa(coordinates: Coordinates): ProjectedPoint {
  const lat = (coordinates.latitude * Math.PI) / 180;
  const lng = (coordinates.longitude * Math.PI) / 180;
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat)) / N;
  const theta = N * (lng - ORIGIN_LNG);
  return {
    x: rho * Math.sin(theta),
    y: RHO_0 - rho * Math.cos(theta),
  };
}

/** Conterminous US only — AK/HI/territories are reported in tables. */
export function isConterminous(coordinates: Coordinates): boolean {
  return (
    coordinates.latitude >= 24 &&
    coordinates.latitude <= 50 &&
    coordinates.longitude >= -125 &&
    coordinates.longitude <= -66
  );
}
