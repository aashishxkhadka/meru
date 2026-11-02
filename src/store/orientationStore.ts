/**
 * OrientationStore (SPEC 7): smoothed device orientation. Step 7 needs heading only;
 * step 8 adds pitch and roll from DeviceMotion.
 */
import { create } from 'zustand';

import { type AngleFilterState, smoothAngleDeg } from '../core/filters';
import { headingSupported, startHeadingWatch } from '../sensors/heading';

interface OrientationState {
  supported: boolean;
  active: boolean;
  /** Smoothed heading, degrees clockwise from true north. */
  headingDeg: number | null;
  headingAccuracy: number | null;
  isTrueNorth: boolean;
  /** Start/stop are reference-counted so several screens can share the sensor. */
  start: () => Promise<void>;
  stop: () => void;
}

let users = 0;
let watch: { stop: () => void } | null = null;
let filter: AngleFilterState | null = null;

export const useOrientationStore = create<OrientationState>((set) => ({
  supported: headingSupported,
  active: false,
  headingDeg: null,
  headingAccuracy: null,
  isTrueNorth: false,

  start: async () => {
    users++;
    if (watch || !headingSupported) return;
    const w = await startHeadingWatch((s) => {
      filter = smoothAngleDeg(filter, s.headingDeg);
      set({
        headingDeg: filter.outputDeg,
        headingAccuracy: s.accuracy,
        isTrueNorth: s.isTrueNorth,
      });
    });
    if (users === 0) {
      w?.stop(); // everyone left while we were starting
      return;
    }
    watch = w;
    set({ active: w !== null });
  },

  stop: () => {
    users = Math.max(0, users - 1);
    if (users > 0) return;
    watch?.stop();
    watch = null;
    filter = null;
    set({ active: false, headingDeg: null });
  },
}));
