/// <reference types="node" />
/**
 * Print the elevation at one or more lat/lon points from a pack, using src/core/dem.ts.
 * Should agree with tools/pipeline/elev.py (same pixel convention, same bilinear rule).
 *
 *   npm run elev -- 28.24625 83.94881
 *   npm run elev -- --region annapurna 28.2096 83.9586 28.5961 83.8203
 */

import { elevationAt } from '../src/core/dem';
import { loadPackFromDisk } from './loadPack';

function main(argv: string[]): number {
  let regionId = 'annapurna';
  const numbers: number[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--region') regionId = argv[++i] ?? regionId;
    else numbers.push(Number(arg));
  }
  if (numbers.length === 0 || numbers.length % 2 !== 0 || numbers.some(Number.isNaN)) {
    console.error('usage: npm run elev -- [--region id] lat lon [lat lon ...]');
    return 1;
  }

  const pack = loadPackFromDisk(regionId);
  const h = pack.dem.header;
  console.log(
    `${pack.manifest.name}: ${h.width} x ${h.height}, loaded in ${pack.loadMs.toFixed(0)} ms`,
  );
  for (let i = 0; i < numbers.length; i += 2) {
    const lat = numbers[i]!;
    const lon = numbers[i + 1]!;
    const elevM = elevationAt(pack.dem, lat, lon);
    console.log(
      `${lat.toFixed(5)}, ${lon.toFixed(5)}  ->  ${elevM === null ? 'outside DEM / nodata' : `${elevM.toFixed(0)} m`}`,
    );
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
