import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { countUp, heatOf, milestoneCrossed, milestoneLabel, tierOf } from '../audio/feedback';
import { TIER_PULSE_EVENT, type TierPulseDetail } from './pulse';
import { formatCredits, formatMult } from '../engine/money';
import { useStore } from '../state/store';
import { useCtl } from './context';
import { useHold } from './hold';
import { css, heroInk } from './heat';
import { Stair } from './icons';
import { heroStep, raysImage, winLook, winTiming } from './win';
import './hud.css';

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * The multiplier. Written straight to the DOM every frame; React only mounts it.
 * The number is always the server's (`ctl.currentMult()` → `formatMult`); the
 * glow, the digit roll and the milestone flares only dress it.
 */
export function Hud() {
  const phase = useStore((s) => s.phase);
  const live = useStore((s) => s.live);
  const result = useStore((s) => s.result);
  const hold = useHold();
  const motion = useStore((s) => s.settings.motion);
  const ctl = useCtl();
  const multRef = useRef<HTMLDivElement>(null);
  const intRef = useRef<HTMLSpanElement>(null);
  const fracRef = useRef<HTMLSpanElement>(null);
  const retRef = useRef<HTMLElement>(null);
  const flareRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  // Survives the effect restarting on phase changes within one round.
  const prev = useRef<{ id: string | null; m: number }>({ id: null, m: 100 });

  useEffect(() => {
    if (!ctl) return;
    const full = motion === 'full';
    let raf = 0;
    let lastInt = '';
    let lastFrac = '';
    let lastHeat = -1;
    let lastTier = -1;
    let lastEl: HTMLDivElement | null = null;
    const flare = (i: number) => {
      ctl.audio.milestone(i);
      ctl.buzz('milestone');
      const f = flareRef.current;
      if (f) {
        f.textContent = milestoneLabel(i);
        f.animate(
          full
            ? [
                { opacity: 0, letterSpacing: '0.02em', transform: 'translateY(6px) scale(0.9)' },
                { opacity: 1, letterSpacing: '0.12em', transform: 'none', offset: 0.18 },
                { opacity: 1, letterSpacing: '0.16em', offset: 0.7 },
                { opacity: 0, letterSpacing: '0.2em' },
              ]
            : [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
          { duration: 1700, easing: 'ease-out', fill: 'both' },
        );
      }
      if (!full) return;
      glowRef.current?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)', offset: 0.25 }, { transform: 'scale(1)' }], {
        duration: 700,
        easing: EASE,
      });
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const st = useStore.getState();
      const id = st.live?.id ?? null;
      if (id !== prev.current.id) prev.current = { id, m: 100 };
      // Settled and held on screen: the figure stops at the outcome (the fall point, or where you left).
      const res = st.phase === 'result' ? st.result : null;
      const m = res ? (res.won ? (res.round.cashoutMult ?? 100) : res.round.crash) : ctl.currentMult();
      if (st.phase === 'running') ctl.audio.climb(m);
      const el = multRef.current;
      if (!el) return;
      if (el !== lastEl) {
        // A fresh HUD (new round): forget what the old one showed.
        lastEl = el;
        lastInt = '';
        lastFrac = '';
        lastHeat = -1;
        lastTier = -1;
      }
      const text = formatMult(m);
      // The hero figure steps down a size as it grows a digit, so it always fits narrow screens.
      if (el.dataset.len !== String(text.length)) el.dataset.len = String(text.length);
      const dot = text.lastIndexOf('.');
      const int = text.slice(0, dot);
      const frac = text.slice(dot);
      if (int !== lastInt && intRef.current) {
        // A short roll on each new whole number (not on the first paint).
        // Motion only: the figure is always one solid colour, never half-faded.
        if (full && lastInt !== '') intRef.current.animate([{ transform: 'translateY(0.12em)' }, { transform: 'none' }], { duration: 220, easing: EASE });
        intRef.current.textContent = int;
        lastInt = int;
      }
      if (frac !== lastFrac && fracRef.current) {
        fracRef.current.textContent = frac;
        lastFrac = frac;
      }
      const heat = heatOf(m);
      if (Math.abs(heat - lastHeat) > 0.004) {
        el.style.setProperty('--heat', heat.toFixed(3));
        el.style.setProperty('--heat-ink', css(heroInk(heat)));
        lastHeat = heat;
      }
      const tier = tierOf(m);
      if (tier !== lastTier) {
        el.dataset.tier = String(tier);
        lastTier = tier;
      }
      if (retRef.current) retRef.current.textContent = formatCredits(res ? res.round.payout : ctl.currentReturn());
      if (st.phase === 'running' && m > prev.current.m) {
        const hit = milestoneCrossed(prev.current.m, m);
        if (hit >= 0) flare(hit);
      }
      if (st.phase === 'running' || st.phase === 'cashing') prev.current.m = Math.max(prev.current.m, m);
    };
    tick();
    // Tier-up pulse (see ./pulse): the progression director calls tierPulse(); only a live run answers.
    const onPulse = (e: Event) => {
      const st = useStore.getState();
      if (st.phase !== 'running' && st.phase !== 'cashing') return;
      const el = glowRef.current;
      if (!el) return;
      const k = Math.max(0.3, Math.min(1.5, (e as CustomEvent<TierPulseDetail>).detail?.strength ?? 1));
      if (full) {
        el.classList.remove('tier-pulse');
        void el.offsetWidth; // restart the ring
        el.classList.add('tier-pulse');
        window.setTimeout(() => el.classList.remove('tier-pulse'), 760);
      }
      el.animate(
        full
          ? [
              { transform: 'scale(1)' },
              { transform: `scale(${(1 + 0.04 * k).toFixed(3)})`, offset: 0.25 },
              { transform: 'scale(1)' },
            ]
          : [{ opacity: 1 }, { opacity: 0.82, offset: 0.3 }, { opacity: 1 }],
        { duration: 620, easing: EASE },
      );
    };
    window.addEventListener(TIER_PULSE_EVENT, onPulse);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(TIER_PULSE_EVENT, onPulse);
    };
  }, [ctl, motion]);

  const held = phase === 'result' && hold && !!result;
  if (!held && (!live || !(phase === 'lead' || phase === 'running' || phase === 'cashing'))) return null;
  const stake = live?.stake ?? result?.round.stake ?? 0;
  const auto = live?.autoCashout ?? null;
  return (
    <div className={`hud ${held ? (result!.won ? 'held won' : 'held fell') : phase}`} aria-live="off">
      <div className="hud-slot">
        {phase === 'lead' ? <span className="getready">Get ready</span> : <span className="flare gold" ref={flareRef} aria-hidden="true" />}
      </div>
      <div className="mult-wrap">
        <div ref={multRef} className="mult num" data-tier="0" role="timer" aria-label="Current multiplier">
          <div className="mult-glow" ref={glowRef}>
            <span className="mi" ref={intRef}>
              1
            </span>
            <span className="mf" ref={fracRef}>
              .00
            </span>
            <span className="x">×</span>
          </div>
        </div>
      </div>
      <div className="hud-sub">
        <span>
          Stake<b className="num">{formatCredits(stake)}</b>
        </span>
        <span className="ret">
          Return<b className="num" ref={retRef}>{formatCredits(stake)}</b>
        </span>
        {auto !== null && (
          <span className="auto">
            Auto<b className="num">{formatMult(auto)}×</b>
          </span>
        )}
      </div>
    </div>
  );
}

