import { countUp, heatOf, tierOf, type Tier } from '../audio/feedback';
import type { FallKind } from '../state/store';
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
 *
 * The tiers escalate unmistakably, never the low one. From 5× the card's plate takes a warm wash
 * from its top edge and a warmer hairline; an event (10×+) is a wider card on desktop with the Return
 * at 72, a longer count with a held beat before it starts, a light that blooms behind the figure as
 * it lands, and the head's words a step up; a legend (25×+) adds a heavier figure, stronger rays that
 * turn slowly, and a double edge. On phones the card keeps its compact height: the tiers speak there
 * through the plate, the light and the count, not the figure's size.
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
  /** The warm wash down from the plate's top edge, as rgba() (transparent below tier 2). */
  tint: string;
  /** The plate's hairline, as rgba() (the system hairline below tier 2). */
  edge: string;
  /** The landing light behind the figure, as rgba() (transparent below tier 3). */
  flash: string;
}

export const TITLES = ['Escaped', 'Clean escape', 'Bold escape', 'Daring escape', 'Legendary escape'] as const;
const RULE = [0.12, 0.24, 0.42, 0.68, 1] as const;
const GLOW = [0, 0, 0.12, 0.2, 0.26] as const;
const BLOOM = [0, 0, 0.14, 0.28, 0.38] as const;
const RAYS = [0, 0, 0, 0.2, 0.32] as const;
const TINT = [0, 0, 0.07, 0.13, 0.2] as const;
const EDGE = [0, 0, 0.26, 0.4, 0.56] as const;
const FLASH = [0, 0, 0, 0.42, 0.6] as const;

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
    tint: rgba(plate, TINT[grade]),
    edge: grade >= 2 ? rgba(plate, EDGE[grade]) : 'rgba(255, 236, 210, 0.10)',
    flash: rgba(plate, FLASH[grade]),
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
 * the stake to the payout, and the profit lands with the rule. The low tier is a quick, quiet count;
 * every tier up counts longer, and an event waits a held beat before it starts (the card has settled,
 * the room goes still), so the landing is the moment.
 */
const COUNT0 = [180, 180, 240, 380, 480] as const;
const COUNT = [560, 760, 1040, 1560, 2200] as const;
export function winTiming(grade: Tier): { count0: number; count: number; land: number } {
  const count0 = COUNT0[grade];
  const count = COUNT[grade];
  return { count0, count, land: count0 + count };
}

/**
 * The header balance while an escape is shown: it holds the old figure until the card comes, then
 * rises on the card's own clock and curve and lands with the card's Return (presentation only: the
 * balance in state is already the new one). `since` is ms since the card came (null: not yet);
 * with reduced motion it lands as the card comes.
 */
export function balanceShown(from: number, to: number, since: number | null, grade: Tier, full: boolean): number {
  if (since === null) return from;
  if (!full) return to;
  const { count0, count } = winTiming(grade);
  return countUp(from, to, Math.max(0, (since - count0) / count));
}

/**
 * The shown escape card's clock: when (document timeline ms) its entrance began, by round id. The card
 * marks it as its count is armed; the header balance reads it, so the two share one origin even when
 * the card's effect runs a few frames after the reveal (a stalled frame, a slow device).
 */
let cardClock: { id: string; t0: number } | null = null;
export function markCardClock(id: string, t0: number): void {
  cardClock = { id, t0 };
}
export function cardClockOf(id: string): number | null {
  return cardClock?.id === id ? cardClock.t0 : null;
}

/** The words for a fall: the card's head and the held plate's label, in the game's voice. */
export const FALL_WORDS: Record<FallKind, { title: string; plate: string }> = {
  start: { title: 'The way fell at once', plate: 'Fallen' },
  chasm: { title: 'The floor gave way', plate: 'Fallen' },
  ledge: { title: 'The floor dropped away', plate: 'Fallen' },
  gate: { title: 'The gate came down', plate: 'Shut out' },
  rockfall: { title: 'The rocks came down', plate: 'Cut off' },
  pillar: { title: 'The pillar came down', plate: 'Cut off' },
  trip: { title: 'He lost his footing', plate: 'Tripped' },
};
const FELL = { title: 'The way fell', plate: 'Fallen' } as const;
export function fallWords(kind: FallKind | undefined): { title: string; plate: string } {
  return (kind && FALL_WORDS[kind]) || FELL;
}

/**
 * The Return figure's size step on the type scale: 72 for an event when the amount fits the (wider)
 * event card at 72 — up to "99,999.99", 9 characters — else the card's usual 44. Phones hold it at 44
 * in CSS whatever this says, so the card never grows into the runner's band.
 */
export function heroStep(grand: boolean, text: string): 72 | 44 {
  return grand && text.length <= 9 ? 72 : 44;
}
