/** Native: copy the bundled asset to a local file if needed, then read its bytes. Offline. */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

export interface AssetReadTiming {
  resolveMs: number;
  readMs: number;
}

export async function readAssetBytes(
  moduleId: number,
): Promise<{ buffer: ArrayBuffer; timing: AssetReadTiming }> {
  const t0 = performance.now();
  const asset = await Asset.fromModule(moduleId).downloadAsync();
  if (!asset.localUri) throw new Error(`Asset ${asset.name} has no local file`);
  const t1 = performance.now();
  const bytes = await new File(asset.localUri).bytes();
  const t2 = performance.now();
  const buffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { buffer: buffer as ArrayBuffer, timing: { resolveMs: t1 - t0, readMs: t2 - t1 } };
}