/** The settled round: an escape you can feel, or a fall you can read — then proof. */
export function ResultPlate() {
  const phase = useStore((s) => s.phase);
  const result = useStore((s) => s.result);
  const set = useStore((s) => s.set);
  const motion = useStore((s) => s.settings.motion);
  // Held back until the world has played the fall or the escape (money is already settled).
  const hold = useHold();
  if (phase !== 'result' || !result || hold) return null;
  const r = result.round;
  const full = motion === 'full';
  const verify = (
    <button className="verify" onClick={() => set({ modal: 'fair', fairFocus: r.id })}>
      Verify this run
    </button>
  );
  if (result.won) return <WonPlate key={r.id} stake={r.stake} payout={r.payout} mult={r.cashoutMult ?? 100} auto={r.auto} full={full} verify={verify} />;
  const m = formatMult(r.crash);
  // The fall, told quietly: the escape card's structure in muted tones. No accent, no count, no glow.
  return (
    <div className={`result lost${full ? ' anim' : ''}`} role="status" key={r.id} data-grade={tierOf(r.crash)}>
      <span className="sr">
        The way fell at {m}×. Stake lost {formatCredits(r.stake)}.
      </span>
      <div className="r-head" aria-hidden="true">
        <Stair />
        <span className="r-k">The way fell</span>
      </div>
      <div className="r-label" aria-hidden="true">
        Fell at
      </div>
      <div className="big num" aria-hidden="true">
        {m}
        <span className="x">×</span>
      </div>
      <div className="r-rule" aria-hidden="true" />
      <div className="r-facts">
        <span aria-hidden="true">
          Stake lost<b className="num">{formatCredits(r.stake)}</b>
        </span>
        {verify}
      </div>
    </div>
  );
}

