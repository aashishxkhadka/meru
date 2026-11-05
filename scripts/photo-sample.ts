/// <reference types="node" />
/**
 * Render a sample exported photo (step 10) on the Mac, using the same layout code as the phone
 * (src/core/photoComposition.ts). The "photo" is a synthetic sky + terrain silhouette from the
 * real horizon; labels, skyline and frame are exactly what the app draws on a real still.
 *
 *   npm run photo-sample -- sarangkot                 # faces Machhapuchhre
 *   npm run photo-sample -- sarangkot --heading 330 --pitch 6 --roll 2
 *
 * Writes tools/out/<viewpoint>_photo_export.jpg
 */

import { type SKRSContext2D, createCanvas } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { observerElevationM } from '../src/core/dem';
import { computeHorizon, type Observer } from '../src/core/horizon';
import {
  type FontSpec,
  type MeasureText,
  PHOTO_COLORS,
  type PhotoComposition,
  type PhotoText,
  composePhoto,
  photoPlaceName,
  stillPhotoView,
} from '../src/core/photoComposition';
import {
  NO_CALIBRATION,
  projectToScreen,
  sensorFovFromFocalLength35mm,
} from '../src/core/projection';
import { computeVisiblePeaks } from '../src/core/visibility';
import { loadPackFromDisk } from './loadPack';

interface Peak {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM: number;
  rank: number;
}
interface Viewpoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  eyeHeightM: number;
}

const W = 1944;
const H = 2592;
const WEIGHTS = { regular: 400, semibold: 600, bold: 700 } as const;
const cssFont = (f: FontSpec) => `${WEIGHTS[f.weight]} ${f.sizePx}px Helvetica`;

