/**
 * Which peaks are visible from an observer (SPEC 6.4). Pure TypeScript.
 *
 * Summit angle uses the peak's catalogued elevation (the DEM smooths sharp summits). The
 * terrain between observer and peak is sampled like the horizon, up to 98% of the distance so
 * the peak's own slopes don't hide it.
 */

import { toDegrees } from './angles';
import type { Dem } from './dem';
import { curvatureDropM, haversineDistanceM, initialBearingDeg } from './geo';
import {
  DEFAULT_SAMPLING,
  type Observer,
  type SamplingOptions,
  buildSampleTable,
  walkRay,
} from './horizon';

/** The fields visibility needs; peaks.json entries have more. */
export interface PeakLike {
  id: string;
  lat: number;
  lon: number;
  elevationM: number;
  rank: number;
}

export interface VisibilityOptions extends SamplingOptions {
  /** A summit this far below the blocking terrain still counts as visible. Default 0.05°. */
  toleranceDeg?: number;
  /** Fraction of the distance to sample before stopping. Default 0.98. */
  stopFraction?: number;
}

export interface VisiblePeak<P extends PeakLike = PeakLike> {
  peak: P;
  distanceM: number;
  azimuthDeg: number;
  elevationAngleDeg: number;
  visible: boolean;
  /** How far the summit is below the line of sight over the blocking terrain (0 if visible). */
  occludedByM: number;
  /** Distance of the terrain that blocks the most (null if nothing in between). */
  blockingDistanceM: number | null;
  /** Elevation angle of that terrain. */
  blockingAngleDeg: number | null;
}

export const DEFAULT_TOLERANCE_DEG = 0.05;
export const DEFAULT_STOP_FRACTION = 0.98;
const DEFAULT_MAX_DIST_M = 150_000;

export function computeVisiblePeaks<P extends PeakLike>(
  dem: Dem,
  observer: Observer,
  peaks: readonly P[],
  options: VisibilityOptions = {},
): VisiblePeak<P>[] {
  const maxDistM = options.maxDistM ?? DEFAULT_MAX_DIST_M;
  const toleranceDeg = options.toleranceDeg ?? DEFAULT_TOLERANCE_DEG;
  const stopFraction = options.stopFraction ?? DEFAULT_STOP_FRACTION;
  const minDistM = options.minDistM ?? DEFAULT_SAMPLING.minDistM;
  const table = buildSampleTable({ ...options, maxDistM });

  const results: VisiblePeak<P>[] = [];
  for (const peak of peaks) {
    const distanceM = haversineDistanceM(observer, peak);
    // Beyond range, or so close that the observer is standing on it.
    if (distanceM > maxDistM || distanceM < minDistM) continue;
    const azimuthDeg = initialBearingDeg(observer, peak);
    const summitTan =
      (peak.elevationM - curvatureDropM(distanceM) - observer.elevationM) / distanceM;

    // Only the samples before stopFraction × distance.
    const stopM = distanceM * stopFraction;
    let sampleCount = 0;
    while (sampleCount < table.distancesM.length && table.distancesM[sampleCount]! <= stopM) {
      sampleCount++;
    }

    let maxTan = -Infinity;
    let blockingDistanceM: number | null = null;
    walkRay(
      dem,
      observer,
      azimuthDeg,
      table,
      (tanAngle, d) => {
        if (tanAngle > maxTan) {
          maxTan = tanAngle;
          blockingDistanceM = d;
        }
      },
      sampleCount,
    );

    const summitAngleDeg = toDegrees(Math.atan(summitTan));
    const blockingAngleDeg = maxTan === -Infinity ? null : toDegrees(Math.atan(maxTan));
    const visible = blockingAngleDeg === null || summitAngleDeg >= blockingAngleDeg - toleranceDeg;
    results.push({
      peak,
      distanceM,
      azimuthDeg,
      elevationAngleDeg: summitAngleDeg,
      visible,
      occludedByM: visible || maxTan === -Infinity ? 0 : (maxTan - summitTan) * distanceM,
      blockingDistanceM,
      blockingAngleDeg,
    });
  }

  results.sort((a, b) => a.peak.rank - b.peak.rank || a.distanceM - b.distanceM);
  return results;
}
