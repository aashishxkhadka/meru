/**
 * Sensor smoothing (SPEC 6.7). Pure functions: the caller keeps the state between samples.
 *
 * - Angles (heading, roll) are smoothed on the unit circle (sin, cos) so 359° -> 1° moves
 *   2° the short way instead of swinging through 180°.
 * - A dead-band holds the output still for tiny changes, which stops label shimmer.
 */

import { toDegrees, toRadians, wrapTo180, wrapTo360 } from './angles';

export const DEFAULT_ALPHA = 0.15;
export const DEFAULT_DEADBAND_DEG = 0.2;

export interface SmoothingOptions {
  /** Low-pass factor per sample, 0..1. Higher = follows faster. ≈0.15 at 30–60 Hz. */
  alpha?: number;
  /** Output only moves when the filtered value differs from it by at least this much. */
  deadbandDeg?: number;
}

export interface AngleFilterState {
  /** Low-passed unit vector. */
  sin: number;
  cos: number;
  /** Value to display, degrees [0, 360). Changes only outside the dead-band. */
  outputDeg: number;
}

export interface ScalarFilterState {
  filtered: number;
  output: number;
}

/**
 * One step of the angle-aware low-pass. Pass `null` as state for the first sample.
 * Returns a new state; `state.outputDeg` is the smoothed angle in [0, 360).
 */
export function smoothAngleDeg(
  state: AngleFilterState | null,
  inputDeg: number,
  options: SmoothingOptions = {},
): AngleFilterState {
  const inputRad = toRadians(inputDeg);
  if (state === null || !Number.isFinite(state.outputDeg)) {
    return { sin: Math.sin(inputRad), cos: Math.cos(inputRad), outputDeg: wrapTo360(inputDeg) };
  }
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const deadbandDeg = options.deadbandDeg ?? DEFAULT_DEADBAND_DEG;

  const sin = state.sin + alpha * (Math.sin(inputRad) - state.sin);
  const cos = state.cos + alpha * (Math.cos(inputRad) - state.cos);
  // If the vector collapses (opposite inputs cancel), keep the previous direction.
  if (Math.hypot(sin, cos) < 1e-9) return { sin, cos, outputDeg: state.outputDeg };

  const filteredDeg = wrapTo360(toDegrees(Math.atan2(sin, cos)));
  const moved = Math.abs(wrapTo180(filteredDeg - state.outputDeg)) >= deadbandDeg;
  return { sin, cos, outputDeg: moved ? filteredDeg : state.outputDeg };
}

/** One step of a plain low-pass with dead-band, for values that do not wrap (pitch). */
export function smoothScalar(
  state: ScalarFilterState | null,
  input: number,
  options: SmoothingOptions = {},
): ScalarFilterState {
  if (state === null || !Number.isFinite(state.output)) return { filtered: input, output: input };
  const alpha = options.alpha ?? DEFAULT_ALPHA;
  const deadband = options.deadbandDeg ?? DEFAULT_DEADBAND_DEG;
  const filtered = state.filtered + alpha * (input - state.filtered);
  return {
    filtered,
    output: Math.abs(filtered - state.output) >= deadband ? filtered : state.output,
  };
}

/**
 * True heading from a magnetic heading and the local magnetic declination
 * (east positive). Fallback when the platform gives no true heading.
 */
export function trueHeadingFromMagneticDeg(magHeadingDeg: number, declinationDeg: number): number {
  return wrapTo360(magHeadingDeg + declinationDeg);
}
