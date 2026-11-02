import { describe, expect, it } from '@jest/globals';
import { wrapTo180, wrapTo360 } from './angles';

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
