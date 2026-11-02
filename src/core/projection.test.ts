import { describe, expect, it } from '@jest/globals';

import { projectToScreen, sensorFovFromFocalLength35mm, visibleFovForCover } from './projection';

const view = { widthPx: 400, heightPx: 800, hFovDeg: 40, vFovDeg: 70 };
const level = { headingDeg: 90, pitchDeg: 0, rollDeg: 0 };
const tan = (d: number) => Math.tan((d * Math.PI) / 180);

describe('projectToScreen', () => {
  it('a target straight ahead lands in the screen centre', () => {
    const p = projectToScreen(90, 0, level, view)!;
    expect(p.x).toBeCloseTo(200, 9);
    expect(p.y).toBeCloseTo(400, 9);
  });

  it('a target at heading + hFov/2 lands on the right edge; at pitch + vFov/2 on the top edge', () => {
    expect(projectToScreen(110, 0, level, view)!.x).toBeCloseTo(400, 9);
    expect(projectToScreen(70, 0, level, view)!.x).toBeCloseTo(0, 9);
    expect(projectToScreen(90, 35, level, view)!.y).toBeCloseTo(0, 9);
  });

  it('wraps around north', () => {
    const p = projectToScreen(1, 0, { ...level, headingDeg: 359 }, view)!;
    expect(p.x).toBeCloseTo(200 + (tan(2) / tan(20)) * 200, 9);
  });

  it('matches the SPEC formula on the centre row and with pitch', () => {
    const pose = { headingDeg: 0, pitchDeg: 10, rollDeg: 0 };
    const p = projectToScreen(0, 14, pose, view)!; // 4° above where the camera points
    expect(p.y).toBeCloseTo(400 - (tan(4) / tan(35)) * 400, 9);
  });

  it('returns null outside the field of view (+ margin) and behind the camera', () => {
    expect(projectToScreen(90 + 26, 0, level, view)).toBeNull(); // 20 + 5 margin
    expect(projectToScreen(90 + 24, 0, level, view)).not.toBeNull();
    expect(projectToScreen(270, 0, level, view)).toBeNull();
  });

  it('applies calibration offsets', () => {
    const p = projectToScreen(95, 2, level, view, { headingOffsetDeg: 5, pitchOffsetDeg: 2 })!;
    expect(p.x).toBeCloseTo(200, 9);
    expect(p.y).toBeCloseTo(400, 9);
  });

  it('rotates by −roll: with the phone turned 90° clockwise, world-right appears up', () => {
    const p = projectToScreen(100, 0, { ...level, rollDeg: 90 }, view)!;
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeLessThan(400);
  });
});

describe('field of view', () => {
  it('a 26 mm (35 mm-equivalent) main camera is ~53° × 67° in portrait', () => {
    const fov = sensorFovFromFocalLength35mm(26);
    expect(fov.hFovDeg).toBeCloseTo(53.0, 0);
    expect(fov.vFovDeg).toBeCloseTo(67.3, 0);
  });

  it('a full-screen preview on a tall phone shows a much narrower horizontal FOV', () => {
    const visible = visibleFovForCover({ hFovDeg: 53, vFovDeg: 67.3 }, 390, 844);
    expect(visible.vFovDeg).toBeCloseTo(67.3, 6); // full height visible
    expect(visible.hFovDeg).toBeCloseTo(34.2, 0); // sides cropped
  });

  it('a wide view crops top and bottom instead', () => {
    const visible = visibleFovForCover({ hFovDeg: 53, vFovDeg: 67.3 }, 800, 400);
    expect(visible.hFovDeg).toBeCloseTo(53, 6);
    expect(visible.vFovDeg).toBeLessThan(53);
  });
});
