/**
 * SceneStore (SPEC 7): horizon + visible peaks for the current position. Recomputed only when
 * the observer moves >= 50 m, in chunks between UI frames, cached on a ~50 m grid.
 */
import { create } from 'zustand';

import type { Pack, PackPeak } from '../core/pack';
import {
  OutsideDemError,
  type Scene,
  SceneCache,
  SceneCancelledError,
  computeScene,
  gridKey,
  needsRecompute,
} from '../core/scene';
import { logEvent } from './eventLogStore';
import type { ObserverPosition } from './locationStore';

export type PackScene = Scene<PackPeak>;

interface SceneState {
  status: 'idle' | 'computing' | 'ready' | 'outside' | 'error';
  scene: PackScene | null;
  /** Label of the position the scene belongs to. */
  label: string | null;
  /** Observer position (incl. eye height) the current scene belongs to. */
  position: ObserverPosition | null;
  error: string | null;
  lastComputeMs: number | null;
  computeCount: number;
  cacheHits: number;
  update: (pack: Pack, position: ObserverPosition | null) => void;
}

const cache = new SceneCache<PackScene>(8);
let inflight: { cancelled: boolean } | null = null;
let inflightFor: ObserverPosition | null = null;
const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const cacheKey = (p: ObserverPosition) => `${gridKey(p)}@${p.eyeHeightM}`;

export const useSceneStore = create<SceneState>((set, get) => ({
  status: 'idle',
  scene: null,
  label: null,
  position: null,
  error: null,
  lastComputeMs: null,
  computeCount: 0,
  cacheHits: 0,

  update: (pack, position) => {
    if (!position) return; // keep the last scene while GPS searches
    const covers = (at: ObserverPosition | null) =>
      at !== null && at.eyeHeightM === position.eyeHeightM && !needsRecompute(at, position);

    // 1) A computation for (nearly) this spot is already running: let it finish.
    if (inflight && covers(inflightFor)) return;
    // 2) The current scene still covers this spot (moved < 50 m): just refresh the label.
    if (!inflight && covers(get().position)) {
      if (get().label !== position.label) set({ label: position.label });
      return;
    }
    const cached = cache.get(cacheKey(position));
    if (cached) {
      if (inflight) inflight.cancelled = true;
      inflight = null;
      set((s) => ({
        status: 'ready',
        scene: cached,
        label: position.label,
        position,
        error: null,
        cacheHits: s.cacheHits + 1,
      }));
      logEvent('scene_ready', {
        visiblePeaks: cached.peaks.filter((r) => r.visible).length,
        cached: true,
      });
      return;
    }

    if (inflight) inflight.cancelled = true;
    const token = { cancelled: false };
    inflight = token;
    inflightFor = position;
    set({ status: 'computing', error: null });
    computeScene(pack.dem, position, pack.peaks, {
      eyeHeightM: position.eyeHeightM,
      yieldFn: nextTick,
      token,
    })
      .then((result) => {
        if (token.cancelled) return;
        cache.set(cacheKey(position), result);
        inflight = null;
        set((s) => ({
          status: 'ready',
          scene: result,
          label: position.label,
          position,
          lastComputeMs: result.timing.horizonMs + result.timing.visibilityMs,
          computeCount: s.computeCount + 1,
        }));
        logEvent('scene_ready', {
          visiblePeaks: result.peaks.filter((r) => r.visible).length,
          computeMs: result.timing.horizonMs + result.timing.visibilityMs,
          wallMs: result.timing.totalMs,
          cached: false,
        });
      })
      .catch((e: unknown) => {
        if (e instanceof SceneCancelledError || token.cancelled) return;
        inflight = null;
        if (e instanceof OutsideDemError)
          set({
            status: 'outside',
            scene: null,
            label: position.label,
            position,
            error: e.message,
          });
        else set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      });
  },
}));
