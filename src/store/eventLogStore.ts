/**
 * Offline event log (SPEC 9): app open, labels shown, calibration, photos. Stored on the device
 * only; exported by hand from the debug screen. Writes are batched (every few seconds and when
 * the app goes to the background) so logging never costs battery or frame time.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import {
  type AppEvent,
  type EventType,
  type EventValue,
  MAX_EVENTS,
  appendEvents,
  buildEventExport,
  cleanEventData,
} from '../core/eventLog';
import {
  appendStoredEvents,
  readStoredEvents,
  rewriteStoredEvents,
  shareEventExport,
} from './eventLogStorage';

const INSTALL_ID_KEY = 'meru.installId.v1';
const FLUSH_DELAY_MS = 3000;

interface EventLogState {
  events: AppEvent[];
  loaded: boolean;
  load: () => Promise<void>;
  exportLog: (regionPack: string) => Promise<void>;
  clear: () => Promise<void>;
}

let pending: AppEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installId: string | null = null;

async function flush(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!useEventLogStore.getState().loaded || pending.length === 0) return;
  const batch = pending;
  pending = [];
  try {
    await appendStoredEvents(batch);
  } catch {
    // logging must never break the app
  }
}

/** Record an event. Cheap: in memory now, written to the file in a batch later. */
export function logEvent(type: EventType, data?: Record<string, EventValue | undefined>): void {
  const e: AppEvent = data
    ? { t: Date.now(), type, data: cleanEventData(data) }
    : { t: Date.now(), type };
  pending.push(e);
  useEventLogStore.setState((s) => ({ events: appendEvents(s.events, [e]) }));
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

async function getInstallId(): Promise<string> {
  if (installId) return installId;
  try {
    installId = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (!installId) {
      installId = Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('');
      await AsyncStorage.setItem(INSTALL_ID_KEY, installId);
    }
  } catch {
    installId = 'unknown';
  }
  return installId;
}

export const useEventLogStore = create<EventLogState>((set, get) => ({
  events: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    let stored: AppEvent[] = [];
    try {
      stored = await readStoredEvents();
      if (stored.length > MAX_EVENTS * 1.2) {
        stored = appendEvents([], stored);
        await rewriteStoredEvents(stored);
      }
    } catch {
      // unreadable log: start a fresh one
    }
    // events logged before loading finished stay in `pending` and are written by flush()
    set((s) => ({ events: appendEvents(stored, s.events), loaded: true }));
    void flush();
  },

  exportLog: async (regionPack) => {
    await flush();
    const doc = buildEventExport(get().events, {
      version: Constants.expoConfig?.version ?? '?',
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      regionPack,
      installId: await getInstallId(),
      now: Date.now(),
    });
    await shareEventExport(doc);
  },

  clear: async () => {
    pending = [];
    set({ events: [] });
    await rewriteStoredEvents([]);
  },
}));

AppState.addEventListener('change', (s) => {
  if (s !== 'active') void flush();
});
