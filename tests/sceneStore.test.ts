/// <reference types="node" />
/** SceneStore behaviour on the real pack: recompute threshold, cache, outside-the-map. */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { destinationPoint } from '../src/core/geo';
import { createPack } from '../src/core/pack';
import { useSceneStore } from '../src/store/sceneStore';

const dir = join(__dirname, '..', 'assets', 'packs', 'annapurna');
const json = (f: string): unknown => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const bytes = readFileSync(join(dir, 'dem.bin'));
const pack = createPack(
  json('manifest.json'),
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  json('peaks.json'),
  json('viewpoints.json'),
);
const sarangkot = pack.viewpoints.find((v) => v.id === 'sarangkot')!;
const at = (p: { lat: number; lon: number }, label: string) => ({ ...p, eyeHeightM: 1.7, label });

async function settled(): Promise<void> {
  for (let i = 0; i < 2000 && useSceneStore.getState().status === 'computing'; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('SceneStore', () => {
  it('computes, skips moves < 50 m, recomputes beyond, reuses the cache', async () => {
    // two full real-pack scenes; Jest-instrumented code is slower than plain Node
    const store = useSceneStore.getState();
    store.update(pack, at(sarangkot, 'Sarangkot'));
    expect(useSceneStore.getState().status).toBe('computing');
    await settled();
    let s = useSceneStore.getState();
    expect(s.status).toBe('ready');
    expect(s.computeCount).toBe(1);
    expect(s.scene!.peaks.find((r) => r.peak.id === 'machhapuchhre')!.visible).toBe(true);

    s.update(pack, at(destinationPoint(sarangkot, 90, 30), 'GPS ±8 m'));
    s = useSceneStore.getState();
    expect(s.status).toBe('ready');
    expect(s.computeCount).toBe(1); // no recompute for 30 m
    expect(s.label).toBe('GPS ±8 m');

    s.update(pack, at(destinationPoint(sarangkot, 90, 200), 'GPS ±8 m'));
    await settled();
    expect(useSceneStore.getState().computeCount).toBe(2);

    useSceneStore.getState().update(pack, at(sarangkot, 'Sarangkot'));
    s = useSceneStore.getState();
    expect(s.status).toBe('ready'); // instantly, from cache
    expect(s.cacheHits).toBe(1);
    expect(s.computeCount).toBe(2);
  }, 30_000);

  it('reports positions outside the map', async () => {
    useSceneStore.getState().update(pack, at({ lat: 27.0, lon: 84.0 }, 'GPS ±5 m'));
    await settled();
    expect(useSceneStore.getState().status).toBe('outside');
  }, 30_000);
});
