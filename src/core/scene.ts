/**
 * Scene = horizon + visible peaks for one observer position (SPEC 6.3, 6.4, 7).
 * Pure TypeScript. The caller injects how to yield between chunks, so on device the work is
 * spread over many short slices and the UI thread stays responsive.
 */

import { type Dem, observerElevationM } from './dem';
import { type LatLon, haversineDistanceM } from './geo';
import {
  DEFAULT_AZIMUTH_STEP_DEG,
  type Horizon,
  type HorizonRay,
  type Observer,
  buildSampleTable,
  computeHorizonRay,
} from './horizon';
import { type PeakLike, type VisiblePeak, computeVisiblePeaks } from './visibility';

/** Recompute only when the observer moved at least this far (SPEC 6.3 / 7). */
export const RECOMPUTE_DISTANCE_M = 50;
/** Cache cell size. */
export const CACHE_GRID_M = 50;

export interface Scene<P extends PeakLike = PeakLike> {
  /** Position the scene was computed for (may differ from the live fix by < 50 m). */
  position: LatLon;
  observer: Observer;
  horizon: Horizon;
  peaks: VisiblePeak<P>[];
  timing: { horizonMs: number; visibilityMs: number; totalMs: number; chunks: number };
}

export interface ComputeSceneOptions {
  eyeHeightM?: number;
  azimuthStepDeg?: number;
  /** Rays per chunk before yielding. Default 60 (24 chunks for 1,440 rays). */
  raysPerChunk?: number;
  /** Called between chunks; return a promise that resolves on the next tick. */
  yieldFn?: () => Promise<void>;
  /** Set `.cancelled = true` to stop early; the promise then rejects with SceneCancelledError. */
  token?: { cancelled: boolean };
  now?: () => number;
}

export class SceneCancelledError extends Error {
  constructor() {
    super('Scene computation cancelled');
    this.name = 'SceneCancelledError';
  }
}

export class OutsideDemError extends Error {
  constructor(position: LatLon) {
    super(`Position ${position.lat.toFixed(5)}, ${position.lon.toFixed(5)} is outside the map`);
    this.name = 'OutsideDemError';
  }
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Compute horizon + visible peaks in chunks. Throws OutsideDemError if there is no terrain. */
export async function computeScene<P extends PeakLike>(
  dem: Dem,
  position: LatLon,
  peaks: readonly P[],
  options: ComputeSceneOptions = {},
): Promise<Scene<P>> {
  const now = options.now ?? defaultNow;
  const eyeHeightM = options.eyeHeightM ?? 1.7;
  const azimuthStepDeg = options.azimuthStepDeg ?? DEFAULT_AZIMUTH_STEP_DEG;
  const raysPerChunk = options.raysPerChunk ?? 60;
  const yieldFn = options.yieldFn ?? (() => Promise.resolve());
  const token = options.token ?? { cancelled: false };

  const elevationM = observerElevationM(dem, position, eyeHeightM);
  if (elevationM === null) throw new OutsideDemError(position);
  const observer: Observer = { lat: position.lat, lon: position.lon, elevationM };

  const t0 = now();
  let busyMs = 0;
  const table = buildSampleTable();
  const rayCount = Math.round(360 / azimuthStepDeg);
  const rays: HorizonRay[] = new Array(rayCount);
  let chunks = 0;
  for (let start = 0; start < rayCount; start += raysPerChunk) {
    if (token.cancelled) throw new SceneCancelledError();
    const c0 = now();
    const end = Math.min(rayCount, start + raysPerChunk);
    for (let i = start; i < end; i++) {
      rays[i] = computeHorizonRay(dem, observer, i * azimuthStepDeg, table);
    }
    busyMs += now() - c0;
    chunks++;
    await yieldFn();
  }
  if (token.cancelled) throw new SceneCancelledError();
  const horizonMs = busyMs;

  const v0 = now();
  const visible = computeVisiblePeaks(dem, observer, peaks);
  const visibilityMs = now() - v0;
  chunks++;

  return {
    position: { lat: position.lat, lon: position.lon },
    observer,
    horizon: { observer, azimuthStepDeg, rays },
    peaks: visible,
    // horizonMs/visibilityMs = actual work; totalMs includes time handed back to the UI.
    timing: { horizonMs, visibilityMs, totalMs: now() - t0, chunks },
  };
}

/** True if the observer moved far enough from `computedAt` to need a new scene. */
export function needsRecompute(
  computedAt: LatLon | null,
  current: LatLon,
  thresholdM = RECOMPUTE_DISTANCE_M,
): boolean {
  return computedAt === null || haversineDistanceM(computedAt, current) >= thresholdM;
}

/** Key of the ~gridM cell containing a position (same cell -> same cached scene). */
export function gridKey(position: LatLon, gridM = CACHE_GRID_M): string {
  const latStepDeg = gridM / 111_195;
  const lonStepDeg = gridM / (111_195 * Math.max(0.01, Math.cos((position.lat * Math.PI) / 180)));
  return `${Math.floor(position.lat / latStepDeg)}:${Math.floor(position.lon / lonStepDeg)}`;
}

/** Tiny LRU cache for scenes (a scene with horizon is a few hundred kB). */
export class SceneCache<V> {
  private readonly entries = new Map<string, V>();
  constructor(private readonly maxEntries = 8) {}

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value); // most recently used last
    }
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
