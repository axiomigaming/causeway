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
}

export const STYLES: WorldStyle[] = [
  {
    name: 'turquoise',
    waterShallow: '#29b39a', waterDeep: '#05473f',
    foliage: [1, 1, 1], fog: 1,
    landmarks: ['fallen_colossus', 'jungle_cliff'],
  },
  {
    // Jade river, a greener, wetter jungle, a little more haze.
    name: 'jade',
    waterShallow: '#3c9a6e', waterDeep: '#0b3a2a',
    foliage: [0.92, 1.04, 0.86], fog: 1.15,
    landmarks: ['river_head', 'column_grove'],
  },
  {
    // A clear blue lagoon, cooler leaves, clean air.
    name: 'lagoon',
    waterShallow: '#2aa6b8', waterDeep: '#06364a',
    foliage: [0.9, 0.98, 1.0], fog: 0.8,
    landmarks: ['sunken_temple', 'fallen_colossus'],
  },
  {
    // Dry season: murky olive water, yellowed leaves, dust in the air.
    name: 'dry',
    waterShallow: '#6aa58a', waterDeep: '#1d4535',
    foliage: [1.14, 1.0, 0.72], fog: 1.3,
    landmarks: ['column_grove', 'river_head'],
  },
  {
    // Deep rainforest: dark tea-green water, deep greens, heavy air.
    name: 'rainforest',
    waterShallow: '#1f8f7d', waterDeep: '#032c28',
    foliage: [0.82, 0.96, 0.78], fog: 1.4,
    landmarks: ['jungle_cliff', 'sunken_temple'],
  },
];
