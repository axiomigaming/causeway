// Run film (FX round 21, "la visuale"): films the chase camera through a stretch of plain run, frame by
// frame on the game's virtual clock (time stepped, so the result does not depend on the frame rate),
// with the real interface on screen (the HUD's multiplier and the live dock, whose insets the rig
// frames against). Writes an mp4, a contact sheet and a JSON of per-frame measurements (camera pose,
// lens, where he stands in the frame, the section under him), and prints a summary: the camera's
// jerk / turn rate / change of turn rate (the limits of tools/framing-check.mjs), the horizon's roll,
// and the composition (his hips and head in NDC, his height in the frame, where the horizon sits).
//
//   URL=http://localhost:5188 node tools/run-film.mjs --w 7 --view desktop --q medium --at 1.3 \
//       --secs 9 --out review/fx21/before --name w7-desktop [--sections corridor,turnL,bridge] [--fps 30]
//       [--size 960x540] [--every 1] [--keep] [--sheet] [--pre 3] [--from 0]
//
// --at: the multiplier when filming starts (3 s of run are stepped first, undrawn, so the chase has
// settled). --every n draws every nth frame (the measurements are taken every frame). Frames are
// deleted once encoded unless --keep.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5188';
const W = arg('w', '7');
const VIEW = arg('view', 'desktop');
const Q = arg('q', 'medium');
const AT = +arg('at', '1.3');
const SECS = +arg('secs', '9');
const FPS = +arg('fps', '30');
const EVERY = +arg('every', '1');
const OUT = arg('out', 'review/fx21/run');
const NAME = arg('name', `w${W}-${VIEW}`);
const SECTIONS = arg('sections', '');
const KEEP = process.argv.includes('--keep');
// --sheet: draw only the 12 frames of the contact sheet (measurements every frame, no film): cheap iteration.
const SHEET_ONLY = process.argv.includes('--sheet');
const PRE = +arg('pre', '3');
// --from <m>: the run starts this far along the route (the runner is moved there in the setup).
const FROM = +arg('from', '0');
const [VW, VH] = (arg('size', VIEW === 'phone' ? '390x844' : '1280x720')).split('x').map(Number);
const FR = `${OUT}/frames-${NAME}`;
mkdirSync(FR, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const mobile = VIEW === 'phone';
const T0 = Date.now();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${URL}/?qa&q=${Q}&w=${W}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });

await page.evaluate(
  async ({ name, sections, at, pre, from }) => {
    const g = window.__game;
    const ctl = window.__ctl;
    const st = window.__store;
    // Deterministic cosmetic randomness (the shake's jolts, the debris), seeded by the film's name.
    let s = 0;
    for (const c of name) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    g.autoQuality = false;
    g.paused = true;
    ctl.enter();
    await new Promise((r) => setTimeout(r, 800));
    if (sections) g.track.forceNext = [...sections];
    g.newWorld('setup');
    await g.toSetup();
    if (from > 0) {
      g.debugAdvance(from);
      g.debugStep(0.5);
      g.rig.snap(g.runner.root.position, g.runner.root.rotation.y);
    }
    g.debugStep(1);
    // The live interface (the HUD's multiplier, the cash-out dock) on the game's clock.
    const E0 = Math.log(at) / 0.000063;
    const start = g.virtualNow + 1100 - Math.max(0, E0 - pre * 1000);
    g.elapsed = () => g.virtualNow - start;
    ctl.currentMult = () => Math.max(100, Math.floor(g.live.mult * 100));
    ctl.elapsedMs = () => g.virtualNow - start;
    const gs = st.getState();
    gs.set({ phase: 'running', live: { id: 'film', stake: 1000, commitment: '0'.repeat(64), runStartsAt: 0, nonce: 0, clientSeed: 'film', autoCashout: null } });
    // (Let the interface lay out and report its insets before the run, so the rig frames the live band.)
    await new Promise((r) => setTimeout(r, 1500));
    g.lead();
    g.debugStep(1.1 + pre);
    await new Promise((r) => setTimeout(r, 300));
  },
  { name: NAME, sections: SECTIONS ? SECTIONS.split(',') : null, at: AT, pre: PRE, from: FROM },
);

