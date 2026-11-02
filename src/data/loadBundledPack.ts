import { type Pack, createPack } from '../core/pack';
import { BUNDLED_PACKS } from './bundledPacks';
import { readAssetBytes } from './readAssetBytes';

export interface PackLoadTiming {
  resolveMs: number;
  readMs: number;
  parseMs: number;
  totalMs: number;
}

/** Load a bundled pack fully into memory (DEM as Int16Array). Never touches the network. */
export async function loadBundledPack(
  regionId: string,
): Promise<{ pack: Pack; timing: PackLoadTiming; demBytes: number }> {
  const source = BUNDLED_PACKS[regionId];
  if (!source) throw new Error(`No bundled pack "${regionId}"`);
  const t0 = performance.now();
  const { buffer, timing } = await readAssetBytes(source.dem);
  const t1 = performance.now();
  const pack = createPack(source.manifest, buffer, source.peaks, source.viewpoints);
  const t2 = performance.now();
  return {
    pack,
    demBytes: buffer.byteLength,
    timing: { ...timing, parseMs: t2 - t1, totalMs: t2 - t0 },
  };
}
