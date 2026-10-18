import { describe, expect, it } from 'vitest';
import { MANIFEST, SampleBank, type Loaded } from '../src/audio/samples';
import { mulberry32 } from '../src/audio/select';
import { LIFT_RATE, ORDERS, ORDERS4, THEME_SOUNDS, ThemePlayer, fanfareFor, landingPlan, liftPlan, nextBar, phrasePlan, phrasePlan4 } from '../src/audio/theme';

// A minimal AudioContext: records every source start (time, offset, rate).
class P {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  setTargetAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
  }
  cancelScheduledValues() {}
}
class N {
  gain = new P();
  connect<T>(n: T): T {
    return n;
  }
  disconnect() {}
}
type Start = { name: string; at: number; offset: number; rate: number };
function fake() {
  const starts: Start[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => new N(),
    createBufferSource: () => {
      const s = {
        buffer: null as unknown as { name: string },
        loop: false,
        onended: null,
        playbackRate: { value: 1 },
        connect: <T>(n: T) => n,
        start: (at: number, offset = 0) => starts.push({ name: s.buffer.name, at, offset, rate: s.playbackRate.value }),
        stop: () => {},
      };
      return s;
    },
  };
  return { ctx, starts };
}
function bank() {
  const meta = (n: string) => ({ group: 'theme', channels: 2, slices: [[0, 8, 1]] as [number, number, number][], bpm: n.startsWith('th_l') || n.startsWith('th_t4') || n === 'th_lift' || n === 'th_fill' ? 112 : 84, webm: { file: '', bytes: 0, hash: '' }, m4a: { file: '', bytes: 0, hash: '' } });
  const b = new SampleBank({ version: 1, sounds: Object.fromEntries(THEME_SOUNDS.map((n) => [n, meta(n)])) }, 'audio/', 'webm');
  for (const n of THEME_SOUNDS) b.put(n, { buffer: { name: n, duration: n.startsWith('th_win') ? 5 : n === 'th_lose' ? 7.6 : 17.14 } as unknown as AudioBuffer, slices: [{ start: 0, dur: 8 }], loop: false } as Loaded);
  return b;
}
const BAR = 240 / 112;
const PHRASE = 8 * BAR;
const mk = (seed = 4) => {
  const { ctx, starts } = fake();
  const th = new ThemePlayer(ctx as unknown as BaseAudioContext, bank(), new N() as unknown as AudioNode, new N() as unknown as AudioNode, mulberry32(seed));
  return { ctx, starts, th };
};
/** Advance the fake clock, calling update() every 25 ms like the engine. */
function play(ctx: { currentTime: number }, th: ThemePlayer, to: number) {
  while (ctx.currentTime < to) {
    ctx.currentTime = Math.min(to, ctx.currentTime + 0.025);
    th.update();
  }
}

