/** Shared panorama geometry (no Skia imports, safe to load before CanvasKit on web). */
import { wrapTo360 } from '../../core/angles';
import type { Horizon } from '../../core/horizon';

/** Visible width of the panorama; same as the default portrait camera FOV (SPEC 6.5). */
export const H_FOV_DEG = 50;
export const LABEL_ROW_HEIGHT = 34;
/** Panorama has room for a 4th row; the camera overlay keeps SPEC 6.6's 3. */
export const LABEL_ROWS = 4;
export const AXIS_HEIGHT = 28;
/** Peaks never look more than this many times steeper than reality. */
const MAX_VERTICAL_EXAGGERATION = 4;

export interface PanoramaLayout {
  width: number;
  height: number;
  pxPerDegX: number;
  pxPerDegY: number;
  topDeg: number;
  bottomDeg: number;
  /** Bottom of the label rows (row 0 sits just above this). */
  labelBottom: number;
  terrainTop: number;
  terrainBottom: number;
  stripWidth: number;
}

/** topInset: space kept clear for overlays (e.g. the location bar) above the labels. */
export function makeLayout(
  horizon: Horizon,
  width: number,
  height: number,
  topInset = 0,
): PanoramaLayout {
  const angles = horizon.rays
    .map((r) => r.maxAngleDeg)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const maxDeg = angles[angles.length - 1] ?? 5;
  const lowDeg = angles[Math.floor(angles.length * 0.05)] ?? -2;
  const topDeg = maxDeg + 1;
  // Show at most ~13° below the top: the mountains matter, not the foreground slope.
  const bottomDeg = Math.max(-4, topDeg - 13, Math.min(-1, lowDeg - 1));
  const pxPerDegX = width / H_FOV_DEG;

  const minLabelBottom = topInset + LABEL_ROWS * LABEL_ROW_HEIGHT + 8;
  const terrainBottom = height - AXIS_HEIGHT;
  const available = terrainBottom - (minLabelBottom + 12);
  const pxPerDegY = Math.min(
    available / (topDeg - bottomDeg),
    pxPerDegX * MAX_VERTICAL_EXAGGERATION,
  );
  // Terrain sits on the bottom; labels sit just above the highest skyline point (short leader
  // lines); any remaining height is sky above them.
  const terrainTop = terrainBottom - (topDeg - bottomDeg) * pxPerDegY;
  const labelBottom = Math.max(minLabelBottom, terrainTop);
  return {
    width,
    height,
    pxPerDegX,
    pxPerDegY,
    topDeg,
    bottomDeg,
    labelBottom,
    terrainTop,
    terrainBottom,
    stripWidth: 360 * pxPerDegX,
  };
}

export const yOfAngle = (l: PanoramaLayout, angleDeg: number) =>
  l.terrainTop + (l.topDeg - angleDeg) * l.pxPerDegY;

export const xOfAzimuth = (l: PanoramaLayout, centerDeg: number, azimuthDeg: number) =>
  wrapTo360(azimuthDeg - (centerDeg - H_FOV_DEG / 2)) * l.pxPerDegX;