console.log(`ready in ${((Date.now() - T0) / 1000).toFixed(0)} s`);
const T1 = Date.now();
const N = Math.round(SECS * FPS);
const rows = [];
let shot = 0;
const sheetAt = new Map();
for (let i = 0; i < 12; i++) sheetAt.set(Math.round((i * (N - 1)) / 11), i);
const drawnF = [];
for (let f = 0; f < N; f++) {
  const draw = SHEET_ONLY ? sheetAt.has(f) : f % EVERY === 0;
  const r = await page.evaluate(
    ({ fps, draw }) => {
      const g = window.__game;
      g.virtualNow += 1000 / fps;
      g.frame(1 / fps, draw);
      const cam = g.rig.camera;
      cam.updateMatrixWorld();
      const V = cam.position.constructor;
      const p = cam.getWorldPosition(new V());
      const q = cam.getWorldQuaternion(cam.quaternion.clone());
      const b = (n) => g.runner.body.getObjectByName(n);
      const ndc = (n) => {
        const o = b(n);
        if (!o) return null;
        const v = o.getWorldPosition(new V()).project(cam);
        return [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
      };
      // The horizon: a point far out along the lens's level heading, at the lens's height.
      const fw = cam.getWorldDirection(new V()).setY(0).normalize();
      const hz = p.clone().addScaledVector(fw, 2000).project(cam);
      const rp = g.runner.root.position;
      const sec = g.track.sectionAt?.(g.s);
      return {
        p: [p.x, p.y, p.z],
        q: [q.x, q.y, q.z, q.w],
        fov: +cam.fov.toFixed(2),
        mult: +g.live.mult.toFixed(3),
        drive: +g.rig.drive.toFixed(3),
        speed: +(g.speed ?? 0).toFixed(3),
        dist: +p.distanceTo(new V(rp.x, rp.y + 1, rp.z)).toFixed(3),
        head: ndc('head'),
        hips: ndc('hips'),
        footL: ndc('footL'),
        footR: ndc('footR'),
        horizon: +hz.y.toFixed(4),
        sec: sec?.type ?? '?',
        stage: g.stage,
        clip: g.runner.current ?? '',
      };
    },
    { fps: FPS, draw },
  );
  rows.push(r);
  if (draw) {
    await page.screenshot({ path: `${FR}/${String(shot).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 90, timeout: 900000 });
    drawnF.push(f);
    shot++;
  }
  if (f % 30 === 0) process.stdout.write(`  ${NAME} f${f}/${N} ${r.mult}x ${r.sec}\r`);
}
console.log(`\nfilmed in ${((Date.now() - T1) / 1000).toFixed(0)} s`);
await browser.close();

// ------------------------------------------------------------------ measurements
const ang = (a, b) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
};
// Per 30 fps frame, whatever the film's rate (the limits are per 30 fps frame).
const k = FPS / 30;
let jerk = 0, omega = 0, snap = 0, roll = 0;
let wPrev = null;
for (let f = 2; f < rows.length; f++) {
  const [a, b, d] = [rows[f].p, rows[f - 1].p, rows[f - 2].p];
  jerk = Math.max(jerk, Math.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]) * k * k);
  const w = ang(rows[f].q, rows[f - 1].q) * k;
  if (wPrev !== null) snap = Math.max(snap, Math.abs(w - wPrev) * k);
  wPrev = w;
  omega = Math.max(omega, w);
}
for (const r of rows) {
  const [x, y, z, w] = r.q;
  roll = Math.max(roll, Math.abs((Math.asin(Math.max(-1, Math.min(1, 2 * (x * y + w * z)))) * 180) / Math.PI));
}
const stat = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x));
  const m = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length));
  return { mean: +m.toFixed(3), sd: +sd.toFixed(3), min: +Math.min(...v).toFixed(3), max: +Math.max(...v).toFixed(3) };
};
const height = rows.map((r) => (r.head && r.footL && r.footR ? (r.head[1] - Math.min(r.footL[1], r.footR[1])) / 2 : NaN));
const summary = {
  name: NAME,
  world: W,
  view: VIEW,
  q: Q,
  size: `${VW}x${VH}`,
  mult: [rows[0].mult, rows[rows.length - 1].mult],
  sections: [...new Set(rows.map((r) => r.sec))],
  camera: { jerkCm: +(jerk * 100).toFixed(1), omegaDeg: +omega.toFixed(2), snapDeg: +snap.toFixed(2), rollDeg: +roll.toFixed(2) },
  fov: stat(rows.map((r) => r.fov)),
  dist: stat(rows.map((r) => r.dist)),
  hipsX: stat(rows.map((r) => r.hips?.[0])),
  hipsY: stat(rows.map((r) => r.hips?.[1])),
  heightFrac: stat(height),
  horizon: stat(rows.map((r) => r.horizon)),
  errors,
};
writeFileSync(`${OUT}/${NAME}.json`, JSON.stringify({ summary, rows }, null, 0));
console.log(`\n${JSON.stringify(summary)}`);

// ------------------------------------------------------------------ film and sheet
const rate = FPS / EVERY;
if (!SHEET_ONLY) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(rate), '-i', `${FR}/%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', `${OUT}/${NAME}.mp4`]);
{
  const tiles = 12;
  const cols = VIEW === 'phone' ? 6 : 4;
  const tw = VIEW === 'phone' ? 260 : 480;
  const th = Math.round((tw * VH) / VW);
  const out = [];
  for (let i = 0; i < tiles; i++) {
    const si = Math.min(shot - 1, Math.round((i * (shot - 1)) / (tiles - 1)));
    const f = drawnF[si];
    const r = rows[f];
    const img = await sharp(`${FR}/${String(si).padStart(4, '0')}.jpg`).resize(tw, th).toBuffer();
    const label = `f${f} ${r.mult.toFixed(2)}x ${r.sec} fov ${r.fov.toFixed(0)}`;
    const svg = Buffer.from(`<svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg"><text x="6" y="${th - 8}" font-family="monospace" font-size="13" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${label}</text></svg>`);
    out.push({ input: await sharp(img).composite([{ input: svg }]).png().toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th });
  }
  await sharp({ create: { width: tw * cols, height: th * Math.ceil(tiles / cols), channels: 3, background: '#000' } })
    .composite(out)
    .jpeg({ quality: 88 })
    .toFile(`${OUT}/${NAME}-sheet.jpg`);
}
if (!KEEP) rmSync(FR, { recursive: true, force: true });
console.log(`wrote ${OUT}/${NAME}.mp4, ${OUT}/${NAME}-sheet.jpg, ${OUT}/${NAME}.json`);
