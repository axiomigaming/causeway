import { describe, expect, it, vi } from 'vitest';
import { countUp, heatOf, tierOf } from '../src/audio/feedback';
import { PLATE_COOL, PLATE_HOT, plateFill, type RGB } from '../src/ui/heat';
import { balanceShown, cardClockOf, fallWords, heroStep, markCardClock, raysImage, winLook, winTiming } from '../src/ui/win';

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

  it('names the escape by tier and makes 10x+ an event (rays, larger figures), never 1.3x', () => {
    expect(winLook(130).title).toBe('Escaped');
    expect(winLook(1000).title).toBe('Daring escape');
    expect(winLook(6000).title).toBe('Legendary escape');
    expect(winLook(130).grand).toBe(false);
    expect(rgb(winLook(130).bloom)[3]).toBe(0);
    expect(rgb(winLook(130).rays)[3]).toBe(0);
    expect(winLook(1000).grand).toBe(true);
    expect(rgb(winLook(6000).rays)[3]).toBeGreaterThan(rgb(winLook(1000).rays)[3]!);
    expect(rgb(winLook(6000).bloom)[3]).toBeGreaterThan(rgb(winLook(1000).bloom)[3]!);
  });

  it('draws the rays only for an event, as an SVG image in the plate colour', () => {
    expect(raysImage(130)).toBe('none');
    expect(raysImage(900)).toBe('none');
    const img = decodeURIComponent(raysImage(6000));
    expect(img.startsWith('url("data:image/svg+xml,<svg')).toBe(true);
    const [r, g, b] = plateFill(heatOf(6000));
    expect(img).toContain(`rgb(${r},${g},${b})`);
  });

  it('steps the Return up to 72 only for an event whose amount fits the event card', () => {
    expect(heroStep(true, '600.00')).toBe(72);
    expect(heroStep(true, '6,000.00')).toBe(72);
    expect(heroStep(true, '60,000.00')).toBe(72);
    expect(heroStep(true, '600,000.00')).toBe(44);
    expect(heroStep(false, '13.00')).toBe(44);
  });

  it('lands the count later for a bigger escape: quick when quiet, a long held count for a legend', () => {
    let prev = 0;
    for (const g of [0, 1, 2, 3, 4] as const) {
      const t = winTiming(g);
      expect(t.land).toBe(t.count0 + t.count);
      expect(t.land).toBeGreaterThan(prev);
      expect(t.land).toBeLessThan(3000);
      prev = t.land;
    }
    expect(winTiming(0).land).toBeLessThan(800);
    expect(winTiming(4).land).toBeGreaterThan(2 * winTiming(0).land);
    expect(winTiming(4).count0).toBeGreaterThan(winTiming(0).count0);
  });

  it('escalates the plate and the light by tier, and keeps the low tiers plain', () => {
    for (const m of [100, 150, 300]) {
      const l = winLook(m);
      expect(rgb(l.tint)[3]).toBe(0);
      expect(rgb(l.flash)[3]).toBe(0);
      expect(l.edge).toBe('rgba(255, 236, 210, 0.10)');
    }
    const a = [600, 1500, 4000].map(winLook);
    for (let i = 1; i < a.length; i++) {
      expect(rgb(a[i]!.tint)[3]!).toBeGreaterThan(rgb(a[i - 1]!.tint)[3]!);
      expect(rgb(a[i]!.edge)[3]!).toBeGreaterThan(rgb(a[i - 1]!.edge)[3]!);
    }
    expect(rgb(winLook(4000).flash)[3]!).toBeGreaterThan(rgb(winLook(1500).flash)[3]!);
  });
});

