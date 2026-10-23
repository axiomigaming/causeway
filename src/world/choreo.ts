import { Rng } from '../engine/rng';

/**
 * Presentation choreography: pure selection functions for run tiers and for
 * crash / escape variants.
 *
 * Honesty rule: every function here is a pure function of values that are
 * already public when it is called — the *current* multiplier (and time), or a
 * round id plus the *settled* multiplier. None of them can see the hidden crash
 * point, so nothing on screen before settlement can encode where the round ends,
 * and nothing after a cash-out can encode how close the fall was.
 */

/**
 * How the way falls (presentation only; the outcome is the server's). Round 20 (FX director):
 * - chasm: the floor gives way, into the water;
 * - ledge: the top course caves in, he drops onto the stone below (no water);
 * - gate: a door slams down ahead;
 * - rockfall: blocks come down from the walls and knock him down;
 * - pillar: a pier topples across the way, he slams into it and goes down;
 * - trip: a column comes down at his feet, he catches it, pitches forward and rolls.
 */
export type CrashKind = 'chasm' | 'gate' | 'rockfall' | 'pillar' | 'trip' | 'ledge';

/** Run tiers by current multiplier: composed, driven, sprint, all-out, desperate. */
export const TIER_AT = [2, 5, 10, 25] as const;
export const TIER_NAMES = ['composed', 'driven', 'sprint', 'all-out', 'desperate'] as const;

export function runTier(mult: number): number {
  let t = 0;
  for (const m of TIER_AT) if (mult >= m) t++;
  return t;
}

/**
 * A continuous tier level, 0 at 1.00× rising through 1, 2, 3, 4 at the tier
 * boundaries (log-linear between them). Drives gait and camera blends so tier
 * changes never pop.
 */
export function runDrive(mult: number): number {
  const anchors = [1, ...TIER_AT];
  const m = Math.max(1, mult);
  if (m >= anchors[anchors.length - 1]!) return anchors.length - 1;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    if (m < b) return i + Math.log(m / a) / Math.log(b / a);
  }
  return anchors.length - 1;
}

/** Presentation intensity from the multiplier: 0 at 1.00×, 1 at 30× and beyond (log scale). */
export function intensityOf(mult: number): number {
  return Math.min(1, Math.max(0, Math.log(Math.max(1, mult)) / Math.log(30)));
}

/** Sub-steps inside the tiers: small beats (a gust, a bird flight) between the tier-ups. */
export const STEP_AT = [1.5, 3, 7, 15, 50, 100] as const;

/**
 * THE PROGRESSION: one model of how far into the crescendo the run is, read by every system — the
 * camera, the grade, the effects and danger cues, the runner, the world and the score. A pure
 * function of the current multiplier only (never the fall point). See README "Presentation by
 * multiplier" for what each system does per tier.
 */
export interface Progression {
  /** 0..4: composed, driven, sprint, all-out, desperate (at 2×, 5×, 10×, 25×). */
  tier: number;
  /** Continuous 0..4: the tier plus how far through it (log-linear). Gait, camera, cue strength. */
  drive: number;
  /** 0..1 through the current tier (1 at the top tier from 25×, approaching 1 near 100×). */
  within: number;
  /** 0..1 log intensity (30× = 1): run speed, lens width, world biome. */
  intensity: number;
  /**
   * 0..1 grade and atmosphere heat: mostly continuous, with a step at each tier so a tier-up is felt
   * at once (warmth, contrast, vignette, dust, vegetation).
   */
  heat: number;
  /** How many of STEP_AT have been passed (0..6). */
  step: number;
}

export function progression(mult: number): Progression {
  const m = Math.max(1, mult);
  const tier = runTier(m);
  const drive = runDrive(m);
  const within = tier >= 4 ? Math.min(1, Math.log(m / 25) / Math.log(4)) : drive - tier;
  const heat = Math.min(1, 0.55 * (drive / 4) + 0.35 * (tier / 4) + (tier >= 4 ? 0.1 * within : 0));
  let step = 0;
  for (const s of STEP_AT) if (m >= s) step++;
  return { tier, drive, within, intensity: intensityOf(m), heat, step };
}

/** How grand a settled moment should be: 0 at ≤1.5×, 1 at ≥10× (log scale). */
export function epicOf(mult: number): number {
  const x = Math.log(Math.max(1, mult) / 1.5) / Math.log(10 / 1.5);
  return Math.min(1, Math.max(0, x));
}

