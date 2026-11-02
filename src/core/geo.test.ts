import { describe, expect, it } from '@jest/globals';

import {
  EARTH_RADIUS_M,
  curvatureDropM,
  destinationPoint,
  elevationAngleDeg,
  haversineDistanceM,
  initialBearingDeg,
} from './geo';

const ONE_DEGREE_ARC_M = (EARTH_RADIUS_M * Math.PI) / 180; // 111,194.93 m on our sphere

function expectWithinFraction(actual: number, expected: number, fraction: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * fraction);
}

describe('haversineDistanceM', () => {
  it('one degree along a meridian is R·π/180', () => {
    expect(haversineDistanceM({ lat: 28, lon: 84 }, { lat: 29, lon: 84 })).toBeCloseTo(
      ONE_DEGREE_ARC_M,
      3,
    );
  });

  it('one degree along the equator is R·π/180', () => {
    expect(haversineDistanceM({ lat: 0, lon: 10 }, { lat: 0, lon: 11 })).toBeCloseTo(
      ONE_DEGREE_ARC_M,
      3,
    );
  });

  it('matches the reference Valparaíso -> Shanghai great circle within 0.1%', () => {
    // Wikipedia "Great-circle navigation" worked example: σ = 168.56°, s = 18,743 km (R = 6371 km)
    const distanceM = haversineDistanceM({ lat: -33, lon: -71.6 }, { lat: 31.4, lon: 121.8 });
    expectWithinFraction(distanceM, 18_743_000, 0.001);
  });

  it('is zero for identical points and symmetric', () => {
    const a = { lat: 28.24625, lon: 83.94881 };
    const b = { lat: 28.49798, lon: 83.945876 };
    expect(haversineDistanceM(a, a)).toBe(0);
    expect(haversineDistanceM(a, b)).toBeCloseTo(haversineDistanceM(b, a), 6);
  });
});

describe('initialBearingDeg', () => {
  const origin = { lat: 28.2, lon: 83.9 };

  it('gives the cardinal directions', () => {
    expect(initialBearingDeg(origin, { lat: 28.3, lon: 83.9 })).toBeCloseTo(0, 6);
    expect(initialBearingDeg(origin, { lat: 28.1, lon: 83.9 })).toBeCloseTo(180, 6);
    expect(initialBearingDeg({ lat: 0, lon: 10 }, { lat: 0, lon: 11 })).toBeCloseTo(90, 6);
    expect(initialBearingDeg({ lat: 0, lon: 10 }, { lat: 0, lon: 9 })).toBeCloseTo(270, 6);
  });

  it('matches the reference Valparaíso -> Shanghai initial course', () => {
    // Wikipedia worked example: α1 = −94.41° -> 265.59° clockwise from north
    const bearingDeg = initialBearingDeg({ lat: -33, lon: -71.6 }, { lat: 31.4, lon: 121.8 });
    expect(Math.abs(bearingDeg - 265.59)).toBeLessThan(0.02);
  });

  it('always returns [0, 360), including just west of north', () => {
    const bearingDeg = initialBearingDeg(origin, { lat: 28.3, lon: 83.8999 });
    expect(bearingDeg).toBeGreaterThan(359);
    expect(bearingDeg).toBeLessThan(360);
  });
});

describe('destinationPoint', () => {
  it('moving 1° of arc north adds 1° of latitude', () => {
    const p = destinationPoint({ lat: 28, lon: 84 }, 0, ONE_DEGREE_ARC_M);
    expect(p.lat).toBeCloseTo(29, 9);
    expect(p.lon).toBeCloseTo(84, 9);
  });

  it('round-trips with distance and bearing', () => {
    const origin = { lat: 28.24625, lon: 83.94881 };
    for (const bearingDeg of [0, 17, 90, 133.3, 180, 241, 270, 359.5]) {
      for (const distanceM of [100, 5_000, 45_000, 150_000]) {
        const p = destinationPoint(origin, bearingDeg, distanceM);
        expectWithinFraction(haversineDistanceM(origin, p), distanceM, 1e-9);
        const back = initialBearingDeg(origin, p);
        expect(Math.abs(((back - bearingDeg + 540) % 360) - 180)).toBeLessThan(1e-6);
      }
    }
  });

  it('wraps longitude across the antimeridian', () => {
    const p = destinationPoint({ lat: 0, lon: 179.9 }, 90, ONE_DEGREE_ARC_M * 0.2);
    expect(p.lon).toBeCloseTo(-179.9, 6);
  });
});

describe('curvatureDropM', () => {
  it('is ≈683 m at 100 km (785 m geometric × (1 − 0.13))', () => {
    expect(curvatureDropM(100_000)).toBeCloseTo(682.78, 1);
  });

  it('grows with the square of distance and is zero at zero', () => {
    expect(curvatureDropM(0)).toBe(0);
    expect(curvatureDropM(20_000) / curvatureDropM(10_000)).toBeCloseTo(4, 9);
  });
});

describe('elevationAngleDeg', () => {
  it('a target at eye level 10 km away appears slightly below horizontal', () => {
    // drop = 6.83 m -> atan(6.83 / 10000) = 0.0391°
    expect(elevationAngleDeg(1000, 1000, 10_000)).toBeCloseTo(-0.0391, 3);
  });

  it('a target 1000 m higher at 1000 m is ≈45° up', () => {
    expect(elevationAngleDeg(0, 1000, 1000)).toBeCloseTo(45, 2);
  });

  it('curvature hides a same-height summit far away more than a near one', () => {
    expect(elevationAngleDeg(1500, 7000, 100_000)).toBeLessThan(
      (Math.atan2(5500, 100_000) * 180) / Math.PI,
    );
  });

  it('a lower target below the observer gives a negative angle', () => {
    expect(elevationAngleDeg(1600, 800, 3000)).toBeLessThan(0);
  });
});
