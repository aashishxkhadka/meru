import { describe, expect, it } from '@jest/globals';

import {
  type MeasureText,
  type PhotoPeak,
  composePhoto,
  ellipsize,
  photoPlaceName,
  stillPhotoView,
  wrapPeakNames,
} from './photoComposition';
import { projectToScreen, visibleFovForCover } from './projection';

/** Monospace-ish stand-in for real font metrics. */
const measure: MeasureText = (text, font) => text.length * font.sizePx * 0.55;

const sensor = { hFovDeg: 50, vFovDeg: 63.5 };
const W = 1944;
const H = 2592;
const pose = { headingDeg: 0, pitchDeg: 5, rollDeg: 0 };
const view = stillPhotoView(sensor, W, H, 34, null);
const noCal = { headingOffsetDeg: 0, pitchOffsetDeg: 0 };

const rays = Array.from({ length: 1440 }, (_, i) => ({ azimuthDeg: i * 0.25, maxAngleDeg: 3 }));
const peak = (id: string, azimuthDeg: number, rank = 2, elevationAngleDeg = 4): PhotoPeak => ({
  id,
  name: id,
  rank,
  elevationM: 7000,
  distanceM: 30_000,
  azimuthDeg,
  elevationAngleDeg,
});

const base = {
  photoWidthPx: W,
  photoHeightPx: H,
  pose,
  view,
  calibration: noCal,
  horizonRays: rays,
  appName: 'Meru',
  placeName: 'Sarangkot',
  dateText: '5 Nov 2026',
  peaksPrefix: 'Peaks:',
  moreText: (n: number) => `+${n} more`,
  measure,
};

describe('stillPhotoView', () => {
  it('uses the full sensor FOV for a still with the sensor aspect ratio', () => {
    const v = stillPhotoView(sensor, 3000, 4000, 34, null);
    const expected = visibleFovForCover(sensor, 3000, 4000);
    expect(v.hFovDeg).toBeCloseTo(expected.hFovDeg, 6);
    expect(v.vFovDeg).toBeCloseTo(expected.vFovDeg, 6);
    expect(v.widthPx).toBe(3000);
  });

  it('applies a hand-set screen FOV as the same lens correction', () => {
    // Screen showed 34° automatically; user set 36°. The still must widen by the same tan ratio.
    const lens = { hFovDeg: 48, vFovDeg: 62 };
    const auto = stillPhotoView(lens, 3, 4, 34, null);
    const v = stillPhotoView(lens, 3, 4, 34, 36);
    const tanHalf = (deg: number) => Math.tan((deg / 2) * (Math.PI / 180));
    const k = tanHalf(36) / tanHalf(34);
    expect(tanHalf(v.hFovDeg)).toBeCloseTo(k * tanHalf(auto.hFovDeg), 9);
    expect(tanHalf(v.vFovDeg)).toBeCloseTo(k * tanHalf(auto.vFovDeg), 9);
  });

  it('no override = no change', () => {
    const a = stillPhotoView(sensor, 3, 4, 34, null);
    const b = stillPhotoView(sensor, 3, 4, 34, 34);
    expect(b.hFovDeg).toBeCloseTo(a.hFovDeg, 9);
  });
});

