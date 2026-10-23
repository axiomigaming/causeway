/**
 * Pure decisions behind the sample player: which variant, how far to vary it, which voice to steal,
 * which bed and footstep surface a section gets, and how the generic `sfx(name)` names resolve.
 * No WebAudio here, so it is unit-tested (tests/audio-select.test.ts).
 */

export type Rng = () => number;

/** Small, fast, seedable PRNG (mulberry32). Cosmetic only. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A variant index in [0, n). With two or more variants it is never the one played last, so a
 * footstep or a hit never repeats back to back.
 */
export function pickVariant(n: number, last: number, rnd: Rng): number {
  if (n <= 1) return 0;
  if (last < 0 || last >= n) return Math.min(n - 1, Math.floor(rnd() * n));
  const i = Math.min(n - 2, Math.floor(rnd() * (n - 1)));
  return i >= last ? i + 1 : i;
}

/** Uniform in [-r, r]. */
export function spread(r: number, rnd: Rng): number {
  return (rnd() * 2 - 1) * r;
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const centsToRate = (c: number) => Math.pow(2, c / 1200);

/**
 * Gain for a trigger strength in [0, 1]: `floorDb` at 0, 0 dB at 1, shaped by `curve` (>1 keeps soft
 * triggers soft). Clamped, never NaN.
 */
export function strengthGain(strength: number, floorDb = -18, curve = 1): number {
  const s = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
  return dbToGain(floorDb * (1 - Math.pow(s, curve)));
}

/**
 * Low-pass cutoff for a trigger strength: weak or distant hits lose their top. 1.2 kHz at 0,
 * `top` Hz at 1, exponential in between.
 */
export function strengthCutoff(strength: number, top = 16000): number {
  const s = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
  return 1200 * Math.pow(top / 1200, s);
}

// ------------------------------------------------------------------ voices

export interface VoiceInfo {
  sound: string;
  priority: number;
  /** AudioContext time it started. */
  started: number;
  /** AudioContext time it ends on its own (Infinity for loops). */
  ends: number;
}

/**
 * Where a new voice goes when `active` is the live pool (already pruned of finished voices):
 * - 'free'   there is room;
 * - index    steal that voice (fade it quickly, reuse the slot);
 * - 'drop'   do not play the new sound (everything playing matters more).
 * A sound over its own concurrency cap steals its own oldest voice first (a burst of debris
 * renews itself instead of piling up). Otherwise the pool steals the lowest-priority voice,
 * the one nearest its end among equals, and never one of higher priority than the newcomer.
 */
export function voiceSlot(active: readonly VoiceInfo[], cap: number, sound: string, perSound: number, priority: number): number | 'free' | 'drop' {
  let own = -1;
  let ownCount = 0;
  for (let i = 0; i < active.length; i++) {
    const v = active[i]!;
    if (v.sound !== sound) continue;
    ownCount++;
    if (own < 0 || v.started < active[own]!.started) own = i;
  }
  if (ownCount >= perSound && own >= 0) return own;
  if (active.length < cap) return 'free';
  let best = -1;
  for (let i = 0; i < active.length; i++) {
    const v = active[i]!;
    if (v.priority > priority) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const b = active[best]!;
    if (v.priority < b.priority || (v.priority === b.priority && v.ends < b.ends)) best = i;
  }
  return best < 0 ? 'drop' : best;
}

/** Voice budget for the device: fewer on phones and low-end hardware. */
export function voiceCap(d: { cores?: number; memoryGb?: number; mobile?: boolean }): number {
  const cores = d.cores ?? 4;
  const mem = d.memoryGb ?? 4;
  if (mem <= 2 || cores <= 2) return 12;
  if (d.mobile || mem <= 4 || cores <= 4) return 20;
  return 32;
}

// ------------------------------------------------------------------ slices

/**
 * The first sample in [from, to) whose magnitude reaches `threshold`, or `from` when none does.
 * Lossy codecs shift a file by their priming delay (AAC ~ 2112 samples) and not every decoder
 * trims it, so each slice's start is snapped onto its real onset after decoding.
 */
export function findOnset(data: Float32Array, from: number, to: number, threshold: number): number {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(data.length, Math.floor(to));
  for (let i = a; i < b; i++) if (Math.abs(data[i]!) >= threshold) return i;
  return a;
}

// ------------------------------------------------------------------ world mapping

export type Surface = 'stone' | 'wood' | 'gravel' | 'wet' | 'dirt';
/** The beds: the causeway's four, and (round 16) the forest's denser chorus and the dry ravine's hollow wind. */
export type Bed = 'jungle' | 'insects' | 'river' | 'waterfall' | 'forest' | 'ravine';

/**
 * Round 15: each world style (world/style.ts names) has its own air. Multipliers on the section mix per bed,
 * the wind, playback rates for the bird and insect beds (a different chorus, not just a level), and the
 * insect bed's top (dB of the high shelf; the default cuts it 9 dB). Unknown names get the default.
 */
export interface StyleAir {
  beds: Record<Bed, number>;
  wind: number;
  birdRate: number;
  insectRate: number;
  insectTop: number;
  /** The rain bed's level when it is shipped (0 = none). */
  rain: number;
}

export const STYLE_AIR: Record<string, StyleAir> = {
  // The reference world: the mix as it was.
  turquoise: { beds: { jungle: 1, insects: 1, river: 1, waterfall: 1, forest: 1, ravine: 1 }, wind: 1, birdRate: 1, insectRate: 1, insectTop: -9, rain: 0 },
  // Jade river, greener and wetter: the river forward, birds a touch lower, fewer insects, less wind.
  jade: { beds: { jungle: 1.1, insects: 0.8, river: 1.4, waterfall: 1.1, forest: 1.1, ravine: 0.8 }, wind: 0.8, birdRate: 0.97, insectRate: 0.98, insectTop: -10, rain: 0 },
  // A clear lagoon, clean open air: water lapping, sparse brighter birds, few insects, more breeze.
  lagoon: { beds: { jungle: 0.75, insects: 0.55, river: 1.25, waterfall: 0.9, forest: 0.8, ravine: 1.2 }, wind: 1.3, birdRate: 1.05, insectRate: 1, insectTop: -11, rain: 0 },
  // Dry season: the cicadas take over (higher, brighter), birds thin out, the water low, a dusty wind.
  dry: { beds: { jungle: 0.6, insects: 1.7, river: 0.45, waterfall: 0.6, forest: 0.7, ravine: 1.4 }, wind: 1.45, birdRate: 1.03, insectRate: 1.07, insectTop: -4, rain: 0 },
  // Deep rainforest: dense, dark and wet; more of everything that lives, water everywhere, still air.
  rainforest: { beds: { jungle: 1.35, insects: 1.15, river: 1.3, waterfall: 1.25, forest: 1.35, ravine: 0.7 }, wind: 0.7, birdRate: 0.95, insectRate: 0.97, insectTop: -8, rain: 0.8 },
};

export function styleAir(name: string | null | undefined): StyleAir {
  return (name && STYLE_AIR[name]) || STYLE_AIR.turquoise!;
}

/** Sections with falling water nearby (waterfall bed, wet stone underfoot). */
const WATERFALL = new Set(['cliff', 'gorge']);
/** Sections over open water (river/lapping bed, planks or wet stone). */
const WATER = new Set(['bridge', 'boardwalk', 'avenue']);
/** Loose ground: rubble, ruins, stairs. */
const LOOSE = new Set(['ruins', 'tunnel', 'stairsDown', 'stairsUp', 'statues']);
/** Round 16, land sections (world/sections.ts LAND_TYPES): earth and leaf litter underfoot. */
const EARTH = new Set(['forest', 'forestWall', 'cutting']);

/** Whether a section's ground is earth (for the leaf-litter and root layer on footsteps). */
export function earthy(section: string | null): boolean {
  return !!section && (EARTH.has(section) || section === 'overgrown' || section === 'ravine');
}

/**
 * The surface under a footstep. The world reports stone or wood; the section refines stone
 * into gravel (ruins, tunnels, stairs) or wet stone (by the falls). `rnd` mixes a few of the
 * neighbouring surface in, as real ground is never one material.
 */
export function surfaceFor(section: string | null, base: 'stone' | 'wood', rnd: Rng): Surface {
  if (base === 'wood') return 'wood';
  const r = rnd();
  if (section && WATERFALL.has(section)) return r < 0.75 ? 'wet' : 'stone';
  if (section && LOOSE.has(section)) return r < 0.6 ? 'gravel' : 'stone';
  if (section && WATER.has(section)) return r < 0.3 ? 'wet' : 'stone';
  // Land: the forest floor is earth; the overgrown plaza is paved, earth at its edges; the ravine footing is
  // grit over earth and stone.
  if (section && EARTH.has(section)) return r < 0.8 ? 'dirt' : 'gravel';
  if (section === 'overgrown') return r < 0.35 ? 'dirt' : 'stone';
  if (section === 'ravine') return r < 0.45 ? 'gravel' : r < 0.8 ? 'dirt' : 'stone';
  return r < 0.15 ? 'gravel' : 'stone';
}

/**
 * Bed levels (0..1) for a section. Unknown or null sections get the default causeway mix:
 * jungle and insects with water lapping. Escapes and menus sit in the jungle by the river.
 */
export function bedMix(section: string | null): Record<Bed, number> {
  const z = { forest: 0, ravine: 0 };
  if (section && WATERFALL.has(section)) return { jungle: 0.45, insects: 0.25, river: 0.3, waterfall: 1, ...z };
  if (section && WATER.has(section)) return { jungle: 0.6, insects: 0.4, river: 1, waterfall: 0, ...z };
  if (section === 'tunnel') return { jungle: 0.2, insects: 0.15, river: 0.25, waterfall: 0, ...z };
  // Land (round 16): away from the water the forest closes in; the walls of trunks are the densest; a cutting
  // between rock faces is quieter with wind in it; the dry ravine is wind over a dry riverbed and cicadas.
  if (section === 'forest') return { jungle: 0.8, insects: 0.7, river: 0.15, waterfall: 0, forest: 0.85, ravine: 0 };
  if (section === 'forestWall') return { jungle: 0.6, insects: 0.85, river: 0.05, waterfall: 0, forest: 1.15, ravine: 0 };
  if (section === 'overgrown') return { jungle: 0.9, insects: 0.7, river: 0.25, waterfall: 0, forest: 0.6, ravine: 0 };
  if (section === 'cutting') return { jungle: 0.45, insects: 0.5, river: 0.05, waterfall: 0, forest: 0.35, ravine: 0.45 };
  if (section === 'ravine') return { jungle: 0.3, insects: 0.85, river: 0, waterfall: 0, forest: 0, ravine: 1 };
  return { jungle: 1, insects: 0.6, river: 0.55, waterfall: 0, ...z };
}

// ------------------------------------------------------------------ generic sfx names

/**
 * Names other code may pass to `audio.sfx(name, strength)`, mapped to a sample and a gain trim.
 * Unknown names resolve to null (a no-op), so new world events never throw.
 */
export const SFX_NAMES: Record<string, (strength: number) => { sound: string; strength: number }> = {
  impact: (s) => ({ sound: 'impact', strength: s }),
  stone: (s) => ({ sound: 'impact', strength: s }),
  slam: (s) => ({ sound: 'slam', strength: s }),
  door: (s) => ({ sound: 'slam', strength: s }),
  grind: (s) => ({ sound: 'grind', strength: s }),
  rumble: (s) => ({ sound: 'rumble', strength: s }),
  tremor: (s) => ({ sound: 'rumble', strength: s }),
  rockfall: (s) => ({ sound: 'rockfall', strength: s }),
  crumble: (s) => ({ sound: 'crumble', strength: s }),
  collapse: (s) => ({ sound: 'crumble', strength: s }),
  debris: (s) => ({ sound: 'debris', strength: s }),
  clatter: (s) => ({ sound: 'debris', strength: s }),
  grit: (s) => ({ sound: 'dust', strength: s * 0.6 }),
  dust_burst: (s) => ({ sound: 'dust', strength: 0.4 + 0.6 * s }),
  stones_skitter: (s) => ({ sound: 'debris', strength: 0.25 + 0.55 * s }),
  dust: (s) => ({ sound: 'dust', strength: s }),
  splash: (s) => ({ sound: s >= 0.55 ? 'splash_big' : 'splash_small', strength: s }),
  splash_big: (s) => ({ sound: 'splash_big', strength: s }),
  splash_small: (s) => ({ sound: 'splash_small', strength: s }),
  whoosh: (s) => ({ sound: 'whoosh', strength: s }),
  gust: (s) => ({ sound: 'gust', strength: s }),
  wind: (s) => ({ sound: 'gust', strength: s }),
  coins: (s) => ({ sound: 'coins', strength: s }),
  gold: (s) => ({ sound: 'coins', strength: s }),
  gem: (s) => ({ sound: 'sparkle', strength: s }),
  sparkle: (s) => ({ sound: 'sparkle', strength: s }),
};

export function resolveSfx(name: string, strength: number): { sound: string; strength: number } | null {
  const f = Object.prototype.hasOwnProperty.call(SFX_NAMES, name) ? SFX_NAMES[name] : undefined;
  if (!f) return null;
  const s = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0.5;
  return f(s);
}
