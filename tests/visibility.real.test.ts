/// <reference types="node" />
/**
 * Real-data checks on the annapurna pack (SPEC section 10). Exact expected values are added
 * as a snapshot only after the panorama has been compared with a real photo (step 4).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { observerElevationM } from '../src/core/dem';
import { computeHorizon, horizonAngleAt } from '../src/core/horizon';
import { computeVisiblePeaks } from '../src/core/visibility';
import { loadPackFromDisk } from '../scripts/loadPack';

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
  lat: number;
  lon: number;
  eyeHeightM: number;
}

const root = join(__dirname, '..');
const packDir = join(root, 'assets', 'packs', 'annapurna');
const pack = loadPackFromDisk('annapurna', root);
const peaks = JSON.parse(readFileSync(join(packDir, 'peaks.json'), 'utf8')) as Peak[];
const viewpoints = JSON.parse(
  readFileSync(join(packDir, 'viewpoints.json'), 'utf8'),
) as Viewpoint[];

function observerAt(id: string) {
  const vp = viewpoints.find((v) => v.id === id)!;
  return { lat: vp.lat, lon: vp.lon, elevationM: observerElevationM(pack.dem, vp, vp.eyeHeightM)! };
}

describe('from Sarangkot', () => {
  const observer = observerAt('sarangkot');
  const results = computeVisiblePeaks(pack.dem, observer, peaks);
  const byId = (id: string) => results.find((r) => r.peak.id === id)!;

  it('Machhapuchhre, Annapurna South and Hiunchuli are visible', () => {
    expect(byId('machhapuchhre').visible).toBe(true);
    expect(byId('annapurna-south').visible).toBe(true);
    expect(byId('hiunchuli').visible).toBe(true);
  });

  it('Machhapuchhre is roughly north (350°-30°), ~28 km away', () => {
    const az = byId('machhapuchhre').azimuthDeg;
    expect(az >= 350 || az <= 30).toBe(true);
    expect(byId('machhapuchhre').distanceM / 1000).toBeCloseTo(28, 0);
  });

  it('Machhapuchhre appears as the highest summit in the sky', () => {
    const top = results
      .filter((r) => r.visible && r.distanceM > 5000)
      .sort((a, b) => b.elevationAngleDeg - a.elevationAngleDeg)[0]!;
    expect(top.peak.id).toBe('machhapuchhre');
  });

  it('the skyline over a visible summit is the summit itself (within 0.5°)', () => {
    const horizon = computeHorizon(pack.dem, observer);
    const m = byId('machhapuchhre');
    // DEM smooths the summit, so the skyline sits a little below the catalogued height
    expect(m.elevationAngleDeg - horizonAngleAt(horizon, m.azimuthDeg)).toBeLessThan(0.5);
    expect(m.elevationAngleDeg - horizonAngleAt(horizon, m.azimuthDeg)).toBeGreaterThan(-0.05);
  });
});

describe('from Pokhara Lakeside', () => {
  it('the Sarangkot ridge hides Annapurna I but Machhapuchhre shows above it', () => {
    const results = computeVisiblePeaks(pack.dem, observerAt('pokhara-lakeside'), peaks);
    const byId = (id: string) => results.find((r) => r.peak.id === id)!;
    expect(byId('machhapuchhre').visible).toBe(true);
    expect(byId('annapurna-i').visible).toBe(false);
    expect(byId('annapurna-i').blockingDistanceM!).toBeLessThan(5000); // the ridge ~3.4 km away
  });
});

/**
 * Snapshots: Sarangkot was compared with a real photo on 2026-11-02 and matched (peak order
 * and skyline shape). Lakeside is a regression guard (SPEC 10). Any change to these lists
 * needs explicit approval: re-check the panorama, then run `npx jest -u`.
 */
describe('snapshots', () => {
  const summary = (id: string) =>
    computeVisiblePeaks(pack.dem, observerAt(id), peaks)
      .filter((r) => r.visible || r.peak.rank === 1)
      .sort((a, b) => Number(b.visible) - Number(a.visible) || a.azimuthDeg - b.azimuthDeg)
      .map(
        (r) =>
          `${r.visible ? 'VISIBLE' : 'hidden '} ${r.peak.id.padEnd(36)} az ${r.azimuthDeg.toFixed(1).padStart(5)}° ` +
          `el ${r.elevationAngleDeg.toFixed(2).padStart(5)}° ${(r.distanceM / 1000).toFixed(1).padStart(5)} km` +
          (r.visible ? '' : ` occluded ${Math.round(r.occludedByM / 10) * 10} m`),
      );

  it('Sarangkot (verified against a real photo)', () => {
    expect(summary('sarangkot')).toMatchSnapshot();
  });

  it('Pokhara Lakeside', () => {
    expect(summary('pokhara-lakeside')).toMatchSnapshot();
  });
});
