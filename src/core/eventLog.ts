/**
 * Offline event log (SPEC 9). Pure TypeScript: event shape, trimming, file (JSON lines)
 * parsing and the export document. Storage and sharing live in src/store/eventLogStore.ts.
 * Nothing here ever touches the network.
 */

export type EventType =
  | 'app_open'
  | 'onboarding_done'
  | 'location_set'
  | 'scene_ready'
  | 'mode_changed'
  | 'labels_shown'
  | 'calibration_saved'
  | 'calibration_reset'
  | 'photo_taken'
  | 'photo_failed'
  | 'photo_saved'
  | 'photo_shared';

export type EventValue = string | number | boolean | null;

export interface AppEvent {
  /** Unix time, ms. */
  t: number;
  type: EventType;
  data?: Record<string, EventValue>;
}

/** Keep the log small: oldest events are dropped beyond this. */
export const MAX_EVENTS = 5000;

export function appendEvents(
  log: readonly AppEvent[],
  events: readonly AppEvent[],
  maxEvents = MAX_EVENTS,
): AppEvent[] {
  const all = [...log, ...events];
  return all.length > maxEvents ? all.slice(all.length - maxEvents) : all;
}

/** Round numbers so the log stays readable (offsets in 0.01°, times in whole ms). */
export function cleanEventData(
  data: Record<string, EventValue | undefined>,
): Record<string, EventValue> {
  const out: Record<string, EventValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (typeof v === 'number') {
      out[k] = Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const serializeEvent = (e: AppEvent): string => JSON.stringify(e);

const isEvent = (v: unknown): v is AppEvent =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as AppEvent).t === 'number' &&
  typeof (v as AppEvent).type === 'string';

/** Parse a JSON-lines log file; broken lines (e.g. a write cut off by a crash) are skipped. */
export function parseEventLines(text: string): AppEvent[] {
  const events: AppEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const v: unknown = JSON.parse(line);
      if (isEvent(v)) events.push(v);
    } catch {
      // skip
    }
  }
  return events;
}

export function countByType(events: readonly AppEvent[]): Partial<Record<EventType, number>> {
  const counts: Partial<Record<EventType, number>> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

export interface EventExport {
  format: 'meru-events';
  formatVersion: 1;
  exportedAt: string;
  app: { version: string; platform: string; osVersion: string; regionPack: string };
  /** Random per-install id (no personal data) so several testers' files can be told apart. */
  installId: string;
  counts: Partial<Record<EventType, number>>;
  events: AppEvent[];
}

export function buildEventExport(
  events: readonly AppEvent[],
  meta: EventExport['app'] & { installId: string; now: number },
): EventExport {
  const { installId, now, ...app } = meta;
  return {
    format: 'meru-events',
    formatVersion: 1,
    exportedAt: new Date(now).toISOString(),
    app,
    installId,
    counts: countByType(events),
    events: [...events],
  };
}

/** Throttle for repeated measurements (e.g. label counts): log on change, at most every `minGapMs`. */
export function shouldLogChange<T>(
  last: { value: T; t: number } | null,
  value: T,
  now: number,
  minGapMs: number,
): boolean {
  if (last === null) return true;
  return last.value !== value && now - last.t >= minGapMs;
}
