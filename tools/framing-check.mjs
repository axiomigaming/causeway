// Hero framing check: builds N setup worlds (and optionally runs a few seconds into each) on a phone
// and a desktop viewport and asserts the runner is whole inside the band the interface leaves free
// and that no solid geometry stands between the lens and him (Game.debugFraming raycasts the scene).
//
//   URL=http://localhost:5180 node tools/framing-check.mjs [--n 20] [--q medium] [--run 0]
//
// Round 18: also the title fly-over (sampled every 2.3 s) and the 50x+ escape (win_slide), whose
// figure is measured from the skeleton (head, hips, feet), not the root.
//
// Round 20 (motion critic): the camera's own motion, frame by frame at 30 fps, through real cash-outs
// (~1.5x, 5x, 20x, 60x) and crashes (each kind): no position jerk over 0.25 m/frame², no turn faster
// than 12°/frame, no change of turn rate over 6°/frame² (the limits of tools/motion-audit.mjs). The
// shot springs are critically damped and the output is jerk-limited (CameraRig.smoothOut), so a swap
// of shot or subject blends. `--motion 0` skips it; `--motion only` runs only it.
//
// Exits 1 if any frame fails. Headless Chromium (SwiftShader); time is stepped (Game.debugStep), so the
// result does not depend on the frame rate.
import { chromium } from 'playwright-core';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const n = +arg('n', 20);
const q = arg('q', 'medium');
const run = +arg('run', 0);
const motion = arg('motion', '1');
const CAM = { jerk: 0.25, omega: 12, snap: 6 };
// --cases 'cash 60x,crash ledge' runs only those; --views desktop only that viewport; --shake 0 measures the
// shot without the impact shake (to tell the two apart).
const only = arg('cases', '')
  .split(',')
  .filter(Boolean);
