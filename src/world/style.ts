/**
 * World round 12: a per-world style, picked with the theme and the look from the world's own cosmetic
 * seed (never the same as the last world's; presentation only, nothing to do with the fall point). It
 * varies what the look leaves alone — the water's colour and clarity, the season of the foliage, the
 * density of the air — and which hero landmarks this world shows. Uniform changes only: no download.
 */
export type LandmarkKind = 'fallen_colossus' | 'river_head' | 'sunken_temple' | 'jungle_cliff' | 'column_grove';

export interface WorldStyle {
  name: string;
  /** Water body colours (shallow, deep). */
  waterShallow: string;
  waterDeep: string;
  /** Multiplier on the leaf albedo: the season of the jungle. */
  foliage: [number, number, number];
  /** Multiplier on the haze density. */
  fog: number;
  /** The hero landmarks this world shows, in the order they come up along the route. */
  landmarks: LandmarkKind[];
  /** World round 28: the sky's tint after its grade (rgb) — the air of the place. */
  sky: [number, number, number];
}

/**
 * World round 28 (the critic: worlds 3 and 7 the same sandstone causeway, arches, beams and palms with only
 * a slight colour shift): the stone the ruins were built of, drawn per world beside the style. Every
 * masonry piece — the paving, parapets, piers, lintels, statues — is moved toward the family's colour at
 * its own baked luminance (caustics.ts FRAG_FAMILY), the natural rock half as far. `colour` is relative to
 * the baked sandstone's luminance; `k` how far the masonry goes (0: as baked). Uniforms only.
 */
export interface StoneFamily {
  name: string;
  colour: [number, number, number];
  k: number;
}

export const STONES: StoneFamily[] = [
  // The buff-to-rust sandstone the kit is baked in.
  { name: 'sandstone', colour: [1, 1, 1], k: 0 },
  // Pale cream limestone (the Yucatán's): bright, sun-bleached.
  { name: 'limestone', colour: [1.4, 1.35, 1.24], k: 0.9 },
  // Grey-green greenstone (the Olmec's serpentine).
  { name: 'greenstone', colour: [0.6, 0.86, 0.68], k: 0.95 },
  // Red volcanic tezontle (Tenochtitlan's): oxblood and rust.
  { name: 'tezontle', colour: [1.42, 0.46, 0.4], k: 0.9 },
  // Dark grey basalt.
  { name: 'basalt', colour: [0.42, 0.44, 0.5], k: 0.95 },
];

export const STYLES: WorldStyle[] = [
  {
    name: 'turquoise',
    waterShallow: '#29b39a', waterDeep: '#05473f',
    foliage: [1, 1, 1], fog: 1,
    landmarks: ['fallen_colossus', 'jungle_cliff'],
    sky: [1, 1, 1],
  },
  {
    // Jade river, a greener, wetter jungle, a little more haze.
    name: 'jade',
    // (World round 28: further from the rainforest — a milkier jade, a fresher yellow-green.)
    waterShallow: '#52ad6c', waterDeep: '#0e4a2b',
    foliage: [0.94, 1.1, 0.7], fog: 1.15,
    landmarks: ['river_head', 'column_grove'],
    sky: [0.9, 1.06, 0.95],
  },
  {
    // A clear blue lagoon, cooler leaves, clean air.
    name: 'lagoon',
    waterShallow: '#2aa6b8', waterDeep: '#06364a',
    foliage: [0.84, 0.98, 1.04], fog: 0.8,
    landmarks: ['sunken_temple', 'fallen_colossus'],
    sky: [0.82, 0.98, 1.2],
  },
  {
    // Dry season: murky olive water, yellowed leaves, dust in the air.
    name: 'dry',
    waterShallow: '#6aa58a', waterDeep: '#1d4535',
    foliage: [1.28, 1.02, 0.58], fog: 1.3,
    landmarks: ['column_grove', 'river_head'],
    sky: [1.16, 1.02, 0.8],
  },
  {
    // Deep rainforest: dark tea-green water, deep greens, heavy air.
    name: 'rainforest',
    // (World round 28: darker tea and deeper blue-greens, further from the jade.)
    waterShallow: '#17766c', waterDeep: '#02221f',
    foliage: [0.62, 0.86, 0.68], fog: 1.4,
    landmarks: ['jungle_cliff', 'sunken_temple'],
    sky: [0.8, 0.9, 0.86],
  },
];
