import { describe, expect, it } from '@jest/globals';

import {
  alignTargetToPoint,
  clampOffsets,
  parseCalibration,
  shiftOffsets,
  viewWithFovOverride,
} from '../src/core/calibration';
import { NO_CALIBRATION, projectToScreen } from '../src/core/projection';

const view = { widthPx: 390, heightPx: 844, hFovDeg: 34, vFovDeg: 66.5 };
const level = { headingDeg: 10, pitchDeg: 0, rollDeg: 0 };

describe('clampOffsets', () => {
  it('keeps values inside ±20° heading / ±10° pitch', () => {
    expect(clampOffsets({ headingOffsetDeg: 5, pitchOffsetDeg: -3 })).toEqual({
      offsets: { headingOffsetDeg: 5, pitchOffsetDeg: -3 },
      clamped: false,
    });
    expect(clampOffsets({ headingOffsetDeg: -31, pitchOffsetDeg: 12 })).toEqual({
      offsets: { headingOffsetDeg: -20, pitchOffsetDeg: 10 },
      clamped: true,
    });
  });
});

describe('shiftOffsets (drag)', () => {
  it('no movement, no change', () => {
    const p = { x: 100, y: 300 };
    expect(shiftOffsets(NO_CALIBRATION, p, p, level, view)).toEqual({
      headingOffsetDeg: 0,
      pitchOffsetDeg: 0,
    });
  });

  it('dragging right moves the skyline right by the same pixels (centre row)', () => {
    const p = projectToScreen(15, 0, level, view)!;
    const o = shiftOffsets(NO_CALIBRATION, p, { x: p.x + 40, y: p.y }, level, view);
    expect(o.headingOffsetDeg).toBeLessThan(0);
    const q = projectToScreen(15, 0, level, view, o)!;
    expect(q.x).toBeCloseTo(p.x + 40, 6);
    expect(q.y).toBeCloseTo(p.y, 6);
  });

  it('dragging down moves the skyline down (pitch offset up)', () => {
    const p = projectToScreen(10, 4, level, view)!;
    const o = shiftOffsets(NO_CALIBRATION, p, { x: p.x, y: p.y + 30 }, level, view);
    expect(o.pitchOffsetDeg).toBeGreaterThan(0);
    expect(o.headingOffsetDeg).toBeCloseTo(0, 9);
    expect(projectToScreen(10, 4, level, view, o)!.y).toBeCloseTo(p.y + 30, 6);
  });

  it('with the phone rolled, a screen-horizontal drag still follows the finger', () => {
    const pose = { headingDeg: 10, pitchDeg: 3, rollDeg: 20 };
    const p = projectToScreen(12, 3, pose, view)!;
    const to = { x: p.x + 25, y: p.y };
    const o = shiftOffsets(NO_CALIBRATION, p, to, pose, view);
    const q = projectToScreen(12, 3, pose, view, o)!;
    expect(Math.hypot(q.x - to.x, q.y - to.y)).toBeLessThan(1);
  });
});

describe('alignTargetToPoint (tap a peak, then where it really is)', () => {
  it('puts an off-centre target exactly on the tap, with pitch and roll', () => {
    const pose = { headingDeg: 359, pitchDeg: 8, rollDeg: -12 };
    const target = { x: 260, y: 330 };
    const r = alignTargetToPoint(5, 11, target, pose, view, NO_CALIBRATION)!;
    expect(r.clamped).toBe(false);
    const q = projectToScreen(5, 11, pose, view, r.offsets)!;
    expect(Math.hypot(q.x - target.x, q.y - target.y)).toBeLessThan(0.5);
  });

  it('recovers a known compass error', () => {
    // compass reads 7° too high and pitch 2° too low: the true view is heading 3°, pitch 2°
    const truth = { headingDeg: 3, pitchDeg: 2, rollDeg: 0 };
    const sensed = { headingDeg: 10, pitchDeg: 0, rollDeg: 0 };
    const real = projectToScreen(8, 6, truth, view)!;
    const r = alignTargetToPoint(8, 6, real, sensed, view, NO_CALIBRATION)!;
    expect(r.offsets.headingOffsetDeg).toBeCloseTo(-7, 3);
    expect(r.offsets.pitchOffsetDeg).toBeCloseTo(2, 3);
  });

  it('flags corrections beyond the limits', () => {
    const p = projectToScreen(10, 0, level, view)!;
    // a target 30° to the side, tapped at the centre
    const r = alignTargetToPoint(40, 0, p, level, view, NO_CALIBRATION)!;
    expect(r.clamped).toBe(true);
    expect(r.offsets.headingOffsetDeg).toBe(20);
  });

  it('returns null for a target behind the camera', () => {
    expect(alignTargetToPoint(190, 0, { x: 195, y: 422 }, level, view, NO_CALIBRATION)).toBeNull();
  });
});

describe('viewWithFovOverride', () => {
  it('returns the view unchanged without an override', () => {
    expect(viewWithFovOverride(view, null)).toBe(view);
  });
  it('derives the vertical FOV from the screen aspect', () => {
    const v = viewWithFovOverride(view, 40);
    expect(v.hFovDeg).toBe(40);
    const ratio = Math.tan((v.vFovDeg * Math.PI) / 360) / Math.tan((40 * Math.PI) / 360);
    expect(ratio).toBeCloseTo(844 / 390, 9);
  });
});

describe('parseCalibration', () => {
  it('accepts a saved value and clamps it', () => {
    expect(
      parseCalibration({
        headingOffsetDeg: 25,
        pitchOffsetDeg: -1.5,
        hFovOverrideDeg: 40,
        calibratedAt: 1,
      }),
    ).toEqual({
      offsets: { headingOffsetDeg: 20, pitchOffsetDeg: -1.5 },
      hFovOverrideDeg: 40,
      calibratedAt: 1,
    });
  });
  it('rejects junk', () => {
    expect(parseCalibration(null)).toBeNull();
    expect(parseCalibration({ headingOffsetDeg: 'x', pitchOffsetDeg: 0 })).toBeNull();
    expect(
      parseCalibration({ headingOffsetDeg: 1, pitchOffsetDeg: 0, hFovOverrideDeg: 500 })
        ?.hFovOverrideDeg,
    ).toBeNull();
  });
});
