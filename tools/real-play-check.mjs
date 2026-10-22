// Real-play edge cases through the real controller and the demo authority (real round clock, nothing
// staged): an instant fall at 1.00×, an auto cash-out at 1.01×, a run past 100×, rapid RUN / CASH OUT /
// RUN tapping, the tab hidden mid-run, and a rotation mid-run. For each it checks the balance against
// the settled round (stake debited once, payout credited exactly), the result card's text, that the
// camera leaves the run and comes back for the next round, and that no frame is black or NaN.
//
//   URL=http://localhost:5180 node tools/real-play-check.mjs [--q low] [--only name] [--out dir]
//
// Seeds (first round, client seed qa-<seed>): qa14-23 falls at 1.00×, qa14-12 at 1.59×, qa14-155 at
// 101.96×, look20 at 24.68× (find more with review/seeds14.ts). Exits 1 on any failure.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const q = arg('q', 'low');
const only = arg('only', '');
const OUT = arg('out', '');
if (OUT) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
let failed = 0;

async function open(seed, w = 390, h = 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  const page = await ctx.newPage();
  const issues = [];
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) issues.push(`console.error: ${t.slice(0, 160)}`);
    if (/non-finite/i.test(t)) issues.push(`console: ${t.slice(0, 160)}`);
  });
  await page.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent = '*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
  });
  await page.goto(`${URL}/?qa&q=${q}&seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  await page.evaluate(() => window.__ctl.enter());
  await page.waitForFunction(() => window.__store.getState().phase === 'setup', null, { timeout: 120000, polling: 250 });
  return { ctx, page, issues };
}
const state = (page) =>
  page.evaluate(() => {
    const s = window.__store.getState();
    const g = window.__game;
    return { phase: s.phase, balance: s.balance, stake: s.stake, result: s.result && { won: s.result.won, crash: s.result.round.crash, cashout: s.result.round.cashoutMult ?? null, stake: s.result.round.stake, id: s.result.round.id }, history: s.history.length, stage: g.debugState.stage, cam: g.rig.mode, card: document.querySelector('.result')?.textContent?.replace(/\s+/g, ' ').trim() ?? null };
  });
async function frame(page, tag) {
  const buf = await page.screenshot({ timeout: 600000 });
  if (OUT) writeFileSync(`${OUT}/${tag}.png`, buf);
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 120;
    cv.height = Math.round((120 * img.height) / img.width);
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0, cv.width, cv.height);
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let s = 0, black = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      s += l;
      if (l < 0.03) black++;
    }
    return { mean: s / (d.length / 4), black: black / (d.length / 4) };
  }, buf.toString('base64'));
}
const payout = (stake, mult) => Math.floor((stake * mult) / 100);
function report(name, problems, extra = '') {
  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(22)} ${extra}${ok ? '' : '  <- ' + problems.join('; ')}`);
}
async function frameProblems(page, tag, problems) {
  const f = await frame(page, tag);
  if (f.mean < 0.06 || f.black > 0.6) problems.push(`${tag}: dark frame (mean ${f.mean.toFixed(3)}, black ${(f.black * 100).toFixed(0)}%)`);
  return f;
}
/** After a round: back to setup must put the camera back on the setup shot and the run must start again. */
async function nextRoundOk(page, problems) {
  await page.evaluate(() => window.__ctl.toSetup());
  await page.waitForFunction(() => window.__store.getState().phase === 'setup', null, { timeout: 60000, polling: 250 });
  await page.waitForTimeout(1500);
  const s = await state(page);
  if (s.cam !== 'setup') problems.push(`camera stuck in '${s.cam}' after back to setup`);
}
async function waitPhase(page, ph, ms = 240000) {
  try {
    await page.waitForFunction((p) => window.__store.getState().phase === p, ph, { timeout: ms, polling: 250 });
  } catch (e) {
    const s = await state(page).catch(() => null);
    throw new Error(`waiting for phase '${ph}': still ${JSON.stringify(s && { phase: s.phase, stage: s.stage, cam: s.cam })}`);
  }
  // The result card is held until the fall or escape has landed (Game.reveal): wait for it.
  if (ph === 'result') await page.waitForSelector('.result', { timeout: 120000 }).catch(() => {});
}

