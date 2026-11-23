import { useLayoutEffect, useRef, useState } from 'react';
import { formatCredits, formatMult } from '../engine/money';
import { countUp, tierOf as winTier } from '../audio/feedback';
import { balanceShown, cardClockOf, winTiming } from './win';
import { useStore } from '../state/store';
import { useCtl } from './context';
import { IconMenu, IconShield, IconSliders, IconSound } from './icons';
import { Logo } from './Logo';

export const tierOf = (m: number) => (m >= 1000 ? 'high' : m >= 200 ? 'mid' : '');

export function TopBar() {
  const balance = useStore((s) => s.balance);
  const history = useStore((s) => s.history);
  const phase = useStore((s) => s.phase);
  const result = useStore((s) => s.result);
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.set);
  const setSettings = useStore((s) => s.setSettings);
  const ctl = useCtl();
  const revealed = useStore((s) => s.revealed);
  const [bump, setBump] = useState(false);
  // What the figure shows now (cents). The balance in state is always the settled one; only this
  // figure waits, so an escape's card is never spoiled by the header.
  const shownRef = useRef(balance);
  const figRef = useRef<HTMLSpanElement>(null);
  const won = phase === 'result' && result?.won ? result.round : null;
  const wonId = won?.id ?? null;
  const wonGrade = won ? winTier(won.cashoutMult ?? 100) : 0;
  useLayoutEffect(() => {
    const el = figRef.current;
    if (!el) return;
    const from = shownRef.current;
    const full = settings.motion === 'full';
    const final = formatCredits(balance);
    const write = (v: number) => {
      shownRef.current = v;
      el.textContent = formatCredits(v);
    };
    if (balance <= from) {
      write(balance);
      el.style.minWidth = '';
      return;
    }
    // Tabular digits, and the box held at the final width, so nothing beside it moves while it counts.
    el.textContent = final;
    el.style.minWidth = `${el.getBoundingClientRect().width}px`;
    let raf = 0;
    let guard = 0;
    let bumpT = 0;
    const finish = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(guard);
      write(balance);
      el.style.minWidth = '';
    };
    // An escape: the old figure holds through the escape's beat; when the card comes, the balance
    // rises on the card's clock and curve (ui/win.ts) and lands with its Return, then a small bump.
    if (wonId) {
      if (!revealed) {
        write(from);
        return;
      }
      const now = () => Number(document.timeline.currentTime ?? performance.now());
      const revealedAt = now();
      const { land } = winTiming(wonGrade);
      // Wait this long for the card to start its clock; past it (no card drawn), count on our own.
      const WAIT = 1000;
      const landed = () => {
        finish();
        if (!full) return;
        setBump(true);
        bumpT = window.setTimeout(() => setBump(false), 650);
      };
      const step = () => {
        // The card's own origin (it marks it as its count is armed), so both figures move as one.
        const t0 = cardClockOf(wonId) ?? (now() - revealedAt > WAIT ? revealedAt : null);
        const since = t0 === null ? null : now() - t0;
        if (since !== null && since >= land) return landed();
        write(balanceShown(from, balance, since, wonGrade, full));
        raf = requestAnimationFrame(step);
      };
      write(from);
      if (!full) landed();
      else {
        step();
        // Frames can stall (a hidden tab, a starved device): the settled figure lands on the card's
        // schedule regardless (as the card's own figure does), never left part-way.
        const arm = (ms: number) => {
          guard = window.setTimeout(() => {
            const t0 = cardClockOf(wonId) ?? revealedAt;
            const left = land - (now() - t0);
            if (left > 0) return arm(left + 50);
            landed();
          }, ms);
        };
        arm(WAIT + land + 80);
      }
      return () => {
        window.clearTimeout(bumpT);
        finish();
      };
    }
    // Any other rise (a refill): a short count from the old figure.
    if (!full) {
      finish();
      return;
    }
    setBump(true);
    const t0 = performance.now();
    const dur = 600;
    const step = () => {
      const k = (performance.now() - t0) / dur;
      if (k >= 1) {
        finish();
        setBump(false);
        return;
      }
      write(countUp(from, balance, k));
      raf = requestAnimationFrame(step);
    };
    write(from);
    raf = requestAnimationFrame(step);
    guard = window.setTimeout(() => {
      finish();
      setBump(false);
    }, dur + 50);
    return () => {
      finish();
      setBump(false);
    };
  }, [balance, settings.motion, wonId, wonGrade, revealed]);
  const open = (m: 'fair' | 'settings' | 'menu' | 'history') => {
    ctl?.audio.ui('open');
    set({ modal: m });
  };
  const quiet = phase === 'result';
  // Responsible play: after a cash-out, the round just settled stays out of the strip until the
  // next run starts, so its fall point (always above the cash-out) never sits on the win screen.
  // It is still in the history panel and the verifier, which the player opens on purpose.
  const held = phase === 'result' && result?.won ? result.round.id : null;
  const shown = held ? history.filter((h) => h.id !== held) : history;
  // The strip fades out at its right end only when it runs past its column: a short strip (one or
  // two runs) ends on a whole figure, never a half-faded one.
  const histRef = useRef<HTMLButtonElement>(null);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = histRef.current;
    if (!el) return;
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown.length]);

  return (
    <header className="topbar">
      <button className="brand" onClick={() => open('menu')} aria-label="Causeway menu">
        <Logo size="compact" />
        <Logo size="mark" />
        <span className="tag">Demo</span>
      </button>
      {/* Responsible play: the strip is a quiet, uniform record. No highlight of big falls, no
          "this was your round" mark, no entrance on the newest entry, and while a result is shown it
          steps back further, so a past fall point never reads as a near miss beside a win. */}
      <button ref={histRef} className={`history${quiet ? ' quiet' : ''}${over ? ' over' : ''}`} onClick={() => open('history')} aria-label="History of previous rounds">
        {history.length === 0 ? (
          <span className="chip none">No runs yet</span>
        ) : shown.length === 0 ? null : (
          <>
            <span className="hist-k" aria-hidden>
              History
            </span>
            {shown.slice(0, 14).map((h) => (
              <span key={h.id} className="chip" title={`Round fell at ${formatMult(h.crash)}×`}>
                {formatMult(h.crash)}
                <span className="x">×</span>
              </span>
            ))}
          </>
        )}
      </button>
      <div className={`balance${bump ? ' bump' : ''}`} aria-live="polite">
        {/* demo status on every screen size (phones drop the brand's DEMO tag, never this) */}
        <div className="k">Demo balance</div>
        <div className="v num">
          {/* the figure's text is written only by the effect above (never by React), so a count
              in progress and React can't disagree */}
          <span className="fig" ref={figRef} aria-hidden />
          <span className="sr">{formatCredits(balance)}</span>
          <small>CR</small>
        </div>
      </div>
      <nav className="tools" aria-label="Game">
        <button className="icon-btn" onClick={() => setSettings({ muted: !settings.muted })} aria-label={settings.muted ? 'Unmute' : 'Mute'} aria-pressed={settings.muted}>
          <IconSound off={settings.muted} />
        </button>
        {/* On phones these two live in the menu. */}
        <button className="icon-btn wide-only" onClick={() => open('fair')} aria-label="Provably fair">
          <IconShield />
        </button>
        <button className="icon-btn wide-only" onClick={() => open('settings')} aria-label="Settings">
          <IconSliders />
        </button>
        <button className="icon-btn" onClick={() => open('menu')} aria-label="Menu">
          <IconMenu />
        </button>
      </nav>
    </header>
  );
}
