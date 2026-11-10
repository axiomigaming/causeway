// Same-frame stills for before/after proofs: stage a moment exactly as tools/premium-hunt.mjs does (world ?w,
// seeded cosmetic randomness, the run's forced sections and set pieces, the round on the game's clock), step
// to it undrawn, then draw it once per variant (a JS snippet evaluated in the page before the draw) and
// save a still for each. Run it against two servers (the old build and the new) for a before/after pair.
//
//   URL=http://localhost:5197 node tools/same-frame.mjs --view desktop --q high --w 7 --at run:6.0 \
//       --out dir --name after [--variant 'name=js' ...] [--crop x,y,w,h] [--size 1280x720] [--dpr 3] [--sections stairsDown,stairsUp]
//
// --at: run:<s> (the premium-hunt run scene, <s> seconds since the round was staged), title:<s>,
//       crash:<kind>:<variant>:<mult>:<s after the fall>, cash:<mult>:<s after the cash-out>.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const variants = [];
args.forEach((a, i) => {
  if (a === '--variant') {
    const v = args[i + 1];
    const j = v.indexOf('=');
    variants.push([v.slice(0, j), v.slice(j + 1)]);
  }
});
if (!variants.length) variants.push(['', '']);
const URL = process.env.URL ?? 'http://localhost:5197';
const VIEW = arg('view', 'desktop');
const Q = arg('q', 'high');
const W = arg('w', '7');
const AT = arg('at', 'run:6.0');
const OUT = arg('out', 'review/same-frame');
const NAME = arg('name', 'shot');
const CROP = arg('crop', '');
const DPR = +arg('dpr', '1');
const SECTIONS = arg('sections', '');
const [VW, VH] = (arg('size', VIEW === 'phone' ? '390x844' : '1280x720')).split('x').map(Number);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const mobile = VIEW === 'phone';
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: mobile, hasTouch: mobile });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${URL}/?qa&q=${Q}&w=${W}&seed=hunt22`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
const [kind, ...rest] = AT.split(':');
const info = await page.evaluate(
  async ({ kind, rest, name, sections }) => {
    const g = window.__game;
    const ctl = window.__ctl;
    const st = window.__store;
    let s = 0;
    for (const c of name) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    g.autoQuality = false;
    g.paused = true;
    const step = (sec) => {
      const n = Math.round(sec * 30);
      for (let i = 0; i < n; i++) {
        g.virtualNow += 1000 / 30;
        g.frame(1 / 30, false);
      }
    };
    if (kind === 'title') {
      step(+rest[0]);
      return { stage: g.stage };
    }
    ctl.enter();
    await new Promise((r) => setTimeout(r, 800));
    if (kind === 'run') g.track.forceNext = sections ? sections.split(',') : ['corridor', 'bridge', 'turnL', 'corridor', 'arcade', 'turnR', 'corridor', 'plaza'];
    g.newWorld('setup');
    await g.toSetup();
    g.debugStep(1);
    window.__t0 = g.virtualNow + 1100;
    g.elapsed = () => g.virtualNow - window.__t0;
    ctl.currentMult = () => (g.virtualNow < window.__t0 ? 100 : Math.max(100, Math.floor(g.live.mult * 100)));
    ctl.elapsedMs = () => g.virtualNow - window.__t0;
    st.getState().set({ phase: 'lead', live: { id: 'hunt', stake: 1000, commitment: '0'.repeat(64), runStartsAt: 0, nonce: 7, clientSeed: 'hunt22', autoCashout: null }, balance: st.getState().balance - 1000 });
    g.lead();
    await new Promise((r) => setTimeout(r, 400));
    const settle = (won, m, ck, cv) => {
      g.elapsed = () => null;
      if (!won && ck) {
        const orig = g.crash.bind(g);
        g.crash = (mult, id) => orig(mult, id, ck, cv);
      }
      const round = { id: `hunt-${won ? 'cashout' : 'crash'}-${ck ?? ''}${cv ?? ''}`, nonce: 7, outcome: won ? 'cashout' : 'crash', stake: 1000, cashoutMult: won ? m : null, auto: false, payout: won ? Math.floor((1000 * m) / 100) : 0, crash: won ? m + 137 : m, commitment: '0'.repeat(64), serverSeed: '1'.repeat(64), clientSeed: 'hunt22', settledAt: Date.now() };
      ctl.settle(round, st.getState().balance + round.payout, 'f'.repeat(64), 8);
    };
    if (kind === 'run') {
      // As premium-hunt's run scene: running at 1.1 s, set pieces forced every 3 s from 3 s.
      const T = +rest[0];
      const ob = { 3: 'log', 6: 'beam', 9: 'pillar', 12: 'blocks', 15: 'tile', 18: 'rocks', 21: 'boulder' };
      for (let f = 0; f <= Math.round(T * 30); f++) {
        const t = f / 30;
        if (f === 33) {
          st.getState().set({ phase: 'running' });
        }
        const k = Object.keys(ob).find((x) => Math.round(+x * 30) === f);
        if (k) g.debugObstacle(ob[k]);
        g.virtualNow += 1000 / 30;
        g.frame(1 / 30, false);
        void t;
      }
      return { stage: g.stage, mult: g.live.mult };
    }
    // crash / cash: run to the multiplier, settle, then step the given seconds after.
    const m = kind === 'crash' ? +rest[2] : +rest[0];
    const after = kind === 'crash' ? +rest[3] : +rest[1];
    const tEv = 1.1 + Math.log(m) / 0.000063 / 1000;
    step(Math.min(1.1, tEv));
    st.getState().set({ phase: 'running' });
    if (tEv > 1.1) step(tEv - 1.1);
    const mm = Math.max(100, Math.floor(g.live.mult * 100));
    if (kind === 'crash') settle(false, mm, rest[0], +rest[1]);
    else settle(true, mm);
    step(after);
    return { stage: g.stage, kind: g.debugState?.crashKind, mult: mm };
  },
  { kind, rest, name: AT.startsWith('run') ? 'run' : AT, sections: SECTIONS },
);
console.log(NAME, AT, JSON.stringify(info));
for (const [vn, js] of variants) {
  const r = await page.evaluate(async (js) => {
    const g = window.__game;
    // eslint-disable-next-line no-new-func
    const out = js ? await new Function('g', `return (async () => { ${js} })()`)(g) : null;
    g.post.render(1 / 30);
    return out;
  }, js);
  await page.waitForTimeout(150);
  const file = `${OUT}/${NAME}${vn ? `-${vn}` : ''}.png`;
  const shot = await page.screenshot({ type: 'png', timeout: 900000, ...(CROP ? { clip: Object.fromEntries(['x', 'y', 'width', 'height'].map((k, i) => [k, +CROP.split(',')[i]])) } : {}) });
  writeFileSync(file, shot);
  console.log(`  ${file}${r !== null && r !== undefined ? `  ${JSON.stringify(r)}` : ''}`);
}
if (errors.length) console.log('page errors:', errors.slice(0, 3).join(' | '));
await browser.close();
