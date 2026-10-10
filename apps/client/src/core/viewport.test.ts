import { describe, expect, it } from 'vitest';
import { computeViewport } from './viewport';

describe('computeViewport', () => {
  const cases: [string, number, number, number][] = [
    ['iPhone 13 landscape', 844, 390, 3],
    ['Pixel 7 landscape', 915, 412, 2.625],
    ['Galaxy A52 landscape', 800, 360, 3],
    ['old Android landscape', 640, 360, 2],
    ['desktop 1080p', 1920, 1080, 1],
    ['iPad landscape', 1180, 820, 2],
  ];
  for (const [name, w, h, dpr] of cases) {
    it(`${name}: integer scale, ~14–17 tiles tall`, () => {
      const v = computeViewport(w, h, dpr);
      expect(Number.isInteger(v.scale)).toBe(true);
      const tiles = v.logicalH / 16;
      expect(tiles).toBeGreaterThanOrEqual(12.5);
      expect(tiles).toBeLessThanOrEqual(17.5);
      // The canvas covers the whole screen (never smaller).
      expect(v.logicalW * v.scale).toBeGreaterThanOrEqual(Math.round(w * dpr));
      expect(v.logicalH * v.scale).toBeGreaterThanOrEqual(Math.round(h * dpr));
    });
  }
});