function main(): number {
  const argv = process.argv.slice(2);
  const id = argv.find((a) => !a.startsWith('--')) ?? 'sarangkot';
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? Number(argv[i + 1]) : null;
  };

  const root = join(__dirname, '..');
  const pack = loadPackFromDisk('annapurna', root);
  const dir = join(root, 'assets', 'packs', 'annapurna');
  const peaks = JSON.parse(readFileSync(join(dir, 'peaks.json'), 'utf8')) as Peak[];
  const viewpoints = JSON.parse(readFileSync(join(dir, 'viewpoints.json'), 'utf8')) as Viewpoint[];
  const vp = viewpoints.find((v) => v.id === id);
  if (!vp) {
    console.error(`Unknown viewpoint "${id}". Known: ${viewpoints.map((v) => v.id).join(', ')}`);
    return 1;
  }
  const ground = observerElevationM(pack.dem, vp, 0);
  if (ground === null) throw new Error('outside DEM');
  const observer: Observer = { lat: vp.lat, lon: vp.lon, elevationM: ground + vp.eyeHeightM };
  const horizon = computeHorizon(pack.dem, observer, { azimuthStepDeg: 0.05 });
  const visible = computeVisiblePeaks(pack.dem, observer, peaks).filter((r) => r.visible);

  const machha = visible.find((r) => r.peak.id.includes('machhapuchhre'));
  const pose = {
    headingDeg: opt('heading') ?? machha?.azimuthDeg ?? 0,
    pitchDeg: opt('pitch') ?? 7,
    rollDeg: opt('roll') ?? 0,
  };
  const view = stillPhotoView(sensorFovFromFocalLength35mm(26), W, H, 34, null);

  const canvas = createCanvas(W, H + 1000);
  const ctx = canvas.getContext('2d');
  const measure: MeasureText = (text, f) => {
    ctx.font = cssFont(f);
    const sp = f.letterSpacingPx ?? 0;
    if (!sp) return ctx.measureText(text).width;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width;
    return w + sp * Math.max(0, [...text].length - 1);
  };

  const c = composePhoto({
    photoWidthPx: W,
    photoHeightPx: H,
    pose,
    view,
    calibration: NO_CALIBRATION,
    horizonRays: horizon.rays,
    peaks: visible.map((r) => ({
      id: r.peak.id,
      name: r.peak.name,
      rank: r.peak.rank,
      elevationM: r.peak.elevationM,
      distanceM: r.distanceM,
      azimuthDeg: r.azimuthDeg,
      elevationAngleDeg: r.elevationAngleDeg,
    })),
    appName: 'Meru',
    placeName: photoPlaceName(vp, vp.name, [], pack.manifest.name, (n) => `Near ${n}`),
    dateText: '5 Nov 2026',
    peaksPrefix: 'Peaks:',
    moreText: (n) => `+${n} more`,
    measure,
  });

  const out = createCanvas(c.widthPx, c.heightPx);
  const o = out.getContext('2d');
  drawSyntheticPhoto(o, horizon.rays, pose, view);
  drawComposition(o, c);

  const outDir = join(root, 'tools', 'out');
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${id}_photo_export.jpg`);
  writeFileSync(file, out.toBuffer('image/jpeg', 90));
  console.log(
    `${vp.name}: heading ${pose.headingDeg.toFixed(1)}°, pitch ${pose.pitchDeg}°, ${c.labels.length} labels: ${c.peakNames.join(', ')}`,
  );
  console.log(`-> ${file} (${c.widthPx}×${c.heightPx})`);
  return 0;
}

/** Sky gradient + terrain filled under the projected horizon (stand-in for a real still). */
function drawSyntheticPhoto(
  o: SKRSContext2D,
  rays: readonly { azimuthDeg: number; maxAngleDeg: number }[],
  pose: { headingDeg: number; pitchDeg: number; rollDeg: number },
  view: ReturnType<typeof stillPhotoView>,
): void {
  const sky = o.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#3d6fa8');
  sky.addColorStop(0.6, '#a9c4dc');
  sky.addColorStop(1, '#dfe8ef');
  o.fillStyle = sky;
  o.fillRect(0, 0, W, H);
  const pts = rays
    .map((r) => projectToScreen(r.azimuthDeg, r.maxAngleDeg, pose, view, NO_CALIBRATION, 2))
    .filter((p): p is { x: number; y: number } => p !== null)
    .sort((a, b) => a.x - b.x);
  const ground = o.createLinearGradient(0, H * 0.3, 0, H);
  ground.addColorStop(0, '#eef2f5');
  ground.addColorStop(0.25, '#7d8a96');
  ground.addColorStop(1, '#2f3b2c');
  o.fillStyle = ground;
  o.beginPath();
  o.moveTo(pts[0]?.x ?? 0, H);
  for (const p of pts) o.lineTo(p.x, p.y);
  o.lineTo(pts.at(-1)?.x ?? W, H);
  o.closePath();
  o.fill();
}

/** Same drawing as src/photo/renderPhoto.ts, with the Node canvas API. */
function drawComposition(o: SKRSContext2D, c: PhotoComposition): void {
  const text = (t: PhotoText) => {
    o.font = cssFont(t.font);
    o.fillStyle = t.color;
    const sp = t.font.letterSpacingPx ?? 0;
    if (!sp) return o.fillText(t.text, t.x, t.baselineY);
    let x = t.x;
    for (const ch of t.text) {
      o.fillText(ch, x, t.baselineY);
      x += o.measureText(ch).width + sp;
    }
  };
  o.fillStyle = PHOTO_COLORS.frameBg;
  o.fillRect(0, c.photoHeightPx, c.widthPx, c.heightPx - c.photoHeightPx);

  o.save();
  o.beginPath();
  o.rect(0, 0, c.widthPx, c.photoHeightPx);
  o.clip();
  o.lineJoin = 'round';
  o.lineCap = 'round';
  for (const [color, width] of [
    [PHOTO_COLORS.skylineShadow, c.skylineWidthPx * 2.3],
    [PHOTO_COLORS.skyline, c.skylineWidthPx],
  ] as const) {
    o.strokeStyle = color;
    o.lineWidth = width;
    o.beginPath();
    for (const line of c.skyline)
      line.forEach((p, i) => (i ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y)));
    o.stroke();
  }
  for (const l of c.labels) {
    o.strokeStyle = PHOTO_COLORS.line;
    o.lineWidth = Math.max(1, c.scale);
    o.beginPath();
    l.leader.forEach((p, i) => (i ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y)));
    o.stroke();
    o.beginPath();
    o.arc(l.summit.x, l.summit.y, l.dotRadiusPx, 0, Math.PI * 2);
    o.fillStyle = PHOTO_COLORS.accent;
    o.fill();
    o.strokeStyle = '#fff';
    o.stroke();
  }
  for (const l of c.labels) {
    o.fillStyle = PHOTO_COLORS.labelBg;
    o.beginPath();
    o.roundRect(l.box.left, l.box.top, l.box.width, l.box.height, l.box.radius);
    o.fill();
    l.texts.forEach(text);
  }
  o.restore();

  o.strokeStyle = PHOTO_COLORS.accent;
  o.lineWidth = Math.max(1, 1.5 * c.scale);
  o.beginPath();
  o.moveTo(0, c.frame.dividerY);
  o.lineTo(c.widthPx, c.frame.dividerY);
  o.stroke();
  c.frame.texts.forEach(text);
}

process.exit(main());
