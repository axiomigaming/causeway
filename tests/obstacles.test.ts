import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { nextBurst, pickPiece, wrapCycle } from '../src/render/obstacles';

describe('obstacle director pacing (cosmetic RNG + current tier only)', () => {
  it('calms shorten and bursts grow with the tier', () => {
    const mean = (tier: number) => {
      const r = new Rng(`pace/${tier}`);
      let calm = 0;
      let count = 0;
      for (let i = 0; i < 400; i++) {
        const b = nextBurst(r, tier);
        calm += b.calm;
        count += b.count;
        expect(b.count).toBeGreaterThanOrEqual(1);
        expect(b.count).toBeLessThanOrEqual(3);
        expect(b.gap).toBeGreaterThan(1.2);
      }
      return { calm: calm / 400, count: count / 400 };
    };
    const m = [0, 1, 2, 3, 4].map(mean);
    for (let t = 1; t < 5; t++) {
      expect(m[t]!.calm).toBeLessThan(m[t - 1]!.calm);
      expect(m[t]!.count).toBeGreaterThanOrEqual(m[t - 1]!.count - 0.05);
    }
  });

  it('tier 0 only has the readable pieces; the spectacular ones come later', () => {
    const r = new Rng('pick');
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(pickPiece(r, 0));
    expect([...seen].sort()).toEqual(['beam', 'log']);
    const hi = new Set<string>();
    for (let i = 0; i < 600; i++) hi.add(pickPiece(r, 4));
    for (const k of ['blocks', 'pillar', 'boulder', 'tile']) expect(hi.has(k)).toBe(true);
  });

  it('wraps a timing error to the nearest start foot', () => {
    expect(wrapCycle(0.1, 0.4)).toBeCloseTo(0.1);
    expect(wrapCycle(0.3, 0.4)).toBeCloseTo(-0.1);
    expect(wrapCycle(-0.35, 0.4)).toBeCloseTo(0.05);
    for (let e = -2; e < 2; e += 0.037) expect(Math.abs(wrapCycle(e, 0.4))).toBeLessThanOrEqual(0.2 + 1e-9);
  });
});
