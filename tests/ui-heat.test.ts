import { describe, expect, it } from 'vitest';
import { heatOf } from '../src/audio/feedback';
import { css, heroInk, INK_COOL, INK_HOT, PLATE_COOL, PLATE_HOT, plateFill, type RGB } from '../src/ui/heat';

/** A colour reads "red" when red dominates and green has collapsed (the one-frame flash was 253, 0, 0). */
const isRed = ([r, g, b]: RGB) => r > 180 && g < 120 && b < 120;
/** Inside the axis-aligned box between two colours (every point of the segment is). */
const within = (c: RGB, a: RGB, b: RGB) => ([0, 1, 2] as const).every((i) => c[i] >= Math.min(a[i], b[i]) && c[i] <= Math.max(a[i], b[i]));

describe('heat → colour (CASH OUT plate and hero figure)', () => {
  it('every multiplier from 1.00× to 100.00× stays on the cream → orange segment, never red', () => {
    let prev: RGB = plateFill(0);
    for (let m = 100; m <= 10000; m++) {
      const fill = plateFill(heatOf(m));
      const ink = heroInk(heatOf(m));
      expect(isRed(fill), `plate at ${m / 100}×: ${fill}`).toBe(false);
      expect(within(fill, PLATE_COOL, PLATE_HOT), `plate at ${m / 100}×: ${fill}`).toBe(true);
      expect(within(ink, INK_COOL, INK_HOT), `ink at ${m / 100}×: ${ink}`).toBe(true);
      // monotone: green and blue only ever fall as the run climbs (no flicker back and forth)
      expect(fill[1]).toBeLessThanOrEqual(prev[1]);
      expect(fill[2]).toBeLessThanOrEqual(prev[2]);
      prev = fill;
    }
  });

  it('is continuous across the tier boundaries and around 3.5× (no jump between hundredths)', () => {
    for (const m of [200, 350, 351, 500, 1000, 2500]) {
      const a = plateFill(heatOf(m - 1));
      const b = plateFill(heatOf(m));
      const step = Math.max(...([0, 1, 2] as const).map((i) => Math.abs(a[i] - b[i])));
      expect(step, `step at ${m / 100}×`).toBeLessThanOrEqual(3);
      expect(isRed(b)).toBe(false);
    }
  });

  it('clamps any heat, including NaN and out-of-range values, to the segment', () => {
    for (const h of [Number.NaN, -1, -0.001, 0, 0.5, 1, 1.001, 7, Infinity, -Infinity]) {
      const fill = plateFill(h);
      expect(within(fill, PLATE_COOL, PLATE_HOT), `heat ${h}: ${fill}`).toBe(true);
      expect(isRed(fill)).toBe(false);
      expect(css(fill)).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/);
    }
  });
});
