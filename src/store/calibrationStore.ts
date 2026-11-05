/**
 * CalibrationStore (SPEC 3.3, 7): heading/pitch offsets and optional FOV override, saved per
 * device with AsyncStorage and applied in projectToScreen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { clampOffsets, parseCalibration } from '../core/calibration';
import { type CalibrationOffsets, NO_CALIBRATION } from '../core/projection';
import { logEvent } from './eventLogStore';

const KEY = 'meru.calibration.v1';

interface CalibrationState {
  offsets: CalibrationOffsets;
  /** Horizontal FOV set by hand (advanced); null = from the camera's lens. */
  hFovOverrideDeg: number | null;
  /** When the user last saved a calibration (ms); null = never / reset. */
  calibratedAt: number | null;
  loaded: boolean;
  load: () => Promise<void>;
  save: (offsets: CalibrationOffsets, hFovOverrideDeg: number | null) => Promise<void>;
  reset: () => Promise<void>;
}

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  offsets: NO_CALIBRATION,
  hFovOverrideDeg: null,
  calibratedAt: null,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed = raw ? parseCalibration(JSON.parse(raw)) : null;
      set({ ...(parsed ?? {}), loaded: true });
    } catch {
      set({ loaded: true }); // unreadable storage: start uncalibrated
    }
  },

  save: async (offsets, hFovOverrideDeg) => {
    const clean = clampOffsets(offsets).offsets;
    if (clean.headingOffsetDeg === 0 && clean.pitchOffsetDeg === 0 && hFovOverrideDeg === null) {
      return get().reset();
    }
    const calibratedAt = Date.now();
    set({ offsets: clean, hFovOverrideDeg, calibratedAt });
    logEvent('calibration_saved', { ...clean, hFovOverrideDeg });
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify({ ...clean, hFovOverrideDeg, calibratedAt }));
    } catch {
      // keep the in-memory calibration even if it cannot be saved
    }
  },

  reset: async () => {
    if (get().calibratedAt !== null) logEvent('calibration_reset');
    set({ offsets: NO_CALIBRATION, hFovOverrideDeg: null, calibratedAt: null });
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // nothing saved is fine
    }
  },
}));