const cases = {
  async instantFall() {
    const { ctx, page, issues } = await open('qa14-23');
    const p = [];
    const b0 = (await state(page)).balance;
    await page.evaluate(() => window.__ctl.run());
    await waitPhase(page, 'result');
    await page.waitForTimeout(2500);
    const s = await state(page);
    if (!s.result || s.result.won || s.result.crash !== 100) p.push(`result ${JSON.stringify(s.result)}`);
    if (s.balance !== b0 - s.result.stake) p.push(`balance ${s.balance} != ${b0} - ${s.result.stake}`);
    if (!s.card || !/1\.00/.test(s.card) || !/fell/i.test(s.card)) p.push(`card '${s.card}'`);
    if (s.stage !== 'crash') p.push(`stage ${s.stage}`);
    await frameProblems(page, 'instant-fall', p);
    await nextRoundOk(page, p);
    p.push(...issues);
    report('crash at 1.00x', p, `balance ${b0} -> ${s.balance}, card '${s.card?.slice(0, 40)}'`);
    await ctx.close();
  },
  async autoCashout101() {
    const { ctx, page, issues } = await open('qa14-12');
    const p = [];
    await page.evaluate(() => window.__store.getState().set({ autoOn: true, auto: 101 }));
    const b0 = (await state(page)).balance;
    await page.evaluate(() => window.__ctl.run());
    await waitPhase(page, 'result');
    await page.waitForTimeout(2500);
    const s = await state(page);
    if (!s.result?.won || s.result.cashout !== 101) p.push(`result ${JSON.stringify(s.result)}`);
    const want = b0 - s.result.stake + payout(s.result.stake, 101);
    if (s.balance !== want) p.push(`balance ${s.balance} != ${want}`);
    if (!s.card || !/Escaped/i.test(s.card) || !/1\.01/.test(s.card)) p.push(`card '${s.card}'`);
    await frameProblems(page, 'auto-101', p);
    await nextRoundOk(page, p);
    p.push(...issues);
    report('auto cash-out 1.01x', p, `balance ${b0} -> ${s.balance}`);
    await ctx.close();
  },
  async run100() {
    const { ctx, page, issues } = await open('qa14-155');
    const p = [];
    await page.evaluate(() => window.__store.getState().set({ autoOn: true, auto: 10000 }));
    const b0 = (await state(page)).balance;
    await page.evaluate(() => window.__ctl.run());
    await waitPhase(page, 'running', 60000);
    // ~73 s of real time to 100×: sample a frame on the way at the top tier.
    await page.waitForFunction(() => window.__game.live.mult > 60, null, { timeout: 240000, polling: 1000 });
    const mid = await frameProblems(page, 'run-60x', p);
    await waitPhase(page, 'result', 240000);
    await page.waitForTimeout(2500);
    const s = await state(page);
    if (!s.result?.won || s.result.cashout !== 10000) p.push(`result ${JSON.stringify(s.result)}`);
    const want = b0 - s.result.stake + payout(s.result.stake, 10000);
    if (s.balance !== want) p.push(`balance ${s.balance} != ${want}`);
    if (!s.card || !/100\.00/.test(s.card)) p.push(`card '${s.card}'`);
    await frameProblems(page, 'escape-100x', p);
    await nextRoundOk(page, p);
    p.push(...issues);
    report('run to 100x', p, `balance ${b0} -> ${s.balance}, mid-run mean ${mid.mean.toFixed(3)}`);
    await ctx.close();
  },
  async rapidTaps() {
    const { ctx, page, issues } = await open('look20');
    const p = [];
    const b0 = (await state(page)).balance;
    // RUN twice, then hammer CASH OUT, then RUN again while the cash-out settles — three times.
    const rounds = [];
    for (let k = 0; k < 3; k++) {
      await page.evaluate(() => {
        void window.__ctl.run();
        void window.__ctl.run();
      });
      await waitPhase(page, 'running', 60000);
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        for (let i = 0; i < 6; i++) void window.__ctl.cashout();
        void window.__ctl.run();
      });
      await waitPhase(page, 'result', 120000);
      await page.waitForTimeout(800);
      const s = await state(page);
      rounds.push(s.result);
      await page.evaluate(() => void window.__ctl.run()); // RUN AGAIN straight from the result
      await waitPhase(page, 'running', 60000);
      await page.waitForTimeout(800);
      await page.evaluate(() => void window.__ctl.cashout());
      await waitPhase(page, 'result', 120000);
      rounds.push((await state(page)).result);
    }
    await page.waitForTimeout(1500);
    const s = await state(page);
    const ids = new Set(rounds.map((r) => r.id));
    if (ids.size !== rounds.length) p.push(`duplicate settlements ${rounds.length} rounds / ${ids.size} ids`);
    let want = b0;
    for (const r of rounds) want += -r.stake + (r.won ? payout(r.stake, r.cashout) : 0);
    if (s.balance !== want) p.push(`balance ${s.balance} != ${want}`);
    if (s.history < rounds.length) p.push(`history ${s.history} < ${rounds.length}`);
    await frameProblems(page, 'rapid', p);
    await nextRoundOk(page, p);
    p.push(...issues);
    report('rapid RUN/CASH/RUN', p, `${rounds.length} rounds, balance ${b0} -> ${s.balance}`);
    await ctx.close();
  },
  async hiddenMidRun() {
    const { ctx, page, issues } = await open('look20');
    const p = [];
    const b0 = (await state(page)).balance;
    await page.evaluate(() => window.__ctl.run());
    await waitPhase(page, 'running', 60000);
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(8000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(3000);
    const mid = await state(page);
    if (mid.phase === 'running' && mid.stage !== 'run') p.push(`resumed: phase running but stage ${mid.stage}`);
    await frameProblems(page, 'hidden-resumed', p);
    if (mid.phase === 'running') await page.evaluate(() => window.__ctl.cashout());
    await waitPhase(page, 'result', 240000);
    await page.waitForTimeout(1500);
    const s = await state(page);
    const want = b0 - s.result.stake + (s.result.won ? payout(s.result.stake, s.result.cashout) : 0);
    if (s.balance !== want) p.push(`balance ${s.balance} != ${want}`);
    await nextRoundOk(page, p);
    p.push(...issues);
    report('tab hidden mid-run', p, `after resume phase ${mid.phase}/${mid.stage}, result ${s.result.won ? 'escaped ' + s.result.cashout : 'fell ' + s.result.crash}`);
    await ctx.close();
  },
  async rotateMidRun() {
    const { ctx, page, issues } = await open('look20');
    const p = [];
    await page.evaluate(() => window.__ctl.run());
    await waitPhase(page, 'running', 60000);
    await page.waitForTimeout(2500);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(3000);
    const a = await state(page);
    await frameProblems(page, 'rotated-landscape', p);
    const fr = await page.evaluate(() => window.__game.debugFraming());
    const ys = fr.ndc.map((v) => v[1]);
    if (a.stage === 'run' && Math.min(...ys) < fr.band[0] - 0.05) p.push(`landscape: boots below the dock (${Math.min(...ys).toFixed(2)} < ${fr.band[0]})`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(3000);
    await frameProblems(page, 'rotated-back', p);
    const c = await page.evaluate(() => [window.__game.renderer.domElement.clientWidth, window.__game.renderer.domElement.clientHeight]);
    if (c[0] !== 390 || c[1] !== 844) p.push(`canvas ${c} after rotating back`);
    if ((await state(page)).phase === 'running') await page.evaluate(() => window.__ctl.cashout());
    await waitPhase(page, 'result', 240000);
    await nextRoundOk(page, p);
    p.push(...issues);
    report('rotate mid-run', p, `landscape stage ${a.stage}`);
    await ctx.close();
  },
};
for (const [name, fn] of Object.entries(cases)) {
  if (only && only !== name) continue;
  try {
    await fn();
  } catch (e) {
    failed++;
    console.log(`FAIL ${name.padEnd(22)} threw: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
console.log(failed ? `${failed} case(s) failed` : 'all cases ok');
process.exit(failed ? 1 : 0);
