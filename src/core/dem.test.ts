import { describe, expect, it } from '@jest/globals';

import { type DemHeader, elevationAt, loadDem, observerElevationM } from './dem';

const NO_DATA = -32768;

/** 3x3 grid, 1° pixels, bbox lon 0..3, lat 0..3. Row 0 is the NORTH row (lat 2.5). */
const HEADER: DemHeader = {
  width: 3,
  height: 3,
  north: 3,
  south: 0,
  west: 0,
  east: 3,
  noData: NO_DATA,
};
const VALUES = [
  10,
  20,
  30, // row 0, lat 2.5
  40,
  50,
  60, // row 1, lat 1.5
  70,
  80,
  90, // row 2, lat 0.5
];

/** Build the buffer exactly as dem.bin is written: Int16 little-endian. */
function int16LeBuffer(values: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));
  return buffer;
}

const dem = loadDem(int16LeBuffer(VALUES), HEADER);

describe('loadDem', () => {
  it('reads Int16 little-endian values', () => {
    expect(Array.from(dem.elevationsM)).toEqual(VALUES);
    expect(dem.cellLonDeg).toBe(1);
    expect(dem.cellLatDeg).toBe(1);
  });

  it('reads negative and large elevations', () => {
    const d = loadDem(int16LeBuffer([-5, 8848, 0, 32767]), { ...HEADER, width: 2, height: 2 });
    expect(Array.from(d.elevationsM)).toEqual([-5, 8848, 0, 32767]);
  });

  it('rejects a buffer that does not match the header', () => {
    expect(() => loadDem(new ArrayBuffer(10), HEADER)).toThrow(/needs 18/);
  });

  it('rejects a degenerate grid size', () => {
    expect(() => loadDem(int16LeBuffer([1]), { ...HEADER, width: 1, height: 1 })).toThrow(/>= 2/);
  });

  it('rejects inverted bounds', () => {
    expect(() => loadDem(int16LeBuffer(VALUES), { ...HEADER, north: 0, south: 3 })).toThrow();
  });

  it('ignores extra manifest fields', () => {
    const d = loadDem(int16LeBuffer(VALUES), {
      ...HEADER,
      file: 'dem.bin',
      resolutionArcSec: 3,
    } as DemHeader);
    expect(d.header).toEqual(HEADER);
  });
});

describe('elevationAt', () => {
  it('returns exact values at pixel centres, north row first', () => {
    expect(elevationAt(dem, 2.5, 0.5)).toBe(10); // north-west
    expect(elevationAt(dem, 2.5, 2.5)).toBe(30); // north-east
    expect(elevationAt(dem, 1.5, 1.5)).toBe(50); // centre
    expect(elevationAt(dem, 0.5, 0.5)).toBe(70); // south-west
    expect(elevationAt(dem, 0.5, 2.5)).toBe(90); // south-east
  });

  it('interpolates midpoints bilinearly', () => {
    expect(elevationAt(dem, 2.5, 1.0)).toBe(15); // between 10 and 20
    expect(elevationAt(dem, 2.0, 0.5)).toBe(25); // between 10 and 40
    expect(elevationAt(dem, 2.0, 1.0)).toBe(30); // centre of 10, 20, 40, 50
    // cell 50/60/80/90, tx = 0.75, ty = 0.25: top 57.5, bottom 87.5 -> 65
    expect(elevationAt(dem, 1.25, 2.25)).toBeCloseTo(65, 9);
  });

  it('clamps to edge pixels inside the bbox', () => {
    expect(elevationAt(dem, 3, 0)).toBe(10); // exact NW corner of bbox
    expect(elevationAt(dem, 0, 3)).toBe(90); // exact SE corner of bbox
    expect(elevationAt(dem, 2.9, 1.0)).toBe(15);
  });

  it('returns null outside the bbox', () => {
    expect(elevationAt(dem, 3.0001, 1)).toBeNull();
    expect(elevationAt(dem, -0.0001, 1)).toBeNull();
    expect(elevationAt(dem, 1, -0.0001)).toBeNull();
    expect(elevationAt(dem, 1, 3.0001)).toBeNull();
    expect(elevationAt(dem, Number.NaN, 1)).toBeNull();
  });

  it('returns null when a contributing pixel is noData, values elsewhere', () => {
    const holes = [...VALUES];
    holes[0] = NO_DATA; // north-west pixel
    const d = loadDem(int16LeBuffer(holes), HEADER);
    expect(elevationAt(d, 2.0, 1.0)).toBeNull(); // uses the NW pixel
    expect(elevationAt(d, 1.0, 2.0)).toBe(70); // centre of 50, 60, 80, 90
  });
});

describe('observerElevationM', () => {
  it('adds eye height to the DEM ground elevation', () => {
    expect(observerElevationM(dem, { lat: 1.5, lon: 1.5 }, 1.7)).toBeCloseTo(51.7, 9);
  });

  it('is null outside the DEM', () => {
    expect(observerElevationM(dem, { lat: 10, lon: 10 }, 1.7)).toBeNull();
  });
});
