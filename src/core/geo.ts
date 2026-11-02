/**
 * Spherical-earth geodesy for line-of-sight work (SPEC 6.1).
 * Pure TypeScript: no React, Expo or native imports.
 *
 * Coordinates are WGS84 decimal degrees on a sphere of radius EARTH_RADIUS_M.
 * Azimuths/bearings are degrees clockwise from true north, in [0, 360).
 */

import { toDegrees, toRadians, wrapTo360 } from './angles';

export const EARTH_RADIUS_M = 6_371_000;
/** Standard atmospheric refraction coefficient: light bends with ~1/7.7 of earth's curvature. */
export const REFRACTION_K = 0.13;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in metres (haversine). */
export function haversineDistanceM(a: LatLon, b: LatLon): number {
  const lat1Rad = toRadians(a.lat);
  const lat2Rad = toRadians(b.lat);
  const dLatRad = lat2Rad - lat1Rad;
  const dLonRad = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLatRad / 2) ** 2 + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLonRad / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees clockwise from true north, [0, 360). */
export function initialBearingDeg(a: LatLon, b: LatLon): number {
  const lat1Rad = toRadians(a.lat);
  const lat2Rad = toRadians(b.lat);
  const dLonRad = toRadians(b.lon - a.lon);
  const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);
  return wrapTo360(toDegrees(Math.atan2(y, x)));
}

/** Point reached travelling distanceM along a great circle starting at bearingDeg. */
export function destinationPoint(origin: LatLon, bearingDeg: number, distanceM: number): LatLon {
  const angularDistRad = distanceM / EARTH_RADIUS_M;
  const bearingRad = toRadians(bearingDeg);
  const lat1Rad = toRadians(origin.lat);
  const lon1Rad = toRadians(origin.lon);

  const sinLat2 =
    Math.sin(lat1Rad) * Math.cos(angularDistRad) +
    Math.cos(lat1Rad) * Math.sin(angularDistRad) * Math.cos(bearingRad);
  const lat2Rad = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const lon2Rad =
    lon1Rad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistRad) * Math.cos(lat1Rad),
      Math.cos(angularDistRad) - Math.sin(lat1Rad) * sinLat2,
    );

  return { lat: toDegrees(lat2Rad), lon: wrapTo360(toDegrees(lon2Rad) + 180) - 180 };
}

/**
 * Apparent drop of a distant point below the observer's horizontal plane caused by earth
 * curvature, reduced by atmospheric refraction: d² / (2R) × (1 − K).
 */
export function curvatureDropM(distanceM: number): number {
  return ((distanceM * distanceM) / (2 * EARTH_RADIUS_M)) * (1 - REFRACTION_K);
}

/**
 * Apparent elevation angle (degrees above horizontal) of a target seen from an observer,
 * including curvature and refraction.
 */
export function elevationAngleDeg(
  observerElevM: number,
  targetElevM: number,
  distanceM: number,
): number {
  return toDegrees(Math.atan2(targetElevM - curvatureDropM(distanceM) - observerElevM, distanceM));
}
