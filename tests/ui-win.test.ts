import { describe, expect, it } from 'vitest';
import { tierOf } from '../src/audio/feedback';
import { PLATE_COOL, PLATE_HOT, type RGB } from '../src/ui/heat';
import { winLook, winTiming } from '../src/ui/win';

const rgb = (s: string): number[] => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
const within = (c: number[], a: RGB, b: RGB) => [0, 1, 2].every((i) => c[i]! >= Math.min(a[i]!, b[i]!) && c[i]! <= Math.max(a[i]!, b[i]!));

describe('escape card look (ui/win.ts)', () => {
  it('follows the shared tier of the cash-out multiplier', () => {
    for (const m of [100, 130, 199, 200, 499, 500, 1000, 2499, 2500, 6000, 100000]) expect(winLook(m).grade).toBe(tierOf(m));
  });

  it('is quiet at 1.3× and celebratory at 60×', () => {
    const lo = winLook(130);
    const hi = winLook(6000);
    expect(lo.grade).toBe(0);
    expect(lo.struck).toBe(false);
    expect(rgb(lo.glow)[3]).toBe(0);
    expect(hi.grade).toBe(4);
    expect(hi.struck).toBe(true);
    expect(rgb(hi.glow)[3]).toBeGreaterThan(0);
    expect(hi.rule).toBe(1);
  });

  it('only ever grows with the multiplier (rule, glow) and keeps its accent on the plate segment', () => {
    let prev = winLook(100);
    for (let m = 100; m <= 10000; m += 7) {
      const l = winLook(m);
      expect(l.rule).toBeGreaterThanOrEqual(prev.rule);
      expect(rgb(l.glow)[3]!).toBeGreaterThanOrEqual(rgb(prev.glow)[3]!);
      expect(within(rgb(l.accent), PLATE_COOL, PLATE_HOT), `${m}: ${l.accent}`).toBe(true);
      expect(l.accent).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
      expect(l.glow).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
      prev = l;
    }
  });

  it('lands the count later for a bigger escape, within a short beat', () => {
    let prev = 0;
    for (const g of [0, 1, 2, 3, 4] as const) {
      const t = winTiming(g);
      expect(t.land).toBe(t.count0 + t.count);
      expect(t.land).toBeGreaterThan(prev);
      expect(t.land).toBeLessThan(2000);
      prev = t.land;
    }
  });
});
