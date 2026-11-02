/** Shared panorama geometry (no Skia imports, safe to load before CanvasKit on web). */
import { wrapTo360 } from '../../core/angles';
import type { Horizon } from '../../core/horizon';

export const H_FOV_DEG = 60;
export const LABEL_ROW_HEIGHT = 38;
export const LABEL_ROWS = 3;
export const LABEL_AREA = LABEL_ROWS * LABEL_ROW_HEIGHT + 10;
export const AXIS_HEIGHT = 30;

export interface PanoramaLayout {
  width: number;
  height: number;
  pxPerDegX: number;
  pxPerDegY: number;
  /** Elevation angles at the top and bottom of the terrain area. */
  topDeg: number;
  bottomDeg: number;
  terrainTop: number;
  terrainBottom: number;
  /** Width of the full 360° strip in px. */
  stripWidth: number;
}

export function makeLayout(horizon: Horizon, width: number, height: number): PanoramaLayout {
  const angles = horizon.rays
    .map((r) => r.maxAngleDeg)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const maxDeg = angles[angles.length - 1] ?? 5;
  const lowDeg = angles[Math.floor(angles.length * 0.05)] ?? -2;
  const topDeg = maxDeg + 1.5;
  const bottomDeg = Math.max(-5, Math.min(-1, lowDeg - 1));
  const terrainTop = LABEL_AREA;
  const terrainBottom = height - AXIS_HEIGHT;
  const pxPerDegX = width / H_FOV_DEG;
  return {
    width,
    height,
    pxPerDegX,
    pxPerDegY: (terrainBottom - terrainTop) / (topDeg - bottomDeg),
    topDeg,
    bottomDeg,
    terrainTop,
    terrainBottom,
    stripWidth: 360 * pxPerDegX,
  };
}

export const yOfAngle = (l: PanoramaLayout, angleDeg: number) =>
  l.terrainTop + (l.topDeg - angleDeg) * l.pxPerDegY;

/** Screen x of an azimuth for a view centred on centerDeg (may be off screen). */
export const xOfAzimuth = (l: PanoramaLayout, centerDeg: number, azimuthDeg: number) =>
  wrapTo360(azimuthDeg - (centerDeg - H_FOV_DEG / 2)) * l.pxPerDegX;
