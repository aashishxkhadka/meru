/** Pure angle helpers. No React / Expo imports allowed in src/core. */

export function toRadians(angleDeg: number): number {
  return (angleDeg * Math.PI) / 180;
}

export function toDegrees(angleRad: number): number {
  return (angleRad * 180) / Math.PI;
}

/** Normalise an azimuth to [0, 360). */
export function wrapTo360(angleDeg: number): number {
  const wrappedDeg = angleDeg % 360;
  const positiveDeg = wrappedDeg < 0 ? wrappedDeg + 360 : wrappedDeg;
  // -1e-15 + 360 rounds to exactly 360 in floating point; keep the range half-open.
  return positiveDeg >= 360 ? 0 : positiveDeg;
}

/** Normalise a signed angle difference to [-180, 180). */
export function wrapTo180(angleDeg: number): number {
  return wrapTo360(angleDeg + 180) - 180;
}
