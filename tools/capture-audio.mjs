// Record what the game actually sounds like: plays real rounds in headless Chromium and captures the
// WebAudio master output (AudioEngine.tap → MediaRecorder), plus a cue list of what happened when, for
// earshot (`timeline --cues`, `sheet`, `realness`; see review/audio11/REPORT.md).
//
//   npx vite --port 5196 &   (or vite preview)
//   URL=http://localhost:5196 SECONDS=60 node tools/capture-audio.mjs out/capture
//
// Writes <out>.webm (Opus, as recorded), <out>.cues.json ([{t, id, label}]) and <out>.log.json.
// Rounds: enter, then RUN with cash-outs at varied points (some rounds are left to fall), mute and
// unmute once mid-round, a tab hide/show, a rapid RUN straight after a result. Presentation only.
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:5196';
const SECONDS = Number(process.env.SECONDS ?? 60);
const out = process.argv[2] ?? 'capture';

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${URL}/?q=low&seed=audio-capture&qa`);
await page.waitForSelector('.title-actions .btn-cta', { timeout: 300000 });
await page.click('.title-actions .btn-cta');
await page.waitForFunction(() => window.__store.getState().phase === 'setup', null, { timeout: 60000 });
// Give the lazy groups (beds, score) time to arrive and decode, as a player reading the title would.
await page.waitForFunction(() => window.__ctl.audio.hasSample('m_pulse') && window.__ctl.audio.hasSample('bed_jungle'), null, { timeout: 60000 }).catch(() => console.warn('beds/score not loaded: capture uses what is ready'));

await page.evaluate(() => {
  const a = window.__ctl.audio;
  const dest = a.tap();
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  window.__rec = { rec, chunks, t0: performance.now(), cues: [] };
  // Cue log: every settlement and phase change, with time since the recording started.
  let last = window.__store.getState().phase;
  window.__store.subscribe((s) => {
    if (s.phase === last) return;
    last = s.phase;
    const t = (performance.now() - window.__rec.t0) / 1000;
    const r = s.result;
    const label = s.phase === 'result' && r ? (r.won ? `escape ${(r.round.cashoutMult / 100).toFixed(2)}x` : `fall ${(r.round.crash / 100).toFixed(2)}x`) : s.phase;
    window.__rec.cues.push({ t: +t.toFixed(3), id: `phase:${s.phase}:${window.__rec.cues.length}`, label });
  });
  rec.start(1000);
});

const t0 = Date.now();
const elapsed = () => (Date.now() - t0) / 1000;
const phase = () => page.evaluate(() => window.__store.getState().phase);
const mark = (label) => page.evaluate((l) => window.__rec.cues.push({ t: +((performance.now() - window.__rec.t0) / 1000).toFixed(3), id: `qa:${window.__rec.cues.length}`, label: l }), label);
const targets = [1.6, 0, 3.2, 1.25, 0, 2.2, 6, 1.4];
let round = 0;
while (elapsed() < SECONDS - 4) {
  const p = await phase();
  if (p !== 'setup' && p !== 'result') {
    await page.waitForTimeout(200);
    continue;
  }
  // Round 3 starts straight after its result (rapid RUN); the others leave a beat.
  if (round !== 3) await page.waitForTimeout(1500);
  await page.evaluate(() => window.__ctl.run());
  const target = targets[round % targets.length];
  round++;
  await page.waitForFunction(() => ['running', 'result'].includes(window.__store.getState().phase), null, { timeout: 20000 }).catch(() => {});
  if (round === 2) {
    await page.waitForTimeout(1200);
    await mark('mute');
    await page.evaluate(() => window.__store.getState().setSettings({ muted: true }));
    await page.waitForTimeout(1000);
    await mark('unmute');
    await page.evaluate(() => window.__store.getState().setSettings({ muted: false }));
  }
  // Cash out when the multiplier on screen reaches the target (0 = let it fall).
  for (;;) {
    const s = await page.evaluate(() => ({ phase: window.__store.getState().phase, m: window.__ctl.currentMult() / 100 }));
    if (s.phase !== 'running' || elapsed() > SECONDS - 3) break;
    if (target && s.m >= target) {
      await page.evaluate(() => window.__ctl.cashout());
      break;
    }
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__store.getState().phase === 'result', null, { timeout: 120000 }).catch(() => {});
  if (round === 4) {
    // Tab hidden and back: the context suspends and resumes.
    await mark('hidden');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await mark('visible');
  }
}
await page.waitForTimeout(Math.max(0, (SECONDS - elapsed()) * 1000));
const res = await page.evaluate(
  () =>
    new Promise((done) => {
      const { rec, chunks, cues } = window.__rec;
      rec.onstop = async () => {
        const b = new Blob(chunks, { type: 'audio/webm' });
        const bytes = new Uint8Array(await b.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        done({ b64: btoa(s), cues, voices: window.__ctl.audio.voices() });
      };
      rec.stop();
    }),
);
writeFileSync(`${out}.webm`, Buffer.from(res.b64, 'base64'));
writeFileSync(`${out}.cues.json`, JSON.stringify(res.cues, null, 1));
writeFileSync(`${out}.log.json`, JSON.stringify({ rounds: round, errors, voicesAtEnd: res.voices }, null, 1));
console.log(`${out}.webm: ${round} rounds, ${res.cues.length} cues, ${errors.length} page errors`);
await browser.close();
