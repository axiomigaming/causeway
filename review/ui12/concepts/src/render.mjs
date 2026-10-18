// node render.mjs [A B ...]  → out/<L>.png (one sheet per direction, phones at 390 px CSS)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/home/user/branchfall/.claude/worktrees/agent-aeb3d407ede760a20/package.json');
const { chromium } = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : 'ABCDEFGH'.split('');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 1 });
for (const d of dirs) {
  await page.goto(`file://${here}/concepts.html?d=${d}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${here}/out/${d}.png`, fullPage: true });
  console.log('shot', d);
}
await browser.close();
