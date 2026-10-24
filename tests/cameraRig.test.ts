import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, type CamMode, type EscapeShot } from '../src/render/cameraRig';

// Round 20 (motion critic): every camera transition is jerk-limited. With shake off, the lens's
// per-frame motion at 30 fps stays under the motion audit's limits (tools/motion-audit.mjs: camJerk,
// camOmega, camSnap) through every mode swap, with margin.
const LIMITS = { acc: 0.06, omega: 10, angAcc: 3 }; // m/frame², °/frame, °/frame² at 30 fps

function fly(plan: { at: number; mode?: CamMode; escape?: EscapeShot; stop?: boolean; body?: number }[], frames: number) {
  const rig = new CameraRig(16 / 9);
  rig.shakeEnabled = false;
  rig.wallClock = false;
  const runner = new THREE.Vector3();
  let speed = 9;
  const dt = 1 / 30;
  const pos: THREE.Vector3[] = [];
  const dir: THREE.Vector3[] = [];
  rig.setMode('run');
  rig.snap(runner, 0);
  for (let f = 0; f < frames; f++) {
    for (const p of plan) {
      if (p.at === f) {
        if (p.mode) rig.setMode(p.mode, { escape: p.escape, side: 1 });
        // A swap of the framing subject (the clip carried him off the root): 2 m in one frame.
        if (p.body !== undefined) rig.bodyAt = runner.clone().add(new THREE.Vector3(p.body, 0, p.body));
        if (process.env.RIG_LOG) console.log(p.mode, p.escape);
        if (p.stop) speed = 0;
      }
    }
    runner.z += speed * dt;
    rig.update(dt, runner, 0, 0.6);
    pos.push(rig.camera.position.clone());
    dir.push(rig.camera.getWorldDirection(new THREE.Vector3()));
  }
  let acc = 0;
  let omega = 0;
  let angAcc = 0;
  const ang = (a: THREE.Vector3, b: THREE.Vector3) => THREE.MathUtils.radToDeg(a.angleTo(b));
  for (let f = 6; f < frames; f++) {
    const [p2, p1, p0] = [pos[f]!, pos[f - 1]!, pos[f - 2]!];
    const [d2, d1, d0] = [dir[f]!, dir[f - 1]!, dir[f - 2]!];
    acc = Math.max(acc, p2.clone().sub(p1).sub(p1.clone().sub(p0)).length());
    const w1 = ang(d2, d1);
    const w0 = ang(d1, d0);
    omega = Math.max(omega, w1);
    angAcc = Math.max(angAcc, Math.abs(w1 - w0));
  }
  if (process.env.RIG_LOG) console.log({ acc, omega, angAcc });
  return { acc, omega, angAcc };
}

describe('camera output spring', () => {
  it('keeps run → crash under the jerk limits', () => {
    const m = fly([{ at: 30, mode: 'crash', stop: true }], 120);
    expect(m.acc).toBeLessThan(LIMITS.acc);
    expect(m.omega).toBeLessThan(LIMITS.omega);
    expect(m.angAcc).toBeLessThan(LIMITS.angAcc);
  });
  for (const escape of ['cheer', 'lookback', 'salute', 'leap'] as const) {
    it(`keeps run → cash-out (${escape}) under the jerk limits`, () => {
      const m = fly([{ at: 30, mode: 'cashout', escape, stop: true }], 150);
      expect(m.acc).toBeLessThan(LIMITS.acc);
      expect(m.omega).toBeLessThan(LIMITS.omega);
      expect(m.angAcc).toBeLessThan(LIMITS.angAcc);
    });
  }
  it('blends a swap of the framing subject', () => {
    const m = fly([{ at: 30, mode: 'cashout', escape: 'cheer', stop: true }, { at: 60, body: 0 }, { at: 75, body: 2 }], 150);
    expect(m.acc).toBeLessThan(LIMITS.acc);
    expect(m.omega).toBeLessThan(LIMITS.omega);
    expect(m.angAcc).toBeLessThan(LIMITS.angAcc);
  });
  it('adds no lag to a steady chase', () => {
    const a = new CameraRig(16 / 9);
    a.shakeEnabled = false;
    a.wallClock = false;
    const r = new THREE.Vector3();
    a.setMode('run');
    a.snap(r, 0);
    for (let f = 0; f < 240; f++) {
      r.z += 9 / 60;
      a.update(1 / 60, r, 0, 0.6);
    }
    // Behind him, and at a steady 9 m/s it holds its gap (the spring's feed-forward).
    const z0 = a.camera.position.z;
    r.z += 9 / 60;
    a.update(1 / 60, r, 0, 0.6);
    expect(a.camera.position.z - z0).toBeCloseTo(9 / 60, 2);
  });
});
