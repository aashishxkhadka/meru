import { describe, expect, it } from '@jest/globals';

import { createPack } from './pack';

const manifest = {
  regionId: 'test',
  name: 'Test',
  version: 1,
  createdAt: '2026-11-02',
  dem: {
    file: 'dem.bin',
    width: 2,
    height: 2,
    north: 2,
    south: 0,
    west: 0,
    east: 2,
    noData: -32768,
  },
  attribution: ['test data'],
};
const demBuffer = new Int16Array([1, 2, 3, 4]).buffer;
const peak = {
  id: 'p',
  name: 'P',
  nameNe: '',
  lat: 1,
  lon: 1,
  elevationM: 100,
  prominenceM: null,
  rank: 1,
  description: '',
  source: 'test',
};
const viewpoint = { id: 'v', name: 'V', lat: 1.5, lon: 0.5, eyeHeightM: 1.7 };

describe('createPack', () => {
  it('builds a pack from valid parts', () => {
    const pack = createPack(manifest, demBuffer, [peak], [viewpoint]);
    expect(pack.peaks).toHaveLength(1);
    expect(pack.dem.elevationsM.length).toBe(4);
  });

  it('lists every problem at once', () => {
    const bad = () =>
      createPack(
        { ...manifest, attribution: [] },
        new ArrayBuffer(4),
        [peak, { ...peak, lat: 50, rank: 7 }],
        [{ ...viewpoint, eyeHeightM: undefined }],
      );
    expect(bad).toThrow(/attribution is empty/);
    expect(bad).toThrow(/dem: DEM buffer/);
    expect(bad).toThrow(/peaks\[1\].*duplicate/);
    expect(bad).toThrow(/outside the DEM/);
    expect(bad).toThrow(/rank must be 1-3/);
    expect(bad).toThrow(/eyeHeightM missing/);
  });

  it('rejects a manifest without a dem block', () => {
    expect(() => createPack({ regionId: 'x' }, demBuffer, [peak], [])).toThrow(/dem block/);
  });
});
