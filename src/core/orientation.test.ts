import { describe, expect, it } from '@jest/globals';

import { wrapTo180 } from './angles';
import { type Vec3, cameraOrientation, magneticFieldLooksDisturbed } from './orientation';

const rad = (d: number) => (d * Math.PI) / 180;
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/**
 * What the sensors would report for a phone whose back camera faces `headingDeg` (true),
 * tilted `pitchDeg` up, turned `rollDeg` clockwise. World axes: x East, y North, z Up.
 */
function simulate(headingDeg: number, pitchDeg: number, rollDeg: number, declinationDeg = 0) {
  const H = rad(headingDeg);
  const P = rad(pitchDeg);
  const R = rad(rollDeg);
  const cam: Vec3 = { x: Math.sin(H) * Math.cos(P), y: Math.cos(H) * Math.cos(P), z: Math.sin(P) };
  const z: Vec3 = { x: -cam.x, y: -cam.y, z: -cam.z }; // device z = towards the user
  const y0: Vec3 = { x: -Math.sin(H) * Math.sin(P), y: -Math.cos(H) * Math.sin(P), z: Math.cos(P) };
  const x0 = cross(y0, z);
  const x: Vec3 = {
    x: x0.x * Math.cos(R) - y0.x * Math.sin(R),
    y: x0.y * Math.cos(R) - y0.y * Math.sin(R),
    z: x0.z * Math.cos(R) - y0.z * Math.sin(R),
  };
  const y: Vec3 = {
    x: x0.x * Math.sin(R) + y0.x * Math.cos(R),
    y: x0.y * Math.sin(R) + y0.y * Math.cos(R),
    z: x0.z * Math.sin(R) + y0.z * Math.cos(R),
  };
  const toDevice = (w: Vec3): Vec3 => ({ x: dot(w, x), y: dot(w, y), z: dot(w, z) });
  const inclination = rad(43); // Pokhara: field dips ~43° below horizontal
  const D = rad(declinationDeg);
  const magneticWorld: Vec3 = {
    x: 45 * Math.sin(D) * Math.cos(inclination),
    y: 45 * Math.cos(D) * Math.cos(inclination),
    z: -45 * Math.sin(inclination),
  };
  return { gravity: toDevice({ x: 0, y: 0, z: -9.81 }), magnetic: toDevice(magneticWorld) };
}

describe('cameraOrientation', () => {
  it('phone upright facing north: heading 0, pitch 0, roll 0', () => {
    const { gravity, magnetic } = simulate(0, 0, 0);
    expect(gravity.y).toBeCloseTo(-9.81, 6); // matches expo-sensors: down = −y when upright
    const o = cameraOrientation(gravity, magnetic)!;
    expect(o.headingDeg).toBeCloseTo(0, 6);
    expect(o.pitchDeg).toBeCloseTo(0, 6);
    expect(o.rollDeg).toBeCloseTo(0, 6);
  });

  it('recovers heading, pitch and roll for many poses, including upright', () => {
    for (const h of [0, 37, 90, 181, 270, 359])
      for (const p of [-40, -10, 0, 5, 25, 60])
        for (const r of [-25, 0, 8, 30]) {
          const { gravity, magnetic } = simulate(h, p, r);
          const o = cameraOrientation(gravity, magnetic)!;
          expect(Math.abs(wrapTo180(o.headingDeg! - h))).toBeLessThan(1e-6);
          expect(o.pitchDeg).toBeCloseTo(p, 6);
          expect(o.rollDeg).toBeCloseTo(r, 6);
        }
  });

  it('applies magnetic declination to give true heading', () => {
    const { gravity, magnetic } = simulate(100, 5, 0, -3); // magnetic north 3° west of true
    const o = cameraOrientation(gravity, magnetic, -3)!;
    expect(o.headingDeg).toBeCloseTo(100, 6);
  });

  it('pitch sign: tilting the top towards you points the camera up', () => {
    // camera tilted up 20° (top of phone towards you): gravity gains a +z component
    const { gravity } = simulate(0, 20, 0);
    expect(gravity.z).toBeGreaterThan(0);
    expect(cameraOrientation(gravity, null)!.pitchDeg).toBeCloseTo(20, 6);
  });

  it('lying flat face-up: camera straight down, heading undefined', () => {
    const o = cameraOrientation({ x: 0, y: 0, z: -9.81 }, { x: 0, y: 30, z: -30 })!;
    expect(o.pitchDeg).toBeCloseTo(-90, 6);
    expect(o.headingDeg).toBeNull();
  });

  it('works without a magnetometer (heading null) and rejects zero gravity', () => {
    expect(cameraOrientation({ x: 0, y: -9.81, z: 0 }, null)!.headingDeg).toBeNull();
    expect(cameraOrientation({ x: 0, y: 0, z: 0 }, null)).toBeNull();
  });
});

describe('magneticFieldLooksDisturbed', () => {
  it('flags fields far from Earth-normal strength', () => {
    expect(magneticFieldLooksDisturbed({ x: 0, y: 32, z: -30 })).toBe(false); // ~44 µT
    expect(magneticFieldLooksDisturbed({ x: 0, y: 150, z: 0 })).toBe(true);
    expect(magneticFieldLooksDisturbed({ x: 0, y: 5, z: 0 })).toBe(true);
  });
});
