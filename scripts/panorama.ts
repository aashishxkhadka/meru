/// <reference types="node" />
/**
 * Render a 360° panorama from a viewpoint using the real core engine (horizon.ts +
 * visibility.ts), print visible/hidden peaks and timings. This is the step-4 reality check:
 * compare <id>_photo.png with a real photo from the same place.
 *
 *   npm run panorama -- sarangkot world-peace-pagoda pokhara-lakeside
 *   npm run panorama -- sarangkot --width 3600 --height 600 --out tools/out
 *
 * Writes per viewpoint:
 *   <id>.png        full 360° strip (vertical angle stretched to fit)
 *   <id>_photo.png  main peaks at true 1:1 angular scale (looks like a photo)
 *   <id>_peaks.csv  every peak in range with azimuth, angle, distance, visible, occludedByM
 */

import { type SKRSContext2D, createCanvas } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { wrapTo180, wrapTo360 } from '../src/core/angles';
import { observerElevationM } from '../src/core/dem';
import { type Horizon, type Observer, computeHorizon } from '../src/core/horizon';
import { type VisiblePeak, computeVisiblePeaks } from '../src/core/visibility';
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

const ROOT = join(__dirname, '..');
const FONT = 'Helvetica, Arial, sans-serif';
const COLORS = {
  skyTop: '#9cc3e6',
  skyBottom: '#e9f2fa',
  near: [38, 50, 62] as const, // dark
  far: [214, 224, 234] as const, // light
  skyline: '#ffffff',
  label: '#10202f',
  hidden: '#7d8a96',
  axis: '#33414f',
};

// ----------------------------------------------------------------------------- args

function parseArgs(argv: string[]) {
  const opts = {
    ids: [] as string[],
    width: 3600,
    height: 600,
    out: 'tools/out',
    region: 'annapurna',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--width') opts.width = Number(argv[++i]);
    else if (a === '--height') opts.height = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i]!;
    else if (a === '--region') opts.region = argv[++i]!;
    else opts.ids.push(a);
  }
  return opts;
}

// ----------------------------------------------------------------------------- drawing

interface View {
  azStartDeg: number; // left edge
  azSpanDeg: number;
  topDeg: number; // elevation angle at top of plot
  bottomDeg: number;
  plotX: number;
  plotY: number;
  plotW: number;
  plotH: number;
}

const xOf = (v: View, az: number) =>
  v.plotX + (wrapTo360(az - v.azStartDeg) / v.azSpanDeg) * v.plotW;
const yOf = (v: View, el: number) =>
  v.plotY + ((v.topDeg - el) / (v.topDeg - v.bottomDeg)) * v.plotH;