describe('theme form', () => {
  it('every run starts on A, tier-4 forms open on the hook, and plans vary from run to run', () => {
    const plans = new Set<string>();
    for (let s = 1; s < 40; s++) {
      const p = phrasePlan(3, mulberry32(s));
      expect(p[0]).toBe('a');
      plans.add(p.join(''));
      const p4 = phrasePlan4(3, mulberry32(s));
      expect(p4[0]).toBe('a');
      expect(p4.length).toBe(12);
    }
    expect(plans.size).toBeGreaterThan(10);
    for (const o of ORDERS) expect(o[0]).toBe('a');
    // each tier-4 form is 32 bars of four different sections
    for (const o of ORDERS4) expect(new Set(o).size).toBe(4);
  });

  it('a tier change lands within about 1.35 bars, never without a lead-in, with the fill downbeat on it', () => {
    for (let now = 0.01; now < 8; now += 0.07) {
      const p = landingPlan(0, 2, now);
      expect(p.at - now).toBeGreaterThanOrEqual(2 / 3 - 1e-9);
      expect(p.at - now).toBeLessThanOrEqual((2 * 4) / 3 + 0.03);
      expect((p.at / 2) % 1).toBeCloseTo(0, 6);
      expect(p.fillAt + (2 - p.fillOffset)).toBeCloseTo(p.at, 6);
    }
    expect(landingPlan(0, 2, 1.9)).toEqual({ at: 4, fillAt: 2, fillOffset: 0 });
  });

  it('the lift starts two bars before a section line (every 4 bars) and lands within about 6 bars', () => {
    for (let now = 0; now < 60; now += 0.37) {
      const l = liftPlan(0, BAR, now);
      expect(l.at - l.start).toBeCloseTo(2 * BAR, 9);
      expect(l.start).toBeGreaterThanOrEqual(now + 0.05 - 1e-9);
      expect((l.at / (4 * BAR)) % 1 < 1e-6 || (l.at / (4 * BAR)) % 1 > 1 - 1e-6).toBe(true);
      expect(l.at - now).toBeLessThanOrEqual(6 * BAR + 0.06);
    }
  });

  it('bar lines and fanfare sizes', () => {
    expect(nextBar(10, BAR, 10)).toBeCloseTo(10);
    expect(nextBar(10, BAR, 10.01)).toBeCloseTo(10 + BAR);
    expect([0, 1, 2, 3, 4].map((t) => fanfareFor(t as 0 | 1 | 2 | 3 | 4))).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('one continuous piece', () => {
  it('a run starts its layers together, then every phrase lands on the same 8-bar grid', () => {
    const { ctx, starts, th } = mk();
    th.startRun(1);
    play(ctx, th, 1 + 5 * PHRASE);
    const phrases = starts.filter((s) => s.name.startsWith('th_l'));
    const times = [...new Set(phrases.map((s) => s.at.toFixed(6)))].map(Number);
    expect(times.length).toBeGreaterThanOrEqual(5);
    times.forEach((t, i) => expect(t).toBeCloseTo(1 + i * PHRASE, 6));
    expect(phrases.filter((s) => s.at === times[0]).map((s) => s.name.slice(0, 5)).sort()).toEqual(['th_l0', 'th_l1', 'th_l2', 'th_l3']);
  });

  it('tiers 1-3 never restart the tune: layers join on bar lines while the phrases keep their grid', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    play(ctx, th, 3.0);
    th.setTier(1);
    play(ctx, th, 20);
    th.setTier(2);
    play(ctx, th, 31);
    th.setTier(3);
    play(ctx, th, 50);
    expect(th.log.filter((l) => l.what === 'run start').length).toBe(1);
    for (const s of starts.filter((s) => s.name.startsWith('th_l'))) expect((s.at / PHRASE) % 1 < 1e-6 || (s.at / PHRASE) % 1 > 1 - 1e-6).toBe(true);
    const fills = starts.filter((s) => s.name === 'th_fill');
    expect(fills.length).toBe(3);
    // the first fill's downbeat is the next bar line after the tier change (a pickup)
    expect(fills[0]!.at + (BAR - fills[0]!.offset)).toBeCloseTo(2 * BAR, 5);
  });

  it('tier 4 modulates at a phrase line through the pivot, then the 32-bar form continues on the same grid', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    play(ctx, th, 3);
    th.setTier(1);
    play(ctx, th, 40);
    th.setTier(4);
    const landing = th.pendingLanding()!;
    expect(landing.tier).toBe(4);
    const liftAt = ctx.currentTime + landing.in;
    expect((liftAt / (4 * BAR)) % 1 < 1e-6 || (liftAt / (4 * BAR)) % 1 > 1 - 1e-6).toBe(true);
    play(ctx, th, liftAt + 6 * PHRASE);
    const pivot = starts.find((s) => s.name === 'th_lift')!;
    expect(pivot.at).toBeCloseTo(liftAt - 2 * BAR, 6);
    const t4 = starts.filter((s) => s.name.startsWith('th_t4'));
    expect(t4[0]!.name).toBe('th_t4_a');
    expect(t4[0]!.at).toBeCloseTo(liftAt, 6);
    t4.forEach((s, i) => expect(s.at).toBeCloseTo(liftAt + i * PHRASE, 6));
    // the form evolves: all four sections within the first 32 bars, nothing from the lower tiers after the lift
    expect(new Set(t4.slice(0, 4).map((s) => s.name)).size).toBe(4);
    expect(starts.filter((s) => s.name.startsWith('th_l') && s.at >= liftAt - 1e-6).length).toBe(0);
    expect(th.log.filter((l) => l.what === 'run start').length).toBe(1);
  });

  it('a jump from 1x straight past 25x stacks no fills', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    play(ctx, th, 2);
    th.setTier(2);
    th.setTier(3);
    th.setTier(4);
    play(ctx, th, 40);
    expect(starts.filter((s) => s.name === 'th_fill').length).toBeLessThanOrEqual(1);
    expect(starts.filter((s) => s.name === 'th_lift').length).toBe(1);
  });

  it('a stall (tab hidden while the clock ran) rejoins the grid at the phrase reached, without restarting', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    play(ctx, th, 5);
    ctx.currentTime = 5 + 3 * PHRASE + 1.2; // no updates for three phrases
    th.update();
    // the phrase that is playing now resumes part-way in, where the music has got to
    const now = ctx.currentTime;
    const inPhrase = now - 3 * PHRASE;
    const resumed = starts.filter((s) => s.offset > 0 && s.name.startsWith('th_l'));
    expect(resumed.length).toBe(4);
    for (const s of resumed) expect(s.offset).toBeCloseTo(inPhrase + 0.01, 6);
    // and the next phrase is back on the grid
    const next = starts.filter((s) => s.offset === 0 && s.at > now);
    play(ctx, th, 4 * PHRASE + 0.5);
    const after = starts.filter((s) => s.name.startsWith('th_l') && s.at > now + 1);
    expect(after[0]!.at).toBeCloseTo(4 * PHRASE, 6);
    expect(next.length).toBeGreaterThanOrEqual(0);
    expect(th.log.filter((l) => l.what === 'run start').length).toBe(1);
  });

  it('tiers never go down and do nothing outside a run', () => {
    const { starts, th } = mk();
    th.setTier(3);
    expect(starts.length).toBe(0);
    th.startRun(0);
    th.setTier(2);
    const n = starts.length;
    th.setTier(1);
    expect(starts.length).toBe(n);
  });
});

