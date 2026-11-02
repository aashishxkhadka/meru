/// <reference types="node" />
/**
 * Real-data check: src/core/dem.ts on the generated annapurna pack must agree with the
 * independent Python reader (tools/pipeline/elev.py), and with the step-1 spot-checks.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { elevationAt } from '../src/core/dem';
import { loadPackFromDisk } from '../scripts/loadPack';

interface ReferenceCase {
  lat: number;
  lon: number;
  elevationM: number | null;
}

const root = join(__dirname, '..');
const pack = loadPackFromDisk('annapurna', root);
const reference = JSON.parse(
  readFileSync(join(root, 'tests', 'fixtures', 'annapurna_elev_reference.json'), 'utf8'),
) as { cases: ReferenceCase[] };

describe('annapurna pack: dem.ts vs Python elev.py', () => {
  it('loads the full grid', () => {
    expect(pack.dem.header.width).toBe(2400);
    expect(pack.dem.header.height).toBe(2160);
    expect(pack.dem.elevationsM.length).toBe(2400 * 2160);
  });

  it(`matches all ${reference.cases.length} reference points within 1 mm`, () => {
    const mismatches = reference.cases.filter((c) => {
      const e = elevationAt(pack.dem, c.lat, c.lon);
      if (c.elevationM === null || e === null) return c.elevationM !== e;
      return Math.abs(e - c.elevationM) > 1e-3;
    });
    expect(mismatches).toEqual([]);
  });

  it('reproduces the step-1 spot-checks', () => {
    const at = (lat: number, lon: number): number => Math.round(elevationAt(pack.dem, lat, lon)!);
    expect(at(28.2096, 83.9586)).toBe(808); // Pokhara Lakeside (target 750-850)
    expect(at(28.24625, 83.94881)).toBe(1564); // Sarangkot viewpoint (target 1500-1600)
    expect(at(28.5961, 83.8203)).toBeGreaterThan(7000); // Annapurna I
  });
});
