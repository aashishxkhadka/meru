/**
 * OrientationStore (SPEC 7): smoothed camera pose at display rate.
 * - pitch/roll from gravity, heading from a tilt-compensated compass (gravity × magnetic field),
 *   so it is correct with the phone held upright (src/core/orientation.ts);
 * - expo-location heading supplies compass accuracy and magnetic declination, and is the
 *   heading fallback when there is no magnetometer.
 * Only this store updates per sensor sample; heavy math never runs here.
 */
import { create } from 'zustand';

import {
  type AngleFilterState,
  type ScalarFilterState,
  smoothAngleDeg,
  smoothScalar,
} from '../core/filters';
import { type Vec3, cameraOrientation, magneticFieldLooksDisturbed } from '../core/orientation';
import { headingSupported, startHeadingWatch } from '../sensors/heading';
import { motionSupported, startMotionWatch } from '../sensors/motion';

const PUBLISH_INTERVAL_MS = 33;

interface OrientationState {
  supported: boolean;
  active: boolean;
  /** Direction the back camera faces, degrees clockwise from true north. */
  headingDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  /** 0-3 from the platform compass; null if unknown. */
  headingAccuracy: number | null;
  magneticDisturbed: boolean;
  /** Reference-counted so several screens can share the sensors. */
  start: () => Promise<void>;
  stop: () => void;
}

let users = 0;
let starting = false;
let watches: { stop: () => void }[] = [];
let lastMagnetic: Vec3 | null = null;
let declinationDeg = 0;
let platformHeading: number | null = null;
let hasMagnetometer = false;
let headingFilter: AngleFilterState | null = null;
let rollFilter: AngleFilterState | null = null;
let pitchFilter: ScalarFilterState | null = null;
let lastPublish = 0;

function resetFilters(): void {
  headingFilter = rollFilter = null;
  pitchFilter = null;
  lastMagnetic = null;
  platformHeading = null;
}

export const useOrientationStore = create<OrientationState>((set) => ({
  supported: motionSupported || headingSupported,
  active: false,
  headingDeg: null,
  pitchDeg: null,
  rollDeg: null,
  headingAccuracy: null,
  magneticDisturbed: false,

  start: async () => {
    users++;
    if (watches.length > 0 || starting) return;
    starting = true;
    resetFilters();

    const onGravity = (g: Vec3) => {
      const o = cameraOrientation(g, hasMagnetometer ? lastMagnetic : null, declinationDeg);
      if (!o) return;
      const heading = o.headingDeg ?? (hasMagnetometer ? null : platformHeading);
      if (heading !== null) headingFilter = smoothAngleDeg(headingFilter, heading);
      pitchFilter = smoothScalar(pitchFilter, o.pitchDeg);
      rollFilter = smoothAngleDeg(rollFilter, o.rollDeg);
      const now = Date.now();
      if (now - lastPublish < PUBLISH_INTERVAL_MS) return;
      lastPublish = now;
      set({
        headingDeg: headingFilter?.outputDeg ?? null,
        pitchDeg: pitchFilter.output,
        rollDeg: rollFilter.outputDeg > 180 ? rollFilter.outputDeg - 360 : rollFilter.outputDeg,
      });
    };
    const onMagnetic = (m: Vec3) => {
      lastMagnetic = m;
      const disturbed = magneticFieldLooksDisturbed(m);
      if (disturbed !== useOrientationStore.getState().magneticDisturbed)
        set({ magneticDisturbed: disturbed });
    };

    const motion = await startMotionWatch(onGravity, onMagnetic);
    if (motion) {
      hasMagnetometer = motion.hasMagnetometer;
      watches.push(motion);
    }
    const heading = await startHeadingWatch((s) => {
      platformHeading = s.headingDeg;
      if (s.declinationDeg !== null) declinationDeg = s.declinationDeg;
      if (s.accuracy !== useOrientationStore.getState().headingAccuracy)
        set({ headingAccuracy: s.accuracy });
    });
    if (heading) watches.push(heading);
    starting = false;

    if (users === 0) {
      watches.forEach((w) => w.stop()); // everyone left while we were starting
      watches = [];
      return;
    }
    set({ active: watches.length > 0 });
  },

  stop: () => {
    users = Math.max(0, users - 1);
    if (users > 0) return;
    watches.forEach((w) => w.stop());
    watches = [];
    resetFilters();
    set({ active: false, headingDeg: null, pitchDeg: null, rollDeg: null });
  },
}));
