/** Web: bundled assets are served next to the app; fetch them. */
import { Asset } from 'expo-asset';

import type { AssetReadTiming } from './readAssetBytes';

export async function readAssetBytes(
  moduleId: number,
): Promise<{ buffer: ArrayBuffer; timing: AssetReadTiming }> {
  const t0 = performance.now();
  const asset = Asset.fromModule(moduleId);
  const t1 = performance.now();
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error(`Failed to load ${asset.uri}: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return { buffer, timing: { resolveMs: t1 - t0, readMs: performance.now() - t1 } };
}
