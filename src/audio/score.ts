/**
 * The adaptive score, played on recorded percussion: frame drum, djembe, shaker, taiko, a deep pulse,
 * over a bowed cello drone. A sequencer places one-shots on a sixteenth grid with human timing
 * (swing, per-hit jitter, flams on the big drums), human dynamics (accents, ghost notes, ±dB per hit)
 * and phrasing (4-bar phrases whose patterns vary bar to bar and end in fills), through the real room
 * impulse response on the music bus.
 *
 * Four layers enter with the tier of the multiplier ON SCREEN (feedback.tierOf): pulse (always), hands
 * (2×), taiko (5×), drive (10×), with everything doubled up at 25×. They fade in and out over a bar.
 * Nothing here knows, or could know, where the round ends.
 */
import type { Tier } from './feedback';
import type { Rng } from './select';
import type { SamplePlayer } from './samples';

export type Inst = 'm_pulse' | 'm_frame' | 'm_shaker' | 'm_djembe_bass' | 'm_djembe_tone' | 'm_djembe_slap' | 'm_taiko' | 'm_taiko_hi' | 'm_boom';
export type Layer = 0 | 1 | 2 | 3;

export interface Hit {
  inst: Inst;
  /** Sixteenth in the bar, 0..15. */
  step: number;
  /** 0..1 */
  vel: number;
  layer: Layer;
}

/** Tempo per tier: a little faster as the run gets hotter, never frantic. */
export const BPM: Record<Tier, number> = { 0: 94, 1: 98, 2: 104, 3: 110, 4: 116 };

/** Layers that play at a tier. */
export function layersFor(tier: Tier): Layer[] {
  return tier >= 3 ? [0, 1, 2, 3] : tier === 2 ? [0, 1, 2] : tier === 1 ? [0, 1] : [0];
}

const DJEMBE: [Inst, number, number][][] = [
  // [instrument, step, velocity]: three hand patterns, picked per bar so no two bars must match.
  [['m_djembe_bass', 0, 0.9], ['m_djembe_tone', 3, 0.6], ['m_djembe_tone', 6, 0.7], ['m_djembe_slap', 10, 0.75], ['m_djembe_tone', 12, 0.6], ['m_djembe_tone', 14, 0.5]],
  [['m_djembe_bass', 0, 0.9], ['m_djembe_tone', 2, 0.55], ['m_djembe_slap', 6, 0.7], ['m_djembe_bass', 8, 0.7], ['m_djembe_tone', 11, 0.6], ['m_djembe_slap', 14, 0.7]],
  [['m_djembe_bass', 0, 0.95], ['m_djembe_slap', 4, 0.65], ['m_djembe_tone', 7, 0.55], ['m_djembe_tone', 8, 0.6], ['m_djembe_slap', 12, 0.75], ['m_djembe_tone', 15, 0.45]],
];

/**
 * The hits of one bar. `bar` counts from the start of the run (phrases are 4 bars; bar 3 of each
 * phrase is a fill). Depends only on the tier on screen, the bar number and the cosmetic RNG.
 */
