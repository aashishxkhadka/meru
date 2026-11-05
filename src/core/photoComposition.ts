/**
 * Photo export layout (SPEC 8). Pure TypeScript.
 *
 * Given a captured still (size + camera pose at capture), the precomputed horizon and visible
 * peaks, this works out everything to draw on the exported image: the skyline, label pills with
 * leader lines, and the bottom frame (wordmark, place, date, "Peaks: …"). The result is a plain
 * draw list in still pixels, so the device (Skia) and the Node preview script render the exact
 * same layout. Text widths come from an injected `measure` so real font metrics are used.
 */

import { toDegrees, toRadians } from './angles';
import { declutterLabels } from './declutter';
import { type LatLon, haversineDistanceM } from './geo';
import {
  type CalibrationOffsets,
  type CameraPose,
  type CameraView,
  type ScreenPoint,
  projectToScreen,
  visibleFovForCover,
} from './projection';

export type FontWeight = 'regular' | 'semibold' | 'bold';

export interface FontSpec {
  sizePx: number;
  weight: FontWeight;
  /** Extra space between letters, in px (wordmark). */
  letterSpacingPx?: number;
}

/** Width in px of `text` drawn with `font`. */
export type MeasureText = (text: string, font: FontSpec) => number;

export interface PhotoPeak {
  id: string;
  name: string;
  rank: number;
  elevationM: number;
  distanceM: number;
  azimuthDeg: number;
  elevationAngleDeg: number;
}

export interface PhotoText {
  text: string;
  /** Left edge of the text. */
  x: number;
  baselineY: number;
  font: FontSpec;
  color: string;
}

export interface PhotoLabel {
  id: string;
  name: string;
  main: boolean;
  /** Label pill. */
  box: { left: number; top: number; width: number; height: number; radius: number };
  texts: PhotoText[];
  /** Leader line from under the pill to the summit. */
  leader: ScreenPoint[];
  summit: ScreenPoint;
  dotRadiusPx: number;
}

export interface PhotoComposition {
  /** Output image size (photo + bottom frame). */
  widthPx: number;
  heightPx: number;
  photoHeightPx: number;
  /** UI scale relative to a ~400 pt wide phone screen. */
  scale: number;
  /** Skyline polylines (broken where rays leave the photo). */
  skyline: ScreenPoint[][];
  skylineWidthPx: number;
  labels: PhotoLabel[];
  frame: { top: number; height: number; texts: PhotoText[]; dividerY: number };
  /** Names in the "Peaks:" line, left to right. */
  peakNames: string[];
}

export interface PhotoCompositionInput {
  photoWidthPx: number;
  photoHeightPx: number;
  pose: CameraPose;
  view: CameraView;
  calibration: CalibrationOffsets;
  horizonRays: readonly { azimuthDeg: number; maxAngleDeg: number }[];
  /** Visible peaks only. */
  peaks: readonly PhotoPeak[];
  appName: string;
  placeName: string;
  dateText: string;
  peaksPrefix: string;
  /** e.g. (n) => `+${n} more` */
  moreText: (n: number) => string;
  measure: MeasureText;
}

export const PHOTO_COLORS = {
  frameBg: '#0b1220',
  text: '#ffffff',
  muted: '#9fb0c8',
  accent: '#f2a541',
  labelBg: 'rgba(11,18,32,0.78)',
  labelSub: '#c3cfdf',
  line: 'rgba(255,255,255,0.8)',
  skyline: 'rgba(255,255,255,0.85)',
  skylineShadow: 'rgba(0,0,0,0.25)',
  divider: '#26344d',
} as const;

/** Reference width the on-screen label sizes were designed for. */
const REFERENCE_WIDTH_PT = 400;
/** One more row than the live view: a still has room, and text must never overlap. */
const LABEL_ROWS = 4;
const MAX_LABELS = 12;
const MAX_PEAK_LINES = 2;

/**
 * Field of view of a still photo. The still covers the whole sensor (its own aspect ratio), not
 * the screen crop. A hand-set FOV (calibration) was set on the screen's visible width; it is
 * applied to the still as the same correction factor on the lens.
 */
export function stillPhotoView(
  sensorFov: { hFovDeg: number; vFovDeg: number },
  photoWidthPx: number,
  photoHeightPx: number,
  screenAutoHFovDeg: number,
  hFovOverrideDeg: number | null,
): CameraView {
  let fov = sensorFov;
  if (hFovOverrideDeg !== null) {
    const k = Math.tan(toRadians(hFovOverrideDeg / 2)) / Math.tan(toRadians(screenAutoHFovDeg / 2));
    fov = {
      hFovDeg: toDegrees(2 * Math.atan(k * Math.tan(toRadians(sensorFov.hFovDeg / 2)))),
      vFovDeg: toDegrees(2 * Math.atan(k * Math.tan(toRadians(sensorFov.vFovDeg / 2)))),
    };
  }
  return {
    widthPx: photoWidthPx,
    heightPx: photoHeightPx,
    ...visibleFovForCover(fov, photoWidthPx, photoHeightPx),
  };
}

