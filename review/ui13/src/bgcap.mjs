// Clean game backdrops (UI hidden) at a chosen DPR: node bgcap.mjs <prefix> <w> <h> <dpr>
// Writes <prefix>-setup.png, -run.png (mid-run, camera on the runner) and -fell.png (after a fall).
import { createRequire } from 'node:module';
const require = createRequire('/home/user/branchfall/.claude/worktrees/agent-aeb3d407ede760a20/package.json');
const { chromium } = require('playwright-core');
const [out, w, h, dpr = '1'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, reducedMotion: 'reduce', hasTouch: +w < 700, isMobile: +w < 700 });
await page.goto('http://localhost:5191/?qa&q=high&seed=ui142', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 250 });
await page.evaluate(() => window.__ctl.enter());
await page.waitForFunction(() => window.__store.getState().phase === 'setup', null, { timeout: 120000 });
await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
await page.waitForTimeout(1000);
await page.evaluate(() => { window.__game.debugStep(3); window.__game.paused = false; });
await page.screenshot({ path: `${out}-setup.png`, timeout: 900000 });
await page.evaluate(() => window.__ctl.run());
await page.waitForFunction(() => window.__store.getState().phase === 'running', null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__game.debugStep(2));
await page.screenshot({ path: `${out}-run.png`, timeout: 900000 });
// let the round play out to its fall
await page.waitForFunction(() => window.__store.getState().phase === 'result', null, { timeout: 900000, polling: 500 });
await page.waitForTimeout(1200);
await page.evaluate(() => window.__game.debugStep(2));
await page.screenshot({ path: `${out}-fell.png`, timeout: 900000 });
console.log('done', out);
await browser.close();