describe('composePhoto', () => {
  it('puts each summit dot exactly where the projection says (the label is on the right peak)', () => {
    const peaks = [peak('A', -10, 1), peak('B', 0, 1, 6), peak('C', 12)];
    const c = composePhoto({ ...base, peaks });
    for (const pk of peaks) {
      const label = c.labels.find((l) => l.id === pk.id)!;
      const p = projectToScreen(pk.azimuthDeg, pk.elevationAngleDeg, pose, view, noCal, 0)!;
      expect(label.summit.x).toBeCloseTo(p.x, 6);
      expect(label.summit.y).toBeCloseTo(p.y, 6);
      // leader ends on the summit
      expect(label.leader.at(-1)).toEqual(label.summit);
    }
    // peak at heading lands on the vertical centre line
    expect(c.labels.find((l) => l.id === 'B')!.summit.x).toBeCloseTo(W / 2, 6);
  });

  it('respects calibration offsets like the live view', () => {
    const cal = { headingOffsetDeg: 3, pitchOffsetDeg: -1 };
    const c = composePhoto({ ...base, calibration: cal, peaks: [peak('B', 3, 1)] });
    const p = projectToScreen(3, 4, pose, view, cal, 0)!;
    expect(c.labels[0]!.summit.x).toBeCloseTo(W / 2, 6);
    expect(c.labels[0]!.summit.y).toBeCloseTo(p.y, 6);
  });

  it('drops peaks outside the photo and behind the camera', () => {
    const c = composePhoto({
      ...base,
      peaks: [peak('in', 5), peak('side', 40), peak('back', 180)],
    });
    expect(c.labels.map((l) => l.id)).toEqual(['in']);
  });

  it('labels sit above the skyline and inside the photo, without overlapping in a row', () => {
    const peaks = Array.from({ length: 10 }, (_, i) =>
      peak(`P${i}`, -20 + i * 4, i % 3 === 0 ? 1 : 2),
    );
    const c = composePhoto({ ...base, peaks });
    const skylineY = projectToScreen(0, 3, pose, view, noCal, 0)!.y;
    for (const l of c.labels) {
      expect(l.box.top + l.box.height).toBeLessThan(skylineY);
      expect(l.box.top).toBeGreaterThanOrEqual(0);
      expect(l.box.left).toBeGreaterThanOrEqual(0);
      expect(l.box.left + l.box.width).toBeLessThanOrEqual(W);
    }
    const rows = new Map<number, typeof c.labels>();
    for (const l of c.labels) rows.set(l.box.top, [...(rows.get(l.box.top) ?? []), l]);
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.box.left - b.box.left);
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1]!;
        const b = sorted[i]!;
        if (a.main && b.main) continue; // rank 1 may be forced
        expect(b.box.left).toBeGreaterThanOrEqual(a.box.left + a.box.width);
      }
    }
  });

  it('never prints a label over another one, even for crowded main peaks', () => {
    // eight main peaks within 3° -> not all can fit; the rest are left out instead of overlapping
    const peaks = Array.from({ length: 8 }, (_, i) => ({
      ...peak(`Main peak number ${i}`, -1.5 + i * 0.4, 1),
      elevationM: 8000 - i * 100,
    }));
    const c = composePhoto({ ...base, peaks });
    expect(c.labels.length).toBeGreaterThan(0);
    expect(c.labels.length).toBeLessThan(8);
    // the highest peak is always kept
    expect(c.labels.map((l) => l.id)).toContain('Main peak number 0');
    for (const a of c.labels) {
      for (const b of c.labels) {
        if (a === b || a.box.top !== b.box.top) continue;
        const overlap =
          a.box.left < b.box.left + b.box.width && b.box.left < a.box.left + a.box.width;
        expect(overlap).toBe(false);
      }
    }
  });

  it('adds a bottom frame with wordmark, place, date and the peaks left to right', () => {
    const c = composePhoto({ ...base, peaks: [peak('Right', 10), peak('Left', -10)] });
    expect(c.photoHeightPx).toBe(H);
    expect(c.heightPx).toBe(H + c.frame.height);
    expect(c.frame.height).toBeGreaterThan(0);
    const t = c.frame.texts.map((x) => x.text);
    expect(t).toContain('MERU');
    expect(t).toContain('Sarangkot');
    expect(t).toContain('5 Nov 2026');
    expect(t).toContain('Peaks: Left, Right');
    for (const x of c.frame.texts) {
      expect(x.baselineY).toBeGreaterThan(H);
      expect(x.baselineY).toBeLessThan(c.heightPx);
      expect(x.x + measure(x.text, x.font)).toBeLessThanOrEqual(W + 1e-6);
    }
    expect(c.peakNames).toEqual(['Left', 'Right']);
  });

  it('works with no peaks in view (frame without a peaks line)', () => {
    const c = composePhoto({ ...base, peaks: [] });
    expect(c.labels).toEqual([]);
    expect(c.frame.texts.some((x) => x.text.startsWith('Peaks'))).toBe(false);
  });

  it('skyline follows the projected horizon and breaks outside the view', () => {
    const c = composePhoto({ ...base, peaks: [] });
    expect(c.skyline.length).toBe(1);
    const y = projectToScreen(0, 3, pose, view, noCal, 0)!.y;
    const mid = c.skyline[0]!.reduce((a, p) =>
      Math.abs(p.x - W / 2) < Math.abs(a.x - W / 2) ? p : a,
    );
    expect(mid.y).toBeCloseTo(y, 0);
  });
});

describe('frame text helpers', () => {
  const font = { sizePx: 10, weight: 'regular' as const };
  const m: MeasureText = (t) => t.length * 10;

  it('wraps peak names between names and summarises the rest', () => {
    const names = ['Annapurna I', 'Machhapuchhre', 'Annapurna South', 'Hiunchuli', 'Dhaulagiri'];
    const lines = wrapPeakNames('Peaks:', names, font, 300, 2, (n) => `+${n} more`, m);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) expect(l.length * 10).toBeLessThanOrEqual(300);
    const joined = lines.join(' ');
    expect(joined.startsWith('Peaks: Annapurna I,')).toBe(true);
    expect(joined).toMatch(/\+\d more$/);
  });

  it('keeps everything on one line when it fits', () => {
    expect(wrapPeakNames('Peaks:', ['A', 'B'], font, 1000, 2, () => '', m)).toEqual([
      'Peaks: A, B',
    ]);
  });

  it('ellipsizes long text', () => {
    expect(ellipsize('Sarangkot', font, 1000, m)).toBe('Sarangkot');
    const e = ellipsize('A very long viewpoint name', font, 100, m);
    expect(e.endsWith('…')).toBe(true);
    expect(e.length * 10).toBeLessThanOrEqual(100);
  });
});

describe('photoPlaceName', () => {
  const vps = [
    { name: 'Sarangkot', lat: 28.2442, lon: 83.9486 },
    { name: 'World Peace Pagoda', lat: 28.2015, lon: 83.9447 },
  ];
  const near = (n: string) => `Near ${n}`;

  it('uses the simulated viewpoint name as is', () => {
    expect(photoPlaceName({ lat: 0, lon: 0 }, 'Sarangkot', vps, 'Annapurna', near)).toBe(
      'Sarangkot',
    );
  });

  it('names the nearest viewpoint within 3 km of a GPS fix', () => {
    // ~1 km north of Sarangkot
    expect(photoPlaceName({ lat: 28.2532, lon: 83.9486 }, null, vps, 'Annapurna', near)).toBe(
      'Near Sarangkot',
    );
  });

  it('falls back to region + coordinates far from every viewpoint', () => {
    expect(photoPlaceName({ lat: 28.5961, lon: 83.8203 }, null, vps, 'Annapurna', near)).toBe(
      'Annapurna · 28.596°N 83.820°E',
    );
  });
});
