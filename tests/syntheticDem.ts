/** Helpers to build small synthetic DEMs for horizon/visibility tests. */
import { type Dem, loadDem } from '../src/core/dem';
import { EARTH_RADIUS_M } from '../src/core/geo';

export const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180; // 111,194.93 m

/** Square DEM centred on (0, 0) on the equator. elevationFn gets metres east/north of centre. */
export function makeDem(
  halfSizeDeg: number,
  cellDeg: number,
  elevationFn: (eastM: number, northM: number) => number,
): Dem {
  const n = Math.round((2 * halfSizeDeg) / cellDeg);
  const values = new Int16Array(n * n);
  for (let row = 0; row < n; row++) {
    const lat = halfSizeDeg - (row + 0.5) * cellDeg; // north row first
    for (let col = 0; col < n; col++) {
      const lon = -halfSizeDeg + (col + 0.5) * cellDeg;
      values[row * n + col] = Math.round(elevationFn(lon * M_PER_DEG, lat * M_PER_DEG));
    }
  }
  return loadDem(values.buffer, {
    width: n,
    height: n,
    north: halfSizeDeg,
    south: -halfSizeDeg,
    west: -halfSizeDeg,
    east: halfSizeDeg,
    noData: -32768,
  });
}

/** A ridge (wall) of given height whose crest runs north-south at eastM, ~3 cells wide. */
export function wallEast(eastM: number, heightM: number, halfWidthM = 150) {
  return (x: number): number => (Math.abs(x - eastM) <= halfWidthM ? heightM : 0);
}

/** Point at the given offsets in metres from (0, 0). */
export function at(eastM: number, northM: number): { lat: number; lon: number } {
  return { lat: northM / M_PER_DEG, lon: eastM / M_PER_DEG };
}
