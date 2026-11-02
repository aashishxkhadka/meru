/** PackStore (SPEC 7): the bundled data pack, loaded into memory once at startup. */
import { create } from 'zustand';

import type { Pack } from '../core/pack';
import { DEFAULT_REGION_ID } from '../data/bundledPacks';
import { type PackLoadTiming, loadBundledPack } from '../data/loadBundledPack';

type PackState =
  | { status: 'idle' | 'loading'; pack: null; error: null; timing: null; demBytes: 0 }
  | { status: 'ready'; pack: Pack; error: null; timing: PackLoadTiming; demBytes: number }
  | { status: 'error'; pack: null; error: string; timing: null; demBytes: 0 };

interface PackStore {
  state: PackState;
  load: (regionId?: string) => Promise<void>;
  /** Clear an error and load again. */
  retry: () => Promise<void>;
}

export const usePackStore = create<PackStore>((set, get) => ({
  state: { status: 'idle', pack: null, error: null, timing: null, demBytes: 0 },
  load: async (regionId = DEFAULT_REGION_ID) => {
    if (get().state.status === 'loading' || get().state.status === 'ready') return;
    set({ state: { status: 'loading', pack: null, error: null, timing: null, demBytes: 0 } });
    try {
      const { pack, timing, demBytes } = await loadBundledPack(regionId);
      set({ state: { status: 'ready', pack, error: null, timing, demBytes } });
    } catch (e) {
      set({
        state: {
          status: 'error',
          pack: null,
          error: e instanceof Error ? e.message : String(e),
          timing: null,
          demBytes: 0,
        },
      });
    }
  },
  retry: async () => {
    set({ state: { status: 'idle', pack: null, error: null, timing: null, demBytes: 0 } });
    await get().load();
  },
}));

/** The loaded pack. Only call inside screens rendered after the root layout's loading gate. */
export function usePack(): Pack {
  const state = usePackStore((s) => s.state);
  if (state.status !== 'ready') throw new Error('usePack() called before the pack was loaded');
  return state.pack;
}
