/**
 * The colour the heat drives, computed here (not by CSS `color-mix()` under a running transition,
 * whose per-frame re-resolution once flashed the CASH OUT plate pure red for a frame at ~3.5×).
 * Plain sRGB interpolation between two fixed palette colours, clamped, so every value lies on the
 * segment between them: cream → warm orange for the plate, ivory → light amber for the figure.
 */
export type RGB = readonly [number, number, number];

export const PLATE_COOL: RGB = [246, 237, 220]; // --cream
export const PLATE_HOT: RGB = [240, 150, 60]; // --hot
export const INK_COOL: RGB = [246, 239, 228]; // --text
export const INK_HOT: RGB = [255, 216, 144]; // --amber-hi

/** How far along the segment the plate goes at full heat (the rest stays cream: calm, never alarm). */
export const PLATE_REACH = 0.85;
export const INK_REACH = 0.7;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function mix(a: RGB, b: RGB, k: number): RGB {
  const t = clamp01(k);
  const at = (x: number, y: number) => Math.round(x + (y - x) * t);
  return [at(a[0], b[0]), at(a[1], b[1]), at(a[2], b[2])];
}

export const css = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;

/** CASH OUT plate fill for a heat in 0..1 (anything else is clamped; NaN is cold). */
export const plateFill = (heat: number): RGB => mix(PLATE_COOL, PLATE_HOT, clamp01(heat) * PLATE_REACH);
/** The hero multiplier's ink for a heat in 0..1. */
export const heroInk = (heat: number): RGB => mix(INK_COOL, INK_HOT, clamp01(heat) * INK_REACH);
