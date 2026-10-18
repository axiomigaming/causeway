import { describe, expect, it } from 'vitest';
import { heatOf, tierOf } from '../src/audio/feedback';
import { progression, runTier, TIER_AT } from '../src/world/choreo';

describe('progression (one model for every system)', () => {
  it('tiers at 2, 5, 10, 25x; drive continuous; within 0..1', () => {
    expect(progression(1).tier).toBe(0);
    for (const [i, m] of TIER_AT.entries()) {
      expect(progression(m).tier).toBe(i + 1);
      expect(progression(m * 0.999).tier).toBe(i);
      expect(progression(m).drive).toBeCloseTo(i + 1, 6);
    }
    let prev = -1;
    for (let m = 1; m < 300; m *= 1.03) {
      const p = progression(m);
      expect(p.drive).toBeGreaterThanOrEqual(prev);
      expect(p.within).toBeGreaterThanOrEqual(0);
      expect(p.within).toBeLessThanOrEqual(1);
      expect(p.heat).toBeGreaterThanOrEqual(0);
      expect(p.heat).toBeLessThanOrEqual(1);
      prev = p.drive;
    }
  });

  it('heat climbs monotonically and steps up at each tier', () => {
    let prev = -1;
    for (let m = 1; m < 200; m *= 1.01) {
      const h = progression(m).heat;
      expect(h).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
    for (const m of TIER_AT) expect(progression(m).heat - progression(m * 0.999).heat).toBeGreaterThan(0.08);
  });

  it('audio and HUD read the same model', () => {
    for (const m of [1, 1.5, 2, 4.99, 5, 9, 10, 24, 25, 120]) {
      expect(tierOf(Math.round(m * 100))).toBe(runTier(m));
      expect(heatOf(m * 100)).toBeCloseTo(progression(m).drive / 4, 6);
    }
  });

  it('sub-steps count the milestones passed', () => {
    expect(progression(1.4).step).toBe(0);
    expect(progression(3).step).toBe(2);
    expect(progression(120).step).toBe(6);
  });
});
