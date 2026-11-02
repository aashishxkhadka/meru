/// <reference types="node" />
/** The bundled annapurna pack passes the same validation the app runs at startup. */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createPack } from '../src/core/pack';

const dir = join(__dirname, '..', 'assets', 'packs', 'annapurna');
const json = (f: string): unknown => JSON.parse(readFileSync(join(dir, f), 'utf8'));

describe('annapurna pack', () => {
  it('is valid', () => {
    const bytes = readFileSync(join(dir, 'dem.bin'));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pack = createPack(
      json('manifest.json'),
      buffer as ArrayBuffer,
      json('peaks.json'),
      json('viewpoints.json'),
    );
    expect(pack.peaks.length).toBeGreaterThan(100);
    expect(pack.viewpoints.map((v) => v.id)).toContain('sarangkot');
    expect(pack.manifest.attribution.join(' ')).toMatch(/Copernicus WorldDEM-30/);
    expect(pack.manifest.attribution.join(' ')).toMatch(/OpenStreetMap/);
  });
});