function ridgeColor(distanceM: number): string {
  const t = Math.min(1, Math.max(0, Math.log(distanceM / 300) / Math.log(150_000 / 300)));
  const c = COLORS.near.map((n, i) => Math.round(n + (COLORS.far[i]! - n) * t ** 0.8));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawTerrain(ctx: SKRSContext2D, v: View, horizon: Horizon): void {
  const sky = ctx.createLinearGradient(0, v.plotY, 0, v.plotY + v.plotH);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(v.plotX, v.plotY, v.plotW, v.plotH);

  const n = horizon.rays.length;
  const bottom = v.plotY + v.plotH;
  const skyline: [number, number][] = [];
  for (let px = 0; px < v.plotW; px++) {
    const az = v.azStartDeg + ((px + 0.5) / v.plotW) * v.azSpanDeg;
    const ray = horizon.rays[Math.round(wrapTo360(az) / horizon.azimuthStepDeg) % n]!;
    // Farthest (highest) ridge first; nearer ridges paint over the lower part.
    for (let k = ray.ridges.length - 1; k >= 0; k--) {
      const r = ray.ridges[k]!;
      const y = Math.max(v.plotY, yOf(v, r.angleDeg));
      if (y >= bottom) continue;
      ctx.fillStyle = ridgeColor(r.distanceM);
      ctx.fillRect(v.plotX + px, y, 1, bottom - y);
      // a slightly darker crest line separates layers
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(v.plotX + px, y, 1, 1);
    }
    skyline.push([v.plotX + px + 0.5, yOf(v, ray.maxAngleDeg)]);
  }
  ctx.strokeStyle = COLORS.skyline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  skyline.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

function drawGrid(ctx: SKRSContext2D, v: View, compact: boolean): void {
  ctx.save();
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = COLORS.axis;
  ctx.strokeStyle = 'rgba(30,40,50,0.12)';
  // elevation-angle lines
  const stepDeg = v.topDeg - v.bottomDeg > 12 ? 2 : 1;
  for (let el = Math.ceil(v.bottomDeg); el <= v.topDeg; el += 1) {
    if (el % stepDeg !== 0) continue;
    const y = yOf(v, el);
    ctx.beginPath();
    ctx.moveTo(v.plotX, y);
    ctx.lineTo(v.plotX + v.plotW, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${el}°`, v.plotX - 4, y + 4);
  }
  // azimuth ticks
  const names: Record<number, string> = {
    0: 'N',
    45: 'NE',
    90: 'E',
    135: 'SE',
    180: 'S',
    225: 'SW',
    270: 'W',
    315: 'NW',
  };
  const tickStep = compact ? 5 : 10;
  const yAxis = v.plotY + v.plotH;
  for (
    let az = Math.ceil(v.azStartDeg / tickStep) * tickStep;
    az <= v.azStartDeg + v.azSpanDeg;
    az += tickStep
  ) {
    const x = xOf(v, az);
    const a = Math.round(wrapTo360(az));
    ctx.fillRect(x, yAxis, 1, a % 45 === 0 ? 10 : 5);
    ctx.textAlign = 'center';
    ctx.font = a % 45 === 0 ? `bold 13px ${FONT}` : `12px ${FONT}`;
    ctx.fillText(names[a] ? `${names[a]} ${a}°` : `${a}°`, x, yAxis + 24);
  }
  ctx.restore();
}

function drawLabels(ctx: SKRSContext2D, v: View, results: VisiblePeak<Peak>[]): number {
  const inView = (r: VisiblePeak<Peak>) =>
    wrapTo360(r.azimuthDeg - v.azStartDeg) <= v.azSpanDeg && r.elevationAngleDeg <= v.topDeg;
  const visible = results.filter((r) => r.visible && inView(r));
  const hidden = results.filter((r) => !r.visible && r.peak.rank === 1 && inView(r));

  // Rank 1 always placed; others only if their label column is free.
  const order = [...visible].sort(
    (a, b) => a.peak.rank - b.peak.rank || b.peak.elevationM - a.peak.elevationM,
  );
  const placedX: number[] = [];
  const slotPx = 15;
  const fits = (x: number) => placedX.every((p) => Math.abs(p - x) >= slotPx);
  const labelBaseY = v.plotY + 6;

  ctx.save();
  /** Nearest free label column to x: rank 1 may move up to 4 slots sideways, others not at all. */
  const findSlot = (x: number, maxShift: number): number | null => {
    for (let k = 0; k <= maxShift; k++) {
      for (const dx of k === 0 ? [0] : [k * slotPx, -k * slotPx]) {
        if (fits(x + dx)) return x + dx;
      }
    }
    return null;
  };

  const draw = (r: VisiblePeak<Peak>, labelX: number, isHidden: boolean) => {
    const x = xOf(v, r.azimuthDeg);
    const ySummit = yOf(v, r.elevationAngleDeg);
    const text = `${r.peak.name}  ${r.peak.elevationM} m · ${(r.distanceM / 1000).toFixed(r.distanceM < 10_000 ? 1 : 0)} km${isHidden ? ' (hidden)' : ''}`;
    ctx.font = `${r.peak.rank === 1 && !isHidden ? 'bold ' : ''}12px ${FONT}`;
    const textW = ctx.measureText(text).width;
    const textBottomY = labelBaseY + textW + 4;
    ctx.strokeStyle = isHidden ? 'rgba(125,138,150,0.6)' : 'rgba(16,32,47,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash(isHidden ? [3, 3] : []);
    if (ySummit > textBottomY + 2) {
      // straight down from the label, then an angled last part to the summit if shifted
      const bendY = labelX === x ? ySummit - 3 : Math.max(textBottomY + 2, ySummit - 22);
      ctx.beginPath();
      ctx.moveTo(labelX, textBottomY + 2);
      ctx.lineTo(labelX, bendY);
      ctx.lineTo(x, ySummit - 3);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = isHidden ? COLORS.hidden : '#d4372c';
    ctx.beginPath();
    ctx.arc(x, ySummit, isHidden ? 2 : 3, 0, Math.PI * 2);
    if (isHidden) ctx.stroke();
    else ctx.fill();
    ctx.translate(labelX + 4, labelBaseY);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = isHidden ? COLORS.hidden : COLORS.label;
    ctx.textAlign = 'left';
    ctx.fillText(text, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  let placed = 0;
  for (const r of order) {
    const slot = findSlot(xOf(v, r.azimuthDeg), r.peak.rank === 1 ? 4 : 0);
    if (slot !== null) {
      draw(r, slot, false);
      placedX.push(slot);
      placed++;
    }
  }
  for (const r of hidden) {
    const slot = findSlot(xOf(v, r.azimuthDeg), 0);
    if (slot !== null) {
      draw(r, slot, true);
      placedX.push(slot);
    }
  }
  ctx.restore();
  return placed;
}

function render(
  file: string,
  title: string,
  footer: string,
  canvasW: number,
  canvasH: number,
  view: Omit<View, 'plotX' | 'plotY' | 'plotW' | 'plotH'>,
  horizon: Horizon,
  results: VisiblePeak<Peak>[],
  compact: boolean,
): number {
  const margin = { left: 44, right: 12, top: 34, bottom: 52 };
  const v: View = {
    ...view,
    plotX: margin.left,
    plotY: margin.top,
    plotW: canvasW - margin.left - margin.right,
    plotH: canvasH - margin.top - margin.bottom,
  };
  const canvas = createCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(0, 0, canvasW, canvasH);
  drawTerrain(ctx, v, horizon);
  drawGrid(ctx, v, compact);
  const placed = drawLabels(ctx, v, results);
  ctx.fillStyle = COLORS.axis;
  ctx.textAlign = 'left';
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(title, margin.left, 22);
  ctx.font = `11px ${FONT}`;
  ctx.fillText(footer, margin.left, canvasH - 6);
  writeFileSync(file, canvas.toBuffer('image/png'));
  return placed;
}

// ----------------------------------------------------------------------------- main

function circularMeanDeg(angles: number[]): number {
  const s = angles.reduce((a, d) => a + Math.sin((d * Math.PI) / 180), 0);
  const c = angles.reduce((a, d) => a + Math.cos((d * Math.PI) / 180), 0);
  return wrapTo360((Math.atan2(s, c) * 180) / Math.PI);
}

function pad(s: string | number, n: number, left = false): string {
  const str = String(s);
  return left ? str.padStart(n) : str.padEnd(n);
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args.ids.length === 0) {
    console.error(
      'usage: npm run panorama -- <viewpoint-id> [...] [--width 3600 --height 600 --out tools/out]',
    );
    return 1;
  }
  const packDir = join(ROOT, 'assets', 'packs', args.region);
  const pack = loadPackFromDisk(args.region, ROOT);
  const peaks = JSON.parse(readFileSync(join(packDir, 'peaks.json'), 'utf8')) as Peak[];
  const viewpoints = JSON.parse(
    readFileSync(join(packDir, 'viewpoints.json'), 'utf8'),
  ) as Viewpoint[];
  const outDir = join(ROOT, args.out);
  mkdirSync(outDir, { recursive: true });
  console.log(
    `Pack ${pack.manifest.name}: loaded in ${pack.loadMs.toFixed(0)} ms, ${peaks.length} peaks`,
  );

  for (const id of args.ids) {
    const vp = viewpoints.find((p) => p.id === id);
    if (!vp) {
      console.error(`Unknown viewpoint "${id}". Known: ${viewpoints.map((p) => p.id).join(', ')}`);
      return 1;
    }
    const groundM = observerElevationM(pack.dem, vp, 0);
    if (groundM === null) throw new Error(`${id} is outside the DEM`);
    const observer: Observer = { lat: vp.lat, lon: vp.lon, elevationM: groundM + vp.eyeHeightM };

    // Timed runs with the app's default settings (0.25° rays).
    let t0 = performance.now();
    computeHorizon(pack.dem, observer);
    const horizonMs = performance.now() - t0;
    t0 = performance.now();
    const results = computeVisiblePeaks(pack.dem, observer, peaks);
    const visibilityMs = performance.now() - t0;
    // Finer rays for smooth images only.
    t0 = performance.now();
    const fine = computeHorizon(pack.dem, observer, { azimuthStepDeg: 0.05 });
    const fineMs = performance.now() - t0;

    const visible = results.filter((r) => r.visible);
    const mainPeaks = visible.filter((r) => r.peak.rank === 1);
    const centerDeg = mainPeaks.length ? circularMeanDeg(mainPeaks.map((r) => r.azimuthDeg)) : 0;
    const angles = fine.rays.map((r) => r.maxAngleDeg).filter(Number.isFinite);
    const maxEl = Math.max(...angles, ...visible.map((r) => r.elevationAngleDeg));
    const sorted = [...angles].sort((a, b) => a - b);
    const lowEl = sorted[Math.floor(sorted.length * 0.02)]!;
    const date = new Date().toISOString().slice(0, 10);
    const credit =
      'Terrain: Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 · Peaks: © OpenStreetMap contributors';
    const title = `${vp.name}  ·  ${vp.lat.toFixed(5)}, ${vp.lon.toFixed(5)}  ·  eye ${observer.elevationM.toFixed(0)} m  ·  Meru engine ${date}`;

    // 1) full 360° strip
    const strip = { topDeg: maxEl + 4.5, bottomDeg: Math.max(-8, Math.min(-1, lowEl - 0.5)) };
    const stripVExag =
      (args.height - 86) / (strip.topDeg - strip.bottomDeg) / ((args.width - 56) / 360);
    render(
      join(outDir, `${id}.png`),
      title,
      `360° · centred on ${centerDeg.toFixed(0)}° · vertical scale ×${stripVExag.toFixed(1)} · near ridges dark, far light · ${credit}`,
      args.width,
      args.height,
      { azStartDeg: centerDeg - 180, azSpanDeg: 360, ...strip },
      fine,
      results,
      false,
    );

    // 2) photo-like crop: main peaks at 1:1 angular scale
    const offsets = mainPeaks.map((r) => wrapTo180(r.azimuthDeg - centerDeg));
    const spanDeg = Math.min(
      200,
      Math.max(40, Math.max(0, ...offsets) - Math.min(0, ...offsets) + 16),
    );
    const left = centerDeg + Math.min(0, ...offsets) - 8;
    const pxPerDeg = (args.width - 56) / spanDeg;
    const photo = { topDeg: maxEl + 7, bottomDeg: Math.max(-6, Math.min(-1, lowEl - 0.5)) };
    const photoH = Math.round((photo.topDeg - photo.bottomDeg) * pxPerDeg) + 86;
    render(
      join(outDir, `${id}_photo.png`),
      title,
      `${spanDeg.toFixed(0)}° wide · true 1:1 angular scale (${pxPerDeg.toFixed(1)} px/°) · compare with a real photo · ${credit}`,
      args.width,
      photoH,
      { azStartDeg: left, azSpanDeg: spanDeg, ...photo },
      fine,
      results,
      true,
    );

    // 3) table + CSV
    const rows = results.map((r) => ({
      name: r.peak.name,
      rank: r.peak.rank,
      ele: r.peak.elevationM,
      az: r.azimuthDeg,
      el: r.elevationAngleDeg,
      km: r.distanceM / 1000,
      visible: r.visible,
      occ: r.occludedByM,
      blockKm: r.blockingDistanceM === null ? null : r.blockingDistanceM / 1000,
    }));
    writeFileSync(
      join(outDir, `${id}_peaks.csv`),
      'name,rank,elevation_m,azimuth_deg,elevation_angle_deg,distance_km,visible,occluded_by_m,blocking_distance_km\n' +
        rows
          .map((r) =>
            [
              JSON.stringify(r.name),
              r.rank,
              r.ele,
              r.az.toFixed(2),
              r.el.toFixed(3),
              r.km.toFixed(2),
              r.visible,
              r.occ.toFixed(0),
              r.blockKm?.toFixed(2) ?? '',
            ].join(','),
          )
          .join('\n') +
        '\n',
    );

    const header = `  ${pad('peak', 30)} ${pad('rank', 4)} ${pad('elev m', 6, true)} ${pad('az °', 6, true)} ${pad('angle °', 7, true)} ${pad('dist km', 7, true)} ${pad('occludedByM', 11, true)}`;
    const line = (r: (typeof rows)[number]) =>
      `  ${pad(r.name.slice(0, 30), 30)} ${pad(r.rank, 4)} ${pad(r.ele, 6, true)} ${pad(r.az.toFixed(1), 6, true)} ${pad(r.el.toFixed(2), 7, true)} ${pad(r.km.toFixed(1), 7, true)} ${pad(r.occ.toFixed(0), 11, true)}`;

    const visibleRows = rows
      .filter((r) => r.visible)
      .sort((a, b) => wrapTo180(a.az - centerDeg) - wrapTo180(b.az - centerDeg));
    const hiddenRows = rows
      .filter((r) => !r.visible && r.rank <= 2)
      .sort((a, b) => a.rank - b.rank || a.km - b.km);
    console.log();
    console.log(`=== ${vp.name} (${id}) — eye ${observer.elevationM.toFixed(0)} m`);
    console.log(
      `VISIBLE (${visibleRows.length}), left to right as you face ${centerDeg.toFixed(0)}°:`,
    );
    console.log(header);
    visibleRows.forEach((r) => console.log(line(r)));
    console.log(
      `HIDDEN rank 1-2 (${hiddenRows.length} of ${rows.length - visibleRows.length} hidden; all in ${id}_peaks.csv):`,
    );
    console.log(header);
    hiddenRows.forEach((r) => console.log(line(r)));
    console.log(
      `Compute: horizon ${horizonMs.toFixed(0)} ms (1,440 rays, default) · visibility ${visibilityMs.toFixed(0)} ms (${results.length} peaks in range) · render horizon ${fineMs.toFixed(0)} ms (7,200 rays)`,
    );
    console.log(`Wrote ${args.out}/${id}.png, ${id}_photo.png, ${id}_peaks.csv`);
  }
  return 0;
}

process.exit(main());
