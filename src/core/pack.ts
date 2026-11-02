/**
 * Data pack types and validation (SPEC 4). Pure TypeScript, shared by device and Node.
 * A pack = manifest.json + dem.bin + peaks.json + viewpoints.json for one region.
 */

import { type Dem, type DemHeader, loadDem } from './dem';

export interface PackManifest {
  regionId: string;
  name: string;
  version: number;
  createdAt: string;
  dem: DemHeader & { file: string; resolutionArcSec?: number; source?: string };
  attribution: string[];
}

export interface PackPeak {
  id: string;
  name: string;
  nameNe: string;
  lat: number;
  lon: number;
  elevationM: number;
  prominenceM: number | null;
  rank: number;
  description: string;
  source: string;
}

export interface PackViewpoint {
  id: string;
  name: string;
  nameNe?: string;
  lat: number;
  lon: number;
  eyeHeightM: number;
  source?: string;
}

export interface Pack {
  manifest: PackManifest;
  dem: Dem;
  peaks: PackPeak[];
  viewpoints: PackViewpoint[];
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Build a Pack from raw parts, checking everything the engine relies on. Throws one Error
 * listing all problems, so a broken pack fails loudly at startup instead of mislabelling.
 */
export function createPack(
  manifest: unknown,
  demBuffer: ArrayBuffer,
  peaks: unknown,
  viewpoints: unknown,
): Pack {
  const problems: string[] = [];
  const m = manifest as Partial<PackManifest> | null;
  if (!m || !isNonEmptyString(m.regionId) || !m.dem) {
    throw new Error('Pack manifest is missing regionId or dem block');
  }
  if (!Array.isArray(m.attribution) || m.attribution.length === 0) {
    problems.push('manifest.attribution is empty (data attribution must be shown)');
  }

  let dem: Dem | null = null;
  try {
    dem = loadDem(demBuffer, m.dem);
  } catch (e) {
    problems.push(`dem: ${(e as Error).message}`);
  }
  const inBounds = (lat: number, lon: number) =>
    lat >= m.dem!.south && lat <= m.dem!.north && lon >= m.dem!.west && lon <= m.dem!.east;

  if (!Array.isArray(peaks) || peaks.length === 0) problems.push('peaks.json is empty');
  const peakIds = new Set<string>();
  for (const [i, p] of (Array.isArray(peaks) ? (peaks as Partial<PackPeak>[]) : []).entries()) {
    const where = `peaks[${i}] (${p?.id ?? '?'})`;
    if (!isNonEmptyString(p.id) || peakIds.has(p.id))
      problems.push(`${where}: id missing or duplicate`);
    else peakIds.add(p.id);
    if (!isNonEmptyString(p.name)) problems.push(`${where}: name missing`);
    if (!isFiniteNumber(p.lat) || !isFiniteNumber(p.lon) || !inBounds(p.lat, p.lon)) {
      problems.push(`${where}: coordinates missing or outside the DEM`);
    }
    if (!isFiniteNumber(p.elevationM) || p.elevationM <= 0)
      problems.push(`${where}: bad elevationM`);
    if (p.rank !== 1 && p.rank !== 2 && p.rank !== 3) problems.push(`${where}: rank must be 1-3`);
  }

  const vpIds = new Set<string>();
  for (const [i, v] of (Array.isArray(viewpoints)
    ? (viewpoints as Partial<PackViewpoint>[])
    : []
  ).entries()) {
    const where = `viewpoints[${i}] (${v?.id ?? '?'})`;
    if (!isNonEmptyString(v.id) || vpIds.has(v.id))
      problems.push(`${where}: id missing or duplicate`);
    else vpIds.add(v.id);
    if (!isFiniteNumber(v.lat) || !isFiniteNumber(v.lon) || !inBounds(v.lat, v.lon)) {
      problems.push(`${where}: coordinates missing or outside the DEM`);
    }
    if (!isFiniteNumber(v.eyeHeightM)) problems.push(`${where}: eyeHeightM missing`);
  }

  if (problems.length > 0 || dem === null) {
    throw new Error(`Invalid data pack "${m.regionId}":\n- ${problems.join('\n- ')}`);
  }
  return {
    manifest: m as PackManifest,
    dem,
    peaks: peaks as PackPeak[],
    viewpoints: viewpoints as PackViewpoint[],
  };
}
