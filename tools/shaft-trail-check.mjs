// Shaft-trail regression check (clarity round 14). A small hot speck (a mote: additive, no depth write)
// over the sky or a one-pixel gap in the leaves was marched by the sun shafts into one scaled copy per
// tap, away from the sun: a trail of growing pale rectangles. This pitches the lens into open sky, aims the sun into the frame, places
// tiny hot sprites down-left of it, and measures the light the shafts add because of the sprites:
//   trail = (sprites - none, shafts on) - (sprites - none, shafts off)
// Fails if more than --max pixels (default 200; the raw source gives ~1300) gain more than 6 levels
// (summed over RGB). The same frame is also measured with the raw source (shafts' clean = 0).
//   URL=http://localhost:5180 node tools/shaft-trail-check.mjs [--q "q=high&adv=12&t=8&w=7&look=morning"] [--out prefix]
import { chromium } from 'playwright-core';
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const Q = arg('q', 'q=high&adv=12&t=8&w=7&look=morning');
const MAX = +arg('max', 200);
const out = arg('out', '');
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await page.goto(`${URL}/?qa&${Q}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
const st = await page.evaluate(() => {
  const qs = new URLSearchParams(location.search);
  const g = window.__game;
  g.paused = true;
  document.querySelector('#app')?.style.setProperty('visibility', 'hidden');
  const now = Date.now, rnd = Math.random;
  Date.now = () => +(qs.get('w') ?? 19);
  Math.random = () => 0.5;
  g.track.lookIndex = -1;
  g.track.themeIndex = -1;
  g.track.styleIndex = -1;
  g.newWorld('setup');
  Date.now = now;
  Math.random = rnd;
  for (let k = 0; k < 8 && g.track.look.name !== (qs.get('look') ?? 'golden'); k++) g.track.lookIndex = (g.track.lookIndex + 1) % 4;
  g.applyLook();
  g.debugStep(0.5);
  const start = g.virtualNow + 1100;
  g.elapsed = () => g.virtualNow - start;
  g.lead();
  g.debugStep(+(qs.get('t') ?? 3));
  g.debugAdvance(+(qs.get('adv') ?? 40));
  g.debugStep(0.5);
  // Open sky whatever the world: the lens pitched up (after the rig has placed it) and the sun aimed
  // into the upper right of that view, so every probe sprite sits over the sky near the sun.
  const PITCH = 0.55;
  const cam0 = g.rig.camera ?? g.camera;
  cam0.rotateX(PITCH);
  cam0.updateMatrixWorld();
  const f = cam0.getWorldDirection(g.sunBase.clone());
  const up = f.clone().set(0, 1, 0);
  const right = f.clone().cross(up).normalize();
  const camUp = right.clone().cross(f).normalize();
  const d = f.clone().addScaledVector(right, 0.3).addScaledVector(camUp, 0.12).normalize();
  g.sunBase.copy(d.applyAxisAngle(up, -g.skyYaw));
  g.debugStep(0.1);
  cam0.rotateX(PITCH);
  cam0.updateMatrixWorld();
  g.post.render(1 / 30);
  const sp = g.post.shafts?.uniforms.get('sunPos').value;
  const su = sp ? [sp.x * 2 - 1, sp.y * 2 - 1] : [0.5, 0.7];
  // Mote-like sprites: clones of the sun disc shader, tiny, facing the lens, 6 m out.
  const cam = g.rig.camera ?? g.camera;
  const D = g.sunDisc;
  const sprites = [];
  const ndcs = [[-0.25, -0.1], [-0.4, -0.35], [-0.6, -0.2], [-0.15, -0.45], [-0.8, -0.6], [-0.3, 0.05], [0.1, -0.3]].map(([dx, dy]) => [su[0] + dx, su[1] + dy]);
  for (const [x, y] of ndcs) {
    const m = new D.constructor(D.geometry, D.material);
    const p = D.position.clone().set(x, y, 0.5).unproject(cam);
    const dir = p.sub(cam.position).normalize();
    m.position.copy(cam.position).addScaledVector(dir, 6);
    m.quaternion.copy(cam.quaternion);
    m.scale.setScalar(0.0012);
    m.name = 'probeMote';
    D.parent.add(m);
    sprites.push(m);
  }
  window.__probe = sprites;
  g.post.render(1 / 30);
  const s = g.post.shafts?.uniforms.get('sunPos').value;
  return { sun: s && [+s.x.toFixed(2), +s.y.toFixed(2)], theme: g.track.theme };
});
console.log('STATE', JSON.stringify(st));
const shots = {};
const snap = async (k) => {
  shots[k] = await page.screenshot({ timeout: 900000 });
  if (out) (await import('node:fs')).writeFileSync(`${out}-${k}.png`, shots[k]);
};
const shafts = (on) =>
  page.evaluate((on) => {
    const g = window.__game;
    g.post.__upd ??= g.post.updateSun.bind(g.post);
    g.post.updateSun = () => {
      g.post.__upd();
      if (!on) g.post.shafts.uniforms.get('strength').value = 0;
    };
  }, on);
const show = (v) => page.evaluate((v) => { window.__probe.forEach((m) => (m.visible = v)); window.__game.post.render(1 / 30); }, v);
const setClean = (v) => page.evaluate((v) => { window.__game.post.shafts.uniforms.get('clean').value = v; }, v);
const metric = (keys) =>
  page.evaluate(async (b64) => {
    const px = async (s) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const c = cv.getContext('2d');
      c.drawImage(img, 0, 0);
      return c.getImageData(0, 0, cv.width, cv.height).data;
    };
    const [m, p, mn, pn] = await Promise.all(b64.map(px));
    let n = 0, e = 0, light = 0;
    for (let i = 0; i < m.length; i += 4) {
      let s = 0;
      for (let k = 0; k < 3; k++) {
        s += Math.max(0, m[i + k] - p[i + k] - (mn[i + k] - pn[i + k]));
        light += Math.max(0, p[i + k] - pn[i + k]);
      }
      e += s;
      if (s > 6) n++;
    }
    return { n, e, light: light / (m.length / 4) };
  }, keys.map((k) => shots[k].toString('base64')));
// The same frame twice: the shipped source (clean) and the raw one (the old trails, to prove the
// setup still provokes them).
await shafts(false);
await show(true);
await snap('motes-noshafts');
await show(false);
await snap('plain-noshafts');
await shafts(true);
const res = {};
for (const cl of [1, 0]) {
  await setClean(cl);
  await show(true);
  await snap(`motes-c${cl}`);
  await show(false);
  await snap(`plain-c${cl}`);
  res[cl] = await metric([`motes-c${cl}`, `plain-c${cl}`, 'motes-noshafts', 'plain-noshafts']);
}
const r = res[1];
await browser.close();
const inFrame = st.sun && st.sun.every((v) => v > 0 && v < 1);
// The raw source must still provoke trails here, or the setup no longer tests anything.
const provoked = res[0].n > 3 * MAX;
const bad = !inFrame || !provoked || r.n > MAX;
console.log(`${bad ? 'FAIL' : 'ok  '} shaft trails: ${r.n} px brighter by > 6 (max ${MAX}), energy ${r.e}; raw source ${res[0].n} px, energy ${res[0].e}; shaft light ${r.light.toFixed(2)} (raw ${res[0].light.toFixed(2)}); sun ${JSON.stringify(st.sun)}`);
process.exit(bad ? 1 : 0);
