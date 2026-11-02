/** Pure angle helpers. No React / Expo imports allowed in src/core. */

/** Normalise an azimuth to [0, 360). */
export function wrapTo360(angleDeg: number): number {
  const wrappedDeg = angleDeg % 360;
  return wrappedDeg < 0 ? wrappedDeg + 360 : wrappedDeg;
}

/** Normalise a signed angle difference to [-180, 180). */
export function wrapTo180(angleDeg: number): number {
  return wrapTo360(angleDeg + 180) - 180;
}