describe('header balance during an escape (ui/win.ts balanceShown)', () => {
  const from = 99_000;
  const to = 129_020; // a 30.02x escape on a 10.00 stake

  it('holds the old figure until the card comes', () => {
    for (const g of [0, 2, 4] as const) expect(balanceShown(from, to, null, g, true)).toBe(from);
  });

  it('rises on the card clock and curve, never ahead of the card, and lands with its Return', () => {
    const stake = 1000;
    const payout = 30_020;
    for (const g of [0, 1, 2, 3, 4] as const) {
      const { count0, count, land } = winTiming(g);
      expect(balanceShown(from, to, 0, g, true)).toBe(from);
      expect(balanceShown(from, to, count0, g, true)).toBe(from);
      for (let t = 0; t <= land + 100; t += 37) {
        const p = Math.max(0, (t - count0) / count);
        const card = countUp(stake, payout, p); // the card's Return at the same moment
        const bal = balanceShown(from, to, t, g, true);
        // the same share of the way: the balance has risen no further than the card has
        const cardShare = (card - stake) / (payout - stake);
        const balShare = (bal - from) / (to - from);
        expect(Math.abs(balShare - cardShare)).toBeLessThan(0.002);
        expect(bal).toBeLessThanOrEqual(to);
      }
      expect(balanceShown(from, to, land, g, true)).toBe(to);
      expect(balanceShown(from, to, land - 250, g, true)).toBeLessThan(to);
    }
  });

  it('shares the card clock by round id (the header counts from the card origin, not its own)', () => {
    expect(cardClockOf('r1')).toBe(null);
    markCardClock('r1', 1234.5);
    expect(cardClockOf('r1')).toBe(1234.5);
    expect(cardClockOf('r2')).toBe(null);
    markCardClock('r2', 99);
    expect(cardClockOf('r1')).toBe(null);
  });

  it('lands as the card comes with reduced motion', () => {
    expect(balanceShown(from, to, 0, 4, false)).toBe(to);
  });
});

describe('fall words (ui/win.ts fallWords)', () => {
  const kinds = ['start', 'chasm', 'gate', 'rockfall', 'pillar', 'trip', 'ledge'] as const;

  it('names each kind of fall in a few words, with a short plate label', () => {
    const titles = new Set<string>();
    for (const k of kinds) {
      const w = fallWords(k);
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.title.length, k).toBeLessThanOrEqual(24); // one line in the 328 px phone card head
      expect(w.plate.length, k).toBeLessThanOrEqual(10);
      expect(w.title).not.toBe('The way fell');
      titles.add(w.title);
    }
    expect(titles.size).toBe(kinds.length);
    expect(fallWords('gate').title).toBe('The gate came down');
    expect(fallWords('start').title).toBe('The way fell at once');
  });

  it('falls back to the old words when the world has not said', () => {
    expect(fallWords(undefined)).toEqual({ title: 'The way fell', plate: 'Fallen' });
  });

  it('is filled in by the controller from the fall the world staged (and 1.00x is the start)', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('navigator', { userAgent: 'node', hardwareConcurrency: 8 });
    const { Controller } = await import('../src/state/controller');
    const { useStore } = await import('../src/state/store');
    const game = { onReveal: () => {}, live: { mult: 1 }, stagedCrashKind: 'gate', crash() {}, cashout() {} };
    const audio = { setScene() {}, outcome() {}, ui() {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctl = new Controller({ onPush() {} } as any, game as any, audio as any) as unknown as { settle: (...a: unknown[]) => void };
    const round = (id: string, crash: number) => ({ id, nonce: 1, outcome: 'crash', stake: 1000, cashoutMult: null, auto: false, payout: 0, crash, commitment: '', serverSeed: '', clientSeed: '', settledAt: 0 });
    game.stagedCrashKind = 'rockfall';
    ctl.settle(round('a', 840), 5000, 'x', 2);
    expect(useStore.getState().result?.fall).toBe('rockfall');
    expect(useStore.getState().balance).toBe(5000);
    ctl.settle(round('b', 100), 4000, 'x', 3);
    expect(useStore.getState().result?.fall).toBe('start');
    vi.unstubAllGlobals();
  });
});
