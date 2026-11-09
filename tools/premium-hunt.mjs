// Premium hunt (QA round 22): stills every 0.5 s of game time through the whole game, with the real
// interface on screen, for a reviewer to look at critically. Time is stepped on the game's virtual
// clock (software rendering cannot hold a frame rate), the round is staged the way the controller
// does it (lead, the HUD on the game's clock, settle() for the outcome) and every audio call is logged
// with its game time. One fresh page per scene; one browser.
//
//   URL=http://localhost:5197 node tools/premium-hunt.mjs --view desktop --q high --w 7 --out review/hunt22/desktop
//       [--scenes title,setup,run,cash1.5,cash30,start,chasm0,...] [--every 0.5]
//
// Scenes: title, setup (+ the panels), run (sections with both corners, every set piece, then the
// tier crossings 5x, 10x, 25x), cash<m> (cash-out at m), start (a fall at 1.00x), and each crash
// variant <kind><v>@<m> (chasm0@3, gate0@1.6, rockfall1@8, pillar0@3, trip0@2, ledge0@5 ...).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5197';
const VIEW = arg('view', 'desktop');
const Q = arg('q', 'high');
const W = arg('w', '7');
const OUT = arg('out', `review/hunt22/${VIEW}`);
const EVERY = +arg('every', '0.5');
const FPS = 30;
const [VW, VH] = VIEW === 'phone' ? [390, 844] : [1280, 720];
const ALL = 'title,setup,run,cash1.5,cash30,start,chasm0@3,chasm1@12,gate0@1.6,gate1@4,rockfall0@3,rockfall1@8,rockfall2@2,pillar0@3,pillar1@6,trip0@2,ledge0@5';
const SCENES = arg('scenes', ALL).split(',');
mkdirSync(OUT, { recursive: true });

const launch = () =>
  chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
let browser = await launch();
const runSec = (m) => Math.log(m) / 0.000063 / 1000;

