import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useCtl } from './context';
import { Dock } from './Dock';
import { Hud, ResultPlate } from './Hud';
import { Panels, Toasts } from './Panels';
import { Title } from './Title';
import { TopBar } from './TopBar';

export function App() {
  const phase = useStore((s) => s.phase);
  const quality = useStore((s) => s.settings.quality);
  const ctl = useCtl();
  // Glass blurs the world only on the high tiers; Low and Medium get a solid fill (no blur cost).
  useEffect(() => {
    document.documentElement.dataset.quality = quality;
  }, [quality]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        if (st.modal) st.set({ modal: null, fairFocus: null });
        else if (st.phase === 'setup' || st.phase === 'result') st.set({ modal: 'menu' });
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        st.setSettings({ muted: !st.settings.muted });
        return;
      }
      if (st.modal || !ctl) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        if (st.phase === 'running') void ctl.cashout();
        else if (st.phase === 'setup' || st.phase === 'result') void ctl.run();
        else if (st.phase === 'title') window.dispatchEvent(new Event('causeway:enter'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  // Title → setup: a short dip through dark. The title copy and its scrim leave while the lens starts
  // down from the title shot, and its first frames (the arch crown under the lens, QA hunt) pass
  // under the veil; it lifts as the setup shot settles. Entered by click or by Space alike.
  const [veil, setVeil] = useState<'' | 'in' | 'out'>('');
  const prevPhase = useRef(phase);
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (was === 'title' && phase === 'setup') {
      setVeil('out');
      const t = window.setTimeout(() => setVeil(''), 900);
      return () => window.clearTimeout(t);
    }
    // A run started before the dip has lifted (Space, Space): the run is never shown through it.
    if (phase !== 'title' && phase !== 'setup') setVeil('');
    return undefined;
  }, [phase]);
  const inGame = phase !== 'title' && phase !== 'loading';
  return (
    <>
      {veil && <div className={`dip ${veil}`} aria-hidden="true" />}
      {inGame && <div className="scrim-top" />}
      {inGame && <div className="scrim-bottom" />}
      {!inGame && <Title onLeave={() => setVeil('in')} />}
      {inGame && <TopBar />}
      {inGame && <Hud />}
      {inGame && <ResultPlate />}
      {inGame && <Dock />}
      <Panels />
      <Toasts />
    </>
  );
}
