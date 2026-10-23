// Motion audit (clarity, round 15): films canonical sequences frame by frame (1280×720, 30 fps, time
// stepped) and checks the runner's motion and the camera against natural limits. For every frame it reads
// the skeleton (every bone's local rotation, key world positions), the runner's ground and heading, and
// the camera, then flags:
//   joint      a joint outside its natural range (relative to the bind pose: swing and twist per joint;
//              knees and elbows as hinges: no reverse bend, little side bend or twist)
//   slide      a planted foot sliding over the ground (or sinking through it)
//   pop        a velocity discontinuity: a joint snapping (angular velocity spike), the hips or a hand,
//              foot or head jumping relative to the body, or the runner's ground position jumping
//   frozen     airborne frames with (almost) no limb motion — a held pose in mid-air; or a statue: the
//              whole body still while the runner travels
//   framing    the runner (head, hips, hands, feet) leaving the frame or the safe band, or too small
//   camera     a camera angular-velocity spike or snap, or a position jerk
// Flagged frames are drawn and kept; a contact sheet per sequence and a report (markdown + JSON) go to
// --out. With --compare <old flags.json> it also writes the delta (new / gone flags by frame).
//
// The sequences drive the game the way the controller does (toSetup, lead, the round clock, cashout(id),
// crash(mult, id)), on the game's virtual clock: the demo round server runs on the wall clock in a
// worker, which software rendering cannot keep at 30 fps.
//
//   URL=http://localhost:5180 node tools/motion-audit.mjs [--seq start,log,...] [--out review/motion/base]
//       [--w 7] [--q high] [--shots 14] [--compare review/motion/old/flags.json]
//
// Sequences: start, log, beam (lintel slide), pillar (vault), blocks (slabs: leaps), corner,
// cash1.5, cash5, cash20, cash60, fall_start, chasm0, chasm1, gate0, gate1, rock0, rock1.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import sharp from 'sharp';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const URL = process.env.URL ?? 'http://localhost:5180';
const OUT = arg('out', 'review/motion/base');
const WORLD = arg('w', '7');
const Q = arg('q', 'high');
const MAX_SHOTS = +arg('shots', 14);
const COMPARE = arg('compare', '');
// --reanalyse: no filming; recompute the flags from the raw samples a previous run saved in --out.
const REANALYSE = process.argv.includes('--reanalyse');
const FPS = 30;
const W = 1280;
const H = 720;
mkdirSync(`${OUT}/frames`, { recursive: true });

// ------------------------------------------------------------------ sequences
const LEAD_MS = 1100;
/** Frames of run from the start of the run to a multiplier (the round clock: mult = e^(0.000063·ms)). */
const runFrames = (m) => Math.round((Math.log(m) / 0.000063 / 1000) * FPS);
const LEAD_F = Math.round((LEAD_MS / 1000) * FPS);
/** Each: events by frame, the measured window [from, to]. Lead is at frame 30 unless said otherwise. */
function seq(name) {
  const L = 30;
  const runAt = L + LEAD_F;
  if (name === 'start') return { name, events: [[45, 'lead']], from: 0, to: 45 + LEAD_F + 150 };
  if (['log', 'beam', 'pillar', 'blocks'].includes(name))
    return { name, events: [[L, 'lead'], [runAt + 90, `obstacle:${name}`]], from: runAt + 15, to: runAt + 300 };
  if (name === 'corner')
    return { name, sections: ['corridor', 'turnL', 'corridor', 'corridor', 'turnR', 'corridor', 'corridor'], events: [[L, 'lead']], from: runAt + 15, to: runAt + 300 };
  if (name.startsWith('cash')) {
    const m = Number(name.slice(4));
    const at = runAt + runFrames(m === 60 ? 62 : m);
    return { name, events: [[L, 'lead'], [at, 'cashout']], from: at - 90, to: at + 240 };
  }
  if (name === 'fall_start') return { name, events: [[L, 'lead'], [L + 15, 'crash:start']], from: L - 10, to: L + 240 };
  const m = /^(chasm|gate|rock)(\d)$/.exec(name);
  if (m) {
    const at = runAt + runFrames(3);
    return { name, events: [[L, 'lead'], [at, `crash:${m[1] === 'rock' ? 'rockfall' : m[1]}:${m[2]}`]], from: at - 60, to: at + 210 };
  }
  throw new Error(`unknown sequence ${name}`);
}
const ALL = ['start', 'log', 'beam', 'pillar', 'blocks', 'corner', 'cash1.5', 'cash5', 'cash20', 'cash60', 'fall_start', 'chasm0', 'chasm1', 'gate0', 'gate1', 'rock0', 'rock1'];
const SEQS = (arg('seq', '') || ALL.join(',')).split(',').filter(Boolean);

