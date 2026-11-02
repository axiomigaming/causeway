import { heatOf, tierOf, type Tier } from '../audio/feedback';
import { css, heroInk, plateFill, type RGB } from './heat';

/**
 * The escape card's look, scaled by the multiplier the player left at (never the fall point).
 * Presentation only: nothing here touches an amount. Colours come from the same heat segment as the
 * CASH OUT plate and the hero figure (ui/heat.ts), as plain rgb()/rgba() strings — no color-mix().
 *
 *   tier 0 (< 2×)   quiet: cream figure, a short cream rule, outlined multiplier
 *   tier 1 (2–5×)   the rule lengthens and warms
 *   tier 2 (5–10×)  a soft glow under the figure
 *   tier 3 (10–25×) the multiplier is struck in the plate colour; an accent along the card's top edge
 *   tier 4 (25×+)   the full-width rule, the warmest glow and one slow sheen across the card
 */
export interface WinLook {
  grade: Tier;
  /** The Return figure's ink (cream → light amber). */
  ink: string;
  /** Rule, top edge and filled multiplier (cream → orange, the CASH OUT plate's segment). */
  accent: string;
  /** The glow under the figure, as rgba() (transparent below tier 2). */
  glow: string;
  /** The accent rule's share of the card's width, 0..1. */
  rule: number;
  /** The multiplier as a filled plate rather than an outline. */
  struck: boolean;
}

const RULE = [0.12, 0.24, 0.42, 0.68, 1] as const;
const GLOW = [0, 0, 0.12, 0.18, 0.24] as const;

export const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, a)).toFixed(2)})`;

export function winLook(mult: number): WinLook {
  const grade = tierOf(mult);
  const heat = heatOf(mult);
  const plate = plateFill(heat);
  return {
    grade,
    ink: css(heroInk(heat)),
    accent: css(plate),
    glow: rgba(plate, GLOW[grade]),
    rule: RULE[grade],
    struck: grade >= 3,
  };
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
