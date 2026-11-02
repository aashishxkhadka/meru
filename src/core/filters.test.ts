import { describe, expect, it } from '@jest/globals';

import { wrapTo180 } from './angles';
import {
  type AngleFilterState,
  type ScalarFilterState,
  smoothAngleDeg,
  smoothScalar,
  trueHeadingFromMagneticDeg,
} from './filters';

function run(start: number, input: number, steps: number): number[] {
  let state: AngleFilterState = smoothAngleDeg(null, start);
  const outputs: number[] = [];
  for (let i = 0; i < steps; i++) {
    state = smoothAngleDeg(state, input);
    outputs.push(state.outputDeg);
  }
  return outputs;
}

describe('smoothAngleDeg', () => {
  it('starts at the first sample', () => {
    expect(smoothAngleDeg(null, 123).outputDeg).toBe(123);
    expect(smoothAngleDeg(null, -10).outputDeg).toBe(350);
  });

  it('crossing 359° -> 1° moves the short way, never through 180°', () => {
    const outputs = run(359, 1, 200);
    for (const outDeg of outputs) {
      expect(outDeg).toBeGreaterThanOrEqual(0);
      expect(outDeg).toBeLessThan(360);
      // stays on the 2° arc between 359° and 1°
      expect(Math.abs(wrapTo180(outDeg - 0))).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(Math.abs(wrapTo180(outputs[outputs.length - 1]! - 1))).toBeLessThan(0.2);
  });

  it('crossing 1° -> 359° the other way also stays near north', () => {
    for (const outDeg of run(1, 359, 200)) {
      expect(Math.abs(wrapTo180(outDeg))).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('converges to a new heading', () => {
    const outputs = run(0, 90, 100);
    expect(outputs[0]!).toBeGreaterThan(0);
    expect(outputs[0]!).toBeLessThan(45); // smoothed, not a jump
    expect(Math.abs(outputs[outputs.length - 1]! - 90)).toBeLessThan(0.2);
  });

  it('dead-band holds the output perfectly still under small jitter', () => {
    let state = smoothAngleDeg(null, 100);
    const jitter = [0.1, -0.08, 0.05, -0.1, 0.09, -0.04, 0.1, -0.1];
    for (let i = 0; i < 400; i++) {
      state = smoothAngleDeg(state, 100 + jitter[i % jitter.length]!);
      expect(state.outputDeg).toBe(100);
    }
  });

  it('dead-band still lets a real 1° turn through', () => {
    let state = smoothAngleDeg(null, 100);
    for (let i = 0; i < 100; i++) state = smoothAngleDeg(state, 101);
    expect(Math.abs(state.outputDeg - 101)).toBeLessThan(0.2);
  });

  it('respects a custom alpha', () => {
    const fast = smoothAngleDeg(smoothAngleDeg(null, 0), 90, { alpha: 1 });
    expect(fast.outputDeg).toBeCloseTo(90, 9);
  });

  it('keeps the previous output if opposite samples cancel out', () => {
    const state = smoothAngleDeg(smoothAngleDeg(null, 0), 180, { alpha: 0.5 });
    expect(state.outputDeg).toBe(0);
  });
});

describe('smoothScalar', () => {
  it('low-passes toward the input and respects the dead-band', () => {
    let state: ScalarFilterState = smoothScalar(null, 0);
    state = smoothScalar(state, 10);
    expect(state.output).toBeCloseTo(1.5, 9); // 0.15 × 10
    for (let i = 0; i < 100; i++) state = smoothScalar(state, 10);
    expect(Math.abs(state.output - 10)).toBeLessThan(0.2);

    const still = smoothScalar(smoothScalar(null, 5), 5.1);
    expect(still.output).toBe(5);
  });
});

describe('trueHeadingFromMagneticDeg', () => {
  it('adds east declination and wraps', () => {
    expect(trueHeadingFromMagneticDeg(359, 2)).toBeCloseTo(1, 9);
    expect(trueHeadingFromMagneticDeg(10, -0.5)).toBeCloseTo(9.5, 9);
  });
});
