/**
 * Azimuth/elevation -> screen x/y for the live camera view (SPEC 6.5). Pure TypeScript.
 *
 * Exact pinhole model: the target direction is rotated into the camera frame (heading, then
 * pitch), divided by depth, scaled by the field of view and finally rotated by −roll about the
 * screen centre. At the screen's centre row this is identical to the SPEC's
 * x = cx + tan(dAz)/tan(hFov/2)·w/2, y = cy − tan(dEl)/tan(vFov/2)·h/2; off-centre it stays
 * correct where that shortcut drifts by up to ~0.5° near the corners.
 */

import { toDegrees, toRadians, wrapTo180 } from './angles';

export interface CameraPose {
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface CameraView {
  widthPx: number;
  heightPx: number;
  /** Field of view actually visible on screen (after any crop to fill the screen). */
  hFovDeg: number;
  vFovDeg: number;
}

export interface CalibrationOffsets {
  headingOffsetDeg: number;
  pitchOffsetDeg: number;
}

export const NO_CALIBRATION: CalibrationOffsets = { headingOffsetDeg: 0, pitchOffsetDeg: 0 };
/** SPEC 6.5 default for a portrait main camera when the device reports nothing. */
export const DEFAULT_SENSOR_FOV = { hFovDeg: 50, vFovDeg: 66 };

export interface ScreenPoint {
  x: number;
  y: number;
}

export function projectToScreen(
  azimuthDeg: number,
  elevationDeg: number,
  pose: CameraPose,
  view: CameraView,
  calibration: CalibrationOffsets = NO_CALIBRATION,
  marginDeg = 5,
): ScreenPoint | null {
  const dAzDeg = wrapTo180(azimuthDeg - (pose.headingDeg + calibration.headingOffsetDeg));
  if (Math.abs(dAzDeg) > view.hFovDeg / 2 + marginDeg) return null;

  const dAz = toRadians(dAzDeg);
  const el = toRadians(elevationDeg);
  const pitch = toRadians(pose.pitchDeg + calibration.pitchOffsetDeg);
  // target in the heading-aligned frame: right, forward, up
  const right = Math.cos(el) * Math.sin(dAz);
  const fwd0 = Math.cos(el) * Math.cos(dAz);
  const up0 = Math.sin(el);
  // tilt by camera pitch about the right axis
  const forward = fwd0 * Math.cos(pitch) + up0 * Math.sin(pitch);
  const up = up0 * Math.cos(pitch) - fwd0 * Math.sin(pitch);
  if (forward <= 1e-6) return null; // behind the camera

  const cx = view.widthPx / 2;
  const cy = view.heightPx / 2;
  const px = (right / forward / Math.tan(toRadians(view.hFovDeg / 2))) * cx;
  const py = -(up / forward / Math.tan(toRadians(view.vFovDeg / 2))) * cy;

  // screen content rotates opposite to the phone's roll
  const r = toRadians(-pose.rollDeg);
  return {
    x: cx + px * Math.cos(r) - py * Math.sin(r),
    y: cy + px * Math.sin(r) + py * Math.cos(r),
  };
}

/** Sensor FOV (portrait) from a 35 mm-equivalent focal length, assuming a 4:3 sensor. */
export function sensorFovFromFocalLength35mm(focalLengthMm: number): {
  hFovDeg: number;
  vFovDeg: number;
} {
  const diagonalMm = Math.hypot(36, 24); // 35 mm-equivalent is defined by the diagonal
  const shortMm = (diagonalMm * 3) / 5;
  const longMm = (diagonalMm * 4) / 5;
  return {
    hFovDeg: toDegrees(2 * Math.atan(shortMm / 2 / focalLengthMm)),
    vFovDeg: toDegrees(2 * Math.atan(longMm / 2 / focalLengthMm)),
  };
}

/**
 * FOV visible on screen when the preview fills a view of the given size ("cover" crops the
 * sensor image on one axis to match the view's aspect ratio).
 */
export function visibleFovForCover(
  sensor: { hFovDeg: number; vFovDeg: number },
  widthPx: number,
  heightPx: number,
): { hFovDeg: number; vFovDeg: number } {
  const tanH = Math.tan(toRadians(sensor.hFovDeg / 2));
  const tanV = Math.tan(toRadians(sensor.vFovDeg / 2));
  const viewAspect = widthPx / heightPx;
  if (viewAspect < tanH / tanV) {
    // view narrower than sensor: full height visible, sides cropped
    return { hFovDeg: toDegrees(2 * Math.atan(tanV * viewAspect)), vFovDeg: sensor.vFovDeg };
  }
  return { hFovDeg: sensor.hFovDeg, vFovDeg: toDegrees(2 * Math.atan(tanH / viewAspect)) };
}
