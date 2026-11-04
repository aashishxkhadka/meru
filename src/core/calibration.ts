/**
 * Manual calibration math (SPEC 3.3). Pure TypeScript.
 *
 * Offsets are applied in projectToScreen as heading' = heading + headingOffset and
 * pitch' = pitch + pitchOffset. Dragging the drawn skyline (or tapping where a peak really is)
 * moves screen content; these helpers turn such a screen shift into offset changes.
 */

import { toDegrees, toRadians } from './angles';
import {
  type CalibrationOffsets,
  type CameraPose,
  type CameraView,
  type ScreenPoint,
  projectToScreen,
} from './projection';

/** SPEC 3.3: heading offset ±20°, pitch offset ±10°. */
export const CALIBRATION_LIMITS = { headingDeg: 20, pitchDeg: 10 } as const;
/** Advanced horizontal FOV override range (portrait, visible on screen). */
export const FOV_OVERRIDE_RANGE = { minDeg: 20, maxDeg: 80 } as const;

const clamp = (v: number, lim: number) => Math.min(lim, Math.max(-lim, v));

export function clampOffsets(o: CalibrationOffsets): {
  offsets: CalibrationOffsets;
  clamped: boolean;
} {
  const offsets = {
    headingOffsetDeg: clamp(o.headingOffsetDeg, CALIBRATION_LIMITS.headingDeg),
    pitchOffsetDeg: clamp(o.pitchOffsetDeg, CALIBRATION_LIMITS.pitchDeg),
  };
  return {
    offsets,
    clamped:
      offsets.headingOffsetDeg !== o.headingOffsetDeg ||
      offsets.pitchOffsetDeg !== o.pitchOffsetDeg,
  };
}

/** Angles of a screen point from the optical axis, in the camera's own frame (roll removed). */
function cameraAnglesDeg(p: ScreenPoint, pose: CameraPose, view: CameraView) {
  const cx = view.widthPx / 2;
  const cy = view.heightPx / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const r = toRadians(pose.rollDeg);
  // inverse of projectToScreen's rotation by −roll
  const px = dx * Math.cos(r) - dy * Math.sin(r);
  const py = dx * Math.sin(r) + dy * Math.cos(r);
  const fx = cx / Math.tan(toRadians(view.hFovDeg / 2));
  const fy = cy / Math.tan(toRadians(view.vFovDeg / 2));
  return { xDeg: toDegrees(Math.atan(px / fx)), yDeg: toDegrees(Math.atan(py / fy)) };
}

/**
 * Offsets after moving screen content from `from` to `to` (e.g. a drag). Unclamped.
 * Moving content right means the camera "looks" further left: heading offset decreases.
 * Moving content down means the camera looks higher: pitch offset increases.
 */
export function shiftOffsets(
  current: CalibrationOffsets,
  from: ScreenPoint,
  to: ScreenPoint,
  pose: CameraPose,
  view: CameraView,
): CalibrationOffsets {
  const a = cameraAnglesDeg(from, pose, view);
  const b = cameraAnglesDeg(to, pose, view);
  return {
    headingOffsetDeg: current.headingOffsetDeg - (b.xDeg - a.xDeg),
    pitchOffsetDeg: current.pitchOffsetDeg + (b.yDeg - a.yDeg),
  };
}

/**
 * Offsets that put a target (azimuth/elevation) exactly at a screen point: "tap a peak label,
 * then tap where that peak really is". A few refinement passes make it exact off-centre and
 * with roll. Null if the target is behind the camera.
 */
export function alignTargetToPoint(
  azimuthDeg: number,
  elevationDeg: number,
  target: ScreenPoint,
  pose: CameraPose,
  view: CameraView,
  current: CalibrationOffsets,
): { offsets: CalibrationOffsets; clamped: boolean } | null {
  let o = current;
  for (let i = 0; i < 4; i++) {
    const p = projectToScreen(azimuthDeg, elevationDeg, pose, view, o, 180);
    if (!p) return null;
    o = shiftOffsets(o, p, target, pose, view);
  }
  return clampOffsets(o);
}

/** View with a user-set horizontal FOV; vertical FOV follows the screen's aspect ratio. */
export function viewWithFovOverride(view: CameraView, hFovDeg: number | null): CameraView {
  if (hFovDeg === null) return view;
  const tanV = Math.tan(toRadians(hFovDeg / 2)) * (view.heightPx / view.widthPx);
  return { ...view, hFovDeg, vFovDeg: toDegrees(2 * Math.atan(tanV)) };
}

/** Parse persisted calibration; anything invalid falls back to "not calibrated". */
export function parseCalibration(raw: unknown): {
  offsets: CalibrationOffsets;
  hFovOverrideDeg: number | null;
  calibratedAt: number | null;
} | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const h = num(r.headingOffsetDeg);
  const p = num(r.pitchOffsetDeg);
  if (h === null || p === null) return null;
  const fov = num(r.hFovOverrideDeg);
  return {
    offsets: clampOffsets({ headingOffsetDeg: h, pitchOffsetDeg: p }).offsets,
    hFovOverrideDeg:
      fov !== null && fov >= FOV_OVERRIDE_RANGE.minDeg && fov <= FOV_OVERRIDE_RANGE.maxDeg
        ? fov
        : null,
    calibratedAt: num(r.calibratedAt),
  };
}
