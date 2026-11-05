import { describe, expect, it } from '@jest/globals';

import {
  type AppEvent,
  appendEvents,
  buildEventExport,
  cleanEventData,
  countByType,
  parseEventLines,
  serializeEvent,
  shouldLogChange,
} from './eventLog';

const ev = (t: number, type: AppEvent['type'] = 'app_open'): AppEvent => ({ t, type });

describe('event log', () => {
  it('appends and drops the oldest beyond the limit', () => {
    const log = appendEvents([ev(1), ev(2)], [ev(3), ev(4)], 3);
    expect(log.map((e) => e.t)).toEqual([2, 3, 4]);
  });

  it('round-trips through JSON lines and skips broken lines', () => {
    const events = [ev(1), { t: 2, type: 'photo_taken' as const, data: { labels: 7 } }];
    const text = `${events.map(serializeEvent).join('\n')}\n{"t":3,"ty`; // last write cut off
    expect(parseEventLines(text)).toEqual(events);
    expect(parseEventLines('')).toEqual([]);
    expect(parseEventLines('null\n42\n{"x":1}')).toEqual([]);
  });

  it('cleans event data: rounds numbers, drops undefined, NaN -> null', () => {
    expect(
      cleanEventData({ a: 1.23456, b: undefined, c: Number.NaN, d: 'x', e: false, f: null }),
    ).toEqual({ a: 1.23, c: null, d: 'x', e: false, f: null });
  });

  it('counts by type and builds the export document', () => {
    const events = [ev(1), ev(2, 'photo_taken'), ev(3, 'photo_taken')];
    expect(countByType(events)).toEqual({ app_open: 1, photo_taken: 2 });
    const doc = buildEventExport(events, {
      version: '0.1.0',
      platform: 'android',
      osVersion: '14',
      regionPack: 'annapurna v1',
      installId: 'abc',
      now: Date.UTC(2026, 10, 5),
    });
    expect(doc.format).toBe('meru-events');
    expect(doc.exportedAt).toBe('2026-11-05T00:00:00.000Z');
    expect(doc.app).toEqual({
      version: '0.1.0',
      platform: 'android',
      osVersion: '14',
      regionPack: 'annapurna v1',
    });
    expect(doc.installId).toBe('abc');
    expect(doc.counts.photo_taken).toBe(2);
    expect(doc.events).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it('throttles repeated measurements to changes, at most every gap', () => {
    expect(shouldLogChange(null, 5, 0, 5000)).toBe(true);
    expect(shouldLogChange({ value: 5, t: 0 }, 5, 99_000, 5000)).toBe(false); // unchanged
    expect(shouldLogChange({ value: 5, t: 0 }, 6, 1000, 5000)).toBe(false); // too soon
    expect(shouldLogChange({ value: 5, t: 0 }, 6, 5000, 5000)).toBe(true);
  });
});
