import { heatOf, tierOf, type Tier } from '../audio/feedback';
import { css, heroInk, plateFill, type RGB } from './heat';

/**
 * The escape card's look, scaled by the multiplier the player left at (never the fall point).
 * Presentation only: nothing here touches an amount. Colours come from the same heat segment as the
 * CASH OUT plate and the hero figure (ui/heat.ts), as plain rgb()/rgba() strings — no color-mix().
 *
 *   tier 0 (< 2×)   "Escaped": quiet. Cream figure, a short cream rule, outlined multiplier
 *   tier 1 (2–5×)   "Clean escape": the rule lengthens and warms
 *   tier 2 (5–10×)  "Bold escape": a soft glow under the figure, a faint warm bloom behind the card
 *   tier 3 (10–25×) "Daring escape": an event. The Return steps up to 72 (where it fits), the profit
 *                   to 28, the multiplier is struck in the plate colour, a fan of rays opens behind
 *                   the card, an accent runs along its top edge
 *   tier 4 (25×+)   "Legendary escape": all of it at full warmth, plus one slow sheen across the card
 */
export interface WinLook {
  grade: Tier;
  /** The head's words for this escape. */
  title: string;
  /** The Return figure's ink (cream → light amber). */
  ink: string;
  /** Rule, top edge and filled multiplier (cream → orange, the CASH OUT plate's segment). */
  accent: string;
  /** The glow under the figure, as rgba() (transparent below tier 2). */
  glow: string;
  /** The bloom behind the card, as rgba() (transparent below tier 2). */
  bloom: string;
  /** The rays' ink behind the card, as rgba() (transparent below tier 3). */
  rays: string;
  /** The accent rule's share of the card's width, 0..1. */
  rule: number;
  /** The multiplier as a filled plate rather than an outline. */
  struck: boolean;
  /** An event: the larger figures and the rays. */
  grand: boolean;
}

export const TITLES = ['Escaped', 'Clean escape', 'Bold escape', 'Daring escape', 'Legendary escape'] as const;
const RULE = [0.12, 0.24, 0.42, 0.68, 1] as const;
const GLOW = [0, 0, 0.12, 0.2, 0.26] as const;
const BLOOM = [0, 0, 0.14, 0.28, 0.38] as const;
const RAYS = [0, 0, 0, 0.16, 0.24] as const;

export const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, a)).toFixed(2)})`;

export function winLook(mult: number): WinLook {
  const grade = tierOf(mult);
  const heat = heatOf(mult);
  const plate = plateFill(heat);
  return {
    grade,
    title: TITLES[grade],
    ink: css(heroInk(heat)),
    accent: css(plate),
    glow: rgba(plate, GLOW[grade]),
    bloom: rgba(plate, BLOOM[grade]),
    rays: rgba(plate, RAYS[grade]),
    rule: RULE[grade],
    struck: grade >= 3,
    grand: grade >= 3,
  };
}

/**
 * The fan of rays behind an event card, as an SVG image (CSS `url(...)`), or 'none' below tier 3.
 * Thin wedges from the centre, faded in from the card's edge and out toward the rim by a radial
 * gradient baked into the image: one plain image layer, no CSS mask (a masked, conic-gradient layer
 * stalled the compositor on software rendering).
 */
export function raysImage(mult: number): string {
  const grade = tierOf(mult);
  const a = RAYS[grade];
  if (a <= 0) return 'none';
  const [r, g, b] = plateFill(heatOf(mult));
  const wedges: string[] = [];
  const n = 30;
  const half = (1.25 * Math.PI) / 180; // 2.5° wide
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const p = (u: number) => `${(100 * Math.cos(u)).toFixed(1)} ${(100 * Math.sin(u)).toFixed(1)}`;
    wedges.push(`M0 0L${p(t - half)}L${p(t + half)}Z`);
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-100 -100 200 200' preserveAspectRatio='none'>` +
    `<defs><radialGradient id='f' cx='0' cy='0' r='100' gradientUnits='userSpaceOnUse'>` +
    `<stop offset='0.25' stop-color='rgb(${r},${g},${b})' stop-opacity='0'/>` +
    `<stop offset='0.45' stop-color='rgb(${r},${g},${b})' stop-opacity='${a.toFixed(2)}'/>` +
    `<stop offset='0.65' stop-color='rgb(${r},${g},${b})' stop-opacity='${(a * 0.85).toFixed(3)}'/>` +
    `<stop offset='1' stop-color='rgb(${r},${g},${b})' stop-opacity='0'/>` +
    `</radialGradient></defs><path fill='url(#f)' d='${wedges.join('')}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * Entrance timing (ms on the document timeline). The card settles first, the Return then counts from
 * the stake to the payout, and the profit lands with the rule. A bigger escape counts a little longer.
 */
export function winTiming(grade: Tier): { count0: number; count: number; land: number } {
  const count0 = 180;
  const count = 560 + grade * 160;
  return { count0, count, land: count0 + count };
}

/**
 * The Return figure's size step on the type scale: 72 for an event when the amount is short enough
 * to sit in the card at 72 ("999.99" and under, 6 characters), else the card's usual 44.
 */
export function heroStep(grand: boolean, text: string): 72 | 44 {
  return grand && text.length <= 6 ? 72 : 44;
}
