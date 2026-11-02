import { describe, expect, it } from '@jest/globals';

import { at, makeDem, wallEast } from '../../tests/syntheticDem';
import { computeVisiblePeaks } from './visibility';

const CELL_DEG = 0.001;
const HALF_DEG = 0.15;
const observer = { lat: 0, lon: 0, elevationM: 2 };

/** A 2000 m peak 10 km east. */
const peak = { id: 'target', rank: 1, elevationM: 2000, ...at(10_000, 0) };
/** A cone at the peak position whose top matches the catalogued summit. */
const cone = (x: number, y: number) => Math.max(0, 2000 - Math.hypot(x - 10_000, y) * 1.5); // 1.33 km radius

describe('computeVisiblePeaks', () => {
  it('a peak behind a taller near ridge is hidden', () => {
    const ridge = wallEast(3000, 1500); // ≈26.5° vs summit ≈11.3°
    const dem = makeDem(HALF_DEG, CELL_DEG, (x, y) => Math.max(ridge(x), cone(x, y)));
    const [r] = computeVisiblePeaks(dem, observer, [peak]);
    expect(r!.visible).toBe(false);
    expect(Math.abs(r!.blockingDistanceM! - 2870)).toBeLessThan(150);
    // line of sight over the ridge passes ≈3,000 m above the summit at 10 km
    expect(r!.occludedByM).toBeGreaterThan(2500);
    expect(r!.occludedByM).toBeLessThan(3500);
  });

  it('the same peak with the ridge removed is visible', () => {
    const dem = makeDem(HALF_DEG, CELL_DEG, cone);
    const [r] = computeVisiblePeaks(dem, observer, [peak]);
    expect(r!.visible).toBe(true);
    expect(r!.occludedByM).toBe(0);
    expect(r!.azimuthDeg).toBeCloseTo(90, 6);
    expect(Math.abs(r!.distanceM - 10_000)).toBeLessThan(1);
    expect(r!.elevationAngleDeg).toBeCloseTo(11.27, 1);
  });

  it('a low ridge that does not reach the line of sight does not hide it', () => {
    const ridge = wallEast(3000, 400); // ≈7.6° < 11.3°
    const dem = makeDem(HALF_DEG, CELL_DEG, (x, y) => Math.max(ridge(x), cone(x, y)));
    expect(computeVisiblePeaks(dem, observer, [peak])[0]!.visible).toBe(true);
  });

  it('applies the 0.05° tolerance: grazing summits visible, clearly blocked ones hidden', () => {
    let sawGrazingVisible = false;
    let sawBlocked = false;
    for (let ridgeM = 560; ridgeM <= 660; ridgeM += 2) {
      const dem = makeDem(HALF_DEG, CELL_DEG, (x, y) =>
        Math.max(wallEast(3000, ridgeM)(x), cone(x, y)),
      );
      const [r] = computeVisiblePeaks(dem, observer, [peak]);
      const marginDeg = r!.blockingAngleDeg! - r!.elevationAngleDeg; // > 0: ridge above summit
      expect(r!.visible).toBe(marginDeg <= 0.05);
      if (marginDeg > 0 && marginDeg <= 0.05) sawGrazingVisible = true;
      if (marginDeg > 0.05) {
        sawBlocked = true;
        expect(r!.occludedByM).toBeGreaterThan(0);
      }
    }
    expect(sawGrazingVisible).toBe(true);
    expect(sawBlocked).toBe(true);
  });

  it('skips peaks beyond maxDistM and sorts by rank then distance', () => {
    const dem = makeDem(HALF_DEG, CELL_DEG, () => 0);
    const peaks = [
      { id: 'far-rank2', rank: 2, elevationM: 500, ...at(0, 8000) },
      { id: 'near-rank2', rank: 2, elevationM: 500, ...at(0, 4000) },
      { id: 'rank1', rank: 1, elevationM: 500, ...at(-9000, 0) },
      { id: 'too-far', rank: 1, elevationM: 500, ...at(0, 14_000) },
      { id: 'standing-on-it', rank: 1, elevationM: 5, ...at(30, 40) }, // 50 m away
    ];
    const ids = computeVisiblePeaks(dem, observer, peaks, { maxDistM: 12_000 }).map(
      (r) => r.peak.id,
    );
    expect(ids).toEqual(['rank1', 'near-rank2', 'far-rank2']);
  });
});
