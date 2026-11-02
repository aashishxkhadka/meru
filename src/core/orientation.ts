/**
 * Device orientation for the back camera, from gravity + magnetic field (SPEC 6.7).
 * Pure TypeScript.
 *
 * Device axes (portrait, both iOS and Android): x = right, y = top of phone, z = out of the
 * screen towards the user. The back camera looks along −z.
 * `gravity` points DOWN in device coordinates (expo-sensors accelerationIncludingGravity:
 * lying face-up gives z ≈ −9.81 on both platforms). `magnetic` is the calibrated field (µT).
 *
 * This is a tilt-compensated compass: it works for any phone orientation (including held
 * upright, where platform "heading" values that track the top edge of the phone break down),
 * except when the camera points straight up or down.
 */

import { toDegrees, wrapTo360 } from './angles';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraOrientation {
  /** Direction the back camera faces, degrees clockwise from true north; null if undefined. */
  headingDeg: number | null;
  /** Camera elevation: 0 = horizon, +90 = straight up. */
  pitchDeg: number;
  /** Rotation about the camera axis: positive = phone turned clockwise (as the user sees it). */
  rollDeg: number;
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

/** Back-camera axis in device coordinates. */
const CAMERA: Vec3 = { x: 0, y: 0, z: -1 };

export function cameraOrientation(
  gravity: Vec3,
  magnetic: Vec3 | null,
  declinationDeg = 0,
): CameraOrientation | null {
  const g = norm(gravity);
  if (!(g > 1e-6)) return null;
  const up = scale(gravity, -1 / g); // world up in device coordinates

  const pitchDeg = toDegrees(Math.asin(Math.max(-1, Math.min(1, dot(CAMERA, up)))));
  const rollDeg = toDegrees(Math.atan2(-up.x, up.y));

  let headingDeg: number | null = null;
  if (magnetic) {
    const eastRaw = cross(magnetic, up); // horizontal, pointing magnetic east
    const eastLen = norm(eastRaw);
    // Camera pointing (almost) straight up/down: heading is undefined.
    if (eastLen > 1e-6 && Math.abs(pitchDeg) < 85) {
      const east = scale(eastRaw, 1 / eastLen);
      const north = cross(up, east);
      headingDeg = wrapTo360(
        toDegrees(Math.atan2(dot(CAMERA, east), dot(CAMERA, north))) + declinationDeg,
      );
    }
  }
  return { headingDeg, pitchDeg, rollDeg };
}

/** Earth's field is ~25–65 µT; far outside that means magnetic interference nearby. */
export function magneticFieldLooksDisturbed(magnetic: Vec3): boolean {
  const m = norm(magnetic);
  return m < 20 || m > 75;
}
