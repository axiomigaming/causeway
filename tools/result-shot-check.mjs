// Regression check for the result shot (owner bug: the causeway ended in a cut edge over water right in
// front of the lens). For several worlds × multipliers × outcomes (fall and escape), run to the
// multiplier on QA time, settle the round, and sample the shot 2, 4 and 7 s later (the card reveal
// included). Fails when the runner stands on the way but more than 35 % of the screen between the
// dock line and his feet is open water (Game.debugForeground).
//   URL=http://localhost:5180 node tools/result-shot-check.mjs [--worlds 3] [--out dir]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const worlds = +arg('worlds', 3);
const OUT = arg('out', '');
const LIMIT = 0.35;
if (OUT) mkdirSync(OUT, { recursive: true });
const VIEWS = [
  { name: 'phone', w: 390, h: 844 },
  { name: 'desktop', w: 1280, h: 720 },
];
const MULTS = [1.0, 1.6, 4, 12, 40];
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = 0;
for (const v of VIEWS) for (let wi = 1; wi <= worlds; wi++) {
  // A fresh page per world: SwiftShader runs out of memory on one page over many worlds.
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, isMobile: v.w < 700, hasTouch: v.w < 700 });
  await page.goto(`${URL}/?qa&q=medium&seed=results`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  await page.evaluate(async () => {
    window.__game.paused = true;
    window.__ctl.enter();
    await new Promise((r) => setTimeout(r, 1500));
  });
  {
    for (const m of MULTS) {
      for (const outcome of m <= 1 ? ['fall'] : ['fall', 'escape']) {
        const r = await page.evaluate(
          ({ wi, m, outcome }) => {
            const g = window.__game;
            const now = Date.now,
              rnd = Math.random;
            Date.now = () => wi * 104729 + Math.round(m * 7);
            Math.random = () => ((wi * 0.618 + m * 0.11) % 1) * 0.98;
            g.newWorld('setup');
            Date.now = now;
            Math.random = rnd;
            g.debugStep(0.5);
            const start = g.virtualNow + 1100;
            g.elapsed = () => g.virtualNow - start;
            g.lead();
            g.debugStep(1.1 + Math.log(Math.max(1, m)) / 0.000063 / 1000);
            const id = `results-${wi}-${m}-${outcome}`;
            if (outcome === 'fall') g.crash(Math.round(m * 100), id);
            else g.cashout(id);
            g.elapsed = () => null;
            const out = [];
            for (const t of [2, 2, 3]) {
              g.debugStep(t);
              out.push(g.debugForeground());
            }
            return out;
          },
          { wi, m, outcome },
        );
        r.forEach((f, k) => {
          const bad = f.onPath && f.samples >= 9 && f.water > LIMIT;
          if (bad) failed++;
          console.log(`${bad ? 'FAIL' : 'ok  '} ${v.name.padEnd(7)} world ${wi} ${String(m).padStart(4)}x ${outcome.padEnd(6)} t+${[2, 4, 7][k]}s stage ${f.stage} onPath ${f.onPath} water ${(f.water * 100).toFixed(0)}% of ${f.samples}${bad ? '  <- open water between the lens and the runner' : ''}`);
        });
        if (OUT) writeFileSync(`${OUT}/${v.name}-w${wi}-${m}x-${outcome}.png`, await page.screenshot({ timeout: 600000 }));
      }
    }
  }
  await page.close();
}
await browser.close();
console.log(failed ? `${failed} shot(s) failed` : 'all result shots ok');
process.exit(failed ? 1 : 0);