// ------------------------------------------------------------------ limits (degrees, from the bind pose)
// swing: the bone's direction leaving its bind direction; twist: about its own axis.
// hinge: flexion range [min, max] (negative = reverse bend), side: sideways bend.
const LIMITS = {
  spine: { swing: 45, twist: 40 },
  chest: { swing: 45, twist: 45 },
  neck: { swing: 50, twist: 60 },
  head: { swing: 55, twist: 70 },
  shoulderL: { swing: 40, twist: 45 },
  shoulderR: { swing: 40, twist: 45 },
  upper_armL: { swing: 178, twist: 110 },
  upper_armR: { swing: 178, twist: 110 },
  forearmL: { hinge: [-12, 160], side: 30, twist: 110 },
  forearmR: { hinge: [-12, 160], side: 30, twist: 110 },
  handL: { swing: 85, twist: 60 },
  handR: { swing: 85, twist: 60 },
  thighL: { swing: 135, twist: 55 },
  thighR: { swing: 135, twist: 55 },
  shinL: { hinge: [-10, 160], side: 20, twist: 35 },
  shinR: { hinge: [-10, 160], side: 20, twist: 35 },
  footL: { swing: 60, twist: 35 },
  footR: { swing: 60, twist: 35 },
  toeL: { swing: 70, twist: 30 },
  toeR: { swing: 70, twist: 30 },
};
const LIMB = ['thighL', 'thighR', 'shinL', 'shinR', 'upper_armL', 'upper_armR', 'forearmL', 'forearmR', 'footL', 'footR'];
const POP_JOINTS = Object.keys(LIMITS);
const KEYS = ['hips', 'head', 'handL', 'handR', 'footL', 'footR', 'toeL', 'toeR'];
const TH = {
  // A pop is a one-frame discontinuity: this frame's step is spike× both neighbours' and above a floor.
  // (A sprint's foot strike reaches ~35 cm/frame² and ~50°/frame every stride: acceleration alone
  // cannot tell a snap from a stride.)
  spike: 3,
  popOmega: 25, // °/frame floor for a joint snap
  // Judder: J = mean |ω_t − (ω_t−1 + ω_t+1)/2| / mean ω over the gait frames (a smooth cycle ≈ 0.1–0.2;
  // a curve that is not smooth at the key level, played at 3× in the gait, zig-zags frame to frame).
  judder: 0.35,
  flip: 90, // °/frame: a flip whatever the neighbours
  popStep: 0.04, // m/frame floor for a hand, foot or head jump (relative to the ground frame)
  hipsAccel: 0.1, // m/frame² of the hips relative to the ground frame
  groundAccel: 0.12, // the runner's ground position
  slide: 0.025, // m/frame horizontal, foot planted on both frames
  sink: 0.05, // m below the planted height
  plantH: 0.02, // m above the lowest height seen = planted (and still vertically: plantVy)
  plantVy: 0.01,
  airH: 0.1,
  frozenLimb: 1.2, // °/frame mean over the limbs
  frozenRun: 4, // frames
  statueBody: 0.4,
  statueRun: 6,
  camOmega: 12, // °/frame
  camSnap: 6, // °/frame² change of angular velocity
  camJerk: 0.25, // m/frame²
};

