/** Startup timing: imported first by the root layout, so this is (close to) JS start. */
const JS_START_MS = Date.now();
let readyMs: number | null = null;

/** Call once the pack is loaded and the first screen can show. Returns ms since JS start. */
export function markAppReady(): number {
  if (readyMs === null) readyMs = Date.now() - JS_START_MS;
  return readyMs;
}

export const appReadyMs = (): number | null => readyMs;
