/**
 * DEM pack reader + bilinear elevation lookup (SPEC 4 and 6.2).
 * Pure TypeScript: works on an ArrayBuffer in Node (tests, scripts) and on device.
 *
 * Grid layout (manifest.json "dem" block): Int16 little-endian metres, row-major,
 * north row first. Pixel (col, row) centre:
 *   lon = west + (col + 0.5) * (east - west) / width
 *   lat = north - (row + 0.5) * (north - south) / height
 */

import type { LatLon } from './geo';

/** The fields of manifest.json "dem" that the reader needs; extra fields are ignored. */
export interface DemHeader {
  width: number;
  height: number;
  north: number;
  south: number;
  west: number;
  east: number;
  noData: number;
}

export interface Dem {
  readonly header: DemHeader;
  /** Elevations in metres, row-major, north row first. */
  readonly elevationsM: Int16Array;
  /** Pixel size in degrees. */
  readonly cellLonDeg: number;
  readonly cellLatDeg: number;
}

function isLittleEndianPlatform(): boolean {
  return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
}

/** Wrap a dem.bin buffer. Throws if the buffer size or header is inconsistent. */
export function loadDem(buffer: ArrayBuffer, header: DemHeader): Dem {
  const { width, height, north, south, west, east } = header;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error(`DEM header: width/height must be integers >= 2 (got ${width} x ${height})`);
  }
  if (!(north > south) || !(east > west)) {
    throw new Error('DEM header: bounds must satisfy north > south and east > west');
  }
  const expectedBytes = width * height * 2;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `DEM buffer is ${buffer.byteLength} bytes, header ${width} x ${height} needs ${expectedBytes}`,
    );
  }

  let elevationsM: Int16Array;
  if (isLittleEndianPlatform()) {
    elevationsM = new Int16Array(buffer);
  } else {
    const view = new DataView(buffer);
    elevationsM = new Int16Array(width * height);
    for (let i = 0; i < elevationsM.length; i++) elevationsM[i] = view.getInt16(i * 2, true);
  }

  return {
    header: { width, height, north, south, west, east, noData: header.noData },
    elevationsM,
    cellLonDeg: (east - west) / width,
    cellLatDeg: (north - south) / height,
  };
}

/**
 * Bilinear elevation (metres) between the four surrounding pixel centres.
 * Returns null outside the DEM bounds or when any of the four pixels is noData.
 * Inside the bounds but within half a pixel of the edge, the edge pixels are used (clamped).
 */
export function elevationAt(dem: Dem, lat: number, lon: number): number | null {
  const { width, height, north, south, west, east, noData } = dem.header;
  if (!(lat >= south && lat <= north && lon >= west && lon <= east)) return null;

  const colF = clamp((lon - west) / dem.cellLonDeg - 0.5, 0, width - 1);
  const rowF = clamp((north - lat) / dem.cellLatDeg - 0.5, 0, height - 1);
  const col0 = Math.min(Math.floor(colF), width - 2);
  const row0 = Math.min(Math.floor(rowF), height - 2);
  const tx = colF - col0;
  const ty = rowF - row0;

  const e = dem.elevationsM;
  const i = row0 * width + col0;
  const q00 = e[i]!;
  const q01 = e[i + 1]!;
  const q10 = e[i + width]!;
  const q11 = e[i + width + 1]!;
  if (q00 === noData || q01 === noData || q10 === noData || q11 === noData) return null;

  const top = q00 + (q01 - q00) * tx;
  const bottom = q10 + (q11 - q10) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Observer eye elevation: terrain from the DEM plus eye height. The DEM is preferred over GPS
 * altitude even when GPS is available, so horizon and peak angles use one consistent surface.
 */
export function observerElevationM(dem: Dem, position: LatLon, eyeHeightM: number): number | null {
  const groundM = elevationAt(dem, position.lat, position.lon);
  return groundM === null ? null : groundM + eyeHeightM;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