// ------------------------------------------------------------------ in-page helper
const HELPER = () => {
  const g = window.__game;
  const V = g.runner.root.position.constructor;
  const Q4 = g.runner.root.quaternion.constructor;
  const M4 = g.runner.root.matrixWorld.constructor;
  let skin = null;
  g.runner.body.traverse((o) => {
    if (o.isSkinnedMesh && !skin) skin = o;
  });
  const bones = skin.skeleton.bones;
  const names = bones.map((b) => b.name);
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  // Bind local rotations, from the skeleton's inverse bind matrices.
  const bindWorld = skin.skeleton.boneInverses.map((m) => new M4().copy(m).invert());
  const bindLocal = bones.map((b, i) => {
    const p = bones.indexOf(b.parent);
    const m = p >= 0 ? new M4().copy(bindWorld[p]).invert().multiply(bindWorld[i]) : bindWorld[i].clone();
    const pos = new V(), q = new Q4(), s = new V();
    m.decompose(pos, q, s);
    return q;
  });
  const r6 = (x) => Math.round(x * 1e5) / 1e5;
  const v3 = (v) => [r6(v.x), r6(v.y), r6(v.z)];
  const tmp = new V();
  const fwd = () => new V(0, 0, -1).applyQuaternion(g.runner.root.getWorldQuaternion(new Q4())).normalize();
  // Hinge direction, in the bind pose: +X flexes if it moves the foot back (knee) or the hand forward (elbow).
  function hingeSigns() {
    const saved = bones.map((b) => b.quaternion.clone());
    bones.forEach((b, i) => b.quaternion.copy(bindLocal[i]));
    g.runner.root.updateMatrixWorld(true);
    const f = fwd();
    const out = {};
    for (const [joint, end, want] of [['shinL', 'footL', -1], ['shinR', 'footR', -1], ['forearmL', 'handL', 1], ['forearmR', 'handR', 1]]) {
      const j = byName[joint];
      if (!j) continue;
      const p0 = byName[end].getWorldPosition(new V());
      const q0 = j.quaternion.clone();
      j.quaternion.multiply(new Q4().setFromAxisAngle(new V(1, 0, 0), 0.2));
      g.runner.root.updateMatrixWorld(true);
      const p1 = byName[end].getWorldPosition(new V());
      j.quaternion.copy(q0);
      g.runner.root.updateMatrixWorld(true);
      const d = p1.sub(p0).dot(f);
      out[joint] = Math.sign(d) === want ? 1 : -1;
    }
    bones.forEach((b, i) => b.quaternion.copy(saved[i]));
    g.runner.root.updateMatrixWorld(true);
    return out;
  }
  function sample(f) {
    g.runner.root.updateMatrixWorld(true);
    const cam = g.rig.camera;
    cam.updateMatrixWorld();
    const wp = {};
    for (const n of ['hips', 'head', 'handL', 'handR', 'footL', 'footR', 'toeL', 'toeR']) wp[n] = byName[n] ? v3(byName[n].getWorldPosition(tmp)) : null;
    const ndc = {};
    for (const n of ['head', 'hips', 'handL', 'handR', 'footL', 'footR']) {
      if (!byName[n]) continue;
      const p = byName[n].getWorldPosition(new V()).project(cam);
      ndc[n] = [r6(p.x), r6(p.y), r6(p.z)];
    }
    const r = g.rig;
    return {
      f,
      stage: g.stage,
      clip: g.runner.current,
      mult: r6(g.live.mult),
      speed: r6(g.speed ?? 0),
      grp: v3(g.runner.root.getWorldPosition(tmp)),
      fwd: v3(fwd()),
      q: bones.map((b) => [r6(b.quaternion.x), r6(b.quaternion.y), r6(b.quaternion.z), r6(b.quaternion.w)]),
      wp,
      cam: { p: v3(cam.getWorldPosition(tmp)), q: (() => { const q = cam.getWorldQuaternion(new Q4()); return [q.x, q.y, q.z, q.w].map(r6); })(), mode: r.mode },
      ndc,
      band: [r6(-1 + 2 * (r.insetBottom ?? 0)), r6(1 - 2 * (r.insetTop ?? 0))],
    };
  }
  window.__ma = {
    names,
    bindLocal: bindLocal.map((q) => [q.x, q.y, q.z, q.w]),
    hingeSigns,
    sample,
    step() {
      g.virtualNow += 1000 / 30;
      g.frame(1 / 30, false);
    },
    draw() {
      g.post.render(1 / 30);
    },
  };
  return { names, bindLocal: window.__ma.bindLocal };
};

// ------------------------------------------------------------------ metrics (node)
const D = 180 / Math.PI;
const quat = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
/** Swing (vector: x and z components of axis·angle, degrees) and twist (about local Y, degrees). */
function swingTwist(q) {
  if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
  const tw = new THREE.Quaternion(0, q.y, 0, q.w);
  const tl = tw.length();
  let twist = 0;
  if (tl > 1e-9) {
    tw.set(0, q.y / tl, 0, q.w / tl);
    twist = 2 * Math.atan2(tw.y, tw.w) * D;
    if (twist > 180) twist -= 360;
    if (twist < -180) twist += 360;
  } else tw.identity();
  const sw = q.clone().multiply(tw.clone().invert());
  if (sw.w < 0) sw.set(-sw.x, -sw.y, -sw.z, -sw.w);
  const ang = 2 * Math.acos(Math.min(1, sw.w)) * D;
  const s = Math.sqrt(Math.max(1e-12, 1 - sw.w * sw.w));
  return { swing: ang, sx: (sw.x / s) * ang, sz: (sw.z / s) * ang, twist };
}
const angle = (a, b) => {
  const d = Math.abs(a.dot(b));
  return 2 * Math.acos(Math.min(1, d)) * D;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const acc = (a, b, c) => len([a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1], a[2] - 2 * b[2] + c[2]]);