const views = arg('views', '');
const shake = arg('shake', '1') !== '0';
// --seeds 0,1,2: other worlds for the same case; --stills <dir> --at 40,80,200: frames drawn and saved.
const seeds = arg('seeds', '0').split(',').map(Number);
const stills = arg('stills', '');
const stillAt = arg('at', '45,75,205').split(',').map(Number);
const VIEWS = [
  { name: 'phone', w: 390, h: 844, mobile: true },
  { name: 'desktop', w: 1280, h: 720, mobile: false },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = 0;
for (const v of VIEWS.filter((x) => !views || views.split(',').includes(x.name))) {
  const page = await browser.newPage({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile });
  await page.goto(`${URL}/?qa&q=${q}&seed=framing`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  if (motion !== '0') failed += await cameraMotion(page, v.name);
  if (motion === 'only') {
    await page.close();
    continue;
  }
  // Round 18: the title fly-over as loaded (its own interface, before Enter), every 2.3 s of its
  // 46 s period: the whole figure on screen, the boots clear of the footer.
  const title = await page.evaluate(() => {
    const g = window.__game;
    g.paused = true;
    const out = [];
    for (let t = 0; t < 46; t += 2.3) {
      g.debugStep(2.3);
      out.push({ stage: `title@${t.toFixed(1)}`, f: g.debugFraming(), title: true });
    }
    return out;
  });
  await page.evaluate(async () => {
    const g = window.__game;
    g.paused = true;
    window.__ctl.enter();
    await new Promise((r) => setTimeout(r, 1500));
    g.debugStep(1);
  });
  for (let w = 1; w <= n; w++) {
    const r = await page.evaluate(
      ({ w, run }) => {
        const g = window.__game;
        const now = Date.now,
          rnd = Math.random;
        Date.now = () => w * 7919;
        Math.random = () => ((w * 0.618) % 1) * 0.98;
        // From the title (anywhere in its fly-over) to the setup, as the player sees it: one second
        // after entering, and settled. Then a fresh world after a round (newWorld('setup')).
        g.newWorld('title');
        Date.now = now;
        Math.random = rnd;
        g.debugStep(2 + ((w * 5.3) % 40));
        g.toSetup();
        g.debugStep(1);
        const out = { 'setup+1s': g.debugFraming() };
        g.debugStep(2);
        out.setup = g.debugFraming();
        Date.now = () => w * 7919 + 1;
        Math.random = () => ((w * 0.377) % 1) * 0.98;
        g.newWorld('setup');
        Date.now = now;
        Math.random = rnd;
        g.debugStep(1);
        out.again = g.debugFraming();
        if (run > 0) {
          const start = g.virtualNow + 1100;
          g.elapsed = () => g.virtualNow - start;
          g.lead();
          g.debugStep(1.1 + run);
          out.run = g.debugFraming();
          g.elapsed = () => null;
        }
        return out;
      },
      { w, run },
    );
    for (const [stage, f] of Object.entries(r)) {
      const [lo, hi] = f.band;
      const xs = f.ndc.map((p) => p[0]);
      const ys = f.ndc.map((p) => p[1]);
      const problems = [];
      if (Math.min(...xs) < -0.92 || Math.max(...xs) > 0.92) problems.push('off the side');
      if (Math.min(...ys) < lo - 0.01) problems.push(`boots below the dock (${Math.min(...ys).toFixed(2)} < ${lo})`);
      if (Math.max(...ys) > hi + 0.01) problems.push(`head above the band (${Math.max(...ys).toFixed(2)} > ${hi})`);
      if (f.solid > 1) problems.push(`occluded (${f.solid}/5 sight lines: ${f.hits.join(', ')})`);
      const ok = problems.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${v.name} world ${String(w).padStart(2)} ${stage.padEnd(8)} feet ${f.ndc[0].join(',')} head ${f.ndc[4].join(',')} band ${lo}..${hi} solid ${f.solid} leaf ${f.leaf}${ok ? '' : '  ← ' + problems.join('; ')}`);
    }
  }
  // Round 18: the title fly-over (its high pass had him just under the bottom edge) and the 50x+
  // escape (win_slide carries him metres off the root, then turns): the figure itself — head, hips,
  // feet from the skeleton — must stay in the frame throughout.
  const extra = await page.evaluate(() => {
    const g = window.__game;
    const out = [];
    const now = Date.now;
    for (const id of ['slide-0', 'slide-2', 'slide-9']) {
      Date.now = () => 7000 + id.length * 31 + +id.split('-')[1];
      g.newWorld('setup');
      Date.now = now;
      g.debugStep(1);
      const start = g.virtualNow + 1100 - 66000;
      g.elapsed = () => g.virtualNow - start;
      g.lead();
      g.debugStep(2.6);
      g.cashout(id);
      g.elapsed = () => null;
      let sawSlide = false;
      for (let t = 0; t < 5; t += 0.15) {
        g.debugStep(0.15);
        if (g.runner.anim === 'win_slide') sawSlide = true;
        if (t > 0.6) out.push({ stage: `${id}@${t.toFixed(2)}${g.runner.anim === 'win_slide' ? ' slide' : ''}`, f: g.debugFraming(), body: true });
      }
      if (!sawSlide) out.push({ stage: `${id} (no win_slide)`, f: null });
    }
    return out;
  });
  for (const { stage, f, body, title: isTitle } of [...title, ...extra]) {
    if (!f) {
      failed++;
      console.log(`FAIL ${v.name} ${stage}`);
      continue;
    }
    const [lo, hi] = f.band;
    const pts = body ? f.body : [...f.ndc, ...f.body];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const problems = [];
    if (Math.min(...xs) < -0.95 || Math.max(...xs) > 0.95) problems.push('off the side');
    if (isTitle) {
      if (Math.min(...ys) < -0.9) problems.push(`boots on the footer (${Math.min(...ys).toFixed(2)})`);
      if (Math.max(...ys) > 0.97) problems.push('off the top');
    } else if (body) {
      if (Math.min(...ys) < -0.97 || Math.max(...ys) > 0.97) problems.push('off the top/bottom');
    } else {
      if (Math.min(...ys) < lo - 0.03) problems.push(`below the band (${Math.min(...ys).toFixed(2)} < ${lo})`);
      if (Math.max(...ys) > hi + 0.03) problems.push(`above the band (${Math.max(...ys).toFixed(2)} > ${hi})`);
    }
    if (pts.some((p) => p[2] !== undefined && p[2] > 1)) problems.push('behind the lens');
    const ok = problems.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${v.name} ${stage.padEnd(22)} head ${(f.body[0] ?? []).slice(0, 2).join(',')} hips ${(f.body[1] ?? []).slice(0, 2).join(',')} feet ${(f.body[2] ?? []).slice(0, 2).join(',')} ${(f.body[3] ?? []).slice(0, 2).join(',')} band ${lo}..${hi}${ok ? '' : '  ← ' + problems.join('; ')}`);
  }
  await page.close();
}
await browser.close();

/** Round 20: the per-frame camera jerk limit through cash-outs and crashes. Returns the failures. */
async function cameraMotion(page, view) {
  const cases = [
    ...[1.5, 5, 20, 60].map((m) => ({ name: `cash ${m}x`, mult: m })),
    ...['chasm', 'gate', 'rockfall', 'pillar', 'trip', 'ledge'].map((k) => ({ name: `crash ${k}`, mult: 2.2, kind: k, variant: 0 })),
    { name: 'crash rockfall2', mult: 2.2, kind: 'rockfall', variant: 2 },
  ];
  let bad = 0;
  for (const c0 of cases.filter((x) => !only.length || only.includes(x.name))) for (const seed of seeds) {
    const c = { ...c0, name: c0.name };
    await page.evaluate(
      ({ c, shake, seed }) => {
        const g = window.__game;
        g.paused = true;
        g.rig.shakeEnabled = shake;
        const now = Date.now;
        Date.now = () => 4242 + c.name.length * 97 + seed * 1013;
        const rnd = Math.random;
        if (seed) Math.random = () => ((seed * 0.618 + c.name.length * 0.1) % 1) * 0.98;
        g.newWorld('setup');
        Date.now = now;
        Math.random = rnd;
        g.debugStep(1);
        // The round clock: m = e^(0.000063 t); cash out (or crash) 2.6 s into the run at c.mult.
        const E = Math.log(c.mult) / 0.000063;
        g.lead();
        const start = g.virtualNow + 2600 - E;
        g.elapsed = () => g.virtualNow - start;
        g.debugStep(2.6);
        if (c.kind) g.crash(Math.round(c.mult * 100), `framing-${c.kind}`, c.kind, c.variant);
        else {
          g.live.mult = Math.floor(g.live.mult * 100) / 100;
          g.cashout(`framing-cash-${c.mult}`);
        }
        g.elapsed = () => null;
        const cam = g.rig.camera;
        const P = [];
        const Q = [];
        const L = [];
        const O = [];
        const D = [];
        const G = [];
        // When the falling pier or drum first strikes the floor (frames from the crash call), and
        // how its long axis lies at the end (degrees off level).
        const colHits = [];
        const onImp = g.debris.onImpact;
        g.debris.onImpact = (e) => {
          if (e.tag === 'column') colHits.push(`f${fNow}@${e.speed.toFixed(1)}`);
          return onImp(e);
        };
        // Hard cuts the rig takes (the safe shot, a snap): logged by frame.
        const cuts = [];
        let fNow = -1;
        for (const k of ['safeShot', 'snap']) {
          const orig = g.rig[k].bind(g.rig);
          g.rig[k] = (...a) => {
            cuts.push(`${k}@f${fNow}`);
            return orig(...a);
          };
        }
        let revealAt = -1;
        let revealSpeed = 0;
        // The figure in the frame (head, hips, hands, feet), projected without the view offset's band.
        const B = [];
        const bones = ['head', 'hips', 'handL', 'handR', 'footL', 'footR'].map((n) => g.runner.body.getObjectByName(n)).filter(Boolean);
        // Kept on the page: the run is stepped in chunks so stills can be taken on the way.
        const pier = () => (g.debris.bodies ?? []).find((b) => b.tag === 'column');
        const C = [];
        const H = [];
        const T = [];
        // World round 23 releases a section's paving once it lies 50 m behind him: any of those
        // sections' path in the frame (occlusion ignored, so conservative) is bare ground on screen.
        const gone = [];
        window.__fc = { gone, g, cam, P, Q, L, O, D, G, H, T, B, C, bones, cuts, colHits, onImp, pier, f: 0, revealAt: -1, revealSpeed: 0, setF: (v) => (fNow = v) };
      },
      { c, shake, seed },
    );
    const shotsAt = stills ? stillAt.filter((x) => x < 210) : [];
    for (const until of [...shotsAt, 210]) {
      await page.evaluate(
        ({ until }) => {
          const S = window.__fc;
          const { g, cam, P, Q, L, O, D, G, H, T, B, C, bones, pier } = S;
          for (; S.f < until; S.f++) {
            const f = S.f;
            g.virtualNow += 1000 / 30;
            // (Drawn only on a still's frame: the camera and the bodies are all this measures.)
            g.frame(1 / 30, f === until - 1 && until < 210);
            cam.updateMatrixWorld();
            const p = cam.getWorldPosition(cam.position.clone());
            const q = cam.getWorldQuaternion(cam.quaternion.clone());
            P.push([p.x, p.y, p.z]);
            Q.push([q.x, q.y, q.z, q.w]);
            L.push(`${g.stage}/${g.runner.current ?? g.runner.anim}`);
            if (f % 3 === 0) {
              let n = 0;
              for (const sec of g.track.sections) {
                if (!sec.tilesGone) continue;
                for (let ds = 0; ds <= sec.len; ds += 4) {
                  const v = g.track.path.sample(sec.s0 + ds).pos.clone().project(cam);
                  if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) n++;
                }
              }
              if (n) S.gone.push(`f${f}:${n}`);
              const fr = g.debugFraming();
              O.push([f, fr.solid, (fr.hits ?? []).slice(0, 2).join('|')]);
            }
            G.push(g.runner.root.position.toArray());
            H.push(bones[1].getWorldPosition(cam.position.clone()).sub(g.runner.root.position).toArray());
            T.push(+g.timeScale.toFixed(3));
            S.setF(f + 1);
            if (S.revealAt < 0 && g.rig.revealed) (S.revealAt = f), (S.revealSpeed = g.speed);
            D.push(cam.getWorldPosition(cam.position.clone()).distanceTo(bones[1].getWorldPosition(cam.position.clone())));
            B.push(
              bones.map((b) => {
                const v = b.getWorldPosition(cam.position.clone()).project(cam);
                return [v.x, v.y, v.z];
              }),
            );
            // The pier (or drum): its long axis off level (°), and how high its two ends' axis
            // points sit over the floor under him (m).
            const pb = pier();
            if (pb) {
              const m = pb.mesh;
              m.updateMatrixWorld();
              const geo = m.geometry;
              if (!geo.boundingBox) geo.computeBoundingBox();
              const bb = geo.boundingBox;
              const a = new cam.position.constructor(0, bb.min.y, 0).applyMatrix4(m.matrixWorld);
              const b = new cam.position.constructor(0, bb.max.y, 0).applyMatrix4(m.matrixWorld);
              const len = a.distanceTo(b) || 1;
              const tilt = (Math.asin(Math.min(1, Math.abs(b.y - a.y) / len)) * 180) / Math.PI;
              const fy = g.runner.root.position.y;
              const rad = (Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2) * new cam.position.constructor().setFromMatrixScale(m.matrixWorld).x;
              // His chest's horizontal gap to the pier's surface (distance to its axis less its radius).
              const chest = bones[0].getWorldPosition(cam.position.clone()).lerp(bones[1].getWorldPosition(cam.position.clone()), 0.4);
              const ab = b.clone().sub(a).setY(0);
              const ap = chest.clone().sub(a).setY(0);
              const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-6, ab.lengthSq())));
              const gap = ap.clone().sub(ab.clone().multiplyScalar(t)).length() - rad;
              C.push([f, tilt, a.y - fy, b.y - fy, rad, gap]);
            }
          }
        },
        { until },
      );
      if (until < 210) {
        const file = `${stills}/${view}-${c.name.replace(/\W+/g, '_')}-s${seed}-f${until - 1}.png`;
        // (The scene only: the interface hidden, as the films' frames are judged.)
        await page.evaluate(() => document.getElementById('app') && (document.getElementById('app').style.visibility = 'hidden'));
        await page.screenshot({ path: file, timeout: 900000 });
        await page.evaluate(() => document.getElementById('app') && (document.getElementById('app').style.visibility = 'visible'));
        console.log(`still ${file}`);
      }
    }
    const r = await page.evaluate(
      () => {
        const S = window.__fc;
        const { g, cam, P, Q, L, B, O, D, G, H, T, C, cuts, colHits, onImp, gone } = S;
        const { revealAt, revealSpeed } = S;
        const hp = g.runner.body.getObjectByName('hips').getWorldPosition(cam.position.clone());
        const cp = cam.getWorldPosition(cam.position.clone());
        const dbg = { d: +cp.distanceTo(hp).toFixed(2), dy: +(cp.y - hp.y).toFixed(2), revealK: +g.rig.revealK.toFixed(2), closeK: +(g.rig.closeK ?? 0).toFixed(2), gap: +(g.rig.gap ?? 0).toFixed(2), fov: +cam.fov.toFixed(1), guard: +(g.guardK ?? 0).toFixed(2) };
        for (const k of ['safeShot', 'snap']) delete g.rig[k];
        g.debris.onImpact = onImp;
        return { gone, P, Q, L, B, O, D, G, H, T, C, cuts, colHits, revealAt, revealSpeed, dbg, kind: g.debugState?.crashKind ?? null };
      },
    );
    const ang = (a, b) => {
      const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
      return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
    };
    let worst = { jerk: 0, omega: 0, snap: 0 };
    const at = { jerk: 0, omega: 0, snap: 0 };
    let wPrev = null;
    for (let f = 2; f < r.P.length; f++) {
      const [a, b, d] = [r.P[f], r.P[f - 1], r.P[f - 2]];
      const j = Math.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]);
      const w = ang(r.Q[f], r.Q[f - 1]);
      const sn = wPrev === null ? 0 : Math.abs(w - wPrev);
      wPrev = w;
      if (j > worst.jerk) [worst.jerk, at.jerk] = [j, f];
      if (w > worst.omega) [worst.omega, at.omega] = [w, f];
      if (sn > worst.snap) [worst.snap, at.snap] = [sn, f];
    }
    const problems = [];
    // Round 20 (coordinator): no Dutch angle: the horizon's roll stays within 4° (shake included).
    let roll = 0;
    let rollAt = 0;
    r.Q.forEach(([x, y, z, w], f) => {
      // The lens's right vector (1,0,0) rotated by q: its height is sin(roll).
      const ry = 2 * (x * y + w * z);
      const d = (Math.asin(Math.max(-1, Math.min(1, ry))) * 180) / Math.PI;
      if (Math.abs(d) > Math.abs(roll)) [roll, rollAt] = [d, f];
    });
    if (Math.abs(roll) > 4) problems.push(`horizon rolled ${roll.toFixed(1)}° at f${rollAt}`);
    // Round 20 (motion critic): the figure stays in the frame through the fall and the aftermath
    // (not the chasm or the gate: he goes under), and ends at least ~1/5 of the frame tall/long.
    const clipped = [];
    r.B.forEach((pts, f) => {
      const vis = pts.filter((p) => p[2] < 1);
      if (vis.some((p) => Math.abs(p[0]) > 0.98 || Math.abs(p[1]) > 0.98)) clipped.push(f);
    });
    const endPts = r.B[r.B.length - 1].filter((p) => p[2] < 1);
    const ext = endPts.length ? Math.max(Math.max(...endPts.map((p) => p[0])) - Math.min(...endPts.map((p) => p[0])), Math.max(...endPts.map((p) => p[1])) - Math.min(...endPts.map((p) => p[1]))) / 2 : 0;
    const under = c.kind === 'chasm' || c.kind === 'gate';
    if (!under && clipped.length) {
      const names = ['head', 'hips', 'handL', 'handR', 'footL', 'footR'];
      const p0 = r.B[clipped[0]];
      const at0 = p0.map((p, i) => (p[2] < 1 && (Math.abs(p[0]) > 0.98 || Math.abs(p[1]) > 0.98) ? `${names[i]} ${p[0].toFixed(2)},${p[1].toFixed(2)}` : null)).filter(Boolean);
      problems.push(`figure clipped in ${clipped.length} frames (f${clipped[0]}..f${clipped[clipped.length - 1]}: ${at0.join(' ')})`);
    }
    // Round 20 (coordinator): from the moment the clip starts, the lens goes straight in to the
    // close-in: no retreat (the lens coming back along the run by more than 0.3 m) on the way.
    if (c.kind === 'pillar' || c.kind === 'trip') {
      // The lens's travel along the run's direction (as the clip starts): how far it ever comes
      // back from the furthest point it reached.
      const f0 = r.L.findIndex((l) => l.includes('fall_'));
      let back = 0;
      if (f0 > 5) {
        const a0 = r.P[f0], b0 = r.P[f0 - 5];
        const len = Math.hypot(a0[0] - b0[0], a0[2] - b0[2]) || 1;
        const fx = (a0[0] - b0[0]) / len, fz = (a0[2] - b0[2]) / len;
        let hi = -Infinity;
        // (The slam throws him back off the pier after its impact, ~0.3 s in: following him back
        // then is not a retreat. The trip dives on.)
        const win = c.kind === 'pillar' ? 12 : 90;
        for (let f = f0; f < Math.min(r.P.length, f0 + win); f++) {
          const t = (r.P[f][0] - a0[0]) * fx + (r.P[f][2] - a0[2]) * fz;
          hi = Math.max(hi, t);
          back = Math.max(back, hi - t);
        }
      }
      if (back > 0.3) problems.push(`lens retreats ${back.toFixed(2)} m after the clip starts`);
      if (process.env.DEBUG) {
        // Lens-to-hips distance, and the lens's own travel along the run, every 5 frames from the clip.
        const ser = [];
        for (let f = Math.max(0, f0); f < Math.min(r.D.length, f0 + 75); f += 5) {
          const p = r.P[f], q = r.P[Math.max(0, f - 5)];
          ser.push(`${r.D[f].toFixed(1)}/${(Math.hypot(p[0] - q[0], p[2] - q[2]) * 6).toFixed(1)}`);
        }
        problems.push(`(retreat ${back.toFixed(2)} m; d/v ${ser.join(' ')})`);
      }
    }
    // Round 20 (character agent): the runner's ground (the root) never jumps: an eased stop, not a
    // uniform one (the motion audit's limit, 12 cm/frame²; here 10).
    let gj = 0;
    let gjAt = 0;
    for (let f = 2; f < r.G.length; f++) {
      const [a, b, d] = [r.G[f], r.G[f - 1], r.G[f - 2]];
      const j = Math.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]);
      if (j > gj) [gj, gjAt] = [j, f];
    }
    // The hips relative to the root (the critic's "hips jump"): the clip plus any time-scale step.
    let hj = 0;
    let hjAt = 0;
    for (let f = 2; f < r.H.length; f++) {
      const [a, b, d] = [r.H[f], r.H[f - 1], r.H[f - 2]];
      const j = Math.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]);
      if (j > hj) [hj, hjAt] = [j, f];
    }
    if (hj > 0.1) {
      // The hips' speed relative to the root around it (cm/frame), and the time scale.
      const sp = [];
      for (let f = Math.max(1, hjAt - 4); f <= Math.min(r.H.length - 1, hjAt + 3); f++) {
        const [a, b] = [r.H[f], r.H[f - 1]];
        sp.push(`${(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100).toFixed(0)}@${r.T[f]}`);
      }
      problems.push(`hips jump ${(hj * 100).toFixed(0)} cm/frame² at f${hjAt} (${r.L[hjAt]}; v@ts ${sp.join(' ')})`);
    }
    if (gj > 0.1) {
      // The root's step per frame around it (cm: along x/z, and y), to tell the run-out from a height step.
      const sp = [];
      for (let f = Math.max(1, gjAt - 4); f <= Math.min(r.G.length - 1, gjAt + 3); f++) {
        const [a, b] = [r.G[f], r.G[f - 1]];
        sp.push(`${(Math.hypot(a[0] - b[0], a[2] - b[2]) * 100).toFixed(1)}/${((a[1] - b[1]) * 100).toFixed(1)}`);
      }
      problems.push(`ground jumps ${(gj * 100).toFixed(0)} cm/frame² at f${gjAt} (${r.L[gjAt]}; xz/y ${sp.join(' ')})`);
    }
    // Round 20 (owner): the result card never lands before he has stopped.
    if (!c.kind && r.revealAt >= 0 && r.revealSpeed > 0.3) problems.push(`card at f${r.revealAt} while he runs at ${r.revealSpeed.toFixed(1)} m/s`);
    // Blocked: three or more of the five sight lines, on two samples running.
    // (Not by the rockfall's own falling stone: rocks crossing the view are its staging. A slab in
    // the lens anywhere else is a fault.)
    const solidBy = (i) => r.O[i] && r.O[i][1] >= 3 && !(c.kind === 'rockfall' && /^debris/.test(r.O[i][2]));
    const blocked = r.O.filter((_, i) => solidBy(i) && solidBy(i - 1)).map(([f]) => f);
    const what = r.O.find(([f]) => f === blocked[0])?.[2] ?? '';
    if (!under && blocked.length) problems.push(`lens blocked (f${blocked[0]}..f${blocked[blocked.length - 1]}, ${blocked.length} samples: ${what})`);
    if (!under && ext < 0.195) problems.push(`figure ${(ext * 100).toFixed(0)} % of the frame at the end`);
    if (worst.jerk > CAM.jerk) problems.push(`position jerk ${(worst.jerk * 100).toFixed(0)} cm/frame² at f${at.jerk}`);
    if (worst.omega > CAM.omega) problems.push(`fast turn ${worst.omega.toFixed(1)}°/frame at f${at.omega}`);
    if (worst.snap > CAM.snap) problems.push(`snap ${worst.snap.toFixed(1)}°/frame² at f${at.snap}`);
    if (r.cuts.length) problems.push(`hard cut ${r.cuts.join(' ')}`);
    if (r.gone.length) problems.push(`released paving in frame ${r.gone.slice(0, 6).join(' ')}`);
    // Round 20 (coordinator): the pier comes to rest on the floor, visibly: level, both ends
    // down (axis no higher than its radius + 0.2 m over the floor), and down before he meets it.
    if (r.C?.length && c.kind === 'pillar') {
      const [, tilt, ya, yb, rad] = r.C[r.C.length - 1];
      const flatAt = r.C.find(([, t]) => t < 12)?.[0] ?? -1;
      const clipAt = r.L.findIndex((l) => l.includes('fall_'));
      // The closest his chest comes to its surface in the clip's first 0.6 s (contact: under 0.15 m).
      const near = Math.min(...r.C.filter(([f]) => f >= clipAt && f <= clipAt + 18).map((x) => x[5]));
      const pierMsg = `pier ${tilt.toFixed(0)}° ends ${ya.toFixed(2)}/${yb.toFixed(2)} m r ${rad.toFixed(2)}, flat f${flatAt} clip f${clipAt}, chest gap ${near.toFixed(2)} m`;
      if (near > 0.15) problems.push(`no contact: his chest stops ${near.toFixed(2)} m short of the pier`);
      if (tilt > 10 || Math.max(ya, yb) > rad + 0.2 || Math.min(ya, yb) < rad - 0.3) problems.push(`pier not at rest on the floor (${pierMsg})`);
      else if (flatAt < 0 || flatAt > clipAt + 8) problems.push(`pier down late (${pierMsg})`);
      else if (process.env.DEBUG) problems.push(`(${pierMsg})`);
    }
    if (process.env.DEBUG && r.colHits?.length) problems.push(`(column hits ${r.colHits.slice(0, 4).join(' ')}; clip at f${r.L.findIndex((l) => l.includes('fall_'))})`);
    if (process.env.DEBUG) {
      const ch = [];
      r.L.forEach((l, f) => {
        if (f === 0 || l !== r.L[f - 1]) ch.push(`f${f} ${l}`);
      });
      problems.push(`(${ch.join(', ')})`);
    }
    if (problems.length) {
      bad++;
      problems.push(`(${r.L[at.jerk]})`);
    }
    console.log(
      `${problems.length ? 'FAIL' : 'ok  '} ${view} camera ${(c.name + (seeds.length > 1 ? ` s${seed}` : '')).padEnd(15)} size ${(ext * 100).toFixed(0)}% roll ${roll.toFixed(1)}° card f${r.revealAt}${process.env.DEBUG ? ' ' + JSON.stringify(r.dbg) : ''}${c.kind && r.kind !== c.kind ? ` (staged ${r.kind})` : ''} jerk ${(worst.jerk * 100).toFixed(1)} cm/f² (f${at.jerk}) turn ${worst.omega.toFixed(1)}°/f (f${at.omega}) snap ${worst.snap.toFixed(1)}°/f² (f${at.snap})${problems.length ? '  ← ' + problems.join('; ') : ''}`,
    );
  }
  return bad;
}
console.log(failed ? `${failed} frame(s) failed` : 'all frames ok');
process.exit(failed ? 1 : 0);
