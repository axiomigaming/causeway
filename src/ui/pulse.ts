/**
 * HUD multiplier "tier-up pulse": a hook for the progression director.
 *
 * Call `tierPulse(tier)` (or dispatch `new CustomEvent(TIER_PULSE_EVENT, { detail: { tier } })`
 * on `window`) when the run crosses into a new tier. The HUD multiplier answers with a short
 * cast-gold swell (scale + flare ring). With reduced motion it is only a brief brightening.
 * The pulse is visual only: no sound, no haptics, and nothing happens outside a live run.
 */
export const TIER_PULSE_EVENT = 'causeway:tier-pulse';

export type TierPulseDetail = { tier: number; strength?: number };

export function tierPulse(tier: number, strength = 1): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<TierPulseDetail>(TIER_PULSE_EVENT, { detail: { tier, strength } }));
}
