import { describe, expect, it } from '@jest/globals';

import { at, makeDem, wallEast } from '../../tests/syntheticDem';
import { destinationPoint } from './geo';
import { computeHorizon } from './horizon';
import { computeVisiblePeaks } from './visibility';
import {
  OutsideDemError,
  SceneCache,
  SceneCancelledError,
  computeScene,
  gridKey,
  needsRecompute,
} from './scene';

const dem = makeDem(0.15, 0.001, wallEast(5000, 1000));
const peaks = [{ id: 'p', rank: 1, elevationM: 1500, ...at(12_000, 0) }];

describe('computeScene', () => {
  it('gives exactly the same horizon and peaks as the one-shot functions', async () => {
    const scene = await computeScene(dem, { lat: 0, lon: 0 }, peaks, { eyeHeightM: 2 });
    const observer = { lat: 0, lon: 0, elevationM: scene.observer.elevationM };
    expect(scene.observer.elevationM).toBe(2); // flat ground at 0 + eye
    expect(scene.horizon.rays).toEqual(computeHorizon(dem, observer).rays);
    expect(scene.peaks).toEqual(computeVisiblePeaks(dem, observer, peaks));
  });

  it('yields between chunks', async () => {
    let yields = 0;
    const scene = await computeScene(dem, { lat: 0, lon: 0 }, peaks, {
      raysPerChunk: 100,
      yieldFn: async () => {
        yields++;
      },
    });
    expect(yields).toBe(15); // 1,440 rays / 100 per chunk
    expect(scene.timing.chunks).toBe(16); // + visibility
  });

  it('can be cancelled between chunks', async () => {
    const token = { cancelled: false };
    let yields = 0;
    const run = computeScene(dem, { lat: 0, lon: 0 }, peaks, {
      token,
      yieldFn: async () => {
        if (++yields === 3) token.cancelled = true;
      },
    });
    await expect(run).rejects.toBeInstanceOf(SceneCancelledError);
    expect(yields).toBe(3);
  });

  it('rejects positions outside the DEM', async () => {
    await expect(computeScene(dem, { lat: 1, lon: 1 }, peaks)).rejects.toBeInstanceOf(
      OutsideDemError,
    );
  });
});

describe('needsRecompute', () => {
  const here = { lat: 28.24625, lon: 83.94881 };
  it('is true without a previous scene', () => {
    expect(needsRecompute(null, here)).toBe(true);
  });
  it('is false under 50 m and true from 50 m', () => {
    expect(needsRecompute(here, destinationPoint(here, 30, 49))).toBe(false);
    expect(needsRecompute(here, destinationPoint(here, 30, 51))).toBe(true);
  });
});

describe('gridKey', () => {
  const here = { lat: 28.24625, lon: 83.94881 };
  it('is stable for the same point and changes ~every 50 m', () => {
    expect(gridKey(here)).toBe(gridKey({ ...here }));
    // walking 500 m due north crosses 10-11 latitude cells
    const latCells = new Set<string>();
    for (let d = 0; d <= 500; d += 10) {
      latCells.add(gridKey(destinationPoint(here, 0, d)).split(':')[0]!);
    }
    expect(latCells.size).toBeGreaterThanOrEqual(10);
    expect(latCells.size).toBeLessThanOrEqual(11);
  });
});

describe('SceneCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new SceneCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a is now most recent
    cache.set('c', 3); // evicts b
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });
});