export function barHits(tier: Tier, bar: number, rnd: Rng): Hit[] {
  const out: Hit[] = [];
  const pos = bar % 4;
  const fill = pos === 3;
  const add = (inst: Inst, step: number, vel: number, layer: Layer) => out.push({ inst, step, vel, layer });
  // Layer 0, the pulse: a heartbeat on the deep drum and a frame drum backbeat with ghosts.
  add('m_pulse', 0, 1, 0);
  add('m_pulse', 3, 0.5, 0);
  add('m_pulse', 8, tier >= 1 ? 0.85 : 0.7, 0);
  if (tier >= 4) add('m_pulse', 11, 0.45, 0);
  add('m_frame', 4, 0.8, 0);
  add('m_frame', 12, 0.85, 0);
  if (rnd() < 0.35) add('m_frame', 7, 0.3, 0);
  if (rnd() < 0.35) add('m_frame', 14, 0.28, 0);
  if (fill && tier === 0) add('m_frame', 15, 0.45, 0);
  // A soft shaker on the off-beats from the first stride, so even 1× has a groove, not just a pulse.
  for (const st of [2, 6, 10, 14]) add('m_shaker', st, 0.3 + rnd() * 0.08, 0);
  // Layer 1, hands: shaker sixteenths with a lilt, a djembe pattern chosen per bar.
  for (let s = 0; s < 16; s++) {
    if (rnd() < 0.06 && s % 4 !== 2) continue; // the player breathes: the odd sixteenth dropped
    const acc = s % 4 === 2 ? 1 : s % 2 === 0 ? 0.62 : 0.38;
    add('m_shaker', s, acc * (0.85 + rnd() * 0.15), 1);
  }
  const pat = DJEMBE[Math.floor(rnd() * DJEMBE.length) % DJEMBE.length]!;
  for (const [i, s, v] of pat) add(i, s, v, 1);
  if (fill) for (const s of [13, 14, 15]) add('m_djembe_slap', s, 0.45 + (s - 13) * 0.15, 1);
  // Layer 2, taiko: the big drum on the downbeats, the small one answering; a fill closes the phrase.
  add('m_taiko', 0, 1, 2);
  add('m_taiko', 8, pos % 2 ? 0.7 : 0.8, 2);
  add('m_taiko_hi', 12, 0.6, 2);
  if (rnd() < 0.5) add('m_taiko_hi', 14, 0.45, 2);
  if (fill) for (const [k, s] of [8, 10, 12, 14].entries()) add('m_taiko_hi', s, 0.55 + k * 0.12, 2);
  // Layer 3, drive: syncopated taiko, slaps doubling the shaker accents, and from 25× the
  // fill becomes sixteenths on the big drum.
  add('m_taiko', 6, 0.65, 3);
  add('m_taiko', 11, 0.6, 3);
  if (pos === 0) add('m_boom', 0, 0.55, 3);
  for (const s of [2, 6, 10, 14]) if (rnd() < 0.6) add('m_djembe_slap', s, 0.35, 3);
  if (tier >= 4 && fill) for (let s = 8; s < 16; s++) add('m_taiko', s, 0.45 + (s - 8) * 0.06, 3);
  return out;
}

/** Between rounds: a soft frame drum now and then over the drone. Never busy, never the same twice. */
export function idleHits(bar: number, rnd: Rng): Hit[] {
  const out: Hit[] = [];
  if (bar % 2 === 0) out.push({ inst: 'm_frame', step: 0, vel: 0.4 + rnd() * 0.15, layer: 0 });
  if (bar % 4 === 2 && rnd() < 0.6) out.push({ inst: 'm_frame', step: 6, vel: 0.25, layer: 0 });
  if (bar % 8 === 4) out.push({ inst: 'm_pulse', step: 0, vel: 0.35, layer: 0 });
  return out;
}

/**
 * Human timing for a hit, in seconds from its grid position: swing on the off-sixteenths, a little
 * jitter (big drums looser than the shaker), never early by more than the jitter itself.
 */
export function humanise(h: Hit, sixteenth: number, rnd: Rng): number {
  const swing = h.step % 2 === 1 ? sixteenth * 0.08 : 0;
  const loose = h.inst === 'm_taiko' || h.inst === 'm_boom' ? 0.009 : h.inst === 'm_shaker' ? 0.004 : 0.006;
  // Sum of two uniforms: a soft bell around 0.
  const j = (rnd() + rnd() - 1) * loose;
  return swing + j;
}

