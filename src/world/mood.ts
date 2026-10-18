/**
 * Round 11 crescendo: the world's mood builds with the run. One number, `drive` (0 calm .. 1 the top of
 * the climb), moves the light, sky, haze, wind, rain, leaves and dust from a calm, sunny day toward a
 * gathering storm (or, in the warm looks, a deepening dusk); short `gust` events punctuate tier-ups.
 *
 * Presentation only: the drive must come from the CURRENT multiplier (the progression director's
 * intensity model, or the game's own intensityOf(mult) when nothing else drives it), never from the
 * hidden fall point.
 *
 * Hooks (for the progression director):
 *   setWorldDrive(d)   every frame, 0..1. When no one calls it in a frame, the game feeds intensityOf(mult).
 *   worldTierUp(k)     on a tier-up moment (k: tier strength 0..1): a gust through the foliage, a burst
 *                      of leaves and dust, and a flicker in the sky (lightning in the storm looks).
 *   worldMood          read-only state: { drive, gust } after smoothing (e.g. for audio or the grade).
 */
export const worldMood = { drive: 0, gust: 0 };

let external: number | null = null;
let gustKick = 0;

export function setWorldDrive(d: number): void {
  external = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : null;
}

export function worldTierUp(k = 1): void {
  gustKick = Math.max(gustKick, Math.min(1, Math.max(0, k)));
}

/** Called once per frame by the game: smooths the drive (eases, never jumps) and decays the gust. */
// QA (dev builds only): ?drive=0.9 pins the drive, to look at the top of the crescendo in a still.
const QA_DRIVE = import.meta.env.DEV && typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('drive') ?? NaN) : NaN;

export function stepMood(dt: number, fallback: number): typeof worldMood {
  if (Number.isFinite(QA_DRIVE)) {
    worldMood.drive = Math.min(1, Math.max(0, QA_DRIVE));
    external = null;
    return worldMood;
  }
  const target = external ?? Math.min(1, Math.max(0, fallback));
  external = null;
  const k = 1 - Math.exp(-dt * (target > worldMood.drive ? 0.9 : 2.5));
  worldMood.drive += (target - worldMood.drive) * k;
  if (gustKick > 0) {
    worldMood.gust = Math.max(worldMood.gust, gustKick);
    gustKick = 0;
  }
  worldMood.gust *= Math.exp(-dt * 0.9);
  if (worldMood.gust < 1e-3) worldMood.gust = 0;
  return worldMood;
}

/** Reset with the world (a new round starts calm). */
export function resetMood(): void {
  worldMood.drive = 0;
  worldMood.gust = 0;
  external = null;
  gustKick = 0;
}
