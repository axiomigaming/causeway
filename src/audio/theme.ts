/**
 * The CAUSEWAY theme: a composed D minor tune (tools/score/compose.py) rendered as layered stems and played
 * here as ONE continuous piece across the whole run, like an endless-runner score that grows as you go.
 *
 * One musical clock per run: a 112 BPM bar grid that starts on GO and never resets. Every segment is 8 bars
 * (one phrase) and is scheduled sample-accurately on that grid, a phrase ahead; layers never restart the tune,
 * they join at the current phrase position, because all layers of a phrase play all the time and only their
 * gains move.
 *
 *   tier 0  marimba ostinato, light drums, the hook hinted on kalimba        (layer 0)
 *   tier 1  + bass and the full pan-flute melody                              (layer 1)
 *   tier 2  + strings (pad, pizzicato, staccato) and denser drums             (layer 2)
 *   tier 3  + brass stabs, horn counter-melody, timpani                       (layer 3)
 *   tier 4  the lift: a modulation to E minor at the next phrase boundary (two pivot bars, C to B7, replace
 *           the end of the current phrase), then a 32-bar form - A, A2, B and a C bridge - in the full
 *           ensemble with choir and trumpet, same tempo, in an order the cosmetic RNG picks per run.
 *
 * Phrases: A (i-VI-III-VII | i-VI-iv-V) and B (the answer), in a per-run order with an occasional one-bar
 * break. A new tier (below 4) lands on the next bar line, led in by a fill whose cymbal falls on that
 * downbeat (entered part-way, as a pickup, when the bar line is near; the bar after if it is too near).
 * A cash-out or a fall cuts in on the next eighth note: the run fades into it and the fanfare (sized by the
 * cash-out tier) or the loss sting plays in the key the run is in, then the warm D major loop or the tense
 * loop follows. Title and setup play the calm version of the tune, which hands over to the run on GO.
 *
 * Only the tier of the multiplier ON SCREEN (during a run) or the settled result (after it) reaches this
 * class. It never knows where the round ends.
 */
import type { Tier } from './feedback';
import type { SampleBank } from './samples';
import type { Rng } from './select';

export const THEME_SOUNDS = [
  'th_l0_a', 'th_l0_b', 'th_l1_a', 'th_l1_b', 'th_l2_a', 'th_l2_b', 'th_l3_a', 'th_l3_b',
  'th_t4_a', 'th_t4_a2', 'th_t4_b', 'th_t4_c', 'th_lift',
  'th_calm', 'th_safe', 'th_tense', 'th_win0', 'th_win1', 'th_win2', 'th_lose', 'th_fill',
] as const;

type Seg = 'a' | 'b';
type Seg4 = 'a' | 'a2' | 'b' | 'c';

/** Phrase orders below tier 4, four phrases at a time; picked per block with the cosmetic RNG. */
export const ORDERS: readonly (readonly Seg[])[] = [
  ['a', 'b', 'a', 'b'],
  ['a', 'a', 'b', 'a'],
  ['a', 'b', 'b', 'a'],
  ['a', 'b', 'a', 'a'],
];
/** Tier-4 forms: 32 bars each, always opening on the hook (A) right after the lift. */
export const ORDERS4: readonly (readonly Seg4[])[] = [
  ['a', 'b', 'a2', 'c'],
  ['a', 'c', 'a2', 'b'],
  ['a', 'a2', 'b', 'c'],
  ['a', 'b', 'c', 'a2'],
];

/** A whole tone: the lift's key change, also applied to the fanfare or sting after a tier-4 run. */
export const LIFT_RATE = Math.pow(2, 2 / 12);

/** The next phrase letters for a run: block by block, never starting a run on B. */
export function phrasePlan(blocks: number, rnd: Rng): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < blocks; i++) out.push(...ORDERS[Math.floor(rnd() * ORDERS.length) % ORDERS.length]!);
  return out;
}

/** The tier-4 sections, block by block; consecutive blocks never repeat the same form. */
export function phrasePlan4(blocks: number, rnd: Rng): Seg4[] {
  const out: Seg4[] = [];
  let last = -1;
  for (let i = 0; i < blocks; i++) {
    let k = Math.floor(rnd() * ORDERS4.length) % ORDERS4.length;
    if (k === last) k = (k + 1) % ORDERS4.length;
    last = k;
    out.push(...ORDERS4[k]!);
  }
  return out;
}