function WonPlate({ stake, payout, mult, auto, full, verify }: { stake: number; payout: number; mult: number; auto: boolean; full: boolean; verify: ReactNode }) {
  const ctl = useCtl();
  const bigRef = useRef<HTMLSpanElement>(null);
  const profit = payout - stake;
  // Scaled by the multiplier the player left at: a 1.2x escape is quiet, a 50x one is an event.
  const look = winLook(mult);
  const { grade } = look;
  const { count0, count, land } = winTiming(grade);
  const shown = formatCredits(payout);

  useEffect(() => {
    const el = bigRef.current;
    const stampT = setTimeout(() => ctl?.audio.ui('stamp'), full ? land : 0);
    if (!el || !full) return () => clearTimeout(stampT);
    // Count from the stake up to the payout once the card has settled; lands exactly on the settled
    // amount. Timed on the document timeline (the clock the card's CSS entrance runs on), so the
    // figure, the rule and the profit stay in step.
    const now = () => Number(document.timeline.currentTime ?? performance.now());
    const t0 = now() + count0;
    const k = () => (now() - t0) / count;
    let raf = 0;
    let guard = 0;
    const step = () => {
      const p = k();
      el.textContent = formatCredits(countUp(stake, payout, Math.max(0, p)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    step();
    // Frames can stall (a hidden tab, a starved device): the settled amount lands on time regardless,
    // never a figure frozen part-way (seen: "Return 11.13" on a 17.60 payout), as the top bar does.
    const arm = (ms: number) => {
      guard = window.setTimeout(() => {
        if (k() < 1) return arm(Math.max(50, (1 - k()) * count + 50));
        cancelAnimationFrame(raf);
        el.textContent = formatCredits(payout);
      }, ms);
    };
    arm(count0 + count + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stampT);
      clearTimeout(guard);
    };
  }, [ctl, full, payout, stake, count0, count, land]);

  const style = {
    '--win-ink': look.ink,
    '--win-accent': look.accent,
    '--win-glow': look.glow,
    '--win-bloom': look.bloom,
    '--win-rays-img': raysImage(mult),
    '--win-rule': look.rule,
    '--land': `${land}ms`,
  } as CSSProperties;
  return (
    <div className={`result won${full ? ' anim' : ''}${look.grand ? ' grand' : ''}`} role="status" data-grade={grade} style={style}>
      <span className="sr">
        Escaped at {formatMult(mult)}×. Paid {shown}, profit {formatCredits(profit)}.
      </span>
      {/* behind the card: a warm bloom from 5x, a fan of rays from 10x; the card's own surface over them */}
      {grade >= 2 && <span className="r-aura" aria-hidden="true" />}
      <span className="r-panel" aria-hidden="true" />
      {grade === 4 && <span className="r-sheen" aria-hidden="true" />}
      <div className="r-head" aria-hidden="true">
        <Stair />
        <span className="r-k">{look.title}</span>
        <span className={`r-mult num${look.struck ? ' struck' : ''}`}>
          {formatMult(mult)}
          <span className="x">×</span>
        </span>
        {auto && <span className="r-note">Auto</span>}
      </div>
      {/* the return, unsigned: profit (below) is the only signed figure */}
      <div className="r-label" aria-hidden="true">
        Return
      </div>
      <div className={`big num${heroStep(look.grand, shown) === 72 ? ' xl' : ''}`} aria-hidden="true">
        <span className="payout-fig" ref={bigRef}>
          {formatCredits(full ? stake : payout)}
        </span>
        <span className="unit">CR</span>
      </div>
      <div className="r-rule" aria-hidden="true">
        <i />
      </div>
      <div className="r-facts">
        <span className="r-profit" aria-hidden="true">
          Profit<b className={`num${profit > 0 ? ' gain' : ''}`}>{formatCredits(profit, { sign: true })}</b>
        </span>
        <i className="dot" aria-hidden="true">
          ·
        </i>
        <span aria-hidden="true">
          Stake<b className="num">{formatCredits(stake)}</b>
        </span>
        {verify}
      </div>
    </div>
  );
}
