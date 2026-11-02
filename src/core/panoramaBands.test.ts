import { describe, expect, it } from '@jest/globals';

import type { Horizon } from './horizon';
import { computeBandSilhouettes } from './panoramaBands';

const horizon = {
  observer: { lat: 0, lon: 0, elevationM: 0 },
  azimuthStepDeg: 180,
  rays: [
    {
      azimuthDeg: 0,
      maxAngleDeg: 9,
      distAtMaxM: 40_000,
      ridges: [
        { distanceM: 500, angleDeg: 1 },
        { distanceM: 5_000, angleDeg: 4 },
        { distanceM: 40_000, angleDeg: 9 },
      ],
    },
    {
      azimuthDeg: 180,
      maxAngleDeg: 2,
      distAtMaxM: 8_000,
      ridges: [{ distanceM: 8_000, angleDeg: 2 }],
    },
  ],
} satisfies Horizon;

describe('computeBandSilhouettes', () => {
  it('gives the highest ridge within each distance limit', () => {
    const { anglesDeg } = computeBandSilhouettes(horizon, [1_000, 10_000, Infinity]);
    expect(Array.from(anglesDeg.map((a) => a[0]))).toEqual([1, 4, 9]);
  });

  it('is NaN where nothing lies within the limit, and the last band is the skyline', () => {
    const { anglesDeg } = computeBandSilhouettes(horizon, [1_000, 10_000, Infinity]);
    expect(anglesDeg[0]![1]).toBeNaN();
    expect(anglesDeg[1]![1]).toBe(2);
    expect(anglesDeg[2]![1]).toBe(horizon.rays[1]!.maxAngleDeg);
  });
});
