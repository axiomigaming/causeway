/**
 * Round 11: time-of-day looks. Every new world picks one (never the same as the last world's) from the
 * world's own cosmetic seed, so consecutive rounds read differently. Presentation only: the seed is drawn
 * on the client when the world is built and knows nothing of the round's fall point.
 *
 * A look is a handful of light and air parameters (no extra passes, no textures): the Low tier pays
 * nothing for it.
 */
export interface Look {
  name: string;
  /** Sun colour (hex) and intensity. */
  sun: number;
  sunI: number;
  /** Bounce fill behind the lens. */
  fillI: number;
  /** Hemisphere (sky, ground, intensity). */
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  envI: number;
  /** Sky panorama brightness. */
  skyI: number;
  /** Haze colour and density (FogExp2), and a multiplier on the mist over the water. */
  fog: number;
  fogDensity: number;
  mist: number;
  /** Multiplier on the stone materials' albedo (a gentle per-look palette shift). */
  stoneTint: [number, number, number];
  /** Sky panorama after its grade: rgb multiplier and how far it is drained of colour (0..1). */
  skyTint?: [number, number, number];
  skyDesat?: number;
  /** Sun disc brightness (0: hidden behind cloud) and how dark the sun's shadows are (0..1). */
  sunDisc?: number;
  shadow?: number;
  /** Multiplier on the wind in the foliage; rain-wet sheen on every stone (0..1); rain streaks (0..1). */
  wind?: number;
  wet?: number;
  rain?: number;
  /** Lightning flashes per minute (0: none). */
  lightning?: number;
}

export const LOOKS: Look[] = [
  {
    name: 'golden',
    sun: 0xffd29c, sunI: 15.5, fillI: 1.15,
    hemiSky: 0x9fd0c8, hemiGround: 0x8a5a3a, hemiI: 0.4, envI: 0.2, skyI: 0.92,
    fog: 0x8db2b9, fogDensity: 0.0022, mist: 1,
    stoneTint: [1, 1, 1],
  },
  {
    // Hazy morning: a softer, paler sun, cooler air, mist lying thick on the water.
    name: 'morning',
    sun: 0xfff0dc, sunI: 11.5, fillI: 1.3,
    hemiSky: 0xb7d8d6, hemiGround: 0x8f7a62, hemiI: 0.55, envI: 0.26, skyI: 1.0,
    fog: 0xb4cacd, fogDensity: 0.0034, mist: 2.2,
    stoneTint: [0.97, 0.98, 1.0],
  },
  {
    // Late afternoon: a hot orange sun, the shade deep and long.
    name: 'afternoon',
    sun: 0xffbe7a, sunI: 17, fillI: 0.95,
    hemiSky: 0x8cc4c4, hemiGround: 0x7a4a2c, hemiI: 0.34, envI: 0.17, skyI: 0.86,
    fog: 0x9aa9a2, fogDensity: 0.0024, mist: 0.8,
    stoneTint: [1.04, 0.98, 0.92],
  },
  {
    // Storm: an overcast slate-blue sky, no sun disc, a flat cool key with soft shadows, the jungle
    // thrashing in the wind, every stone rain-dark and glossy, rain streaks and the odd flash of
    // lightning. It must not read as the clear day with a filter. Wind, rain, wet and lightning are the
    // values at the top of the run: a run opens still and overcast and the storm breaks with the drive
    // (game.ts applyMood).
    name: 'storm',
    sun: 0xb9c8d8, sunI: 4.2, fillI: 0.7,
    hemiSky: 0x7f93a6, hemiGround: 0x3e3a34, hemiI: 1.05, envI: 0.3, skyI: 0.5,
    fog: 0x56677a, fogDensity: 0.0062, mist: 2.4,
    stoneTint: [0.76, 0.81, 0.9],
    skyTint: [0.62, 0.72, 0.86], skyDesat: 0.75,
    sunDisc: 0, shadow: 0.35,
    wind: 2.6, wet: 0.75, rain: 1, lightning: 5,
  },
];
