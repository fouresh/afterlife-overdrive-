import { describe, expect, it } from 'vitest';
import { angleToByte, byteToAngle, datan2, dcos, dsin, ipow, wrapAngle } from './fmath';

describe('deterministic math', () => {
  it('dsin/dcos match Math within 1e-8', () => {
    for (let a = -20; a <= 20; a += 0.0137) {
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-8);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-8);
    }
  });

  it('datan2 matches Math.atan2 within 1e-6', () => {
    for (let y = -5; y <= 5; y += 0.31) {
      for (let x = -5; x <= 5; x += 0.29) {
        expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-6);
      }
    }
    expect(datan2(0, 0)).toBe(0);
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('wrapAngle stays within [-PI, PI]', () => {
    for (let a = -50; a < 50; a += 0.7) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI - 1e-12);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-12);
    }
  });

  it('angle bytes round-trip within one step', () => {
    for (let a = -3; a < 3; a += 0.05) {
      const back = byteToAngle(angleToByte(a));
      expect(Math.abs(wrapAngle(back - a))).toBeLessThan((2 * Math.PI) / 256);
    }
  });

  it('ipow', () => {
    expect(ipow(2, 10)).toBe(1024);
    expect(ipow(1.5, 2)).toBe(2.25);
    expect(ipow(2, -2)).toBe(0.25);
  });
});
