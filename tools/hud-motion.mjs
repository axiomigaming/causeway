// HUD motion stills: the interface's transitions frozen at fixed times, for a before/after pair.
// The 3D frame is drawn once per beat (game paused, on its virtual clock); every CSS and Web Animation
// in the document is paused right after each beat's trigger and sought to 0, 40, 80 … ms, so the
// stills land on the same animation times whatever the machine's speed.
//
//   URL=http://localhost:5197 node tools/hud-motion.mjs --view desktop --out dir --name before \
//       [--beats lead,go,whole,tier,cash,fall,reveal] [--times 0,60,120,200,320,500,800]
//
// Beats: lead (RUN accepted: the HUD and the plate appear), go (the lead turns into the run), whole
// (9.99 -> 10.00), tier (a tier-up pulse with its milestone flare), cash (the press, then the settled
// figure stepping up), fall (the figure going muted), reveal (the held figure giving way to the card).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5197';
const VIEW = arg('view', 'desktop');
const OUT = arg('out', 'review/hud-motion');
const NAME = arg('name', 'shot');
const BEATS = arg('beats', 'lead,go,whole,tier,cash,fall,reveal').split(',');
const TIMES = arg('times', '0,60,120,200,320,500,800').split(',').map(Number);
const [VW, VH] = VIEW === 'phone' ? [390, 844] : [1280, 720];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open() {
  const mobile = VIEW === 'phone';
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${URL}/?qa&q=low&w=7&seed=hunt22`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  await page.evaluate(async () => {
    const g = window.__game;
    const ctl = window.__ctl;
    g.autoQuality = false;
    g.paused = true;
    ctl.enter();
    await new Promise((r) => setTimeout(r, 800));
    g.debugStep(1.5);
    // The round on the game's clock (as tools/premium-hunt.mjs stages it).
    window.__stage = (atMult) => {
      const st = window.__store;
      window.__t0 = g.virtualNow + 1100;
      g.elapsed = () => g.virtualNow - window.__t0;
      ctl.currentMult = () => (g.virtualNow < window.__t0 ? 100 : Math.max(100, Math.floor(g.live.mult * 100)));
      ctl.elapsedMs = () => g.virtualNow - window.__t0;
      st.getState().set({ phase: 'lead', live: { id: `hm-${atMult}`, stake: 1000, commitment: '0'.repeat(64), runStartsAt: 0, nonce: 7, clientSeed: 'hm', autoCashout: null }, balance: st.getState().balance - 1000 });
      g.lead();
    };
    window.__toMult = (m) => {
      const t = 1.1 + Math.log(m) / 0.000063 / 1000;
      const now = (g.virtualNow - window.__t0) / 1000 + 1.1;
      if (t > now) g.debugStep(t - now);
    };
    window.__settle = (won, kind) => {
      const st = window.__store.getState();
      const m = Math.max(100, Math.floor(g.live.mult * 100));
      g.elapsed = () => null;
      if (!won && kind) {
        const orig = g.crash.bind(g);
        g.crash = (mult, id) => orig(mult, id, kind, 0);
      }
      const round = { id: `hm-${won}`, nonce: 7, outcome: won ? 'cashout' : 'crash', stake: 1000, cashoutMult: won ? m : null, auto: false, payout: won ? Math.floor((1000 * m) / 100) : 0, crash: won ? m + 137 : m, commitment: '0'.repeat(64), serverSeed: '1'.repeat(64), clientSeed: 'hm', settledAt: Date.now() };
      window.__ctl.settle(round, st.balance + round.payout, 'f'.repeat(64), 8);
    };
  });
  return page;
}

// Pause every animation now; then shoot it at each time (ms since the trigger).
async function freezeAndShoot(page, beat) {
  await page.evaluate(() => {
    window.__anims = document.getAnimations().map((a) => {
      a.pause();
      return a;
    });
    window.__animBase = window.__anims.map((a) => a.currentTime ?? 0);
  });
  for (const t of TIMES) {
    const n = await page.evaluate((t) => {
      // Animations started by the trigger (the beat's own) run from 0; older ones keep their offset.
      window.__anims.forEach((a, i) => {
        try {
          a.currentTime = window.__animBase[i] + t;
        } catch {}
      });
      return window.__anims.length;
    }, t);
    await page.waitForTimeout(60);
    writeFileSync(`${OUT}/${NAME}-${beat}-${String(t).padStart(4, '0')}.png`, await page.screenshot({ timeout: 900000, clip: VIEW === 'phone' ? { x: 0, y: 0, width: VW, height: VH } : { x: 0, y: 0, width: VW, height: VH } }));
    if (t === TIMES[0]) console.log(`  ${beat}: ${n} animations`);
  }
}

for (const beat of BEATS) {
  const page = await open();
  try {
    // Set up the moment just before the beat (undrawn steps, then one draw), then trigger it.
    await page.evaluate((beat) => {
      const g = window.__game;
      const st = window.__store;
      if (beat === 'lead') return;
      window.__stage(beat);
      if (beat === 'go') {
        g.debugStep(1.05);
        return;
      }
      g.debugStep(1.1);
      st.getState().set({ phase: 'running' });
      if (beat === 'whole') window.__toMult(9.97);
      else if (beat === 'tier') window.__toMult(4.99);
      else window.__toMult(3.4);
      if (beat === 'reveal') {
        window.__settle(true);
        g.debugStep(2);
      }
    }, beat);
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__game.debugStep(1 / 30));
    await page.waitForTimeout(300);
    // The trigger.
    await page.evaluate((beat) => {
      const g = window.__game;
      const st = window.__store;
      if (beat === 'lead') window.__stage('lead');
      else if (beat === 'go') {
        g.debugStep(0.05);
        st.getState().set({ phase: 'running' });
      } else if (beat === 'whole') window.__toMult(10.0);
      else if (beat === 'tier') {
        window.__toMult(5.02);
      } else if (beat === 'cash') {
        st.getState().set({ phase: 'cashing' });
        window.__settle(true);
      } else if (beat === 'fall') window.__settle(false, 'gate');
      else if (beat === 'reveal') {
        g.debugStep(3);
      }
      g.debugStep(1 / 30);
    }, beat);
    await page.waitForTimeout(40);
    await freezeAndShoot(page, beat);
  } catch (e) {
    console.log(`${beat} failed: ${String(e.message).split('\n')[0]}`);
  } finally {
    await page.close();
  }
  console.log(`${beat} done`);
}
await browser.close();
