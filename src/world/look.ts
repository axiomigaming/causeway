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
    // Storm light: a dim, grey-green sky, the sun breaking through weakly, the air heavy.
    name: 'storm',
    sun: 0xffe6c4, sunI: 8.5, fillI: 1.0,
    hemiSky: 0x8da9a6, hemiGround: 0x5e5446, hemiI: 0.52, envI: 0.22, skyI: 0.68,
    fog: 0x71878a, fogDensity: 0.003, mist: 1.6,
    stoneTint: [0.93, 0.95, 0.96],
  },
];
