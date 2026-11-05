/**
 * LocationStore (SPEC 7): where the observer is. Either a live GPS fix or a simulated
 * viewpoint chosen in the picker (for testing, and when the first fix is slow offline).
 */
import { create } from 'zustand';

import type { PackViewpoint } from '../core/pack';
import { logEvent } from './eventLogStore';
import { type GpsFix, type GpsWatch, startGpsWatch } from '../sensors/gps';

/** A fix counts as "fixed" once it is at least this accurate. */
export const FIX_ACCURACY_M = 100;
export const GPS_EYE_HEIGHT_M = 1.7;

export type GpsStatus =
  'idle' | 'requesting' | 'denied' | 'services-off' | 'searching' | 'fixed' | 'error';

export interface ObserverPosition {
  lat: number;
  lon: number;
  eyeHeightM: number;
  /** For display: viewpoint name or "GPS ±12 m". */
  label: string;
}

interface LocationState {
  source: 'gps' | 'simulated';
  gpsStatus: GpsStatus;
  /** Latest GPS fix (may be inaccurate while searching). */
  fix: GpsFix | null;
  searchStartedAt: number | null;
  gpsError: string | null;
  viewpoint: PackViewpoint | null;
  startGps: () => Promise<void>;
  simulate: (viewpoint: PackViewpoint) => void;
}

let watch: GpsWatch | null = null;

function stopWatch(): void {
  watch?.stop();
  watch = null;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  source: 'gps',
  gpsStatus: 'idle',
  fix: null,
  searchStartedAt: null,
  gpsError: null,
  viewpoint: null,

  startGps: async () => {
    set({ source: 'gps', viewpoint: null });
    const status = get().gpsStatus;
    if (watch || status === 'requesting') return;
    set({ gpsStatus: 'requesting', gpsError: null });
    try {
      const { result, watch: w } = await startGpsWatch(
        (fix) => {
          const accurate = fix.accuracyM !== null && fix.accuracyM <= FIX_ACCURACY_M;
          const prev = get();
          if (accurate && prev.gpsStatus !== 'fixed') {
            logEvent('location_set', {
              source: 'gps',
              accuracyM: fix.accuracyM,
              secondsToFix: prev.searchStartedAt
                ? (Date.now() - prev.searchStartedAt) / 1000
                : undefined,
            });
          }
          set({ fix, gpsStatus: accurate ? 'fixed' : 'searching' });
        },
        (message) => set({ gpsError: message }),
      );
      if (result !== 'started') {
        set({ gpsStatus: result });
        return;
      }
      if (get().source !== 'gps') {
        w?.stop(); // user picked a viewpoint while we were asking for permission
        set({ gpsStatus: 'idle' });
        return;
      }
      watch = w;
      if (get().gpsStatus === 'requesting')
        set({ gpsStatus: 'searching', searchStartedAt: Date.now() });
    } catch (e) {
      set({ gpsStatus: 'error', gpsError: e instanceof Error ? e.message : String(e) });
    }
  },

  simulate: (viewpoint) => {
    stopWatch(); // save battery while simulating
    set({ source: 'simulated', viewpoint, gpsStatus: 'idle', searchStartedAt: null });
    logEvent('location_set', { source: 'simulated', viewpoint: viewpoint.id });
  },
}));

/** Position to compute the scene for, or null while there is none yet. */
export function selectObserverPosition(s: LocationState): ObserverPosition | null {
  if (s.source === 'simulated' && s.viewpoint) {
    const v = s.viewpoint;
    return { lat: v.lat, lon: v.lon, eyeHeightM: v.eyeHeightM, label: v.name };
  }
  if (s.gpsStatus === 'fixed' && s.fix) {
    return {
      lat: s.fix.lat,
      lon: s.fix.lon,
      eyeHeightM: GPS_EYE_HEIGHT_M,
      label: `GPS ±${Math.round(s.fix.accuracyM ?? 0)} m`,
    };
  }
  return null;
}
