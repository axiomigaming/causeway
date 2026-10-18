/**
 * The CAUSEWAY theme: a composed D minor tune (tools/score/compose.py) rendered as layered stems, played here
 * sample-accurately and stacked with the run tier, like an endless-runner score that grows as you go:
 *
 *   tier 0  marimba ostinato, light drums, the hook hinted on kalimba        (layer 0)
 *   tier 1  + bass and the full pan-flute melody                              (layer 1)
 *   tier 2  + strings (pad, pizzicato, staccato) and denser drums             (layer 2)
 *   tier 3  + brass stabs, horn counter-melody, timpani                       (layer 3)
 *   tier 4  the lifted loop: a whole tone up (E minor), faster, full ensemble and choir
 *
 * Each layer exists as two 8-bar segments (A: i-VI-III-VII | i-VI-iv-V, B: the answer). Every run picks its
 * own phrase order with the cosmetic RNG and now and then drops the drums for a bar (a break). A tier change
 * plays a one-bar fill (taiko roll, string swell, cymbal) from the next bar line and the new layer lands on
 * the downbeat after it. A cash-out stops the run and plays a fanfare in the theme's key (bigger with the
 * cash-out tier), then a calm, warm version of the tune; a fall plays a descending low-brass sting and a
 * sparse tense loop. Title and setup play the calm version too.
 *
 * Only the tier of the multiplier ON SCREEN (during a run) or the settled result (after it) reaches this
 * class. It never knows where the round ends.
 */
import type { Tier } from './feedback';
import type { SampleBank } from './samples';
import type { Rng } from './select';

export const THEME_SOUNDS = [
  'th_l0_a', 'th_l0_b', 'th_l1_a', 'th_l1_b', 'th_l2_a', 'th_l2_b', 'th_l3_a', 'th_l3_b',
  'th_top', 'th_calm', 'th_tense', 'th_win0', 'th_win1', 'th_win2', 'th_lose', 'th_fill',
] as const;

/** Phrase orders a run cycles through, four segments at a time; picked per block with the cosmetic RNG. */
export const ORDERS: readonly (readonly ('a' | 'b')[])[] = [
  ['a', 'b', 'a', 'b'],
  ['a', 'a', 'b', 'a'],
  ['a', 'b', 'b', 'a'],
  ['a', 'b', 'a', 'a'],
];

/** The next segment letters for a run: block by block, never starting a run on B. */
export function phrasePlan(blocks: number, rnd: Rng): ('a' | 'b')[] {
  const out: ('a' | 'b')[] = [];
  for (let i = 0; i < blocks; i++) out.push(...ORDERS[Math.floor(rnd() * ORDERS.length) % ORDERS.length]!);
  return out;
}

/** The fanfare for a settled cash-out tier: small (1-2x), medium (2-10x), big (10x and up). */
export function fanfareFor(tier: Tier): 0 | 1 | 2 {
  return tier >= 3 ? 2 : tier >= 1 ? 1 : 0;
}

/** First bar line at or after `t` on a grid that started at `t0`. */
export function nextBar(t0: number, bar: number, t: number): number {
  return t0 + Math.max(0, Math.ceil((t - t0) / bar - 1e-6)) * bar;
}

