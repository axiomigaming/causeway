import { describe, expect, it } from 'vitest';
import { MANIFEST, SampleBank, type Loaded } from '../src/audio/samples';
import { mulberry32 } from '../src/audio/select';
import { ORDERS, THEME_SOUNDS, ThemePlayer, fanfareFor, landingPlan, nextBar, phrasePlan } from '../src/audio/theme';

// A minimal AudioContext: records every source start and every gain automation.
class P {
  value = 0;
  log: [string, number, number][] = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.log.push(['set', v, t]);
  }
  setTargetAtTime(v: number, t: number) {
    this.value = v;
    this.log.push(['target', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.value = v;
    this.log.push(['ramp', v, t]);
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
function fake() {
  const starts: { name: string; at: number; offset: number }[] = [];
  const ctx = {
    currentTime: 0,
    createGain: () => new N(),
    createBufferSource: () => {
      const s = {
        buffer: null as unknown as { name: string },
        loop: false,
        onended: null,
        connect: <T>(n: T) => n,
        start: (at: number, offset = 0) => starts.push({ name: s.buffer.name, at, offset }),
        stop: () => {},
      };
      return s;
    },
  };
  return { ctx, starts };
}
function bank() {
  const b = new SampleBank({ version: 1, sounds: Object.fromEntries(THEME_SOUNDS.map((n) => [n, { group: 'theme', channels: 2, slices: [[0, 8, 1]], bpm: n === 'th_top' ? 120 : n.startsWith('th_l') ? 112 : 84, webm: { file: '', bytes: 0, hash: '' }, m4a: { file: '', bytes: 0, hash: '' } }])) }, 'audio/', 'webm');
  for (const n of THEME_SOUNDS) b.put(n, { buffer: { name: n, duration: n.startsWith('th_win') ? 4 : 17.14 } as unknown as AudioBuffer, slices: [{ start: 0, dur: 8 }], loop: false } as Loaded);
  return b;
}

describe('theme form', () => {
  it('every run starts on A, and its phrase plan varies from run to run', () => {
    const plans = new Set<string>();
    for (let s = 1; s < 40; s++) {
      const p = phrasePlan(3, mulberry32(s));
      expect(p[0]).toBe('a');
      expect(p.length).toBe(12);
      plans.add(p.join(''));
    }
    expect(plans.size).toBeGreaterThan(10);
    for (const o of ORDERS) expect(o[0]).toBe('a');
  });

  it('a tier change lands within about 1.35 bars, never without a lead-in', () => {
    const bar = 2;
    for (let now = 0.01; now < 8; now += 0.13) {
      const p = landingPlan(0, bar, now);
      expect(p.at - now).toBeGreaterThanOrEqual(bar / 3 - 1e-9);
      expect(p.at - now).toBeLessThanOrEqual(bar * 4 / 3 + 0.03);
      expect((p.at / bar) % 1).toBeCloseTo(0, 6);
      expect(p.fillOffset).toBeGreaterThanOrEqual(0);
      expect(p.fillOffset).toBeLessThan(bar * 2 / 3 + 1e-9);
    }
    // just before a downbeat: the following one, with the whole fill
    expect(landingPlan(0, 2, 1.9)).toEqual({ at: 4, fillAt: 2, fillOffset: 0 });
    // in every case the fill's own downbeat (one bar into its file) is the landing
    for (let now = 0.01; now < 8; now += 0.07) {
      const p = landingPlan(0, 2, now);
      expect(p.fillAt + (2 - p.fillOffset)).toBeCloseTo(p.at, 6);
    }
  });

  it('bar lines and fanfare sizes', () => {
    const bar = (4 * 60) / 112;
    expect(nextBar(10, bar, 10)).toBeCloseTo(10);
    expect(nextBar(10, bar, 10.01)).toBeCloseTo(10 + bar);
    expect(nextBar(10, bar, 10 + 3 * bar - 1e-9)).toBeCloseTo(10 + 3 * bar);
    expect([0, 1, 2, 3, 4].map((t) => fanfareFor(t as 0 | 1 | 2 | 3 | 4))).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('theme player', () => {
  const mk = () => {
    const { ctx, starts } = fake();
    const th = new ThemePlayer(ctx as unknown as BaseAudioContext, bank(), new N() as unknown as AudioNode, new N() as unknown as AudioNode, mulberry32(4));
    return { ctx, starts, th };
  };

  it('a run starts all four layers of a segment together, sample-locked, and schedules ahead', () => {
    const { ctx, starts, th } = mk();
    expect(th.ready()).toBe(true);
    th.startRun(1);
    const first = starts.filter((s) => s.name.startsWith('th_l'));
    expect(first.map((s) => s.name).sort()).toEqual(['th_l0_a', 'th_l1_a', 'th_l2_a', 'th_l3_a']);
    expect(new Set(first.map((s) => s.at)).size).toBe(1);
    ctx.currentTime = 1 + 8 * (240 / 112) - 1;
    th.update();
    const second = starts.filter((s) => s.name.startsWith('th_l')).slice(4);
    expect(second.length).toBe(4);
    expect(second[0]!.at).toBeCloseTo(1 + 8 * (240 / 112));
  });

  it('a tier-up lands on the next bar line with a pickup fill whose downbeat is that bar; jumps share one fill', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    ctx.currentTime = 3.0;
    th.setTier(1);
    th.setTier(2);
    const fills = starts.filter((s) => s.name === 'th_fill');
    expect(fills.length).toBe(1);
    const bar = 240 / 112;
    // the fill's own downbeat (one bar into the file) falls on the landing bar line
    expect(fills[0]!.at + (bar - fills[0]!.offset)).toBeCloseTo(2 * bar, 5);
    expect(th.pendingLanding()!.in).toBeCloseTo(2 * bar - 3.0, 5);
    expect(th.nextDownbeat()).toBeCloseTo(2 * bar - 3.0, 5);
    expect(th.state().landed).toBe(2);
    // tier 4: the lifted loop starts on a downbeat
    ctx.currentTime = 20;
    th.setTier(4);
    const top = starts.find((s) => s.name === 'th_top');
    expect(top).toBeDefined();
    expect((top!.at / bar) % 1).toBeCloseTo(0, 5);
    expect(th.state().top).toBe(true);
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

  it('cash-out: the fanfare for the settled tier, then the calm loop; nothing more for that result', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    ctx.currentTime = 5;
    th.escape(4);
    expect(starts.some((s) => s.name === 'th_win2')).toBe(true);
    expect(th.state().idle).toBe('th_calm');
    const n = starts.length;
    th.fall(); // no near-miss or loss cue after a cash-out
    th.escape(4);
    expect(starts.length).toBe(n);
  });

  it('fall: the loss sting then the tense loop; a new run clears it', () => {
    const { ctx, starts, th } = mk();
    th.startRun(0);
    ctx.currentTime = 5;
    th.fall();
    expect(starts.some((s) => s.name === 'th_lose')).toBe(true);
    expect(th.state().idle).toBe('th_tense');
    th.rest();
    expect(th.state().idle).toBe('th_calm');
    th.lead();
    th.startRun(9);
    expect(th.state().mode).toBe('run');
    expect(th.state().idle).toBe(null);
  });
});

describe('shipped theme', () => {
  it('is complete, within its 3 MB budget, and its stems share one length', () => {
    const names = Object.keys(MANIFEST.sounds).filter((n) => MANIFEST.sounds[n]!.group === 'theme');
    if (!names.length) return;
    for (const n of THEME_SOUNDS) expect(MANIFEST.sounds[n], n).toBeDefined();
    expect(new SampleBank(MANIFEST, 'audio/', 'webm').groupBytes('theme')).toBeLessThanOrEqual(3e6);
    const lens = new Set(['l0', 'l1', 'l2', 'l3'].flatMap((l) => ['a', 'b'].map((s) => MANIFEST.sounds[`th_${l}_${s}`]!.slices[0]![1])));
    expect(lens.size).toBe(1);
    expect(MANIFEST.sounds.th_l0_a!.bpm).toBe(112);
  });
});
