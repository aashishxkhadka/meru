import { describe, expect, it } from '@jest/globals';

import { makeDem, wallEast } from '../../tests/syntheticDem';
import { toDegrees } from './angles';
import { EARTH_RADIUS_M, REFRACTION_K, curvatureDropM } from './geo';
import { buildSampleTable, computeHorizon, computeHorizonRay, horizonAngleAt } from './horizon';

const CELL_DEG = 0.001; // ~111 m
const HALF_DEG = 0.15; // DEM ±16.7 km
const observer = { lat: 0, lon: 0, elevationM: 2 };
const rayAt = (dem: Parameters<typeof computeHorizonRay>[0], az: number) =>
  computeHorizonRay(dem, observer, az, buildSampleTable());

describe('buildSampleTable', () => {
  it('steps 45 m to 10 km, then 90 m, up to maxDist', () => {
    const t = buildSampleTable({ maxDistM: 10_500 });
    const d = Array.from(t.distancesM);
    expect(d[0]).toBe(100);
    expect(d[1]).toBe(145);
    expect(d.filter((x) => x < 10_000).every((x, i, a) => i === 0 || x - a[i - 1]! === 45)).toBe(
      true,
    );
    expect(d[d.length - 1]! - d[d.length - 2]!).toBe(90);
    expect(d[d.length - 1]).toBeLessThanOrEqual(10_500);
  });
});

describe('computeHorizon on flat ground', () => {
  const flat = makeDem(HALF_DEG, CELL_DEG, () => 0);

  it('the skyline is the curved-earth horizon: dip ≈0.042° at ≈5.4 km for a 2 m eye', () => {
    // tan(angle) = −(h/d + d·k), k = (1 − K)/(2R): best at d = √(h/k), tan = −2√(h·k)
    const k = (1 - REFRACTION_K) / (2 * EARTH_RADIUS_M);
    const expectedDistM = Math.sqrt(2 / k);
    const expectedDeg = toDegrees(Math.atan(-2 * Math.sqrt(2 * k)));
    const h = computeHorizon(flat, observer);
    expect(h.rays).toHaveLength(1440);
    for (const ray of h.rays.filter((_, i) => i % 90 === 0)) {
      expect(ray.maxAngleDeg).toBeCloseTo(expectedDeg, 4);
      expect(Math.abs(ray.distAtMaxM - expectedDistM)).toBeLessThan(100);
    }
  });

  it('rays are spaced by azimuthStepDeg starting at north', () => {
    const h = computeHorizon(flat, observer, { azimuthStepDeg: 1 });
    expect(h.rays).toHaveLength(360);
    expect(h.rays[0]!.azimuthDeg).toBe(0);
    expect(h.rays[90]!.azimuthDeg).toBe(90);
  });
});

describe('computeHorizon with ridges', () => {
  it('a wall 5 km east shows at azimuth 90°, not at 270°', () => {
    const dem = makeDem(HALF_DEG, CELL_DEG, wallEast(5000, 1000));
    const east = rayAt(dem, 90);
    // nearest wall edge ≈ 4.85-4.9 km; angle ≈ atan((1000 − drop − 2) / d)
    expect(Math.abs(east.distAtMaxM - 4870)).toBeLessThan(150);
    const expected = toDegrees(
      Math.atan((1000 - curvatureDropM(east.distAtMaxM) - 2) / east.distAtMaxM),
    );
    expect(east.maxAngleDeg).toBeCloseTo(expected, 6);
    expect(east.maxAngleDeg).toBeGreaterThan(11);
    expect(rayAt(dem, 270).maxAngleDeg).toBeLessThan(0);
  });

  it('north is the top of the grid (north row first)', () => {
    const dem = makeDem(HALF_DEG, CELL_DEG, (_x, y) => (y > 4000 && y < 4300 ? 800 : 0));
    expect(rayAt(dem, 0).maxAngleDeg).toBeGreaterThan(9);
    expect(rayAt(dem, 180).maxAngleDeg).toBeLessThan(0);
  });

  it('records ridge layers nearest first with increasing angle', () => {
    const near = wallEast(3000, 300);
    const far = wallEast(10_000, 2000);
    const dem = makeDem(HALF_DEG, CELL_DEG, (x, y) => Math.max(near(x), far(x)) + 0 * y);
    const ray = rayAt(dem, 90);
    const big = ray.ridges.filter((r) => r.angleDeg > 1);
    expect(big).toHaveLength(2);
    expect(Math.abs(big[0]!.distanceM - 2870)).toBeLessThan(150);
    expect(Math.abs(big[1]!.distanceM - 9870)).toBeLessThan(150);
    expect(big[1]!.angleDeg).toBeGreaterThan(big[0]!.angleDeg);
    expect(ray.maxAngleDeg).toBeCloseTo(big[1]!.angleDeg, 9);
  });

  it('a far ridge hidden behind a near one is not a layer', () => {
    const near = wallEast(3000, 600); // ≈11.3°
    const far = wallEast(10_000, 1000); // ≈5.7°, hidden
    const dem = makeDem(HALF_DEG, CELL_DEG, (x) => Math.max(near(x), far(x)));
    const ray = rayAt(dem, 90);
    expect(ray.ridges.filter((r) => r.angleDeg > 1)).toHaveLength(1);
    expect(ray.distAtMaxM).toBeLessThan(3200);
  });

  it('stops at the DEM edge', () => {
    const dem = makeDem(HALF_DEG, CELL_DEG, (x) => x / 10); // slope rising to the east
    const ray = rayAt(dem, 90);
    expect(ray.distAtMaxM).toBeLessThanOrEqual(HALF_DEG * 111_195);
  });
});

describe('horizonAngleAt', () => {
  it('interpolates between rays and wraps around north', () => {
    const fake = {
      observer,
      azimuthStepDeg: 90,
      rays: [0, 10, 20, 30].map((a, i) => ({
        azimuthDeg: i * 90,
        maxAngleDeg: a,
        distAtMaxM: 0,
        ridges: [],
      })),
    };
    expect(horizonAngleAt(fake, 45)).toBeCloseTo(5, 9);
    expect(horizonAngleAt(fake, 315)).toBeCloseTo(15, 9); // between 30 (270°) and 0 (360°)
    expect(horizonAngleAt(fake, -45)).toBeCloseTo(15, 9);
  });
});