/** Runner clip for each crash kind and variant. */
export const CRASH_CLIPS: Record<CrashKind, readonly string[]> = {
  chasm: ['fall_chasm', 'fall_chasm_b'],
  gate: ['fall_gate', 'fall_gate_b'],
  rockfall: ['fall_rock', 'fall_rock_b', 'fall_side_hit'],
  // (Until the runner GLB carries these, Runner.play falls back to fall_gate_b / fall_rock.)
  pillar: ['fall_pillar', 'fall_pillar_b'],
  trip: ['fall_trip'],
  ledge: ['fall_drop'],
};

/** Relative weights of the crash kinds a section can stage: a mix, the new ones a touch favoured. */
const CRASH_WEIGHT: Record<CrashKind, number> = { chasm: 1, ledge: 1, gate: 1, rockfall: 1, pillar: 1.2, trip: 1.1 };

export interface CrashStaging {
  kind: CrashKind;
  variant: number;
  clip: string;
  /** 0 (quick, small) … 1 (big, slow, cinematic). */
  epic: number;
  /** The fall came before the runner got going: the gate slams as they push off. */
  atStart: boolean;
}

/**
 * Staging for a settled fall, from the round id and the (now public) crash
 * multiplier. `hazards` are the kinds the current section can stage; `standing`
 * means the runner has not got going yet (instant falls at 1.00×).
 */
export function crashStaging(roundId: string, crashMult: number, hazards: readonly CrashKind[], standing: boolean, last: CrashKind | null = null): CrashStaging {
  const epic = epicOf(crashMult);
  if (standing) return { kind: 'gate', variant: 0, clip: 'fall_start', epic: 0, atStart: true };
  const r = new Rng(`${roundId}/staging`);
  // Never the same kind twice running when the section offers another.
  const pool = hazards.length > 1 && last ? hazards.filter((k) => k !== last) : hazards;
  const kind = pool.length ? r.weighted(pool.map((k) => [k, CRASH_WEIGHT[k]] as const)) : 'rockfall';
  const variant = new Rng(`${roundId}/variant/${kind}`).int(0, CRASH_CLIPS[kind].length - 1);
  return { kind, variant, clip: CRASH_CLIPS[kind][variant]!, epic, atStart: false };
}

export type EscapeVariant = 'lookback' | 'cheer' | 'salute' | 'leap';
export const ESCAPE_CLIPS: Record<EscapeVariant, string> = { lookback: 'win', cheer: 'win_cheer', salute: 'win_salute', leap: 'win_leap' };

/** Relative weights by cash-out tier: bigger escapes favour the grander moves. */
const ESCAPE_WEIGHTS: readonly (readonly [number, readonly (readonly [EscapeVariant, number])[]])[] = [
  [1, [['lookback', 3], ['salute', 3], ['cheer', 1], ['leap', 0.5]]],
  [2, [['lookback', 3], ['salute', 2], ['cheer', 2], ['leap', 1]]],
  [10, [['lookback', 2], ['salute', 1], ['cheer', 2], ['leap', 2]]],
  [Infinity, [['lookback', 1], ['salute', 0.5], ['cheer', 2], ['leap', 3]]],
];

export interface EscapeStaging {
  variant: EscapeVariant;
  clip: string;
  epic: number;
  /** Seconds into the clip to start (a standing runner skips the run-out). */
  offset: number;
}

/**
 * Staging for a cash-out, from a round seed and the cash-out multiplier only.
 * `standing` (the runner barely moving, e.g. a cash-out at 1.00×) picks the
 * calm turn-and-salute and starts it past its run-out.
 */
export function escapeStaging(seed: string, cashMult: number, standing: boolean): EscapeStaging {
  const epic = epicOf(cashMult);
  if (standing) return { variant: 'salute', clip: ESCAPE_CLIPS.salute, epic, offset: 0.7 };
  const table = ESCAPE_WEIGHTS.find(([below]) => cashMult < below)![1];
  const variant = new Rng(`${seed}/escape`).weighted(table);
  return { variant, clip: ESCAPE_CLIPS[variant], epic, offset: 0 };
}

export type Beat = 'glance' | 'stumble';

/**
 * The next cosmetic beat in a run (a glance back over the shoulder, a
 * stumble-and-recover), from the cosmetic RNG and the current tier only.
 * Returns null below the tiers that have beats. `wait` is seconds until it.
 */
export function nextBeat(rng: Rng, tier: number): { beat: Beat; wait: number } | null {
  if (tier < 2) return null;
  const wait = rng.range(3.5, 8) * (1.35 - 0.15 * tier);
  const beat: Beat = rng.chance(tier >= 3 ? 0.55 : 0.3) ? 'glance' : 'stumble';
  return { beat, wait };
}