async function open(name) {
  if (!browser.isConnected()) browser = await launch();
  const mobile = VIEW === 'phone';
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 160)}`));
  await page.goto(`${URL}/?qa&q=${Q}&w=${W}&seed=hunt22`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  await page.evaluate((name) => {
    const g = window.__game;
    const ctl = window.__ctl;
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
    // Every audio call, on the game's clock.
    window.__alog = [];
    const a = ctl.audio;
    for (const k of ['ui', 'setScene', 'outcome', 'crash', 'escape', 'sfx', 'event', 'impact', 'slam', 'tremor', 'whoosh', 'milestone', 'footstep', 'setSection']) {
      const f = a[k]?.bind(a);
      if (!f) continue;
      a[k] = (...args) => {
        const last = window.__alog[window.__alog.length - 1];
        const rec = `${k}(${args.map((x) => (typeof x === 'number' ? +x.toFixed(2) : JSON.stringify(x))).join(',')})`;
        if (!(k === 'footstep' && last?.c.startsWith('footstep') && g.virtualNow - last.t < 400)) window.__alog.push({ t: Math.round(g.virtualNow), c: rec, stage: g.stage });
        return f(...args);
      };
    }
  }, name);
  return { page, errors };
}

/** Stage a round (as the controller does, on the game's clock) and leave it running `pre` s in. */
async function stageRun(page, { sections, pre = 0, settleUi = true }) {
  await page.evaluate(
    async ({ sections }) => {
      const g = window.__game;
      const ctl = window.__ctl;
      ctl.enter();
      await new Promise((r) => setTimeout(r, 800));
      if (sections) g.track.forceNext = [...sections];
      g.newWorld('setup');
      await g.toSetup();
      g.debugStep(1);
    },
    { sections },
  );
  await page.evaluate(async () => {
    const g = window.__game;
    const ctl = window.__ctl;
    const st = window.__store;
    window.__t0 = g.virtualNow + 1100;
    g.elapsed = () => g.virtualNow - window.__t0;
    ctl.currentMult = () => (g.virtualNow < window.__t0 ? 100 : Math.max(100, Math.floor(g.live.mult * 100)));
    ctl.elapsedMs = () => g.virtualNow - window.__t0;
    const live = { id: 'hunt', stake: 1000, commitment: '0'.repeat(64), runStartsAt: 0, nonce: 7, clientSeed: 'hunt22', autoCashout: null };
    st.getState().set({ phase: 'lead', live, balance: st.getState().balance - 1000 });
    g.lead();
    ctl.audio.setScene('lead');
    ctl.audio.ui('bet');
    await new Promise((r) => setTimeout(r, 400));
  });
  if (pre > 0) await page.evaluate((pre) => window.__game.debugStep(pre), pre);
}

/** Settle the staged round as the controller does (the store, the stinger, the world). */
const SETTLE = ({ ev, kind, v }) => {
  const g = window.__game;
  const ctl = window.__ctl;
  const st = window.__store.getState();
  const m = ev === 'start' ? 100 : Math.max(100, Math.floor(g.live.mult * 100));
  const won = ev === 'cashout';
  g.elapsed = () => null;
  if (!won && kind) {
    const orig = g.crash.bind(g);
    g.crash = (mult, id) => orig(mult, id, kind, v);
  }
  const round = { id: `hunt-${ev}-${kind ?? ''}${v ?? ''}`, nonce: 7, outcome: won ? 'cashout' : 'crash', stake: 1000, cashoutMult: won ? m : null, auto: false, payout: won ? Math.floor((1000 * m) / 100) : 0, crash: won ? m + 137 : m, commitment: '0'.repeat(64), serverSeed: '1'.repeat(64), clientSeed: 'hunt22', settledAt: Date.now() };
  ctl.settle(round, st.balance + round.payout, 'f'.repeat(64), 8);
  return { m, kind: g.debugState?.crashKind, clip: g.runner.current };
};

/** Step `secs` of game time, a still every EVERY s; `at` maps a time offset to an action. */
async function film(page, name, secs, at = {}, t0 = 0) {
  const per = Math.round(EVERY * FPS);
  const n = Math.round(secs * FPS);
  const acts = new Map(Object.entries(at).map(([k, v]) => [Math.round(+k * FPS), v]));
  const log = [];
  for (let f = 0; f <= n; f++) {
    const act = acts.get(f);
    if (act) log.push({ t: +(t0 + f / FPS).toFixed(2), act: act.name, r: await page.evaluate(act.fn, act.arg ?? null) });
    const draw = f % per === 0;
    const st = await page.evaluate(
      ({ draw, fps }) => {
        const g = window.__game;
        g.virtualNow += 1000 / fps;
        g.frame(1 / fps, draw);
        const s = window.__store.getState();
        return { mult: +g.live.mult.toFixed(2), stage: g.stage, clip: g.runner.current, phase: s.phase, rev: s.revealed, sec: g.track.sectionAt?.(g.s)?.type ?? '' };
      },
      { draw, fps: FPS },
    );
    if (draw) {
      // (The interface's own transitions run on the wall clock: let a frame of it land.)
      await page.waitForTimeout(120);
      const file = `${OUT}/${name}-${String(Math.round((t0 + f / FPS) * 10)).padStart(4, '0')}.jpg`;
      writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 70, timeout: 900000 }));
      log.push({ t: +(t0 + f / FPS).toFixed(2), file, ...st });
    }
  }
  return log;
}

async function sheet(name, files) {
  if (!files.length) return;
  const cols = VIEW === 'phone' ? 8 : 5;
  const tw = VIEW === 'phone' ? 195 : 384;
  const th = Math.round((tw * VH) / VW);
  for (let p = 0; p * cols * 4 < files.length; p++) {
    const part = files.slice(p * cols * 4, (p + 1) * cols * 4);
    const rows = Math.ceil(part.length / cols);
    const comp = await Promise.all(
      part.map(async (f, i) => ({
        input: await sharp(f.file).resize(tw, th).composite([{ input: Buffer.from(`<svg width="${tw}" height="18"><rect width="${tw}" height="18" fill="black" opacity="0.6"/><text x="4" y="13" font-size="12" fill="white" font-family="monospace">${f.t}s ${f.mult}x ${f.stage} ${f.clip ?? ''}</text></svg>`), top: 0, left: 0 }]).toBuffer(),
        left: (i % cols) * tw,
        top: Math.floor(i / cols) * th,
      })),
    );
    await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: '#000' } }).composite(comp).jpeg({ quality: 72 }).toFile(`${OUT}/sheet-${name}-${p}.jpg`);
  }
}

const report = {};
for (const sc of SCENES) {
  const T = Date.now();
  let page;
  try {
    const o = await open(sc);
    page = o.page;
    let log = [];
    if (sc === 'title') {
      log = await film(page, sc, 3);
    } else if (sc === 'setup') {
      await page.evaluate(() => window.__ctl.enter());
      await page.waitForTimeout(600);
      log = await film(page, sc, 3);
      for (const m of ['history', 'fair', 'settings', 'how', 'menu']) {
        await page.evaluate((m) => window.__store.getState().set({ modal: m }), m);
        await page.waitForTimeout(1500);
        const file = `${OUT}/panel-${m}.jpg`;
        writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 75, timeout: 900000 }));
        log.push({ t: 0, file, panel: m });
      }
      await page.evaluate(() => window.__store.getState().set({ modal: null }));
    } else if (sc === 'run') {
      await stageRun(page, { sections: ['corridor', 'bridge', 'turnL', 'corridor', 'arcade', 'turnR', 'corridor', 'plaza'] });
      const ob = (k) => ({ name: `obstacle:${k}`, fn: (k) => window.__game.debugObstacle(k), arg: k });
      const go = { name: 'running', fn: () => { window.__store.getState().set({ phase: 'running' }); window.__ctl.audio.setScene('run'); } };
      log = await film(page, sc, 23.1, { 1.1: go, 3: ob('log'), 6: ob('beam'), 9: ob('pillar'), 12: ob('blocks'), 15: ob('tile'), 18: ob('rocks'), 21: ob('boulder') });
      // The tier crossings (5x at 25.5 s of run, 10x at 36.5 s, 25x at 51.1 s), lead included.
      for (const [from, len] of [[25.6, 2.5], [36.6, 2.5], [51.2, 3]]) {
        const now = await page.evaluate(() => (window.__game.virtualNow - window.__t0) / 1000 + 1.1);
        await page.evaluate((s) => window.__game.debugStep(s), from - now);
        log.push(...(await film(page, sc, len, {}, from)));
      }
    } else if (sc.startsWith('cash') || sc === 'start' || /^[a-z]+\d@/.test(sc)) {
      const cash = sc.startsWith('cash');
      const m = cash ? +sc.slice(4) : sc === 'start' ? 1 : +sc.split('@')[1];
      const [, kind, v] = /^([a-z]+?)(\d)@/.exec(sc) ?? [];
      await stageRun(page, {});
      const tEv = sc === 'start' ? 1.15 : 1.1 + runSec(m);
      const from = Math.max(0, tEv - 1.5);
      await page.evaluate(({ from }) => {
        const g = window.__game;
        g.debugStep(Math.min(1.1, from));
        window.__store.getState().set({ phase: 'running' });
        window.__ctl.audio.setScene('run');
        if (from > 1.1) g.debugStep(from - 1.1);
      }, { from });
      log = await film(page, sc.replace('@', 'at'), 9, { [tEv - from]: { name: 'settle', fn: SETTLE, arg: { ev: cash ? 'cashout' : sc === 'start' ? 'start' : 'crash', kind, v: v === undefined ? undefined : +v } } }, from);
    }
    const alog = await page.evaluate(() => window.__alog);
    report[sc] = { log, audio: alog, errors: o.errors, secs: Math.round((Date.now() - T) / 1000) };
    await sheet(sc.replace('@', 'at'), log.filter((x) => x.file && !x.panel));
    console.log(`${sc.padEnd(12)} ${log.filter((x) => x.file).length} stills  ${report[sc].secs}s  errors ${o.errors.length}`);
  } catch (e) {
    console.log(`${sc.padEnd(12)} FAILED ${String(e.message).split('\n')[0]}`);
    report[sc] = { failed: String(e.message) };
  } finally {
    await page?.close().catch(() => {});
    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  }
}
await browser.close();
