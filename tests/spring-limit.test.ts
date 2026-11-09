import { describe, expect, it } from 'vitest';
import { softLimit } from '../src/world/runner';

describe('secondary-motion spring limit', () => {
  it('passes small angles unchanged and never reaches the limit', () => {
    expect(softLimit(0.05, -0.12, 0.12)).toBe(0.05);
    expect(softLimit(-0.08, -0.12, 0.12)).toBe(-0.08);
    // the spring state is held within twice the limit
    for (const x of [0.2, 0.4, 0.5]) {
      expect(softLimit(x, -0.25, 0.3)).toBeLessThan(0.3);
      expect(softLimit(-x, -0.25, 0.3)).toBeGreaterThan(-0.25);
    }
  });

  it('is continuous and monotonic, with no kink at the knee', () => {
    let prev = softLimit(-0.5, -0.25, 0.25);
    let prevSlope = 0;
    for (let x = -0.5; x <= 0.5; x += 0.001) {
      const y = softLimit(x, -0.25, 0.25);
      expect(y).toBeGreaterThanOrEqual(prev);
      const slope = (y - prev) / 0.001;
      if (x > -0.499) expect(Math.abs(slope - prevSlope)).toBeLessThan(0.05);
      prev = y;
      prevSlope = slope;
    }
  });
});
