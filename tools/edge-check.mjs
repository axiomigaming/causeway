// Edge-case check in headless Chromium (real game loop, real round timing):
// for every phase (title, setup, run, result) it hides and resumes the tab, resizes/rotates, loses
// and restores the WebGL context, and (mid-run) steps the quality governor down; after each it
// screenshots and asserts the frame is not black or washed out, and that no page error or
// non-finite-uniform warning appeared.
//
//   URL=http://localhost:5180 node tools/edge-check.mjs [--q high] [--w 390 --h 844 --dpr 3] [--out dir]
//
// Exits 1 if any check fails.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const q = arg('q', 'medium');
const W = +arg('w', 390);
const H = +arg('h', 844);
const DPR = +arg('dpr', 1);
const OUT = arg('out', '');
const mobile = W < 700;
if (OUT) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const issues = [];
page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/Failed to load resource/.test(t)) issues.push(`console.error: ${t.slice(0, 160)}`);
  if (/non-finite|NaN|context lost|CONTEXT_LOST/i.test(t) && !/KHR_parallel/.test(t)) issues.push(`console: ${t.slice(0, 160)}`);
});
await page.goto(`${URL}/?qa&q=${q}&seed=look20`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });

let failed = 0;
const results = [];
/** Screenshot the canvas and judge it: mean luminance and the share of near-black / near-white pixels. */
async function frameOk(tag, waitMs = 4000) {
  await page.waitForTimeout(waitMs);
  const before = issues.length;
  const st = await page.evaluate(() => {
    const g = window.__game;
    const c = g.renderer.domElement;
    return { phase: window.__store.getState().phase, stage: g.debugState.stage, w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, lost: g.renderer.getContext().isContextLost(), mem: g.renderer.info.memory };
  });
  const buf = await page.screenshot({ timeout: 600000, clip: { x: 0, y: 0, width: page.viewportSize().width, height: page.viewportSize().height } });
  if (OUT) (await import('node:fs')).writeFileSync(`${OUT}/${tag}.png`, buf);
  // Decode the PNG in the page (no image libraries here): draw it and read it back.
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 160;
    cv.height = Math.round((160 * img.height) / img.width);
    const c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0, cv.width, cv.height);
    const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, black = 0, white = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      sum += l; n++;
      if (l < 0.03) black++;
      if (l > 0.97) white++;
    }
    return { mean: sum / n, black: black / n, white: white / n };
  }, buf.toString('base64'));
  const problems = [];
  if (stats.mean < 0.08) problems.push(`dark frame (mean ${stats.mean.toFixed(3)})`);
  if (stats.black > 0.5) problems.push(`black ${(stats.black * 100).toFixed(0)}%`);
  if (stats.white > 0.5) problems.push(`white ${(stats.white * 100).toFixed(0)}%`);
  if (st.lost) problems.push('context still lost');
  if (Math.abs(st.cw - page.viewportSize().width) > 1 || Math.abs(st.ch - page.viewportSize().height) > 1) problems.push(`canvas ${st.cw}x${st.ch} != viewport`);
  for (const i of issues.slice(before)) problems.push(i);
  const ok = problems.length === 0;
  if (!ok) failed++;
  const line = `${ok ? 'ok  ' : 'FAIL'} ${tag.padEnd(28)} phase ${st.phase}/${st.stage} buffer ${st.w}x${st.h} mean ${stats.mean.toFixed(3)} black ${(stats.black * 100).toFixed(0)}% geo ${st.mem.geometries} tex ${st.mem.textures}${ok ? '' : '  <- ' + problems.join('; ')}`;
  console.log(line);
  results.push(line);
  return ok;
}
const issuesSince = issues.length;
void issuesSince;

async function hideResume(tag) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await frameOk(`${tag}-hidden-resumed`);
}
async function resizes(tag) {
  const base = page.viewportSize();
  const sizes = mobile
    ? [
        [320, 568],
        [430, 932],
        [base.height, base.width],
      ]
    : [
        [800, 600],
        [1920, 1080],
        [390, 844],
      ];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await frameOk(`${tag}-${w}x${h}`, 3000);
  }
  await page.setViewportSize(base);
  await frameOk(`${tag}-back`, 3000);
}
async function contextLoss(tag) {
  const had = await page.evaluate(() => {
    const ext = window.__game.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.__lc = ext;
    ext.loseContext();
    return true;
  });
  if (!had) return console.log(`skip ${tag}-context (no WEBGL_lose_context)`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__lc.restoreContext());
  await frameOk(`${tag}-context-restored`, 8000);
}

// Title
await frameOk('title');
await hideResume('title');
await resizes('title');
await contextLoss('title');
// Setup
await page.evaluate(() => window.__ctl.enter());
await page.waitForFunction(() => window.__store.getState().phase === 'setup', null, { timeout: 120000 });
await frameOk('setup');
await hideResume('setup');
await resizes('setup');
await contextLoss('setup');
// Run (look20's first round falls at 24.68x, ~51 s of real time)
await page.evaluate(() => window.__ctl.run());
await page.waitForFunction(() => window.__store.getState().phase === 'running', null, { timeout: 120000, polling: 500 });
await frameOk('run');
await hideResume('run');
await resizes('run');
await contextLoss('run');
// Governor steps down mid-run.
const tier = await page.evaluate(() => {
  const g = window.__game;
  const order = ['low', 'medium', 'high', 'ultra'];
  const i = order.indexOf(g.quality);
  if (i > 0) g.applyQuality(order[i - 1], false);
  return g.quality;
});
await frameOk(`run-stepdown-${tier}`);
// Result
await page.waitForFunction(() => window.__store.getState().phase === 'result', null, { timeout: 600000, polling: 1000 });
await frameOk('result');
await hideResume('result');
await resizes('result');
await contextLoss('result');
// A real round outlives only a few of these (slow) checks, so the run presentation is also driven on
// a slowed clock (20× slower than real time), with the store left in the result phase.
await page.evaluate(() => {
  const g = window.__game;
  const t0 = performance.now() + 1100;
  g.lead();
  g.elapsed = () => (performance.now() - t0) * 0.05 + (performance.now() > t0 ? 9000 : 0);
});
await page.waitForFunction(() => window.__game.debugState.stage === 'run', null, { timeout: 120000, polling: 500 });
await frameOk('run2');
await hideResume('run2');
await resizes('run2');
await contextLoss('run2');
const tier2 = await page.evaluate(() => {
  const g = window.__game;
  const order = ['low', 'medium', 'high', 'ultra'];
  const i = order.indexOf(g.quality);
  if (i > 0) g.applyQuality(order[i - 1], false);
  return g.quality;
});
await frameOk(`run2-stepdown-${tier2}`);
await browser.close();
console.log(failed ? `${failed} check(s) failed` : 'all checks ok');
process.exit(failed ? 1 : 0);
