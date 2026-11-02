import { describe, expect, it } from '@jest/globals';
import { circularMeanDeg, wrapTo180, wrapTo360 } from './angles';

describe('wrapTo360', () => {
  it('keeps values already in range', () => {
    expect(wrapTo360(0)).toBe(0);
    expect(wrapTo360(123.5)).toBe(123.5);
  });
  it('wraps negative and >= 360 values', () => {
    expect(wrapTo360(-10)).toBe(350);
    expect(wrapTo360(360)).toBe(0);
    expect(wrapTo360(725)).toBe(5);
  });
});

describe('wrapTo180', () => {
  it('gives the short way round across north', () => {
    expect(wrapTo180(359 - 1)).toBe(-2);
    expect(wrapTo180(1 - 359)).toBe(2);
    expect(wrapTo180(190)).toBe(-170);
  });
});

describe('wrapTo360 floating-point edge', () => {
  it('never returns 360', () => {
    expect(wrapTo360(-1e-15)).toBe(0);
  });
});

describe('circularMeanDeg', () => {
  it('averages across north the short way', () => {
    expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 9);
    expect(circularMeanDeg([80, 100])).toBeCloseTo(90, 9);
    expect(circularMeanDeg([])).toBe(0);
  });
});