function analyse(name, frames, meta, signs) {
  const idx = Object.fromEntries(meta.names.map((n, i) => [n, i]));
  const bind = meta.bindLocal.map(quat);
  const flags = [];
  const flag = (f, type, what, value, detail) => flags.push({ seq: name, f: f.f, type, what, value: +value.toFixed(3), detail, stage: f.stage, clip: f.clip });
  // Planted height per foot: the lowest height above the ground seen (relative to the runner's ground).
  const footH = (f, n) => (f.wp[n] ? f.wp[n][1] - f.grp[1] : null);
  const low = {};
  for (const n of ['footL', 'footR']) low[n] = Math.min(...frames.map((f) => footH(f, n) ?? 9).filter((x) => x > -0.5));
  const rel = (f, n) => (f.wp[n] ? sub(f.wp[n], f.grp) : null);
  let frozenRun = 0, statueRun = 0;
  let camOmegaPrev = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const p = frames[i - 1];
    const pp = frames[i - 2];
    // Joint limits.
    for (const [j, L] of Object.entries(LIMITS)) {
      const k = idx[j];
      if (k === undefined) continue;
      const d = bind[k].clone().invert().multiply(quat(f.q[k]));
      const st = swingTwist(d);
      if (L.hinge) {
        const flex = (signs[j] ?? 1) * st.sx;
        if (flex < L.hinge[0]) flag(f, 'joint', `${j} reverse bend`, flex, `${flex.toFixed(0)}° (limit ${L.hinge[0]}°)`);
        if (flex > L.hinge[1]) flag(f, 'joint', `${j} over-flexed`, flex, `${flex.toFixed(0)}° (limit ${L.hinge[1]}°)`);
        if (Math.abs(st.sz) > L.side) flag(f, 'joint', `${j} side bend`, Math.abs(st.sz), `${st.sz.toFixed(0)}° (limit ${L.side}°)`);
      } else if (st.swing > L.swing) flag(f, 'joint', `${j} swing`, st.swing, `${st.swing.toFixed(0)}° (limit ${L.swing}°)`);
      if (Math.abs(st.twist) > L.twist) flag(f, 'joint', `${j} twist`, Math.abs(st.twist), `${st.twist.toFixed(0)}° (limit ${L.twist}°)`);
    }
    {
      const tn = ['neck', 'head'].map((j) => (idx[j] === undefined ? 0 : swingTwist(bind[idx[j]].clone().invert().multiply(quat(f.q[idx[j]]))).twist)).reduce((a, b) => a + b, 0);
      if (Math.abs(tn) > 100) flag(f, 'joint', 'neck+head twist', Math.abs(tn), `${tn.toFixed(0)}° (limit 100°)`);
    }
    if (!p) continue;
    // Angular velocity per joint (°/frame) and pops (one-frame spikes; needs the next frame).
    const n = frames[i + 1];
    let limbSum = 0, limbN = 0, bodySum = 0, bodyN = 0;
    for (const j of POP_JOINTS) {
      const k = idx[j];
      if (k === undefined) continue;
      const w = angle(quat(f.q[k]), quat(p.q[k]));
      if (LIMB.includes(j)) ((limbSum += w), limbN++);
      bodySum += w;
      bodyN++;
      if (w > TH.flip) flag(f, 'pop', `${j} flips`, w, `${w.toFixed(0)}°/frame`);
      else if (n && pp) {
        const wb = angle(quat(p.q[k]), quat(pp.q[k]));
        const wa = angle(quat(n.q[k]), quat(f.q[k]));
        if (w > TH.popOmega && w > TH.spike * Math.max(wb, wa, 2)) flag(f, 'pop', `${j} snaps`, w, `${w.toFixed(0)}°/frame between ${wb.toFixed(0)}° and ${wa.toFixed(0)}°`);
      }
    }
    if (pp) {
      for (const nm of ['head', 'handL', 'handR', 'footL', 'footR']) {
        const a = rel(f, nm), b = rel(p, nm), c = rel(pp, nm), d = n && rel(n, nm);
        if (!a || !b || !c || !d) continue;
        const st = len(sub(a, b)), sb = len(sub(b, c)), sa = len(sub(d, a));
        if (st > TH.popStep && st > TH.spike * Math.max(sb, sa, 0.005)) flag(f, 'pop', `${nm} jumps`, st, `${(st * 100).toFixed(0)} cm in one frame between ${(sb * 100).toFixed(0)} and ${(sa * 100).toFixed(0)} cm`);
      }
      const ha = acc(rel(f, 'hips'), rel(p, 'hips'), rel(pp, 'hips'));
      if (ha > TH.hipsAccel) flag(f, 'pop', 'hips jump', ha, `${(ha * 100).toFixed(0)} cm/frame² relative to the ground`);
      const ga = acc(f.grp, p.grp, pp.grp);
      if (ga > TH.groundAccel) flag(f, 'pop', 'runner ground jumps', ga, `${(ga * 100).toFixed(0)} cm/frame²`);
    }
    // Feet: slide while planted, sinking.
    let air = true;
    for (const n of ['footL', 'footR']) {
      const h = footH(f, n), hp = footH(p, n);
      if (h === null || hp === null) continue;
      if (h > low[n] + TH.airH) continue;
      air = false;
      const planted = h < low[n] + TH.plantH && hp < low[n] + TH.plantH && Math.abs(h - hp) < TH.plantVy;
      if (planted && (f.stage === 'run' || f.stage === 'lead' || f.stage === 'setup' || f.stage === 'cashout')) {
        const d = Math.hypot(f.wp[n][0] - p.wp[n][0], f.wp[n][2] - p.wp[n][2]);
        if (d > TH.slide) flag(f, 'slide', `${n} slides`, d, `${(d * 100).toFixed(1)} cm/frame while planted`);
      }
      if ((f.stage === 'run' || f.stage === 'setup') && h < low[n] - TH.sink) flag(f, 'slide', `${n} sinks`, low[n] - h, `${((low[n] - h) * 100).toFixed(0)} cm below the floor`);
    }
    // Frozen in the air; statue while travelling.
    const limb = limbN ? limbSum / limbN : 0;
    const body = bodyN ? bodySum / bodyN : 0;
    if (air && limb < TH.frozenLimb) frozenRun++;
    else frozenRun = 0;
    if (frozenRun >= TH.frozenRun) flag(f, 'frozen', 'airborne, limbs still', limb, `${limb.toFixed(2)}°/frame mean limb motion, ${frozenRun} frames in the air`);
    const travel = Math.hypot(f.grp[0] - p.grp[0], f.grp[2] - p.grp[2]) * FPS;
    if (body < TH.statueBody && travel > 2) statueRun++;
    else statueRun = 0;
    if (statueRun >= TH.statueRun) flag(f, 'frozen', 'statue while travelling', body, `${body.toFixed(2)}°/frame body motion at ${travel.toFixed(1)} m/s`);
    // Framing.
    {
      const pts = Object.entries(f.ndc).filter(([, v]) => v[2] < 1);
      const out = pts.filter(([, v]) => Math.abs(v[0]) > 0.98 || v[1] < -0.98 || v[1] > 0.98).map(([k]) => k);
      const vis = pts.filter(([, v]) => Math.abs(v[0]) <= 1 && Math.abs(v[1]) <= 1).length;
      if (vis === 0 && f.stage !== 'crash') flag(f, 'framing', 'runner out of frame', 1, 'no body point in the frame');
      else if (out.length) flag(f, 'framing', 'runner clipped', out.length, `${out.join(', ')} at the frame edge`);
      const hd = f.ndc.head, ft = f.ndc.footL && f.ndc.footR ? (f.ndc.footL[1] < f.ndc.footR[1] ? f.ndc.footL : f.ndc.footR) : null;
      if (hd && ft && hd[2] < 1 && f.stage !== 'crash') {
        const hgt = hd[1] - ft[1];
        if (hgt < 0.12) flag(f, 'framing', 'runner tiny', hgt, `${(hgt * 50).toFixed(0)} % of the frame height`);
      }
    }
    // Camera.
    {
      const w = angle(quat(f.cam.q), quat(p.cam.q));
      if (w > TH.camOmega) flag(f, 'camera', 'fast turn', w, `${w.toFixed(1)}°/frame`);
      if (camOmegaPrev !== null && Math.abs(w - camOmegaPrev) > TH.camSnap) flag(f, 'camera', 'snap', Math.abs(w - camOmegaPrev), `angular velocity ${camOmegaPrev.toFixed(1)} → ${w.toFixed(1)}°/frame`);
      camOmegaPrev = w;
      if (pp) {
        const j = acc(f.cam.p, p.cam.p, pp.cam.p);
        if (j > TH.camJerk) flag(f, 'camera', 'position jerk', j, `${(j * 100).toFixed(0)} cm/frame²`);
      }
    }
  }
  // Judder per joint over the gait frames (run, start, sprint blends: clip 'run' or 'start').
  const gait = frames.filter((f) => f.clip === 'run' && f.stage === 'run');
  const judder = {};
  if (gait.length > 20) {
    for (const j of POP_JOINTS) {
      const k = idx[j];
      if (k === undefined) continue;
      const w = [];
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i], p = frames[i - 1];
        if (!(f.clip === 'run' && f.stage === 'run' && p.clip === 'run')) {
          w.push(null);
          continue;
        }
        w.push(angle(quat(f.q[k]), quat(p.q[k])));
      }
      let num = 0, den = 0, n = 0;
      const worst = [];
      for (let i = 1; i < w.length - 1; i++) {
        if (w[i] === null || w[i - 1] === null || w[i + 1] === null) continue;
        const e = Math.abs(w[i] - (w[i - 1] + w[i + 1]) / 2);
        num += e;
        den += w[i];
        n++;
        worst.push([frames[i + 1].f, e]);
      }
      if (n < 15) continue;
      const J = num / Math.max(den, n);
      judder[j] = J;
      if (J > TH.judder) {
        worst.sort((a, b) => b[1] - a[1]);
        const fr = frames.find((x) => x.f === worst[0][0]);
        flags.push({ seq: name, f: worst[0][0], type: 'judder', what: `${j} judders in the gait`, value: +J.toFixed(3), detail: `J ${J.toFixed(2)} (limit ${TH.judder}); worst frames ${worst.slice(0, 6).map((x) => `f${x[0]} (${x[1].toFixed(0)}°)`).join(', ')}`, stage: fr.stage, clip: fr.clip });
      }
    }
  }
  // A joint that judders is reported once as such; its per-frame snaps in the gait are dropped.
  const jud = new Set(flags.filter((x) => x.type === 'judder').map((x) => x.what.split(' ')[0]));
  const kept = flags.filter((x) => !(x.type === 'pop' && x.clip === 'run' && jud.has(x.what.split(' ')[0])));
  kept.judder = judder;
  return kept;
}