/** The fanfare for a settled cash-out tier: small (1-2x), medium (2-10x), big (10x and up). */
export function fanfareFor(tier: Tier): 0 | 1 | 2 {
  return tier >= 3 ? 2 : tier >= 1 ? 1 : 0;
}

/** First grid line at or after `t` on a grid of `step` that started at `t0`. */
export function nextBar(t0: number, step: number, t: number): number {
  return t0 + Math.max(0, Math.ceil((t - t0) / step - 1e-6)) * step;
}

/**
 * When a tier change (below 4) that arrives at `now` lands, and where the one-bar fill starts: its downbeat
 * (one bar into the file) falls on the landing. The landing is the next bar line, approached with a pickup;
 * if that bar line is less than a third of a bar away, the following one with the whole fill. A new tier is
 * never more than about 1.35 bars late, and never lands without a lead-in.
 */
export function landingPlan(t0: number, bar: number, now: number): { at: number; fillAt: number; fillOffset: number } {
  const nb = nextBar(t0, bar, now + 0.02);
  const at = nb - now < bar / 3 ? nb + bar : nb;
  return { at, fillAt: Math.max(now, at - bar), fillOffset: Math.max(0, bar - (at - now)) };
}

/**
 * The lift into tier 4: the first section line (every 4 bars: the A tune restarts its motif on i in bar 5,
 * so half a phrase is a section start too) whose two pivot bars have not started yet. `start` is where the
 * pivot (th_lift) begins and the run layers bow out; `at` is the E minor downbeat, from which the 8-bar
 * tier-4 phrases run. At most about 6 bars after tier 4 arrives.
 */
export function liftPlan(t0: number, bar: number, now: number): { start: number; at: number } {
  const half = 4 * bar;
  let at = nextBar(t0, half, now + 2 * bar + 0.05);
  if (at - 2 * bar < now + 0.05) at += half;
  return { start: at - 2 * bar, at };
}

