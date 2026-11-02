/// <reference types="node" />
/** What the camera overlay would show from Sarangkot (projection + scene on the real pack). */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPack } from '../src/core/pack';
import {
  projectToScreen,
  sensorFovFromFocalLength35mm,
  visibleFovForCover,
} from '../src/core/projection';
import { computeScene } from '../src/core/scene';

const dir = join(__dirname, '..', 'assets', 'packs', 'annapurna');
const json = (f: string): unknown => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const bytes = readFileSync(join(dir, 'dem.bin'));
const pack = createPack(
  json('manifest.json'),
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  json('peaks.json'),
  json('viewpoints.json'),
);

describe('camera overlay from Sarangkot (phone upright, facing 359°, 390x844, 26 mm lens)', () => {
  const view = {
    widthPx: 390,
    heightPx: 844,
    ...visibleFovForCover(sensorFovFromFocalLength35mm(26), 390, 844),
  };
  const pose = { headingDeg: 359, pitchDeg: 0, rollDeg: 0 };

  it('shows ~34° of the horizon on a tall phone', () => {
    expect(view.hFovDeg).toBeGreaterThan(32);
    expect(view.hFovDeg).toBeLessThan(36);
  });

  it('puts Machhapuchhre near the centre, above the middle; Annapurna South off screen', async () => {
    const sk = pack.viewpoints.find((v) => v.id === 'sarangkot')!;
    const scene = await computeScene(pack.dem, sk, pack.peaks, { eyeHeightM: sk.eyeHeightM });
    const at = (id: string) => {
      const r = scene.peaks.find((p) => p.peak.id === id)!;
      return projectToScreen(r.azimuthDeg, r.elevationAngleDeg, pose, view, undefined, 0);
    };
    const m = at('machhapuchhre')!;
    expect(Math.abs(m.x - 195)).toBeLessThan(10); // 0.4° right of centre
    expect(m.y).toBeLessThan(422); // ~11° up
    expect(m.y).toBeGreaterThan(100);
    const southDeg = scene.peaks.find((p) => p.peak.id === 'annapurna-south')!.azimuthDeg;
    expect(Math.abs(((southDeg - 359 + 540) % 360) - 180)).toBeGreaterThan(view.hFovDeg / 2);
    expect(at('annapurna-south')).toBeNull();
  }, 30_000);
});