/** Runs of consecutive frames with the same (type, what). */
function ranges(flags) {
  const key = (x) => `${x.type}|${x.what}`;
  const by = new Map();
  for (const x of flags) {
    const k = key(x);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(x);
  }
  const out = [];
  for (const [, list] of by) {
    list.sort((a, b) => a.f - b.f);
    let cur = null;
    for (const x of list) {
      if (cur && x.f <= cur.to + 2) {
        cur.to = x.f;
        if (x.value > cur.peak.value) cur.peak = x;
        cur.n++;
      } else {
        cur = { seq: x.seq, type: x.type, what: x.what, from: x.f, to: x.f, peak: x, n: 1 };
        out.push(cur);
      }
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

// ------------------------------------------------------------------ filming
const browser = REANALYSE
  ? null
  : await chromium.launch({
      executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
const allFlags = [];
const allRanges = [];
const summary = [];
const timeline = {};
for (const name of SEQS) {
  const S = seq(name);
  if (REANALYSE) {
    const raw = JSON.parse(readFileSync(`${OUT}/raw-${name}.json`, 'utf8'));
    const flags = analyse(name, raw.frames, raw.meta, raw.signs);
    const rg = ranges(flags);
    allFlags.push(...flags);
    allRanges.push(...rg);
    timeline[name] = raw.timeline;
    const counts = {};
    for (const r of rg) counts[r.type] = (counts[r.type] ?? 0) + 1;
    summary.push({ ...raw.summary, counts });
    console.log(`${name.padEnd(10)} ${raw.frames.length} frames  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'clean'}`);
    continue;
  }
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL}/?qa&q=${Q}&w=${WORLD}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 900000, polling: 500 });
  const meta = await page.evaluate(HELPER);
  // Deterministic run: seeded cosmetic randomness, the world from ?w, the sections forced if asked.
  await page.evaluate(
    ({ name, sections }) => {
      const g = window.__game;
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
      document.querySelector('#app')?.style.setProperty('visibility', 'hidden');
      if (sections) g.track.forceNext = [...sections];
      g.newWorld('setup');
      void g.toSetup();
    },
    { name, sections: S.sections ?? null },
  );
  const signs = await page.evaluate(() => window.__ma.hingeSigns());
  const frames = [];
  const shots = [];
  const events = new Map(S.events.map(([f, e]) => [f, e]));
  const seen = new Set();
  let lastCount = 0;
  const actual = {};
  for (let f = 0; f <= S.to; f++) {
    const ev = events.get(f);
    if (ev) {
      const r = await page.evaluate(
        ({ ev, name }) => {
          const g = window.__game;
          const id = `motion-${name}`;
          if (ev === 'lead') {
            g.lead();
            const start = g.virtualNow + 1100;
            g.elapsed = () => g.virtualNow - start;
            return { ev };
          }
          if (ev.startsWith('obstacle:')) return { ev, ...g.debugObstacle(ev.slice(9)) };
          if (ev === 'cashout') {
            // As the controller: the settled cash-out multiplier, then the escape.
            g.live.mult = Math.floor(g.live.mult * 100) / 100;
            g.cashout(id);
            return { ev, mult: g.live.mult };
          }
          if (ev === 'crash:start') {
            g.crash(100, id);
            return { ev, kind: g.debugState.crashKind };
          }
          const [, kind, v] = ev.split(':');
          g.crash(Math.round(g.live.mult * 100), id, kind, Number(v));
          return { ev, kind: g.debugState.crashKind, clip: g.runner.current, mult: g.live.mult };
        },
        { ev, name },
      );
      Object.assign(actual, r);
    }
    await page.evaluate(() => window.__ma.step());
    if (f < S.from) continue;
    const smp = await page.evaluate((f) => window.__ma.sample(f), f);
    frames.push(smp);
    // Flags so far (the analysis is cheap; recomputed on the tail).
    const tail = frames.slice(-12);
    // (A pop needs the next frame: the flags of the previous frame are final now; this frame is drawn.)
    const fl = analyse(name, tail, meta, signs).filter((x) => x.f === f - 1);
    if (fl.length) {
      // Draw this frame once per new kind of flag (and the worst of each run later in the report).
      const k = fl.map((x) => `${x.type}|${x.what}`).find((k) => !seen.has(`${k}|${Math.floor(f / 15)}`));
      if (k && shots.length < MAX_SHOTS) {
        fl.forEach((x) => seen.add(`${x.type}|${x.what}|${Math.floor(f / 15)}`));
        await page.evaluate(() => window.__ma.draw());
        const file = `${OUT}/frames/${name}-f${String(f).padStart(4, '0')}.png`;
        writeFileSync(file, await page.screenshot({ timeout: 900000 }));
        shots.push({ f, file, label: fl.map((x) => `${x.type}: ${x.what} ${x.detail}`).slice(0, 3) });
      }
    }
    if (f % 60 === 0 && frames.length !== lastCount) {
      lastCount = frames.length;
      process.stdout.write(`  ${name} f${f}/${S.to}\r`);
    }
  }
  // Full analysis over the whole window (the per-frame pass saw only a short tail).
  const flags = analyse(name, frames, meta, signs);
  const rg = ranges(flags);
  allFlags.push(...flags);
  allRanges.push(...rg);
  // The clip/stage timeline (for the agents reading frame numbers).
  const tl = [];
  for (const fr of frames) {
    const last = tl[tl.length - 1];
    const k = `${fr.stage}/${fr.clip}`;
    if (!last || last.k !== k) tl.push({ k, from: fr.f, to: fr.f });
    else last.to = fr.f;
  }
  timeline[name] = tl;
  // Contact sheet of the drawn frames.
  if (shots.length) {
    const tw = 426, th = 240, cols = 3;
    const rows = Math.ceil(shots.length / cols);
    const tiles = [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      const img = await sharp(s.file).resize(tw, th).toBuffer();
      const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const txt = [`${name} f${s.f}`, ...s.label].map((t, j) => `<text x="6" y="${16 + j * 14}" font-family="monospace" font-size="${j ? 11 : 13}" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(t.slice(0, 64))}</text>`).join('');
      const svg = Buffer.from(`<svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg">${txt}</svg>`);
      tiles.push({ input: await sharp(img).composite([{ input: svg }]).png().toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th });
    }
    await sharp({ create: { width: tw * cols, height: th * rows, channels: 3, background: '#000' } }).composite(tiles).png().toFile(`${OUT}/sheet-${name}.png`);
  }
  const counts = {};
  for (const r of rg) counts[r.type] = (counts[r.type] ?? 0) + 1;
  summary.push({ name, frames: frames.length, window: [S.from, S.to], actual, counts, shots: shots.length, errors });
  writeFileSync(`${OUT}/raw-${name}.json`, JSON.stringify({ frames, meta, signs, timeline: tl, summary: summary[summary.length - 1] }));
  console.log(`${name.padEnd(10)} ${frames.length} frames  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'clean'}${errors.length ? `  page errors: ${errors.length}` : ''}`);
  await page.close();
}
await browser?.close();

// ------------------------------------------------------------------ report
const md = [];
md.push(`# Motion audit — ${OUT}`);
md.push('');
md.push(`World ${WORLD}, quality ${Q}, ${W}×${H}, ${FPS} fps time-stepped. Frame numbers count from the sequence start (frame 0 = the world built, setup shot).`);
md.push('Each row is a run of consecutive flagged frames (same check); the peak frame and value are given. Sheets show the frame each new kind of flag was first seen.');
md.push('');
md.push('| sequence | frames | judder | joint | slide | pop | frozen | framing | camera | staged |');
md.push('|---|---|---|---|---|---|---|---|---|---|');
for (const s of summary)
  md.push(`| ${s.name} | ${s.window[0]}–${s.window[1]} | ${s.counts.judder ?? 0} | ${s.counts.joint ?? 0} | ${s.counts.slide ?? 0} | ${s.counts.pop ?? 0} | ${s.counts.frozen ?? 0} | ${s.counts.framing ?? 0} | ${s.counts.camera ?? 0} | ${Object.entries(s.actual).filter(([k]) => k !== 'ev').map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')} |`);
md.push('');
for (const s of summary) {
  md.push(`## ${s.name}`);
  md.push('');
  md.push(`Timeline: ${timeline[s.name].map((t) => `${t.from}–${t.to} ${t.k}`).join(' · ')}`);
  md.push('');
  const rs = allRanges.filter((r) => r.seq === s.name);
  if (!rs.length) md.push('No flags.');
  else {
    md.push('| frames | check | peak | clip at peak |');
    md.push('|---|---|---|---|');
    for (const r of rs) md.push(`| ${r.from === r.to ? r.from : `${r.from}–${r.to}`} | ${r.type}: ${r.what} | f${r.peak.f}: ${r.peak.detail} | ${r.peak.stage}/${r.peak.clip} |`);
  }
  if (s.shots) md.push('', `![${s.name}](sheet-${s.name}.png)`);
  if (s.errors.length) md.push('', `Page errors: ${s.errors.join('; ')}`);
  md.push('');
}
writeFileSync(`${OUT}/report.md`, md.join('\n'));
writeFileSync(`${OUT}/flags.json`, JSON.stringify({ world: WORLD, q: Q, summary, ranges: allRanges.map((r) => ({ ...r, peak: { f: r.peak.f, value: r.peak.value, detail: r.peak.detail, clip: r.peak.clip, stage: r.peak.stage } })), thresholds: TH, limits: LIMITS }, null, 1));
console.log(`report: ${OUT}/report.md`);

// ------------------------------------------------------------------ delta
if (COMPARE && existsSync(COMPARE)) {
  const old = JSON.parse(readFileSync(COMPARE, 'utf8'));
  const k = (r) => `${r.seq}|${r.type}|${r.what}`;
  const overlap = (a, b) => a.from <= b.to + 3 && b.from <= a.to + 3;
  const newer = allRanges.filter((r) => !old.ranges.some((o) => k(o) === k(r) && overlap(o, r)));
  const gone = old.ranges.filter((o) => SEQS.includes(o.seq) && !allRanges.some((r) => k(o) === k(r) && overlap(o, r)));
  const dl = [`# Motion audit delta — ${OUT} vs ${COMPARE}`, '', `New flags: ${newer.length}. Gone: ${gone.length}.`, ''];
  dl.push('## New', '', '| sequence | frames | check | peak |', '|---|---|---|---|');
  for (const r of newer) dl.push(`| ${r.seq} | ${r.from}–${r.to} | ${r.type}: ${r.what} | f${r.peak.f}: ${r.peak.detail} (${r.peak.stage}/${r.peak.clip}) |`);
  dl.push('', '## Gone', '', '| sequence | frames | check | peak |', '|---|---|---|---|');
  for (const r of gone) dl.push(`| ${r.seq} | ${r.from}–${r.to} | ${r.type}: ${r.what} | f${r.peak.f}: ${r.peak.detail} |`);
  writeFileSync(`${OUT}/delta.md`, dl.join('\n'));
  console.log(`delta: ${OUT}/delta.md (${newer.length} new, ${gone.length} gone)`);
}