describe('results', () => {
  it('cash-out cuts in on the next eighth note with the fanfare for the settled tier, then the warm loop', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    play(ctx, th, 5.01);
    th.escape(2);
    const f = starts.find((s) => s.name === 'th_win1')!;
    expect(f.at).toBeGreaterThan(5.01);
    expect(f.at - 5.01).toBeLessThanOrEqual(BAR / 8 + 0.031);
    expect(((f.at / (BAR / 8)) % 1 < 1e-6) || ((f.at / (BAR / 8)) % 1 > 1 - 1e-6)).toBe(true);
    expect(f.rate).toBe(1);
    expect(th.state().idle).toBe('th_safe');
    const n = starts.length;
    th.fall(); // no near-miss or loss cue after a cash-out
    th.escape(4);
    expect(starts.length).toBe(n);
  });

  it('after the lift, the fanfare and the sting play in the lifted key', () => {
    const a = mk();
    a.th.startRun(0);
    play(a.ctx, a.th, 2);
    a.th.setTier(4);
    play(a.ctx, a.th, 40);
    a.th.escape(4);
    expect(a.starts.find((s) => s.name === 'th_win2')!.rate).toBeCloseTo(LIFT_RATE, 9);
    const b = mk();
    b.th.startRun(0);
    play(b.ctx, b.th, 2);
    b.th.setTier(4);
    play(b.ctx, b.th, 40);
    b.th.fall();
    expect(b.starts.find((s) => s.name === 'th_lose')!.rate).toBeCloseTo(LIFT_RATE, 9);
  });

  it('fall: the loss sting then the tense loop; RUN during a result hands back to the calm tune and a new clock', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    play(ctx, th, 5);
    th.fall();
    expect(starts.some((s) => s.name === 'th_lose')).toBe(true);
    expect(th.state().idle).toBe('th_tense');
    th.lead();
    expect(th.state().idle).toBe('th_calm');
    th.startRun(9);
    expect(th.state().mode).toBe('run');
    expect(th.state().idle).toBe(null);
    expect(th.state().tier).toBe(0);
  });
});

describe('shipped theme', () => {
  it('is complete, within its 3 MB budget, and every 112 BPM phrase shares one length', () => {
    const names = Object.keys(MANIFEST.sounds).filter((n) => MANIFEST.sounds[n]!.group === 'theme');
    if (!names.length) return;
    for (const n of THEME_SOUNDS) expect(MANIFEST.sounds[n], n).toBeDefined();
    expect(new SampleBank(MANIFEST, 'audio/', 'webm').groupBytes('theme')).toBeLessThanOrEqual(3e6);
    const phrase = ['th_l0_a', 'th_l0_b', 'th_l1_a', 'th_l1_b', 'th_l2_a', 'th_l2_b', 'th_l3_a', 'th_l3_b', 'th_t4_a', 'th_t4_a2', 'th_t4_b', 'th_t4_c'];
    const lens = new Set(phrase.map((n) => MANIFEST.sounds[n]!.slices[0]![1]));
    expect(lens.size).toBe(1);
    for (const n of phrase) expect(MANIFEST.sounds[n]!.bpm, n).toBe(112);
  });
});
