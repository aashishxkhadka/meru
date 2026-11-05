/** App settings kept on the device (AsyncStorage). Currently: has onboarding been shown. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const ONBOARDED_KEY = 'meru.onboarded.v1';

interface SettingsState {
  /** null until loaded. */
  onboarded: boolean | null;
  load: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  onboarded: null,

  load: async () => {
    if (get().onboarded !== null) return;
    try {
      set({ onboarded: (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1' });
    } catch {
      set({ onboarded: true }); // storage broken: don't trap the user in onboarding
    }
  },

  completeOnboarding: async () => {
    set({ onboarded: true });
    try {
      await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // shown again next launch at worst
    }
  },
}));
