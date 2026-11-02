/**
 * Near/far ridge silhouettes for drawing (SPEC 3.4: near = darker, far = lighter).
 * For each distance limit D, silhouette[ray] = highest terrain angle within D in that
 * direction. Drawing the farthest band first and nearer bands on top gives layered ridges.
 */

import type { Horizon } from './horizon';

/** Default band limits in metres; the last band is the full skyline. */
export const DEFAULT_BAND_LIMITS_M = [
  1_000,
  3_000,
  7_000,
  15_000,
  30_000,
  55_000,
  90_000,
  Infinity,
];

export interface BandSilhouettes {
  limitsM: number[];
  /** [band][ray] elevation angle in degrees; NaN where no terrain lies within the limit. */
  anglesDeg: Float32Array[];
}

export function computeBandSilhouettes(
  horizon: Horizon,
  limitsM: readonly number[] = DEFAULT_BAND_LIMITS_M,
): BandSilhouettes {
  const rayCount = horizon.rays.length;
  const anglesDeg = limitsM.map(() => new Float32Array(rayCount).fill(Number.NaN));
  for (let i = 0; i < rayCount; i++) {
    const ridges = horizon.rays[i]!.ridges; // nearest first, increasing angle
    let k = 0;
    let best = Number.NaN;
    for (let b = 0; b < limitsM.length; b++) {
      while (k < ridges.length && ridges[k]!.distanceM <= limitsM[b]!) {
        best = ridges[k]!.angleDeg;
        k++;
      }
      anglesDeg[b]![i] = best;
    }
  }
  return { limitsM: [...limitsM], anglesDeg };
}
