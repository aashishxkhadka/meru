/// <reference types="node" />
/** Node-only helper: load a bundled data pack from assets/packs/<regionId>/ for scripts. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Dem, type DemHeader, loadDem } from '../src/core/dem';

export interface PackFiles {
  manifest: { regionId: string; name: string; dem: DemHeader & { file: string } };
  dem: Dem;
  loadMs: number;
}

export function loadPackFromDisk(regionId: string, root = join(__dirname, '..')): PackFiles {
  const t0 = performance.now();
  const dir = join(root, 'assets', 'packs', regionId);
  const manifest = JSON.parse(
    readFileSync(join(dir, 'manifest.json'), 'utf8'),
  ) as PackFiles['manifest'];
  const bytes = readFileSync(join(dir, manifest.dem.file));
  // Copy into a standalone ArrayBuffer (Node Buffers can share a larger pool).
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const dem = loadDem(buffer, manifest.dem);
  return { manifest, dem, loadMs: performance.now() - t0 };
}
