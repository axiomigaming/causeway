// node render13.mjs <concept 1|2> [states…]  → out13/c<C>-<phone|desktop>-<state>.png
// Phone renders at DPR 2 (so a 1:1 crop of them is the 200 % close-up), desktop at DPR 1.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire('/home/user/branchfall/.claude/worktrees/agent-aeb3d407ede760a20/package.json');
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const [C = '1', ...want] = process.argv.slice(2);
const PHONE = ['setup', 'pressed', 'hover', 'focus', 'disabled', 'low', 'high', 'escaped', 'fell'];
const DESK = ['setup', 'pressed', 'low', 'high', 'escaped', 'fell'];
fs.mkdirSync(`${here}/out13`, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
for (const [v, list, w, h, dpr] of [['phone', PHONE, 390, 844, 2], ['desktop', DESK, 1440, 900, 1]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  for (const s of list) {
    if (want.length && !want.includes(s) && !want.includes(`${v}-${s}`)) continue;
    await page.goto(`file://${here}/screens.html?c=${C}&v=${v}&s=${s}`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${here}/out13/c${C}-${v}-${s}.png` });
    console.log('shot', C, v, s);
  }
  await page.close();
}
await browser.close();
