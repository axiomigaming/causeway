// Lens-ghost check (round 19): the flare's ghosts and halo must not draw over the runner.
// For run frames with the sun in view, the runner's screen rect (from his skeleton) is shot with
// the ghosts on and off and compared pixel by pixel; any visible difference over him fails.
//
//   URL=http://localhost:5195 node tools/ghost-check.mjs [--n 4] [--q high] [--look golden]
//
// Exits 1 if any frame fails. Headless Chromium (SwiftShader); time is stepped.
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const n = +arg('n', 4);
const q = arg('q', 'high');
const look = arg('look', 'golden');
// --selftest: the near fade off (the old ghosts): the check should then catch some frames.
const selftest = process.argv.includes('--selftest');
const W = 1280;
const H = 720;

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(`${URL}/?qa&q=${q}&look=${look}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
await page.addStyleTag({ content: '#app{visibility:hidden !important} #world{transition:none !important;opacity:1 !important}' });

const lum = async (buf) => {
  // Blurred: a ghost is a patch, re-render noise is single pixels (motes, sparkle).
  const { data, info } = await sharp(buf).removeAlpha().blur(2.5).raw().toBuffer({ resolveWithObject: true });
  return { data, n: info.width * info.height };
};
let failed = 0;
let tested = 0;
for (let w = 1; w <= n; w++) {
  await page.evaluate(({ w, look }) => {
    const g = window.__game;
    g.paused = true;
    const now = Date.now;
    Date.now = () => 9100 + w * 37;
    g.newWorld('setup');
    Date.now = now;
    if (look) g.track.forceLook?.(look);
    g.debugStep(1);
    const start = g.virtualNow + 1100;
    g.elapsed = () => g.virtualNow - start;
    g.lead();
    g.debugStep(1.1);
  }, { w, look });
  if (selftest) await page.evaluate(() => window.__game.post.lens.uniforms.get('ghostNear').value = 0);
  for (let k = 0; k < 8; k++) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      g.debugStep(0.7);
      const lens = g.post.lens;
      const on = lens ? lens.uniforms.get('sunOn').value * lens.uniforms.get('flare').value : 0;
      const f = g.debugFraming();
      return { on, body: f.body, mult: g.live?.mult };
    });
    if (!(s.on > 0.05) || !s.body?.length) continue;
    // His screen rect: head, hips and feet from the skeleton, padded for the arms.
    const xs = s.body.map((p) => p[0]);
    const ys = s.body.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(((Math.min(...xs) + 1) / 2) * W - 40));
    const x1 = Math.min(W, Math.ceil(((Math.max(...xs) + 1) / 2) * W + 40));
    const y0 = Math.max(0, Math.floor(((1 - Math.max(...ys)) / 2) * H - 30));
    const y1 = Math.min(H, Math.ceil(((1 - Math.min(...ys)) / 2) * H + 20));
    if (x1 - x0 < 8 || y1 - y0 < 8) continue;
    const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const raw = {};
    const shot = async (ghosts) => {
      await page.evaluate((v) => {
        const g = window.__game;
        g.post.lens.uniforms.get('ghosts').value = v;
        g.frame(1e-6, true);
      }, ghosts);
      raw[ghosts] = await page.screenshot({ clip, type: 'png', timeout: 600000 });
      return lum(raw[ghosts]);
    };
    const a = await shot(1);
    const b = await shot(0);
    // His silhouette: the same frame with him hidden differs only where he stands. (Ghosts over
    // the far scene beside him are fine; only those on him count.)
    await page.evaluate(() => {
      const g = window.__game;
      g.runner.root.visible = false;
      g.post.lens.uniforms.get('ghosts').value = 0;
      g.frame(1e-6, true);
    });
    const hid = await lum(await page.screenshot({ clip, type: 'png', timeout: 600000 }));
    await page.evaluate(() => {
      const g = window.__game;
      g.runner.root.visible = true;
      g.post.lens.uniforms.get('ghosts').value = 1;
    });
    let sum = 0;
    let max = 0;
    let lit = 0;
    let body = 0;
    for (let i = 0; i < a.data.length; i += 3) {
      const m = Math.max(Math.abs(b.data[i] - hid.data[i]), Math.abs(b.data[i + 1] - hid.data[i + 1]), Math.abs(b.data[i + 2] - hid.data[i + 2]));
      if (m < 12) continue;
      body++;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
      sum += d;
      if (d > max) max = d;
      if (d > 3) lit++;
    }
    if (body < 200) continue;
    const mean = sum / body;
    const area = lit / body;
    tested++;
    // A ghost over him is a patch: hundreds of pixels a few levels brighter. Re-render noise (a
    // mote, a sparkle) is a handful of isolated dots, so the test is the area that changed.
    // (Measured: the fixed flare changes at most ~1.2% of his silhouette, its edge pixels where the
    // far scene shows through; the old ghosts changed 17-39%.)
    const ok = mean < 0.6 && area < 0.02;
    if (!ok) failed++;
    // DUMP=<dir>: the two crops of a failing frame, to look at.
    if (!ok && process.env.DUMP) {
      await sharp(raw[1]).toFile(`${process.env.DUMP}/ghost-w${w}-t${k}-on.png`);
      await sharp(raw[0]).toFile(`${process.env.DUMP}/ghost-w${w}-t${k}-off.png`);
    }
    console.log(`${ok ? 'ok  ' : 'FAIL'} world ${w} t${k} sun ${s.on.toFixed(2)} rect ${clip.width}x${clip.height} mean ${mean.toFixed(2)} max ${max} area ${(area * 100).toFixed(2)}%`);
  }
}
await browser.close();
console.log(tested ? (failed ? `${failed} of ${tested} frame(s) failed` : `all ${tested} frames ok`) : 'no frames with the sun in view');
process.exit(failed || !tested ? 1 : 0);
