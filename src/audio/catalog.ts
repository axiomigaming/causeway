/**
 * How each recorded sound is played: its bus, level, how much every trigger varies, how it
 * survives a crowd. The files themselves (and their variants, as slices of one file) are listed in
 * public/audio/manifest.json, built by tools/build-audio.mjs from the sources in
 * tools/audio-sources.json (credits: public/audio/CREDITS.txt).
 */

export type Bus = 'sfx' | 'foley' | 'ui' | 'amb' | 'music' | 'sting';

export interface SoundSpec {
  bus: Bus;
  /** Base level, dB (files are loudness-normalised; this is the mix). */
  db: number;
  /** Random pitch per trigger, ± cents (rate change: pitch and length move together, as a real take). */
  cents: number;
  /** Random level per trigger, ± dB. */
  vary: number;
  /** 0 ambience/ornament … 3 must be heard (slams, cash-out). Higher steals lower. */
  priority: number;
  /** Most voices of this sound at once; the oldest is renewed past it. */
  max: number;
  /** Random pan per trigger, ± (0 = centred). */
  pan?: number;
  /** Level at strength 0, dB below strength 1 (default -14). */
  floor?: number;
  /** Strength also darkens the sound (weak = far = duller). */
  dull?: boolean;
  /** Play from a random point inside long textures (debris, rumble), seconds of spread. */
  scatter?: number;
}

export const SOUNDS: Record<string, SoundSpec> = {
  // Footsteps: four surfaces, tight but never identical.
  step_stone: { bus: 'foley', db: -11, cents: 70, vary: 2, priority: 1, max: 3, pan: 0.12, floor: -9, dull: true },
  step_wood: { bus: 'foley', db: -11, cents: 80, vary: 2, priority: 1, max: 3, pan: 0.12, floor: -9, dull: true },
  step_gravel: { bus: 'foley', db: -12, cents: 70, vary: 2, priority: 1, max: 3, pan: 0.12, floor: -9, dull: true },
  step_wet: { bus: 'foley', db: -12, cents: 70, vary: 2, priority: 1, max: 3, pan: 0.12, floor: -9, dull: true },
  breath: { bus: 'foley', db: -17, cents: 0, vary: 0, priority: 1, max: 1 },
  pant: { bus: 'foley', db: -15, cents: 40, vary: 1, priority: 1, max: 1 },
  // The world under strain and coming down.
  impact: { bus: 'sfx', db: -6, cents: 150, vary: 2, priority: 2, max: 4, pan: 0.35, floor: -16, dull: true },
  slam: { bus: 'sfx', db: -1, cents: 60, vary: 1, priority: 3, max: 2, pan: 0.05 },
  grind: { bus: 'sfx', db: -6, cents: 100, vary: 1.5, priority: 2, max: 2, pan: 0.15 },
  rumble: { bus: 'sfx', db: -7, cents: 120, vary: 1.5, priority: 2, max: 2, floor: -12, scatter: 2 },
  rockfall: { bus: 'sfx', db: -5, cents: 120, vary: 2, priority: 2, max: 3, pan: 0.3, floor: -12, dull: true },
  crumble: { bus: 'sfx', db: -5, cents: 90, vary: 1.5, priority: 2, max: 2, pan: 0.2, floor: -12 },
  debris: { bus: 'sfx', db: -12, cents: 200, vary: 3, priority: 0, max: 4, pan: 0.5, floor: -12, dull: true, scatter: 0.2 },
  dust: { bus: 'sfx', db: -16, cents: 200, vary: 3, priority: 0, max: 3, pan: 0.4, floor: -12, dull: true },
  splash_big: { bus: 'sfx', db: -5, cents: 120, vary: 1.5, priority: 2, max: 2, pan: 0.25, floor: -10, dull: true },
  splash_small: { bus: 'sfx', db: -10, cents: 200, vary: 2.5, priority: 1, max: 4, pan: 0.4, floor: -12, dull: true },
  whoosh: { bus: 'sfx', db: -12, cents: 150, vary: 2, priority: 1, max: 2, pan: 0.2 },
  gust: { bus: 'amb', db: -14, cents: 150, vary: 3, priority: 0, max: 2, pan: 0.6 },
  // Escape and cash-out.
  coins: { bus: 'ui', db: -8, cents: 60, vary: 1, priority: 3, max: 2, pan: 0.1 },
  sparkle: { bus: 'ui', db: -13, cents: 50, vary: 1, priority: 2, max: 2, pan: 0.25 },
  swell: { bus: 'sting', db: -9, cents: 0, vary: 0, priority: 3, max: 1 },
  // Interface: stone and wood, small and close.
  ui_tap: { bus: 'ui', db: -14, cents: 80, vary: 1.5, priority: 2, max: 3 },
  ui_tick: { bus: 'ui', db: -19, cents: 120, vary: 1.5, priority: 1, max: 3 },
  ui_slide: { bus: 'ui', db: -17, cents: 60, vary: 1, priority: 1, max: 2 },
  ui_toggle: { bus: 'ui', db: -17, cents: 50, vary: 1, priority: 1, max: 2 },
  // Beds (loops; levels are set by the engine).
  bed_jungle: { bus: 'amb', db: -16, cents: 0, vary: 0, priority: 0, max: 1 },
  bed_insects: { bus: 'amb', db: -22, cents: 0, vary: 0, priority: 0, max: 1 },
  bed_river: { bus: 'amb', db: -19, cents: 0, vary: 0, priority: 0, max: 1 },
  bed_waterfall: { bus: 'amb', db: -17, cents: 0, vary: 0, priority: 0, max: 1 },
  bed_wind: { bus: 'amb', db: -19, cents: 0, vary: 0, priority: 0, max: 1 },
  // Score: recorded percussion played by the sequencer (score.ts), a drone, strings, stingers.
  m_taiko: { bus: 'music', db: -7, cents: 25, vary: 1.5, priority: 1, max: 4 },
  m_taiko_hi: { bus: 'music', db: -11, cents: 30, vary: 1.5, priority: 1, max: 4 },
  m_djembe_bass: { bus: 'music', db: -10, cents: 20, vary: 1.5, priority: 1, max: 3 },
  m_djembe_tone: { bus: 'music', db: -13, cents: 25, vary: 2, priority: 1, max: 4 },
  m_djembe_slap: { bus: 'music', db: -15, cents: 25, vary: 2, priority: 1, max: 4 },
  m_frame: { bus: 'music', db: -11, cents: 25, vary: 2, priority: 1, max: 3 },
  m_shaker: { bus: 'music', db: -21, cents: 40, vary: 2.5, priority: 0, max: 3 },
  m_pulse: { bus: 'music', db: -8, cents: 15, vary: 1, priority: 1, max: 2 },
  m_boom: { bus: 'sting', db: -6, cents: 40, vary: 1, priority: 3, max: 2 },
  m_gong: { bus: 'sting', db: -9, cents: 0, vary: 0.5, priority: 3, max: 2 },
  m_drone: { bus: 'music', db: -17, cents: 0, vary: 0, priority: 0, max: 2 },
  m_strings: { bus: 'music', db: -19, cents: 0, vary: 0, priority: 0, max: 1 },
};

/** Which sounds load first (core: everything a round needs) and which wait for the first gesture. */
export const LAZY_GROUPS = ['beds', 'music'] as const;
