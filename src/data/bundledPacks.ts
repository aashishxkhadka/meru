/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles assets via static require() */
/**
 * Data packs bundled into the app binary. Metro needs static require() calls, so each region
 * is listed here once. Adding a region = generating its pack + one entry below; no logic changes.
 */

export interface BundledPackSource {
  manifest: unknown;
  peaks: unknown;
  viewpoints: unknown;
  /** Metro asset module id for dem.bin. */
  dem: number;
}

export const BUNDLED_PACKS: Record<string, BundledPackSource> = {
  annapurna: {
    manifest: require('../../assets/packs/annapurna/manifest.json'),
    peaks: require('../../assets/packs/annapurna/peaks.json'),
    viewpoints: require('../../assets/packs/annapurna/viewpoints.json'),
    dem: require('../../assets/packs/annapurna/dem.bin'),
  },
};

export const DEFAULT_REGION_ID = 'annapurna';