interface Src {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface Run {
  t0: number;
  bar: number;
  /** Next phrase line not yet scheduled. */
  next: number;
  seg: number;
  plan: Seg[];
  seg4: number;
  plan4: Seg4[];
  /** E minor downbeat of the lift, once tier 4 is reached. */
  liftAt: number | null;
  srcs: AudioBufferSourceNode[];
}

export class ThemePlayer {
  private layer: GainNode[] = [];
  /** Layers 0 and 2 (the drums) go through here, so a break can drop them for a bar. */
  private brk: GainNode;
  private topGain: GainNode;
  private run: Run | null = null;
  private idle: (Src & { name: string }) | null = null;
  private idleStart: number | null = null;
  private tier: Tier = 0;
  /** When the pending (below-4) tier change lands, so repeated tier-ups share one fill. */
  private landing = 0;
  private landed: Tier = 0;
  mode: 'off' | 'idle' | 'lead' | 'run' | 'result' = 'off';
  /** What was scheduled when (AudioContext seconds), for QA and tests: the proof that nothing restarts. */
  readonly log: { t: number; what: string }[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: SampleBank,
    private out: AudioNode,
    private readonly sting: AudioNode,
    private readonly rnd: Rng,
  ) {
    // The theme sits 3 dB hotter than the bus it joins (measured in play: it read under the beds at unity).
    const level = ctx.createGain();
    level.gain.value = 1.41;
    level.connect(out);
    out = level;
    this.out = level;
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

  private note(t: number, what: string) {
    this.log.push({ t: +t.toFixed(4), what });
    if (this.log.length > 600) this.log.splice(0, this.log.length - 600);
  }

  private buf(name: string): AudioBuffer | null {
    return this.bank.get(name)?.buffer ?? null;
  }

  private bpm(name: string): number {
    return this.bank.meta(name)?.bpm ?? 112;
  }

  /** A one-shot or loop, from `offset` into its buffer, at `at`. */
  private source(name: string, dest: AudioNode, at: number, loop = false, gain = 1, offset = 0, rate = 1): Src | null {
    const b = this.buf(name);
    if (!b) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.loop = loop;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    // A start already in the past (rejoining after a stall) enters the buffer where the music has got to.
    const now = this.ctx.currentTime;
    if (at < now) {
      offset += (now + 0.01 - at) * rate;
      at = now + 0.01;
    }
    src.start(at, offset);
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

  /** Calm (title, setup), safe (after a cash-out) or tense (after a fall) loop, faded in from `at`. */
  setIdle(name: 'th_calm' | 'th_safe' | 'th_tense', at: number, fadeIn = 1.5, level = 1): void {
    if (this.idle?.name === name) {
      this.idle.gain.gain.setTargetAtTime(level, Math.max(at, this.ctx.currentTime), 0.4);
      if (this.mode === 'off') this.mode = 'idle';
      return;
    }
    this.fadeOut(this.idle, Math.max(this.ctx.currentTime, at), 0.6);
    const s = this.source(name, this.out, at, true, 0);
    if (!s) return;
    s.gain.gain.setValueAtTime(0, at);
    s.gain.gain.linearRampToValueAtTime(level, at + fadeIn);
    this.idle = { ...s, name };
    this.idleStart = Math.max(this.ctx.currentTime, at);
    this.note(at, `idle ${name}`);
    if (this.mode === 'off') this.mode = 'idle';
  }

  /** The bet is in: the calm music steps back a little for the coil (it hands over to the run on GO). */
  lead(): void {
    const t = this.ctx.currentTime;
    this.stopRun(t, 0.05);
    if (this.idle?.name === 'th_calm') this.idle.gain.gain.setTargetAtTime(0.45, t, 0.3);
    else {
      // From a result (a fanfare or a sting still ringing, or their loops): back to the calm tune.
      this.setIdle('th_calm', t, 0.6, 0.45);
    }
    this.mode = 'lead';
  }

  /** Go: the run's musical clock starts on this downbeat at tier 0, with a fresh phrase plan for this run. */
  startRun(at: number): void {
    this.stopRun(at, 0.03);
    if (this.idle) {
      // The calm tune crossfades into the run over about a second instead of stopping.
      this.fadeOut(this.idle, at, 0.35);
      this.idle = null;
      this.idleStart = null;
    }
    const bar = (4 * 60) / this.bpm('th_l0_a');
    this.run = { t0: at, bar, next: at, seg: 0, plan: phrasePlan(8, this.rnd), seg4: 0, plan4: phrasePlan4(4, this.rnd), liftAt: null, srcs: [] };
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
    this.note(at, 'run start');
    this.update();
  }

  /** Keep the next phrase scheduled ahead. Call every ~25 ms. */
  update(): void {
    this.tickBars();
    const r = this.run;
    if (!r) return;
    const now = this.ctx.currentTime;
    // After a long stall the clock did not stop (a suspended context freezes it, which is the usual case):
    // rejoin on the phrase grid, at the phrase position the music has reached, instead of restarting.
    const phrase = 8 * r.bar;
    if (r.next < now - 0.05) {
      // Rejoin inside the phrase that is playing now (its sources start part-way in, see source()).
      const skipped = Math.floor((now - r.next) / phrase);
      r.next += skipped * phrase;
      if (r.liftAt !== null && r.next > r.liftAt) r.seg4 += skipped;
      else r.seg += skipped;
      this.note(now, `rejoin at phrase ${r.seg + r.seg4}`);
    }
    while (r.next < now + 1.5) {
      if (r.liftAt !== null && r.next >= r.liftAt - 1e-6) {
        if (r.seg4 >= r.plan4.length) r.plan4.push(...phrasePlan4(2, this.rnd));
        const s = r.plan4[r.seg4]!;
        const x = this.source(`th_t4_${s}`, this.topGain, r.next);
        if (x) r.srcs.push(x.src);
        this.note(r.next, `t4 ${s}`);
        r.seg4++;
      } else {
        if (r.seg >= r.plan.length) r.plan.push(...phrasePlan(4, this.rnd));
        const s = r.plan[r.seg]!;
        const cut = r.liftAt !== null && r.next < r.liftAt && r.next + phrase > r.liftAt ? r.liftAt + 0.05 : null;
        for (let i = 0; i < 4; i++) {
          const x = this.source(`th_l${i}_${s}`, this.layer[i]!, r.next);
          if (!x) continue;
          r.srcs.push(x.src);
          if (cut !== null) x.src.stop(cut); // the lift takes over half-way through this phrase
        }
        this.note(r.next, `phrase ${s}`);
        // A break now and then (not in the first phrase, not before the melody is in, not into the lift):
        // the drums and the ostinato drop out for the last bar of the phrase and come back on the downbeat.
        const intoLift = r.liftAt !== null && Math.abs(r.next + phrase - r.liftAt) < 0.01;
        if (r.seg > 0 && this.landed >= 1 && !intoLift && this.rnd() < 0.3) {
          const b0 = r.next + 7 * r.bar;
          this.brk.gain.setValueAtTime(1, b0 - 0.02);
          this.brk.gain.linearRampToValueAtTime(0.12, b0 + 0.03);
          this.brk.gain.setValueAtTime(0.12, b0 + r.bar - 0.03);
          this.brk.gain.linearRampToValueAtTime(1, b0 + r.bar);
          this.note(b0, 'break');
        }
        r.seg++;
      }
      // Only the sources that may still be playing need stopping later (two phrases' worth).
      if (r.srcs.length > 10) r.srcs.splice(0, r.srcs.length - 10);
      // The lift may fall half-way through this phrase: the E minor music starts there, not a bar later.
      const lift = r.liftAt;
      r.next = lift !== null && r.next < lift - 1e-6 && r.next + phrase > lift + 1e-6 ? lift : r.next + phrase;
    }
  }

  /** The tier of the multiplier on screen. Higher tiers land on bar lines; tier 4 lifts at a phrase line. */
  setTier(t: Tier): void {
    const r = this.run;
    if (!r || this.mode !== 'run' || t <= this.tier) return;
    const from = this.tier;
    this.tier = t;
    const now = this.ctx.currentTime;
    if (t >= 4) {
      if (r.liftAt !== null) return;
      const lp = liftPlan(r.t0, r.bar, now);
      r.liftAt = lp.at;
      // The phrase holding the lift may already be scheduled (it began less than 1.5 s ahead of now): the
      // tier-4 music then starts at the lift itself, and the old phrase's sources end there.
      if (r.next > lp.at + 1e-6) {
        r.next = lp.at;
        for (const s of r.srcs) {
          try {
            s.stop(lp.at + 0.05);
          } catch {
            /* already stopped */
          }
        }
      }
      // The lower layers still come in on the next bar line when there is room for at least a bar of them
      // before the pivot (a jump from, say, 1x to 30x); otherwise the pivot itself is the transition.
      if (from < 3) {
        const p = landingPlan(r.t0, r.bar, now + 0.01);
        if (this.landing <= now && p.at <= lp.start - r.bar) {
          this.source('th_fill', this.sting, p.fillAt, false, 0.85, p.fillOffset);
          this.landing = p.at;
          this.landLayers(3, p.at);
          this.note(p.at, 'land 3 (on the way to 4)');
        } else if (this.landing > now) this.landLayers(3, this.landing);
      }
      // The pivot: the run layers bow out as the two transition bars begin, and the E minor music starts on
      // the phrase line (scheduled by update(), in its turn, on the same clock).
      const on = this.landed;
      this.layer.forEach((g, i) => {
        g.gain.cancelScheduledValues(lp.start - 0.06);
        g.gain.setValueAtTime(i === 0 || i <= on ? 1 : 0, lp.start - 0.05);
        g.gain.linearRampToValueAtTime(0, lp.start + 0.03);
      });
      this.source('th_lift', this.topGain, lp.start);
      this.landed = 4;
      this.note(lp.start, 'lift pivot');
      this.note(lp.at, 'lift lands');
      return;
    }
    if (r.liftAt !== null) return;
    if (this.landing > now) {
      // A fill is already on its way: the bigger tier lands with it (no stacked fills).
      this.landLayers(t, this.landing);
      return;
    }
    const plan = landingPlan(r.t0, r.bar, now + 0.01);
    this.source('th_fill', this.sting, plan.fillAt, false, 0.85, plan.fillOffset);
    this.landing = plan.at;
    this.landLayers(t, plan.at);
    this.note(plan.at, `land ${t}`);
  }

  private landLayers(t: Tier, at: number) {
    this.landed = Math.max(this.landed, Math.min(3, t)) as Tier;
    for (let i = 1; i <= Math.min(3, t); i++) {
      const g = this.layer[i]!.gain;
      if (g.value >= 0.99) continue;
      g.cancelScheduledValues(at - 0.05);
      g.setValueAtTime(0, at - 0.01);
      g.linearRampToValueAtTime(1, at + 0.03);
    }
  }

  /** Where the pending tier change lands (for the visual punch): the next layer's or the lift's downbeat. */
  pendingLanding(): { tier: Tier; in: number } | null {
    const now = this.ctx.currentTime;
    const r = this.run;
    if (r?.liftAt != null && r.liftAt > now) return { tier: 4, in: r.liftAt - now };
    return this.landing > now ? { tier: this.landed, in: this.landing - now } : null;
  }

  /** The grid the music is on now: [start, bar length] (the run, or the idle loop), or null. */
  private grid(): [number, number] | null {
    if (this.run) return [this.run.t0, this.run.bar];
    if (this.idle && this.idleStart !== null) return [this.idleStart, (4 * 60) / this.bpm(this.idle.name)];
    return null;
  }

  /** Seconds until the next bar line of the music playing now, or null when no theme music plays. */
  nextDownbeat(): number | null {
    const g = this.grid();
    if (!g) return null;
    const now = this.ctx.currentTime;
    return nextBar(g[0], g[1], now) - now;
  }

  private barListeners = new Set<(bar: number, inSeconds: number) => void>();
  private lastBar = -1;

  /**
   * Called on every bar line of the theme (a little ahead: `inSeconds` is the time left until it), with the
   * bar index on the current grid. Returns an unsubscribe function.
   */
  onBar(cb: (bar: number, inSeconds: number) => void): () => void {
    this.barListeners.add(cb);
    return () => this.barListeners.delete(cb);
  }

  private tickBars() {
    const g = this.grid();
    if (!g || !this.barListeners.size) return;
    const now = this.ctx.currentTime;
    // Announce each bar line up to 60 ms ahead, once.
    const idx = Math.floor((now + 0.06 - g[0]) / g[1] + 1e-6);
    if (idx === this.lastBar || idx < 0) return;
    this.lastBar = idx;
    const at = g[0] + idx * g[1];
    for (const cb of this.barListeners) cb(idx, Math.max(0, at - now));
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
    this.run = null;
    this.landing = 0;
  }

  /**
   * Where a result cuts in: the next eighth note of the run (at most a quarter of a beat away), so the
   * fanfare or the sting starts on the beat; and whether the run had already lifted to E minor.
   */
  private cutIn(): { at: number; lifted: boolean } {
    const now = this.ctx.currentTime;
    const r = this.run;
    if (!r) return { at: now + 0.01, lifted: false };
    const at = nextBar(r.t0, r.bar / 8, now + 0.03);
    return { at, lifted: r.liftAt !== null && at >= r.liftAt - 2 * r.bar };
  }

  /** Cash-out: on the next eighth, the run gives way to a fanfare sized by the settled cash-out tier, in the
   * run's key; then the warm D major version of the tune. */
  escape(tier: Tier): void {
    if (this.mode === 'result') return;
    const { at, lifted } = this.cutIn();
    this.stopRun(at - 0.02, 0.04);
    const n = fanfareFor(tier);
    const rate = lifted ? LIFT_RATE : 1;
    const f = this.buf(`th_win${n}`);
    this.source(`th_win${n}`, this.sting, at, false, 1, 0, rate);
    this.note(at, `fanfare ${n}${lifted ? ' (E)' : ''}`);
    this.setIdle('th_safe', at + Math.max(1.5, (f?.duration ?? 4) / rate - 1.6), 2.5, 0.85);
    this.mode = 'result';
  }

  /** A fall: on the next eighth, the run stops into the loss sting (in the run's key), then the tense loop. */
  fall(): void {
    if (this.mode === 'result') return;
    const { at, lifted } = this.cutIn();
    this.stopRun(at - 0.02, 0.02);
    const rate = lifted ? LIFT_RATE : 1;
    const f = this.buf('th_lose');
    this.source('th_lose', this.sting, at, false, 1, 0, rate);
    this.note(at, `loss${lifted ? ' (E)' : ''}`);
    this.setIdle('th_tense', at + Math.max(2, (f?.duration ?? 5) / rate - 2.2), 2, 0.9);
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
    this.idleStart = null;
    this.mode = 'off';
  }

  /** For tests and QA. */
  state(): { mode: string; tier: Tier; landed: Tier; lifted: boolean; idle: string | null } {
    return { mode: this.mode, tier: this.tier, landed: this.landed, lifted: this.run?.liftAt != null, idle: this.idle?.name ?? null };
  }
}