interface Src {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class ThemePlayer {
  private layer: GainNode[] = [];
  /** Layers 0 and 2 (the drums) go through here, so a break can drop them for a bar. */
  private brk: GainNode;
  private topGain: GainNode;
  private run: { t0: number; bar: number; next: number; seg: number; plan: ('a' | 'b')[]; srcs: AudioBufferSourceNode[] } | null = null;
  private top: AudioBufferSourceNode | null = null;
  private idle: (Src & { name: string }) | null = null;
  private tier: Tier = 0;
  /** When the pending tier change lands (AudioContext time), so repeated tier-ups share one fill. */
  private landing = 0;
  private landed: Tier = 0;
  mode: 'off' | 'idle' | 'lead' | 'run' | 'result' = 'off';

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: SampleBank,
    private readonly out: AudioNode,
    private readonly sting: AudioNode,
    private readonly rnd: Rng,
  ) {
    this.brk = ctx.createGain();
    this.brk.connect(out);
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(i === 0 || i === 2 ? this.brk : out);
      this.layer.push(g);
    }
    this.topGain = ctx.createGain();
    this.topGain.connect(out);
  }

  ready(): boolean {
    return THEME_SOUNDS.every((n) => this.bank.has(n));
  }

  private buf(name: string): AudioBuffer | null {
    return this.bank.get(name)?.buffer ?? null;
  }

  private bpm(name: string): number {
    return (this.bank.meta(name)?.bpm as number | undefined) ?? 112;
  }

  /** A one-shot or loop, from the start of its buffer, at `at`. */
  private source(name: string, dest: AudioNode, at: number, loop = false, gain = 1): Src | null {
    const b = this.buf(name);
    if (!b) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(Math.max(this.ctx.currentTime, at));
    src.onended = () => g.disconnect();
    return { src, gain: g };
  }

  private fadeOut(s: Src | null, at: number, tc: number) {
    if (!s) return;
    s.gain.gain.cancelScheduledValues(at);
    s.gain.gain.setValueAtTime(s.gain.gain.value, at);
    s.gain.gain.setTargetAtTime(0, at, tc);
    try {
      s.src.stop(at + tc * 6 + 0.05);
    } catch {
      /* already stopped */
    }
  }

  /** Calm (title, setup, after a cash-out) or tense (after a fall) loop, faded in from `at`. */
  setIdle(name: 'th_calm' | 'th_tense', at: number, fadeIn = 1.5, level = 1): void {
    if (this.idle?.name === name) {
      this.idle.gain.gain.setTargetAtTime(level, Math.max(at, this.ctx.currentTime), 0.4);
      this.mode = this.mode === 'off' ? 'idle' : this.mode;
      return;
    }
    this.fadeOut(this.idle, Math.max(this.ctx.currentTime, at), 0.6);
    const s = this.source(name, this.out, at, true, 0);
    if (!s) return;
    s.gain.gain.setValueAtTime(0, at);
    s.gain.gain.linearRampToValueAtTime(level, at + fadeIn);
    this.idle = { ...s, name };
    if (this.mode === 'off') this.mode = 'idle';
  }

  /** The bet is in: the idle music steps back for the coil. */
  lead(): void {
    const t = this.ctx.currentTime;
    this.idle?.gain.gain.setTargetAtTime(0.25, t, 0.3);
    this.stopRun(t, 0.05);
    this.mode = 'lead';
  }

  /** Go: the run music starts on this downbeat at tier 0, with a fresh phrase plan for this run. */
  startRun(at: number): void {
    this.stopRun(at, 0.03);
    if (this.idle) {
      this.fadeOut(this.idle, at, 0.15);
      this.idle = null;
    }
    const bar = (4 * 60) / this.bpm('th_l0_a');
    this.run = { t0: at, bar, next: at, seg: 0, plan: phrasePlan(8, this.rnd), srcs: [] };
    this.tier = 0;
    this.landed = 0;
    this.landing = 0;
    for (let i = 0; i < 4; i++) {
      this.layer[i]!.gain.cancelScheduledValues(at);
      this.layer[i]!.gain.setValueAtTime(i === 0 ? 1 : 0, at);
    }
    this.brk.gain.cancelScheduledValues(at);
    this.brk.gain.setValueAtTime(1, at);
    this.topGain.gain.cancelScheduledValues(at);
    this.topGain.gain.setValueAtTime(1, at);
    this.mode = 'run';
    this.update();
  }

  /** Keep the next segment scheduled ahead. Call every ~25 ms. */
  update(): void {
    const r = this.run;
    if (!r || this.top) return;
    const now = this.ctx.currentTime;
    // After a long stall (tab hidden), rejoin on the grid instead of firing old segments.
    if (r.next < now - 0.05) {
      const segLen = 8 * r.bar;
      r.next = r.t0 + Math.ceil((now - r.t0) / segLen) * segLen;
    }
    while (r.next < now + 1.5) {
      if (r.seg >= r.plan.length) r.plan.push(...phrasePlan(4, this.rnd));
      const s = r.plan[r.seg]!;
      for (let i = 0; i < 4; i++) {
        const x = this.source(`th_l${i}_${s}`, this.layer[i]!, r.next);
        if (x) r.srcs.push(x.src);
      }
      // A break now and then (not in the first segment, not before the melody is in): the drums and the
      // ostinato drop out for the last bar of the phrase and come back on the downbeat.
      if (r.seg > 0 && this.landed >= 1 && this.rnd() < 0.3) {
        const b0 = r.next + 7 * r.bar;
        this.brk.gain.setValueAtTime(1, b0 - 0.02);
        this.brk.gain.linearRampToValueAtTime(0.12, b0 + 0.03);
        this.brk.gain.setValueAtTime(0.12, b0 + r.bar - 0.03);
        this.brk.gain.linearRampToValueAtTime(1, b0 + r.bar);
      }
      // Only the sources that may still be playing need stopping later (two segments' worth).
      if (r.srcs.length > 8) r.srcs.splice(0, r.srcs.length - 8);
      r.seg++;
      r.next += 8 * r.bar;
    }
  }

  /** The tier of the multiplier on screen. Higher tiers land on a bar line after a one-bar fill. */
  setTier(t: Tier): void {
    const r = this.run;
    if (!r || this.mode !== 'run' || t <= this.tier) return;
    this.tier = t;
    const now = this.ctx.currentTime;
    if (this.landing > now) {
      // A fill is already on its way: the bigger tier lands with it.
      this.land(t, this.landing);
      return;
    }
    const fillAt = nextBar(r.t0, r.bar, now + 0.08);
    const at = fillAt + r.bar;
    this.source('th_fill', this.sting, fillAt, false, 0.85);
    this.landing = at;
    this.land(t, at);
  }

  private land(t: Tier, at: number) {
    const r = this.run;
    if (!r) return;
    this.landed = t;
    if (t >= 4) {
      // The lift: the run layers stop on the downbeat and the key-lifted loop takes over.
      for (const g of [...this.layer]) {
        g.gain.cancelScheduledValues(at);
        g.gain.setValueAtTime(g.gain.value, at - 0.03);
        g.gain.linearRampToValueAtTime(0, at + 0.02);
      }
      if (!this.top) {
        const s = this.source('th_top', this.topGain, at, true);
        if (s) this.top = s.src;
      }
      return;
    }
    for (let i = 1; i <= Math.min(3, t); i++) {
      const g = this.layer[i]!.gain;
      g.cancelScheduledValues(at - 0.05);
      g.setValueAtTime(0, at - 0.01);
      g.linearRampToValueAtTime(1, at + 0.03);
    }
  }

  private stopRun(at: number, tc: number) {
    const r = this.run;
    for (const g of [...this.layer, this.topGain]) {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(g.gain.value, at);
      g.gain.setTargetAtTime(0, at, tc);
    }
    const stopAt = at + tc * 6 + 0.05;
    for (const s of r?.srcs ?? []) {
      try {
        s.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    if (this.top) {
      try {
        this.top.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    this.top = null;
    this.run = null;
    this.landing = 0;
  }

  /** Cash-out: the run stops, a fanfare sized by the settled cash-out tier, then the calm loop. */
  escape(tier: Tier): void {
    if (this.mode === 'result') return;
    const t = this.ctx.currentTime;
    this.stopRun(t, 0.06);
    const n = fanfareFor(tier);
    const f = this.buf(`th_win${n}`);
    this.source(`th_win${n}`, this.sting, t + 0.01);
    this.setIdle('th_calm', t + Math.max(1.5, (f?.duration ?? 4) - 1.6), 2.5, 0.85);
    this.mode = 'result';
  }

  /** A fall: the run stops dead, the loss sting, then the sparse tense loop. */
  fall(): void {
    if (this.mode === 'result') return;
    const t = this.ctx.currentTime;
    this.stopRun(t, 0.02);
    const f = this.buf('th_lose');
    this.source('th_lose', this.sting, t + 0.01);
    this.setIdle('th_tense', t + Math.max(2, (f?.duration ?? 5) - 2.2), 2, 0.9);
    this.mode = 'result';
  }

  /** Title / setup: the calm version of the tune (kept running if it already is). */
  rest(): void {
    if (this.mode === 'run') this.stopRun(this.ctx.currentTime, 0.3);
    this.setIdle('th_calm', this.ctx.currentTime + 0.05, 2.5, 0.85);
    this.mode = 'idle';
  }

  /** Everything off (the engine lost its theme, or tests). */
  stop(): void {
    const t = this.ctx.currentTime;
    this.stopRun(t, 0.1);
    this.fadeOut(this.idle, t, 0.2);
    this.idle = null;
    this.mode = 'off';
  }

  /** For tests and QA. */
  state(): { mode: string; tier: Tier; landed: Tier; top: boolean; idle: string | null } {
    return { mode: this.mode, tier: this.tier, landed: this.landed, top: !!this.top, idle: this.idle?.name ?? null };
  }
}
