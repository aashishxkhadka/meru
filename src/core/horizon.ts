/**
 * 360° skyline from a DEM (SPEC 6.3). Pure TypeScript.
 *
 * For each azimuth, walk outwards along the great circle, compute the apparent elevation angle
 * of the terrain (curvature + refraction included) and track the running maximum.
 * The final maximum is the skyline; every crest that raised the maximum is a "ridge layer"
 * (used to draw near ridges dark and far ridges light).
 */

import { toDegrees, toRadians } from './angles';
import { type Dem, elevationAt } from './dem';
import { EARTH_RADIUS_M, type LatLon, curvatureDropM } from './geo';

export interface Observer extends LatLon {
  /** Eye elevation in metres (ground + eye height). */
  elevationM: number;
}

export interface SamplingOptions {
  /** First sample distance. Default 100 m. */
  minDistM?: number;
  /** Last sample distance (or the DEM edge, whichever comes first). Default 150 km. */
  maxDistM?: number;
  /** Step size up to nearLimitM. Default 45 m. */
  nearStepM?: number;
  /** Step size beyond nearLimitM. Default 90 m. */
  farStepM?: number;
  /** Where the step changes from near to far. Default 10 km. */
  nearLimitM?: number;
}

export interface HorizonOptions extends SamplingOptions {
  /** Angular spacing of rays. Default 0.25° (1,440 rays). */
  azimuthStepDeg?: number;
}

export interface RidgeLayer {
  distanceM: number;
  angleDeg: number;
}

export interface HorizonRay {
  azimuthDeg: number;
  /** Skyline elevation angle in this direction. */
  maxAngleDeg: number;
  /** Distance of the terrain that forms the skyline. */
  distAtMaxM: number;
  /** Crests that raised the running maximum, nearest first (angles increase with distance). */
  ridges: RidgeLayer[];
}

export interface Horizon {
  observer: Observer;
  azimuthStepDeg: number;
  rays: HorizonRay[];
}

export const DEFAULT_SAMPLING: Required<SamplingOptions> = {
  minDistM: 100,
  maxDistM: 150_000,
  nearStepM: 45,
  farStepM: 90,
  nearLimitM: 10_000,
};
export const DEFAULT_AZIMUTH_STEP_DEG = 0.25;

/**
 * Distances shared by every ray, with their great-circle trig and curvature drop precomputed.
 * Computed once per horizon, not per ray.
 */
export interface SampleTable {
  distancesM: Float64Array;
  sinAngular: Float64Array;
  cosAngular: Float64Array;
  dropM: Float64Array;
}

export function buildSampleTable(options: SamplingOptions = {}, upToM?: number): SampleTable {
  const o = { ...DEFAULT_SAMPLING, ...options };
  const limitM = Math.min(o.maxDistM, upToM ?? Infinity);
  const distances: number[] = [];
  for (let d = o.minDistM; d <= limitM; d += d < o.nearLimitM ? o.nearStepM : o.farStepM) {
    distances.push(d);
  }
  const n = distances.length;
  const table: SampleTable = {
    distancesM: Float64Array.from(distances),
    sinAngular: new Float64Array(n),
    cosAngular: new Float64Array(n),
    dropM: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const angular = distances[i]! / EARTH_RADIUS_M;
    table.sinAngular[i] = Math.sin(angular);
    table.cosAngular[i] = Math.cos(angular);
    table.dropM[i] = curvatureDropM(distances[i]!);
  }
  return table;
}

/** Callback per sample along a ray: tangent of the apparent elevation angle, distance. */
type SampleVisitor = (tanAngle: number, distanceM: number) => void;

/**
 * Walk one great-circle ray from the observer. Stops at the DEM edge; skips noData cells.
 * Uses tan(angle) = (h − drop − eye) / d, which orders exactly like the angle itself.
 */
export function walkRay(
  dem: Dem,
  observer: Observer,
  azimuthDeg: number,
  table: SampleTable,
  visit: SampleVisitor,
  sampleCount = table.distancesM.length,
): void {
  const { north, south, west, east } = dem.header;
  const lat1 = toRadians(observer.lat);
  const lon1 = toRadians(observer.lon);
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const bearing = toRadians(azimuthDeg);
  const sinB = Math.sin(bearing);
  const cosB = Math.cos(bearing);

  for (let i = 0; i < sampleCount; i++) {
    const sinD = table.sinAngular[i]!;
    const cosD = table.cosAngular[i]!;
    const sinLat2 = sinLat1 * cosD + cosLat1 * sinD * cosB;
    const latDeg = toDegrees(Math.asin(sinLat2));
    const lonDeg = toDegrees(lon1 + Math.atan2(sinB * sinD * cosLat1, cosD - sinLat1 * sinLat2));
    if (latDeg < south || latDeg > north || lonDeg < west || lonDeg > east) return; // DEM edge
    const terrainM = elevationAt(dem, latDeg, lonDeg);
    if (terrainM === null) continue; // noData hole
    const distanceM = table.distancesM[i]!;
    visit((terrainM - table.dropM[i]! - observer.elevationM) / distanceM, distanceM);
  }
}

/** Compute one ray of the horizon. Exposed so callers can chunk work across frames. */
export function computeHorizonRay(
  dem: Dem,
  observer: Observer,
  azimuthDeg: number,
  table: SampleTable,
): HorizonRay {
  let maxTan = -Infinity;
  let distAtMaxM = 0;
  let pending: RidgeLayer | null = null;
  const ridges: RidgeLayer[] = [];

  walkRay(dem, observer, azimuthDeg, table, (tanAngle, distanceM) => {
    if (tanAngle > maxTan) {
      maxTan = tanAngle;
      distAtMaxM = distanceM;
      pending = { distanceM, angleDeg: toDegrees(Math.atan(tanAngle)) };
    } else if (pending !== null) {
      ridges.push(pending); // the climb stopped: that was a crest
      pending = null;
    }
  });
  if (pending !== null) ridges.push(pending);

  return {
    azimuthDeg,
    maxAngleDeg: maxTan === -Infinity ? Number.NaN : toDegrees(Math.atan(maxTan)),
    distAtMaxM,
    ridges,
  };
}

export function computeHorizon(
  dem: Dem,
  observer: Observer,
  options: HorizonOptions = {},
): Horizon {
  const azimuthStepDeg = options.azimuthStepDeg ?? DEFAULT_AZIMUTH_STEP_DEG;
  const table = buildSampleTable(options);
  const rayCount = Math.round(360 / azimuthStepDeg);
  const rays: HorizonRay[] = new Array(rayCount);
  for (let i = 0; i < rayCount; i++) {
    rays[i] = computeHorizonRay(dem, observer, i * azimuthStepDeg, table);
  }
  return { observer, azimuthStepDeg, rays };
}

/** Skyline angle at any azimuth, linearly interpolated between rays. */
export function horizonAngleAt(horizon: Horizon, azimuthDeg: number): number {
  const n = horizon.rays.length;
  const f = ((((azimuthDeg % 360) + 360) % 360) / 360) * n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const t = f - Math.floor(f);
  return horizon.rays[i0]!.maxAngleDeg * (1 - t) + horizon.rays[i1]!.maxAngleDeg * t;
}