export const formatPeakSubtitle = (elevationM: number, distanceM: number) =>
  `${elevationM.toLocaleString('en-US')} m · ${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;

export function composePhoto(input: PhotoCompositionInput): PhotoComposition {
  const { photoWidthPx: w, photoHeightPx: h, pose, view, calibration, measure } = input;
  const s = w / REFERENCE_WIDTH_PT;

  // --- skyline
  const skyline: ScreenPoint[][] = [];
  let current: ScreenPoint[] | null = null;
  let topY = h;
  for (const ray of input.horizonRays) {
    const p = Number.isFinite(ray.maxAngleDeg)
      ? projectToScreen(ray.azimuthDeg, ray.maxAngleDeg, pose, view, calibration, 2)
      : null;
    if (!p) {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      skyline.push(current);
    }
    current.push(p);
    if (p.x >= 0 && p.x <= w) topY = Math.min(topY, p.y);
  }
  // Rays run 0→360°: if both ends are in view, the last piece continues into the first.
  const first = input.horizonRays[0];
  const firstPiece = skyline[0];
  if (
    skyline.length > 1 &&
    current !== null &&
    first &&
    firstPiece &&
    projectToScreen(first.azimuthDeg, first.maxAngleDeg, pose, view, calibration, 2) !== null
  ) {
    skyline[0] = [...skyline.pop()!, ...firstPiece];
  }

  // --- labels (same look as the live view, scaled to the photo)
  const rowH = 34 * s;
  const boxH = 28 * s;
  const padX = 7 * s;
  const nameFont: FontSpec = { sizePx: 12 * s, weight: 'semibold' };
  const nameMainFont: FontSpec = { sizePx: 12.5 * s, weight: 'bold' };
  const subFont: FontSpec = { sizePx: 10.5 * s, weight: 'regular' };

  const onPhoto: { peak: PhotoPeak; x: number; y: number; sub: string }[] = [];
  for (const pk of input.peaks) {
    const p = projectToScreen(pk.azimuthDeg, pk.elevationAngleDeg, pose, view, calibration, 0);
    if (!p || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
    onPhoto.push({
      peak: pk,
      x: p.x,
      y: p.y,
      sub: formatPeakSubtitle(pk.elevationM, pk.distanceM),
    });
  }
  const byId = new Map(onPhoto.map((o) => [o.peak.id, o]));
  // Forced labels overlap a more important label placed before them: fine on a live screen
  // you can move, but text printed over text spoils a photo, so they are left out here.
  const placed = declutterLabels(
    onPhoto.map((o) => {
      const main = o.peak.rank === 1;
      const nameW = measure(o.peak.name, main ? nameMainFont : nameFont);
      return {
        id: o.peak.id,
        rank: o.peak.rank,
        elevationM: o.peak.elevationM,
        anchorX: o.x,
        widthPx: Math.ceil(Math.max(nameW, measure(o.sub, subFont)) + 2 * padX + 2 * s),
        compactWidthPx: Math.ceil(nameW + 2 * padX + 2 * s),
      };
    }),
    {
      screenWidthPx: w,
      rowCount: LABEL_ROWS,
      maxLabels: MAX_LABELS,
      gapPx: 4 * s,
      edgeMarginPx: 6 * s,
      maxShiftPx: 140 * s,
    },
  ).filter((p) => !p.forced);
  const minBottom = 16 * s + LABEL_ROWS * rowH;
  const labelBottom = Math.min(Math.max(minBottom, topY - 10 * s), h * 0.7);

  const labels: PhotoLabel[] = placed.map((p) => {
    const o = byId.get(p.id)!;
    const main = o.peak.rank === 1;
    const top = labelBottom - (p.row + 1) * rowH;
    const lineTop = top + rowH - 4 * s;
    const lineX = Math.min(Math.max(p.anchorX, p.left + 6 * s), p.right - 6 * s);
    const texts: PhotoText[] = [];
    const font = main ? nameMainFont : nameFont;
    if (p.compact) {
      texts.push({
        text: o.peak.name,
        x: p.left + padX,
        baselineY: top + boxH / 2 + font.sizePx * 0.36,
        font,
        color: PHOTO_COLORS.text,
      });
    } else {
      texts.push({
        text: o.peak.name,
        x: p.left + padX,
        baselineY: top + 13 * s,
        font,
        color: PHOTO_COLORS.text,
      });
      texts.push({
        text: o.sub,
        x: p.left + padX,
        baselineY: top + 24.5 * s,
        font: subFont,
        color: PHOTO_COLORS.labelSub,
      });
    }
    const leader: ScreenPoint[] =
      lineX !== p.anchorX
        ? [
            { x: lineX, y: lineTop },
            { x: p.anchorX, y: lineTop },
            { x: p.anchorX, y: o.y },
          ]
        : [
            { x: p.anchorX, y: lineTop },
            { x: p.anchorX, y: o.y },
          ];
    return {
      id: p.id,
      name: o.peak.name,
      main,
      box: { left: p.left, top, width: p.right - p.left, height: boxH, radius: 7 * s },
      texts,
      leader,
      summit: { x: p.anchorX, y: o.y },
      dotRadiusPx: 3.5 * s,
    };
  });

  // --- bottom frame
  const peakNames = [...labels].sort((a, b) => a.summit.x - b.summit.x).map((l) => l.name);
  const pad = 18 * s;
  const wordmarkFont: FontSpec = { sizePx: 22 * s, weight: 'bold', letterSpacingPx: 3 * s };
  const dateFont: FontSpec = { sizePx: 11 * s, weight: 'regular' };
  const placeFont: FontSpec = { sizePx: 14 * s, weight: 'semibold' };
  const peaksFont: FontSpec = { sizePx: 11.5 * s, weight: 'regular' };
  const peaksLineH = 16 * s;

  const texts: PhotoText[] = [];
  const frameTop = h;
  let y = frameTop + pad + wordmarkFont.sizePx * 0.8;
  texts.push({
    text: input.appName.toUpperCase(),
    x: pad,
    baselineY: y,
    font: wordmarkFont,
    color: PHOTO_COLORS.accent,
  });
  const dateW = measure(input.dateText, dateFont);
  texts.push({
    text: input.dateText,
    x: w - pad - dateW,
    baselineY: y,
    font: dateFont,
    color: PHOTO_COLORS.muted,
  });
  y += 10 * s + placeFont.sizePx;
  texts.push({
    text: ellipsize(input.placeName, placeFont, w - 2 * pad, measure),
    x: pad,
    baselineY: y,
    font: placeFont,
    color: PHOTO_COLORS.text,
  });
  const peakLines = peakNames.length
    ? wrapPeakNames(
        input.peaksPrefix,
        peakNames,
        peaksFont,
        w - 2 * pad,
        MAX_PEAK_LINES,
        input.moreText,
        measure,
      )
    : [];
  y += 6 * s;
  for (const line of peakLines) {
    y += peaksLineH;
    texts.push({ text: line, x: pad, baselineY: y, font: peaksFont, color: PHOTO_COLORS.muted });
  }
  const frameHeight = Math.ceil(y - frameTop + pad);

  return {
    widthPx: w,
    heightPx: h + frameHeight,
    photoHeightPx: h,
    scale: s,
    skyline,
    skylineWidthPx: 1.75 * s,
    labels,
    frame: { top: frameTop, height: frameHeight, texts, dividerY: frameTop },
    peakNames,
  };
}

/** Cut `text` with "…" so it fits `maxWidthPx`. */
export function ellipsize(
  text: string,
  font: FontSpec,
  maxWidthPx: number,
  measure: MeasureText,
): string {
  if (measure(text, font) <= maxWidthPx) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`, font) > maxWidthPx) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * "Peaks: A, B, C" wrapped onto at most `maxLines` lines, breaking between names. Names that do
 * not fit are summarised as "+N more" at the end of the last line.
 */
