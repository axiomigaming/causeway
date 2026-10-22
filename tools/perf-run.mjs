// Frame cost across a 60 s run (QA time-stepped so every build sees the same moments): every 2 s of
// run time one frame is drawn and timed with a GPU sync; reports the median and p90 ms, draw calls,
// triangles and texture count. SwiftShader: compare builds relative to each other only.
//   URL=http://localhost:5180 node tools/perf-run.mjs [--q low] [--w 390 --h 844 --dpr 1]
import { chromium } from 'playwright-core';
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const q = arg('q', 'low');
const w = +arg('w', 390);
const h = +arg('h', 844);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +arg('dpr', 1), isMobile: w < 700, hasTouch: w < 700 });
await page.goto(`${URL}/?qa&q=${q}&seed=perf`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
const r = await page.evaluate(async () => {
  const g = window.__game;
  g.autoQuality = false;
  g.paused = true;
  const p = g.toSetup();
  g.debugStep(1.2);
  await p;
  const start = g.virtualNow + 1100;
  g.elapsed = () => g.virtualNow - start;
  g.lead();
  g.debugStep(1.2);
  const gl = g.renderer.getContext();
  const px = new Uint8Array(4);
  const ms = [], calls = [], tris = [];
  for (let s = 0; s < 30; s++) {
    g.debugStep(2 - 1 / 30, 30);
    const t = performance.now();
    g.debugStep(1 / 30);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    ms.push(performance.now() - t);
    calls.push(g.renderer.info.render.calls);
    tris.push(g.renderer.info.render.triangles);
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const p90 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.9)];
  return { msMedian: +med(ms).toFixed(0), msP90: +p90(ms).toFixed(0), callsMedian: med(calls), callsMax: Math.max(...calls), trisMedian: med(tris), trisMax: Math.max(...tris), textures: g.renderer.info.memory.textures, geometries: g.renderer.info.memory.geometries, programs: g.renderer.info.programs?.length ?? 0, mult: +g.live.mult.toFixed(2), pixelRatio: g.renderer.getPixelRatio() };
});
console.log(JSON.stringify({ url: URL, q, w, h, ...r }));
await browser.close();
