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
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
    const shot = async (ghosts) => {
      await page.evaluate((v) => {
        const g = window.__game;
        g.post.lens.uniforms.get('ghosts').value = v;
        g.frame(1e-6, true);
      }, ghosts);
      return lum(await page.screenshot({ clip, type: 'png', timeout: 600000 }));
    };
    const a = await shot(1);
    const b = await shot(0);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < a.data.length; i++) {
      const d = Math.abs(a.data[i] - b.data[i]);
      sum += d;
      if (d > max) max = d;
    }
    const mean = sum / a.data.length;
    tested++;
    // A ghost over him shows as a patch of several levels; noise from re-rendering stays ~0.
    const ok = mean < 0.6 && max < 24;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} world ${w} t${k} sun ${s.on.toFixed(2)} rect ${clip.width}x${clip.height} mean ${mean.toFixed(2)} max ${max}`);
  }
}
await browser.close();
console.log(tested ? (failed ? `${failed} of ${tested} frame(s) failed` : `all ${tested} frames ok`) : 'no frames with the sun in view');
process.exit(failed || !tested ? 1 : 0);
