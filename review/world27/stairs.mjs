// World round 27: world 5's phone chase up a forced flight of stairs (the coordinator's probe), on
// <URL>: the runner's height against the tread under him, and stills at a few frames into <out>-f<n>.png.
//   URL=http://localhost:5196 node review/world27/stairs.mjs <out-stem>
import { chromium } from '../../node_modules/playwright-core/index.mjs';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.goto(`${process.env.URL}/?qa&q=low&w=5&seed=stairs`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
await page.evaluate(() => {
  const g = window.__game;
  g.paused = true;
  g.track.forceNext = ['stairsUp', 'corridor', 'stairsDown'];
  g.newWorld('setup');
  g.debugStep(1);
  g.lead();
  const E = Math.log(2.5) / 0.000063;
  const start = g.virtualNow + 2600 - E;
  g.elapsed = () => g.virtualNow - start;
  g.debugStep(2.6);
});
const shots = new Set([0, 6, 12, 120, 130]);
for (let f = 0; f < 150; f++) {
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.virtualNow += 1000 / 30;
    g.frame(1 / 30, false);
    const sec = g.track.sectionAt(g.s);
    const rp = g.runner.root.position;
    return { sec: sec?.type, s: +g.s.toFixed(2), runY: +rp.y.toFixed(3), pathY: +g.track.path.sample(g.s).pos.y.toFixed(3) };
  });
  if (r.sec?.startsWith('stairs') && f % 3 === 0) console.log('STAIRS', f, JSON.stringify(r));
  if (shots.has(f)) await page.screenshot({ path: `${out}-f${f}.png` });
}
await browser.close();
console.log('STAIRSDONE');