/** The sequencer that plays `barHits` through the sample player. Owned by AudioEngine. */
export class ScorePlayer {
  private layerGain: GainNode[] = [];
  private layerOn = [false, false, false, false];
  private bar = 0;
  private step = 0;
  private next = 0;
  private hits: Hit[] = [];
  private tier: Tier = 0;
  private bpm = BPM[0];
  mode: 'off' | 'idle' | 'lead' | 'run' = 'off';

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly player: SamplePlayer,
    out: AudioNode,
    private readonly rnd: Rng,
  ) {
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      this.layerGain.push(g);
    }
  }

  /** Ready when the percussion is decoded. */
  ready(): boolean {
    return this.player.has('m_pulse') && this.player.has('m_frame');
  }

  /** Restart the grid now (a new run, the go). */
  restart(at: number): void {
    this.bar = 0;
    this.step = 0;
    this.next = at;
    this.hits = [];
  }

  setTier(t: Tier): void {
    this.tier = t;
  }

  private accentNext = 0;

  /**
   * A tier just arrived: on the next downbeat (where its layer fades in) the big drum and the boom
   * land together, louder for higher tiers. One accent per bar at most.
   */
  accent(strength: number): void {
    if (this.mode === 'run') this.accentNext = Math.max(this.accentNext, 0.4 + 0.6 * strength);
  }

  private setLayers(at: number) {
    const want = this.mode === 'run' ? layersFor(this.tier) : this.mode === 'off' ? [] : [0];
    for (let i = 0; i < 4; i++) {
      const on = want.includes(i as Layer);
      if (on === this.layerOn[i]) continue;
      this.layerOn[i] = on;
      // Over about a bar: in on the downbeat, out across the bar.
      this.layerGain[i]!.gain.setTargetAtTime(on ? 1 : 0, at, on ? 0.25 : 0.6);
    }
  }

  /** Schedule everything up to `ahead` (AudioContext seconds). Call every ~25 ms. */
  schedule(ahead: number): void {
    if (this.mode === 'off') return;
    const now = this.ctx.currentTime;
    // After a stall (tab throttled), skip ahead instead of firing a burst of old notes.
    if (this.next < now - 0.05) {
      this.next = now + 0.02;
    }
    while (this.next < ahead) {
      if (this.step === 0) {
        // Tier, tempo and layers change on the bar line only, so the groove never lurches.
        this.bpm = this.mode === 'run' ? BPM[this.tier] : this.mode === 'lead' ? 88 : 80;
        this.setLayers(this.next);
        this.hits = this.mode === 'run' ? barHits(this.tier, this.bar, this.rnd) : this.mode === 'lead' ? [
          { inst: 'm_pulse', step: 0, vel: 0.9, layer: 0 },
          { inst: 'm_pulse', step: 3, vel: 0.5, layer: 0 },
          { inst: 'm_pulse', step: 8, vel: 0.85, layer: 0 },
          { inst: 'm_pulse', step: 11, vel: 0.5, layer: 0 },
        ] : idleHits(this.bar, this.rnd);
        if (this.accentNext > 0 && this.mode === 'run') {
          const a = this.accentNext;
          this.accentNext = 0;
          const at = Math.max(now, this.next);
          this.player.play('m_taiko', { when: at, strength: a, priority: 3, dest: this.layerGain[0] });
          this.player.play('m_boom', { when: at, strength: 0.4 + 0.5 * a, gain: 0.7, dest: this.layerGain[0] });
        }
      }
      const sixteenth = 60 / this.bpm / 4;
      for (const h of this.hits) {
        if (h.step !== this.step) continue;
        if (this.mode === 'run' && !this.layerOn[h.layer]) continue;
        const at = Math.max(now, this.next + humanise(h, sixteenth, this.rnd));
        // Velocity → level, with a touch of per-hit variation on top of the catalog's own.
        this.player.play(h.inst, { when: at, strength: h.vel, dest: this.layerGain[h.layer], gain: h.inst === 'm_boom' ? 0.6 : 1 });
        // Flam: the big drum is sometimes struck twice, the grace note soft and just early.
        if (h.inst === 'm_taiko' && h.vel > 0.9 && this.rnd() < 0.25) this.player.play('m_taiko_hi', { when: Math.max(now, at - 0.028), strength: 0.3, dest: this.layerGain[h.layer] });
      }
      this.next += sixteenth;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  /** Cut every layer (a fall) or let it ring out (an escape). */
  silence(at: number, tc: number): void {
    for (let i = 0; i < 4; i++) {
      this.layerOn[i] = false;
      const g = this.layerGain[i]!.gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(g.value, at);
      g.setTargetAtTime(0, at, tc);
    }
  }
}
