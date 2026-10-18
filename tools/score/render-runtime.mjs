// Render what the RUNTIME plays (src/audio/theme.ts, the same code the game runs) into a file, offline and
// deterministic, for listening and for earshot: an OfflineAudioContext in headless Chromium, suspended every
// 25 ms to call update() and to feed the scripted multiplier (tier) and the scene changes, exactly as
// AudioEngine does in play. Music only (no SFX, beds or UI).
//
//   npx vite --port 5196 &
//   URL=http://localhost:5196 node tools/score/render-runtime.mjs long  review/audio13/preview-long.mp3
//   URL=http://localhost:5196 node tools/score/render-runtime.mjs top   review/audio13/top-form.mp3
//
// Scripts:
//   long  title (calm) -> GO -> a run that climbs like the game's curve (2x at 11 s ... 25x at 51 s) to 60x
//         -> cash-out (fanfare) -> the warm loop -> setup -> a second run -> a fall at 7x -> the tense loop
//   top   a run that reaches 25x at once and stays above it for 2.5 minutes (the tier-4 form evolving)
// Writes <out> (MP3, -16 LUFS for listening), <out>.wav (raw render) and <out>.log.json (what was scheduled
// when: phrases, fills, the pivot, the lift, the result).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://localhost:5196';
const which = process.argv[2] ?? 'long';
const out = process.argv[3] ?? `review/audio13/${which}.mp3`;

// The game's curve: m(t) = e^(0.000063 t ms); tiers at 2, 5, 10, 25x.
const mAt = (s) => Math.exp(0.063 * s);
const SCRIPTS = {
  long: {
    seconds: 140,
    events: [
      [0, 'rest'],
      [10, 'lead'],
      [11.1, 'run'],
      [11.1 + Math.log(60) / 0.063, 'escape'],
      [86, 'rest'],
      [92, 'lead'],
      [93.1, 'run'],
      [93.1 + Math.log(7) / 0.063, 'fall'],
    ],
  },
  top: { seconds: 165, events: [[0, 'rest'], [4, 'lead'], [5.1, 'run'], [5.1 + Math.log(25) / 0.063, 'hold'], [160, 'escape']] },
};
const sc = SCRIPTS[which];

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`${URL}/audio/CREDITS.txt`);
const info = await page.evaluate(
  async ({ sc, which }) => {
    const { ThemePlayer } = await import('/src/audio/theme.ts');
    const { SampleBank } = await import('/src/audio/samples.ts');
    const { mulberry32 } = await import('/src/audio/select.ts');
    const { tierOf } = await import('/src/audio/feedback.ts');
    const sr = 48000;
    const off = new OfflineAudioContext(2, Math.ceil(sc.seconds * sr), sr);
    const bank = new SampleBank(undefined, '/audio/', 'webm');
    await bank.load(off, 'theme');
    // The engine's music path: theme -> duck -> music bus (0.6 * 0.95) -> master; stingers on the sting bus.
    const bus = off.createGain();
    bus.gain.value = 0.6 * 0.95;
    bus.connect(off.destination);
    const th = new ThemePlayer(off, bank, bus, bus, mulberry32(which === 'long' ? 2026 : 7));
    let runAt = null;
    let hold = false;
    let ev = 0;
    const events = sc.events;
    const step = 0.025;
    for (let t = step; t < sc.seconds; t += step) {
      off.suspend(+t.toFixed(4)).then(() => {
        const now = off.currentTime;
        while (ev < events.length && events[ev][0] <= now + 1e-9) {
          const [, what] = events[ev++];
          if (what === 'rest') th.rest();
          else if (what === 'lead') th.lead();
          else if (what === 'run') {
            th.startRun(now);
            runAt = now;
            hold = false;
          } else if (what === 'escape') {
            th.escape(tierOf(Math.round(100 * Math.exp(0.063 * (now - runAt)))));
            runAt = null;
          } else if (what === 'fall') {
            th.fall();
            runAt = null;
          } else if (what === 'hold') hold = true;
        }
        if (runAt !== null) {
          const m = hold ? 2600 : Math.round(100 * Math.exp(0.063 * (now - runAt)));
          th.setTier(tierOf(m));
        }
        th.update();
        off.resume();
      });
    }
    const buf = await off.startRendering();
    window.__buf = buf;
    return { len: buf.length, log: th.log };
  },
  { sc, which },
);
// Pull the render out in 10 s chunks of 16-bit PCM.
const sr = 48000;
const chunks = [];
for (let a = 0; a < info.len; a += sr * 10) {
  const b64 = await page.evaluate(
    ({ a, n }) => {
      const buf = window.__buf;
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const k = Math.min(n, buf.length - a);
      const pcm = new Int16Array(k * 2);
      for (let i = 0; i < k; i++) {
        pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[a + i] * 32767)));
        pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[a + i] * 32767)));
      }
      const u8 = new Uint8Array(pcm.buffer);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { a, n: sr * 10 },
  );
  chunks.push(Buffer.from(b64, 'base64'));
}
await browser.close();
const pcm = Buffer.concat(chunks);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(sr, 24);
hdr.writeUInt32LE(sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
writeFileSync(`${out}.wav`, Buffer.concat([hdr, pcm]));
writeFileSync(`${out}.log.json`, JSON.stringify(info.log, null, 1));
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', `${out}.wav`, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '160k', out]);
if (r.status !== 0) throw new Error(String(r.stderr));
console.log(`${out}: ${(info.len / sr).toFixed(1)} s, ${info.log.length} log entries`);