export function wrapPeakNames(
  prefix: string,
  names: readonly string[],
  font: FontSpec,
  maxWidthPx: number,
  maxLines: number,
  moreText: (n: number) => string,
  measure: MeasureText,
): string[] {
  const lines: string[] = [];
  let line = prefix;
  let i = 0;
  for (; i < names.length; i++) {
    const sep = line === prefix ? ' ' : ', ';
    const candidate = `${line}${sep}${names[i]}`;
    if (measure(candidate, font) <= maxWidthPx || line === prefix) {
      line = candidate;
      continue;
    }
    if (lines.length + 1 >= maxLines) break;
    lines.push(`${line},`);
    line = names[i]!;
  }
  if (i < names.length) {
    // make room for "+N more" on the last line
    let shown = i;
    const more = () => ` ${moreText(names.length - shown)}`;
    while (measure(`${line}${more()}`, font) > maxWidthPx && shown > 0) {
      const cut = line.lastIndexOf(', ');
      if (cut < 0) break;
      line = line.slice(0, cut);
      shown--;
    }
    line = `${line}${more()}`;
  }
  lines.push(line);
  return lines;
}

/** Within this distance of a viewpoint a GPS photo is captioned "Near <viewpoint>". */
export const NEAR_VIEWPOINT_M = 3000;

/**
 * Caption for the photo frame: the viewpoint name when simulating, "Near X" for a GPS fix close
 * to a known viewpoint, otherwise the region name with coordinates.
 */
export function photoPlaceName(
  position: LatLon,
  simulatedViewpointName: string | null,
  viewpoints: readonly (LatLon & { name: string })[],
  regionName: string,
  nearText: (name: string) => string,
): string {
  if (simulatedViewpointName) return simulatedViewpointName;
  let best: { name: string; d: number } | null = null;
  for (const v of viewpoints) {
    const d = haversineDistanceM(position, v);
    if (!best || d < best.d) best = { name: v.name, d };
  }
  if (best && best.d <= NEAR_VIEWPOINT_M) return nearText(best.name);
  const lat = `${Math.abs(position.lat).toFixed(3)}°${position.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(position.lon).toFixed(3)}°${position.lon >= 0 ? 'E' : 'W'}`;
  return `${regionName} · ${lat} ${lon}`;
}
