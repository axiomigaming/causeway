import * as THREE from 'three';

export type CamMode = 'title' | 'setup' | 'lead' | 'run' | 'crash' | 'cashout';
export type CrashShot = 'chasm' | 'gate' | 'rockfall' | 'ledge';
export type EscapeShot = 'lookback' | 'cheer' | 'salute' | 'leap';

/** Round 20: an impact knock is a push over ~1/JOLT_K s (80 ms), not an instant change of velocity. */
const JOLT_K = 12;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const dampV = (a: THREE.Vector3, b: THREE.Vector3, k: number, dt: number) => a.lerp(b, 1 - Math.exp(-k * dt));
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = THREE.MathUtils.lerp;

function angleDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** A camera placement in the runner's frame: metres along the route, to the right, and up. */
interface Frame {
  along: number;
  lat: number;
  up: number;
  /** Look target: along/lat/up from the runner, then pulled toward the focus point by `focus`. */
  lAlong: number;
  lLat: number;
  lUp: number;
  focus: number;
  fov: number;
}

function mixFrame(a: Frame, b: Frame, t: number): Frame {
  const k = ease(t);
  return {
    along: lerp(a.along, b.along, k),
    lat: lerp(a.lat, b.lat, k),
    up: lerp(a.up, b.up, k),
    lAlong: lerp(a.lAlong, b.lAlong, k),
    lLat: lerp(a.lLat, b.lLat, k),
    lUp: lerp(a.lUp, b.lUp, k),
    focus: lerp(a.focus, b.focus, k),
    fov: lerp(a.fov, b.fov, k),
  };
}

/** Piecewise-eased keyframes over time: [(t, frame)…]. */
function track(keys: [number, Frame][], t: number): Frame {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i]!;
    const [t1, b] = keys[i + 1]!;
    if (t < t1) return mixFrame(a, b, (t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1]![1];
}

/** Closest a cinematic (crash or escape) lens may come to the runner's head, in metres. */
const MIN_SHOT = 2.35;

const F = (along: number, lat: number, up: number, lAlong: number, lLat: number, lUp: number, fov: number, focus = 0): Frame => ({ along, lat, up, lAlong, lLat, lUp, fov, focus });

/**
 * A chase camera with weight, and authored moves for the moments that matter.
 * The position lags on a spring, the heading lags the route, the lens widens
 * with speed, footfalls bob the operator, and shake comes from "trauma" that
 * decays. Title, start, crash and cash-out are choreographed as keyframed shots
 * in the runner's frame; every mode is a target the same springs move toward,
 * so switching is always a camera move, never a cut. A corridor constraint
 * (supplied by the game) keeps the lens out of the walls.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CamMode = 'title';
  private pos = new THREE.Vector3(0, 3, 8);
  private look = new THREE.Vector3();
  private yaw = 0;
  private fov = 55;
  private trauma = 0;
  private t = 0;
  private modeT = 0;
  private side = 1;
  private crashShot: CrashShot = 'gate';
  private escapeShot: EscapeShot = 'lookback';
  private variant = 0;
  /** 0..1: how grand the settled moment is (slower, wider, higher). */
  private epic = 0;
  /** 0..1, set by the game: the runner has dropped into a chasm and the lens tilts down after them. */
  gap = 0;
  private rollKick = 0;
  /**
   * Metres from the runner to a second subject the settled shot keeps in view (the fallen door, its
   * mask 3.3 m up); 0 for none. Set by the game per staging.
   */
  subjectAhead = 0;
  /** Metres from the runner to the escape's gate of light (set by the game), for the push. */
  gateAhead = 12;
  /** Run mode: how far (rad) the lens leads the runner's heading into a bend ahead (the game sets it). */
  yawLead = 0;
  /**
   * Set by the game when the result card appears: the settled shot then keeps the whole runner in
   * the band between the card (reported as the top inset) and the dock.
   */
  revealed = false;
  /** 0..1 as the result card is up (read by the game to keep the result shot over the way). */
  revealK = 0;
  /** 0..1: how far a settled escape ends on a vista over the runner's shoulder. */
  private reveal = 0;
  /** Continuous run tier (see world/choreo): camera energy rises with it. */
  drive = 0;
  private fovKick = 0;
  private bob = 0;
  private joltX = 0;
  private joltY = 0;
  private bobV = 0;
  private sway = 0;
  private swayV = 0;
  private dutch = 0;
  private lastYaw = 0;
  shakeEnabled = true;
  motionScale = 1;
  /** Called on the raw shot each frame just before the output spring (set by the game). */
  preOutput: ((dt: number) => void) | null = null;
  /** Crash: > 0 once he is down (set by the game at the impact): the lens closes in on him. */
  closeIn = 0;
  /** Crash close-in: metres higher (the ledge: over the fragments lying round him in the trough). */
  closeUp = 0;
  /** Crash close-in: its sideways offset times this (the ledge: the trough is 3.2 m wide). */
  closeSide = 1;
  private closeK = 0;
  /** Crash: close in from this frame on, without first easing through the crash shot's own framing. */
  closeNow(): void {
    this.closeIn = 1;
    this.closeK = 1;
  }
  /** Crash: > 0 while he is thrown across the frame (the side hit): the shot opens wider. */
  wide = 0;
  private wideK = 0;
  /** Extra focus point for crash framing (the hazard). */
  focus = new THREE.Vector3();
  /** Keeps a camera position inside the open corridor (walls, floor). Set by the game. */
  constrain: (p: THREE.Vector3) => void = () => {};
  /** Distance from `a` to the first solid obstacle toward `b`, or null. Set by the game. */
  occlude: (a: THREE.Vector3, b: THREE.Vector3) => number | null = () => null;
  // Occlusion response: swing the orbit toward the clear side, else pull in along the sight line.
  private swing = 0;
  private swingTarget = 0;
  private pull = 1;
  private pullTarget = 1;
  private occT = 0;
  private blockedT = 0;
  private clearT = 0;
  private rawTarget = new THREE.Vector3();
  private runnerAt = new THREE.Vector3();
  private cand = new THREE.Vector3();
  private eye = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 2400);
  }

  setMode(m: CamMode, opts: { side?: number; shot?: CrashShot; escape?: EscapeShot; variant?: number; epic?: number; reveal?: number } = {}): void {
    if (opts.side) this.side = opts.side;
    if (opts.reveal !== undefined) this.reveal = opts.reveal;
    else if (m !== this.mode) this.reveal = 0;
    if (opts.shot) this.crashShot = opts.shot;
    if (opts.escape) this.escapeShot = opts.escape;
    if (opts.variant !== undefined) this.variant = opts.variant;
    if (opts.epic !== undefined) this.epic = opts.epic;
    if (m === this.mode) return;
    this.gap = 0;
    this.revealed = false;
    this.subjectAhead = 0;
    this.mode = m;
    this.modeT = 0;
    this.closeIn = 0;
    this.closeUp = 0;
    this.closeSide = 1;
    this.closeK = 0;
    this.wide = 0;
    this.wideK = 0;
    this.swingTarget = 0;
    this.pullTarget = 1;
  }

  // ------------------------------------------------------------------ output smoothing
  /**
   * Round 20: every move the lens makes is jerk-limited. Whatever the shot logic asks for (a mode
   * change, a new target, a correction), the camera follows it through a critically damped
   * second-order spring on position and on orientation, with its acceleration capped and the change
   * of acceleration per step capped: velocity and acceleration stay continuous, so no target swap
   * reads as a whip, a snap or a hard stop. The target's own smooth motion is fed forward (a steady
   * chase or pan has no lag); a jump in it (a swap) is not, so only the spring carries the lens
   * across. Hard cuts (snap, the safe shot) reset it. Shake and footfall bob go on after it.
   */
  private sm = {
    on: false,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    a: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    w: new THREE.Vector3(),
    aw: new THREE.Vector3(),
    tp: new THREE.Vector3(),
    tv: new THREE.Vector3(),
    tq: new THREE.Quaternion(),
    tw: new THREE.Vector3(),
  };
  private smT = new THREE.Vector3();
  private smT2 = new THREE.Vector3();
  private smW = new THREE.Vector3();
  private smQ = new THREE.Quaternion();
  private tmpQi = new THREE.Quaternion();
  /** The roll of an orientation about its own view axis (radians; 0 = horizon level). */
  private rollOf(q: THREE.Quaternion): number {
    const r = this.smR.set(1, 0, 0).applyQuaternion(q);
    const u = this.smU.set(0, 1, 0).applyQuaternion(q);
    return Math.atan2(r.y, u.y);
  }
  private smR = new THREE.Vector3();
  private smU = new THREE.Vector3();
  /** Rotation vector (axis × angle, shortest way) taking `from` to `to`, written into `out`. */
  private rotVec(to: THREE.Quaternion, from: THREE.Quaternion, out: THREE.Vector3): THREE.Vector3 {
    const qe = this.smQ.copy(to).multiply(this.tmpQi.copy(from).invert());
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w);
    const sn = Math.sqrt(qe.x * qe.x + qe.y * qe.y + qe.z * qe.z);
    out.set(qe.x, qe.y, qe.z);
    return sn > 1e-8 ? out.multiplyScalar((2 * Math.atan2(sn, qe.w)) / sn) : out.set(0, 0, 0);
  }
  private smoothOut(dt: number): void {
    const c = this.camera;
    const S = this.sm;
    if (!S.on || dt <= 0 || dt > 0.3) {
      S.on = true;
      S.p.copy(c.position);
      S.q.copy(c.quaternion);
      S.tp.copy(c.position);
      S.tq.copy(c.quaternion);
      S.v.set(0, 0, 0);
      S.a.set(0, 0, 0);
      S.w.set(0, 0, 0);
      S.aw.set(0, 0, 0);
      S.tv.set(0, 0, 0);
      S.tw.set(0, 0, 0);
      return;
    }
    const W = 14;
    const WR = 16;
    const A_MAX = 90; // m/s²
    const J_MAX = 2400; // m/s³
    const AW_MAX = 35; // rad/s²
    const W_MAX = 3.5; // rad/s: a swap of aim pans, never whips
    const JW_MAX = 1600; // rad/s³
    // The target's velocity, fed forward unless it jumped (a swap: more than ~3 g of change).
    const tv = this.smT2.copy(c.position).sub(S.tp).divideScalar(dt);
    if (tv.distanceTo(S.tv) > 30 * dt + 0.5 || tv.length() > 40) tv.copy(S.tv).multiplyScalar(Math.exp(-dt * 6));
    S.tv.copy(tv);
    S.tp.copy(c.position);
    const tw = this.rotVec(c.quaternion, S.tq, this.smT).divideScalar(dt);
    if (tw.distanceTo(S.tw) > 20 * dt + 0.15 || tw.length() > 5) tw.copy(S.tw).multiplyScalar(Math.exp(-dt * 6));
    S.tw.copy(tw);
    S.tq.copy(c.quaternion);
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    const want = this.smW;
    for (let i = 0; i < n; i++) {
      // Position: toward the target where it will be at the end of this frame.
      want.copy(c.position).addScaledVector(S.tv, -(dt - (i + 1) * h)).sub(S.p).multiplyScalar(W * W);
      want.addScaledVector(this.smT2.copy(S.tv).sub(S.v), 2 * W);
      if (want.length() > A_MAX) want.setLength(A_MAX);
      const da = want.sub(S.a);
      if (da.length() > J_MAX * h) da.setLength(J_MAX * h);
      S.a.add(da);
      S.v.addScaledVector(S.a, h);
      S.p.addScaledVector(S.v, h);
      // Orientation: the error as a rotation vector (target · current⁻¹).
      const e = this.rotVec(c.quaternion, S.q, want);
      e.addScaledVector(S.tw, -(dt - (i + 1) * h)).multiplyScalar(WR * WR);
      e.addScaledVector(this.smT2.copy(S.tw).sub(S.w), 2 * WR);
      if (e.length() > AW_MAX) e.setLength(AW_MAX);
      const daw = e.sub(S.aw);
      if (daw.length() > JW_MAX * h) daw.setLength(JW_MAX * h);
      S.aw.add(daw);
      S.w.addScaledVector(S.aw, h);
      if (S.w.length() > W_MAX) S.w.setLength(W_MAX);
      const wl = S.w.length();
      if (wl > 1e-8) {
        this.smQ.setFromAxisAngle(this.smT2.copy(S.w).divideScalar(wl), wl * h);
        S.q.premultiply(this.smQ).normalize();
      }
    }
    c.position.copy(S.p);
    // The spring turns the shortest way between two aims, and between two aims that differ in
    // yaw and pitch that way passes through roll (5-6° in a fast move). The output is levelled
    // and keeps only the shot's own roll (the bank into a bend, an impact's kick).
    const rollWant = this.rollOf(c.quaternion);
    c.quaternion.copy(S.q);
    const have = this.rollOf(c.quaternion);
    c.rotateZ(rollWant - have);
  }

  /**
   * A safe shot (the lens went non-finite or into solid geometry): behind and above the runner,
   * looking at the chest, with every spring, kick and offset reset.
   */
  safeShot(runnerPos: THREE.Vector3, runnerYaw: number): void {
    this.sm.on = false;
    if (![runnerPos.x, runnerPos.y, runnerPos.z, runnerYaw].every(Number.isFinite)) return;
    this.yaw = this.lastYaw = runnerYaw;
    this.fwd.set(-Math.sin(runnerYaw), 0, -Math.cos(runnerYaw));
    this.right.set(Math.cos(runnerYaw), 0, -Math.sin(runnerYaw));
    this.pos.copy(runnerPos).addScaledVector(this.fwd, -4.2).addScaledVector(this.right, 0.8).setY(runnerPos.y + 2.4);
    this.look.copy(runnerPos).setY(runnerPos.y + 1.1);
    this.trauma = this.fovKick = this.rollKick = this.dutch = 0;
    this.bob = this.bobV = this.sway = this.swayV = 0;
    this.swing = this.swingTarget = 0;
    this.pull = this.pullTarget = 1;
    this.standBack = this.standBackV = 0;
    this.sideK = this.sideV = 0;
    this.fov = 58;
    const c = this.camera;
    c.position.copy(this.pos);
    c.quaternion.identity();
    c.lookAt(this.look);
    c.fov = this.fov;
    c.near = 0.1;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  /** Snap to the current target (after a teleport such as a new round). */
  snap(runnerPos: THREE.Vector3, runnerYaw: number): void {
    this.sm.on = false;
    this.yaw = runnerYaw;
    this.lastYaw = runnerYaw;
    this.swing = this.swingTarget = 0;
    this.pull = this.pullTarget = 1;
    // A new round starts clean: no leftover shake, lens punch or jolt from the last cinematic.
    this.trauma = 0;
    this.joltX = this.joltY = 0;
    this.standBack = this.standBackV = 0;
    this.fovKick = 0;
    this.bob = this.bobV = this.sway = this.swayV = 0;
    const fov = this.computeTarget(runnerPos, runnerYaw, 0, 1 / 60, true);
    this.pos.copy(this.targetPos);
    this.look.copy(this.targetLook);
    this.fov = fov;
  }

  addTrauma(x: number): void {
    this.trauma = Math.min(1, this.trauma + x);
  }

  /** A footfall: the operator is running too. */
  footfall(strength: number, foot: 'L' | 'R'): void {
    if (this.mode !== 'run' && this.mode !== 'lead') return;
    // From the sprint tier up the operator's own footfalls jar the frame a little.
    if (this.mode === 'run' && this.drive > 2) this.trauma = Math.min(1, this.trauma + 0.035 * (this.drive - 2) * strength * this.motionScale);
    this.bobV -= (0.22 + 0.34 * strength) * (1 + 0.15 * Math.max(0, this.drive - 2)) * this.motionScale;
    this.swayV += (foot === 'L' ? -1 : 1) * 0.06 * strength * this.motionScale;
    // Each plant flares the lens open a hair, more as he drives: the cadence is felt, not only seen.
    if (this.mode === 'run') this.fovKick += (0.35 + 0.25 * Math.min(4, this.drive) * 0.25) * strength * this.motionScale;
  }

  /**
   * An impact in a cinematic: the operator is jolted (a downward knock on the bob spring) and the
   * lens punches in by `deg`. Scaled by the motion setting.
   */
  jolt(strength: number, deg: number): void {
    // (Round 20: a shaped push over ~50 ms, not an instant change of velocity: the same knock,
    // without a one-frame jerk.)
    this.joltY -= strength * 1.4 * this.motionScale * JOLT_K;
    this.joltX += (Math.random() - 0.5) * strength * 0.8 * this.motionScale * JOLT_K;
    this.fovKick -= deg * this.motionScale;
    // The frame tips on the blow, then rights itself.
    this.rollKick += (Math.random() < 0.5 ? -1 : 1) * Math.min(0.025, 0.012 * strength) * this.motionScale;
  }

  /** A lens punch (the start burst). */
  kick(deg: number): void {
    this.fovKick += deg * this.motionScale;
  }

  private targetPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private targetLook = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();

  private place(out: THREE.Vector3, base: THREE.Vector3, along: number, lat: number, up: number) {
    return out.copy(base).addScaledVector(this.fwd, along).addScaledVector(this.right, lat).setY(base.y + up);
  }

  /**
   * How much to compose for a tall screen with the interface over its lower part: 0 on a landscape
   * screen with no dock, 1 on a phone in portrait. Settled shots pull back and aim lower by this, so
   * the runner's feet sit above the dock line.
   */
  private get compact(): number {
    const pf = Math.min(1, Math.max(0, (1 - this.camera.aspect) / 0.5));
    return Math.min(1, Math.max(pf, this.shiftTarget / 0.2));
  }

  /**
   * After the result card appears: stand back far enough that the whole runner fits ~75 % of the
   * band between the card and the dock, and aim at the hips, so the view offset (applyShift) sets
   * him in the middle of that band, under the card. Not while the lens looks down into a chasm.
   */
  private resultFrame(f: Frame): Frame {
    const k = this.revealK;
    if (k <= 0.001 || this.gap > 0.5) return f;
    const band = Math.max(0.25, 1 - this.insetTop - this.insetBottom);
    const a = this.camera.aspect;
    const lens = Math.min(96, f.fov * (a < 1 ? Math.min(1.55, 1 + (1 - a) * 0.95) : 1));
    const tanH = Math.tan((lens * Math.PI) / 360);
    // The fallen door: keep its mask in the band too — stand back and low enough that runner
    // (feet) and mask (crown, ~4.7 m up, `subjectAhead` beyond him) share it, aiming between them.
    if (this.crashShot === 'gate' && this.subjectAhead > 0 && this.mode === 'crash') {
      const A = this.subjectAhead;
      const D = Math.min(10, Math.max(4, 4.4 / (0.9 * band * 2 * tanH) - A * 0.5));
      const g: Frame = { along: -D, lat: 0.45 * D * Math.sign(f.lat || 1), up: 1.4, lAlong: A * 0.5, lLat: 0, lUp: 1.9, fov: f.fov, focus: 0 };
      return mixFrame(f, g, k);
    }
    // Round 17: beside the interface column (landscape, sideK) he is no longer squeezed into the
    // band between card and dock: frame him at ~36 % of the frame height, at that distance exactly
    // (closer or further), and let keepInFrame stand him on the third beside the column.
    const needBand = 1.95 / (0.75 * band * 2 * tanH);
    const needSide = 1.95 / (0.36 * 2 * tanH);
    const dy = f.up - 1.0;
    const d0 = Math.max(0.3, Math.hypot(f.along, f.lat, dy));
    // Round 20: and never so far that he is a dot: pull in until he fills ~38 % of the band.
    const needFar = 1.95 / (0.38 * band * 2 * tanH);
    // (A man lying on the stone is not 1.95 m tall in the frame: once the crash lens has closed in
    // on him, keepInFrame alone keeps him whole; the standing stand-back would undo the close-in.)
    const lying = this.mode === 'crash' && this.closeK > 0.5;
    const mBand = d0 < needBand ? (lying ? 1 : needBand / d0) : d0 > needFar ? needFar / d0 : 1;
    const m = lerp(mBand, needSide / d0, this.sideK);
    const out: Frame = { ...f, along: f.along * m, lat: f.lat * m, up: 1.0 + dy * m, lAlong: lerp(f.lAlong, 0.3, 0.85), lLat: lerp(f.lLat, 0, 0.85), lUp: lerp(f.lUp, 0.95, 0.85), focus: f.focus * 0.15 };
    return mixFrame(f, out, k);
  }

  private settled(f: Frame): Frame {
    const k = this.compact;
    if (k <= 0) return f;
    return { ...f, along: f.along * (1 + 0.3 * k), lat: f.lat * (1 + 0.2 * k), up: f.up + 0.3 * k, lUp: f.lUp - 0.3 * k };
  }

  private shot(runnerPos: THREE.Vector3, f: Frame) {
    this.place(this.targetPos, runnerPos, f.along, f.lat, f.up);
    this.place(this.targetLook, runnerPos, f.lAlong, f.lLat, f.lUp);
    if (f.focus > 0) {
      const y = this.targetLook.y;
      this.targetLook.lerp(this.focus, f.focus).setY(y);
    }
    return f.fov;
  }

  private computeTarget(runnerPos: THREE.Vector3, runnerYaw: number, intensity: number, dt: number, snap = false) {
    const k = snap ? 1e6 : 1;
    const follow = this.mode === 'run' || this.mode === 'lead' ? 2.6 : this.mode === 'crash' || this.mode === 'cashout' ? 0.6 : 1.6;
    // Round 14 corners: in the run the lens leads into a bend (yawLead, from the route ahead) and
    // follows faster through it, so it swings round the corner with him instead of lagging into
    // the outside wall.
    const run = this.mode === 'run' || this.mode === 'lead';
    const lead = run ? this.yawLead : 0;
    const quick = run ? 1 + 1.2 * Math.min(1, Math.abs(this.yawLead) / 0.5) : 1;
    this.yaw += angleDelta(this.yaw, runnerYaw + lead) * (1 - Math.exp(-follow * quick * dt * k));
    const yaw = this.yaw;
    this.fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const I = intensity;
    const s = this.side;
    const T = this.modeT;
    let fov = 55;
    switch (this.mode) {
      case 'title': {
        // An establishing move: high over the causeway looking down the way ahead, drifting down
        // to a low three-quarter view behind the runner (who sits right of frame, clear of the
        // title copy), and back up. Reduced motion slows it to a crawl.
        const period = this.motionScale < 1 ? 90 : 46;
        const c = ease(0.5 - 0.5 * Math.cos((2 * Math.PI * this.t) / period));
        const drift = Math.sin(this.t * 0.11) * 0.25;
        // At 5.4 m the high pass looked straight into the crowns of the arches over the road (7–8 m):
        // big soft blocks across the top of the frame. It rides above them instead.
        const tall = Math.min(1, Math.max(0, (1 - this.camera.aspect) / 0.5));
        fov = this.shot(runnerPos, {
          along: lerp(-8.5, -2.3, c),
          lat: lerp(-0.5, -1.45, c) + drift,
          // (Round 9: on a wide screen too; at 5.4 m the desktop title looked through the stacked
          // stones of the arch beside the lens, a quarter of the frame each side.)
          up: lerp(9.0 + 0.8 * tall, 1.05, Math.pow(c, 1.5)),
          lAlong: lerp(22, 6, c),
          lLat: lerp(0.2, 0.95, c),
          lUp: lerp(0.4, 1.55, c),
          focus: 0,
          fov: lerp(50, 44, c),
        });
        break;
      }
      case 'setup': {
        // The whole runner stands in the band the interface leaves free (the view offset centres
        // that band, see setInsets): stand back far enough that head to feet fill ~60 % of it,
        // and aim at the hips.
        // On a wide screen a narrower lens from further back: the corridor walls beside the lens
        // filled a quarter of the frame on each side as huge soft slabs.
        const a = this.camera.aspect;
        const sfov = a > 1 ? 44 : 52;
        // The lens as update() will open it on a portrait screen (see `portrait` there).
        const lens = Math.min(96, sfov * (a < 1 ? Math.min(1.55, 1 + (1 - a) * 0.95) : 1));
        const span = 0.6 * this.free * 2 * Math.tan((lens * Math.PI) / 360);
        const back = Math.min(9, Math.max(2.75, 1.95 / span));
        fov = this.shot(runnerPos, F(-back, 0.25 + 0.06 * back, 1.15 + 0.12 * back, 0.6, 0.1, 0.92, sfov));
        break;
      }
      case 'lead': {
        // Low beside the coiled runner, easing in: the held breath before the go.
        const p = ease(T / 1.2);
        fov = this.shot(runnerPos, this.fitInBand(F(lerp(-2.45, -1.95, p), lerp(0.62, 0.78, p), lerp(1.2, 1.02, p), 7, 0.1, 1.05, lerp(52, 47, p))));
        break;
      }
      case 'run': {
        // Low and close on a wide lens (the references): shoulder height, the runner big and left
        // of centre, the way ahead open to the right. Energy rises with the run tier: closer and
        // lower at the top tiers, a wider lens, a drift. fitInBand keeps him whole, boots
        // included, above the cash-out plate.
        const d = this.drive;
        const hi = Math.max(0, d - 2.5);
        // Round 11: the chase closes in and drops as the multiplier climbs (the lens widens with it,
        // so he keeps his size while the world rushes past faster at the edges).
        const dist = 2.25 - 0.25 * I - 0.12 * hi;
        const drift = 0.22 * I * Math.sin(this.t * 0.37) * this.motionScale;
        // Round 8: a three-quarter view over his right shoulder, a hand lower than before. Straight
        // from behind the forward lean of the run (9°) and the sprint (17°) vanished into his own
        // silhouette and read as an upright jog; from the side and below it reads as drive.
        // Round 9: on a narrow (portrait) frame the shoulder offset pushed his far arm off the left
        // edge; there it comes in toward the axis (keepInFrame below enforces the margin).
        const narrow = Math.min(1, Math.max(0, (1 - this.camera.aspect) / 0.5));
        const lat = lerp(0.72, 0.36, narrow);
        // Round 13: tier 0 already a run for his life — a hand lower (the floor streams past the lens)
        // and 4° wider from the go; the top of the climb is where it was.
        // World round 23 (coordinator): phone portrait run framing — on a portrait screen the look point
        // rises 1.4 m (pitch up) and the lens is 8° narrower before the portrait widening: the bottom
        // 40 % of a phone frame was paving tiles, the world a thin band above him. Landscape is
        // unchanged (narrow = 0).
        fov = this.shot(runnerPos, this.fitInBand(F(-dist, lat + drift, 1.24 - 0.08 * I - 0.06 * hi, 9, lerp(0.6, 0.3, narrow) + drift * 0.4, 1.0 + 0.08 * I + 1.4 * narrow, 64 + 14 * I + 3 * hi - 8 * narrow)));
        break;
      }
      case 'crash': {
        // Round 20: after the impact of a slam, a trip, a fall onto the stone or a side hit, the
        // lens closes in on him where he lies (game sets closeIn): a low three-quarter view ~2.8 m
        // from his body, so the figure fills a third of the frame instead of a dot behind the dust.
        this.closeK += ((this.closeIn > 0 ? 1 : 0) - this.closeK) * (1 - Math.exp(-dt * 1.6));
        this.wideK += ((this.wide > 0 && this.closeIn <= 0 ? 1 : 0) - this.wideK) * (1 - Math.exp(-dt * 6));
        let cf = this.crashFrame(T / (1 + 0.5 * this.epic), s);
        // (closeIn > 1 comes closer still; a portrait screen opens its lens, so it comes closer too.)
        const ck = (this.camera.aspect < 1 ? 0.72 : 1) / Math.max(1, this.closeIn);
        if (this.closeK > 0.001) cf = mixFrame(cf, { along: -2.2 * ck, lat: 1.35 * ck * this.closeSide * (s || 1), up: 0.35 + 1.4 * ck + this.closeUp, lAlong: 0.1, lLat: 0, lUp: 0.35, fov: cf.fov, focus: 0 }, this.closeK);
        fov = this.shot(runnerPos, this.resultFrame(this.settled(cf)));
        break;
      }
      case 'cashout': {
        fov = this.shot(runnerPos, this.resultFrame(this.settled(this.escapeFrame(T, s))));
        break;
      }
    }
    this.rawTarget.copy(this.targetPos);
    this.runnerAt.copy(runnerPos);
    this.constrain(this.rawTarget);
    this.applyClearance(this.targetPos, this.swing, this.pull);
    return fov;
  }

  /** Rotate the target about the runner by `swing`, pull it toward the chest by `pull`, keep it in the corridor. */
  private applyClearance(out: THREE.Vector3, swing: number, pull: number): THREE.Vector3 {
    const r = this.runnerAt;
    const dx = out.x - r.x;
    const dz = out.z - r.z;
    const c = Math.cos(swing);
    const sn = Math.sin(swing);
    out.x = r.x + dx * c + dz * sn;
    out.z = r.z - dx * sn + dz * c;
    if (pull < 1) {
      this.eye.set(r.x, r.y + 1.3, r.z);
      out.sub(this.eye).multiplyScalar(pull).add(this.eye);
    }
    this.constrain(out);
    return out;
  }

  /** The nearest obstacle between the runner's chest/head and `p`, as a fraction of the way (or null). */
  private blockedAt(p: THREE.Vector3): number | null {
    const r = this.runnerAt;
    let best: number | null = null;
    for (const h of [1.25, 1.62]) {
      this.eye.set(r.x, r.y + h, r.z);
      const len = this.eye.distanceTo(p);
      const d = this.occlude(this.eye, p);
      if (d !== null && d < len - 0.15) best = Math.min(best ?? 1, d / len);
    }
    return best;
  }

  /**
   * Keep the runner in sight: every few frames test the sight lines from chest and head to the
   * camera target. Blocked for a moment → swing the orbit to the nearest clear angle (settled shots)
   * or pull in in front of the obstacle; clear for a while → ease back. Hysteresis stops jitter.
   */
  private clearance(dt: number): void {
    this.occT -= dt;
    const run = this.mode === 'run' || this.mode === 'lead';
    if (this.occT <= 0 && this.mode !== 'title') {
      const step = run ? 0.25 : 0.1;
      this.occT = step;
      const cur = this.applyClearance(this.cand.copy(this.rawTarget), this.swingTarget, 1);
      const hit = this.blockedAt(cur);
      if (hit === null) {
        this.blockedT = 0;
        this.clearT += step;
        if (this.clearT > 0.5) this.pullTarget = 1;
        if (this.swingTarget !== 0 && this.clearT > 1.0 && this.blockedAt(this.applyClearance(this.cand.copy(this.rawTarget), 0, 1)) === null) this.swingTarget = 0;
      } else {
        this.clearT = 0;
        this.blockedT += step;
        if (this.blockedT >= 0.1) {
          let found = false;
          if (!run) {
            for (const d of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
              const a = this.swingTarget + d;
              if (Math.abs(a) > 1.6) continue;
              if (this.blockedAt(this.applyClearance(this.cand.copy(this.rawTarget), a, 1)) === null) {
                this.swingTarget = a;
                this.pullTarget = 1;
                found = true;
                break;
              }
            }
          }
          // Pull in front of the obstacle — but a cinematic never closes to a face-filling close-up.
          const len = this.cand.distanceTo(this.eye.set(this.runnerAt.x, this.runnerAt.y + 1.3, this.runnerAt.z));
          const floor = run ? 0.3 : Math.min(1, MIN_SHOT / Math.max(0.01, len));
          if (!found) this.pullTarget = Math.max(floor, Math.min(this.pullTarget, hit - 0.12));
        }
      }
    }
    this.swing = damp(this.swing, this.swingTarget, 2.2, dt);
    this.pull = damp(this.pull, this.pullTarget, this.pullTarget < this.pull ? 6 : 1.2, dt);
  }

  /**
   * Escape choreography per variant, as an orbit around the runner (angle 0 = behind, π = in
   * front). Bigger escapes orbit wider and crane higher, slower.
   */
  private escapeFrame(T0: number, s: number): Frame {
    const e = this.epic;
    // (Round 20: the celebration's beats come 0.33 s later now: four real steps to turn.)
    const T = Math.max(0, T0 - 0.33) / (1 + 0.4 * e);
    let a: number;
    let r: number;
    let up: number;
    let lAlong: number;
    let lUp: number;
    let fov: number;
    const low = ease((T - 2.3) / 1.1);
    switch (this.escapeShot) {
      case 'salute':
        // Stay behind: the runner turns back to face the lens for the salute.
        a = lerp(0.15, 0.6, ease((T - 0.3) / 2));
        r = lerp(3.6, 4.3, ease(T / 2));
        up = lerp(1.7, 1.45, ease((T - 1) / 1.5));
        lAlong = lerp(2.5, 0, ease(T / 1.4));
        lUp = lerp(1.25, 1.05, ease((T - 1) / 2));
        fov = lerp(52, 48, ease((T - 1) / 2));
        break;
      case 'leap':
        // Swing out to profile to watch the leap, then on round to a low three-quarter front.
        a = lerp(0.2, 1.45, ease(T / 0.8)) + lerp(0, 0.75, ease((T - 1.6) / 2));
        r = lerp(3.8, 4.4, ease(T / 0.8)) - 0.2 * low;
        up = lerp(1.5, 1.25, ease(T / 0.8)) - 0.15 * low;
        lAlong = lerp(2.5, 0, ease(T / 1.2));
        lUp = lerp(1.2, 1.1, low);
        fov = lerp(54, 49, low);
        break;
      case 'cheer':
        // Round to the front, low, looking up at the raised fists.
        a = T < 0.35 ? 0.15 : lerp(0.15, 2.55, ease((T - 0.35) / 2.0));
        r = lerp(3.6, 4.1, low);
        up = lerp(1.6, 0.95, low);
        lAlong = T < 0.35 ? 3 : lerp(1.5, 0, ease((T - 0.35) / 1.5));
        lUp = lerp(1.2, 1.2, low);
        fov = lerp(52, 50, low);
        break;
      default:
        // Look-back: orbit round to a three-quarter front as they stop, then low for the fist.
        a = T < 0.45 ? 0.15 : lerp(0.15, 2.25, ease((T - 0.45) / 2.1)) + Math.max(0, T - 3.4) * 0.03;
        r = lerp(3.6, 4.0, low);
        up = lerp(T < 0.45 ? 1.65 : 1.5, 1.1, low);
        lAlong = T < 0.45 ? 3 : lerp(1.5, 0, ease((T - 0.45) / 1.5));
        lUp = lerp(1.2, 1.15, low);
        fov = lerp(52, 48, low);
    }
    // Grand escapes: a wider orbit that cranes up as it settles. (Round 20: closer all round: he
    // was a fifth of the frame in the turn.)
    const crane = e * ease((T - 1.2) / 2.5);
    r *= 0.8 * (1 + 0.2 * e);
    up += 1.1 * crane;
    fov += 3 * e;
    lUp += 0.2 * crane;
    // The threshold: after the first beat the lens swings round behind the runner's shoulder and
    // pushes slowly toward the gate of light ahead (the way stays whole and calm), the runner a
    // silhouette against the daylight.
    const v = this.reveal * ease((T - 1.4) / 1.8);
    if (v > 0) {
      const push = ease((T - 2.6) / 4);
      a = lerp(a, 0.32, v);
      r = lerp(r, 4.0 + 0.4 * e - 1.0 * push, v);
      up = lerp(up, 1.9 + 0.5 * e, v);
      lAlong = lerp(lAlong, this.gateAhead, v);
      lUp = lerp(lUp, 2.4, v);
      fov = lerp(fov, 56 + 3 * e, v);
    }
    // Portrait: the lens is already opened up for width; come in so the figure keeps its size.
    if (this.camera.aspect < 1) r *= 0.66;
    return { along: -Math.cos(a) * r, lat: s * Math.sin(a) * r, up, lAlong, lLat: 0, lUp, focus: 0, fov };
  }

  /** Crash choreography per staging, in the runner's frame (s = the open side). */
  private crashFrame(T: number, s: number): Frame {
    const f = this.crashBase(T, s);
    // A big fall pulls wider and cranes higher, slowly, to take in the whole collapse.
    const grow = ease(T / 2.6) * this.epic;
    // A tall screen already opens the lens (and settles further back): stay closer on the gate.
    const tall = this.camera.aspect < 1 ? 0.8 : 1;
    // (The ledge: no crane or pull-back with the size of the fall. The beat is him dropping with
    // the floor, held at the lip; see crashBase.)
    if (this.crashShot === 'ledge') return f;
    if (this.crashShot === 'gate') return { ...f, along: f.along * (1 + 0.18 * grow) * tall, up: f.up + 0.7 * grow, lUp: f.lUp + 0.4 * grow, fov: f.fov + 2 * grow };
    const v = this.variant ? -0.35 : 0;
    // (Round 20: a throw across the frame — the side hit — opens the shot while he flies.)
    const w = this.wideK;
    const out = { ...f, along: f.along * (1 + 0.5 * grow) * (1 + 0.8 * w), lat: f.lat * (1 + 0.25 * grow) * (1 + 0.5 * w), up: f.up + 1.6 * grow + v * ease(T / 2), fov: f.fov + 4 * grow + 10 * w };
    // The runner went down with the floor: lean out over the lip and tilt down into the gap.
    if (this.crashShot === 'chasm' && this.gap > 0) return mixFrame(out, F(-1.3, 1.1 * s, 3.1, 1.2, 0, -2.8, 56, 0), this.gap);
    return out;
  }

  private crashBase(T: number, s: number): Frame {
    switch (this.crashShot) {
      case 'gate':
        // Pull back and rise at once, eyes up on the door coming down, then settle off-axis and
        // high: the runner, the broken slabs and the carved door together, never the door alone.
        return track(
          [
            [0, F(-3.2, 0.3 * s, 1.9, 4, 0, 2.8, 60, 0)],
            [0.4, F(-5.6, 1.1 * s, 2.6, 3, 0, 3.4, 62, 0.25)],
            [1.2, F(-6.8, 1.8 * s, 3.4, 2.4, 0, 1.6, 58, 0)],
            // Settle high and aside, looking down the broken way: the runner, the gap, the door.
            [3.0, F(-5.6, 1.9 * s, 3.7, 1.8, 0, 0.9, 57, 0)],
            [7, F(-5.3, 1.9 * s, 3.5, 1.8, 0.2 * s, 0.9, 56, 0)],
          ],
          T,
        );
      case 'chasm':
        // Look down as the slabs go, then crane up and aside over the runner's shoulder: the runner
        // teetering at the lip in the foreground, the gap and the falling slabs beyond. A slow push.
        return track(
          [
            [0, F(-2.8, 0.2 * s, 1.85, 5, 0, 0.3, 58, 0)],
            [0.55, F(-3.0, 0.8 * s, 2.3, 4, 0, 0.1, 57, 0.3)],
            [2.0, F(-3.3, 1.55 * s, 3.3, 3, 0, -0.4, 55, 0.5)],
            [6.5, F(-2.6, 1.7 * s, 2.7, 3, 0, -0.2, 52, 0.45)],
          ],
          T,
        );
      case 'ledge':
        // Round 20 (coordinator, ledge0 review): the floor gives under him. The lens goes on from
        // the chase, behind his shoulder at the lip, and tilts down after him as he drops with
        // the slabs (the look point sinks with him to the trough's floor, 2.75 m below the root
        // this frame is measured from); it never cranes up over the walls. Once he is down the
        // close-in brings it down into the trough beside him (game sets closeIn).
        return track(
          [
            [0, F(-2.35, 0.65 * s, 1.3, 2.2, 0, 0.9, 60, 0)],
            [0.3, F(-2.3, 0.75 * s, 1.35, 1.1, 0, -0.3, 58, 0)],
            [0.75, F(-2.1, 0.9 * s, 1.3, 0.5, 0, -1.8, 56, 0)],
            [1.2, F(-2.0, 1.0 * s, 1.25, 0.3, 0, -2.2, 55, 0)],
            [6.5, F(-1.9, 1.0 * s, 1.2, 0.3, 0, -2.2, 54, 0)],
          ],
          T,
        );
      default:
        // Rockfall: pull back and look up into what is coming, then settle low and aside on the
        // crouched runner with the blocks beyond.
        return track(
          [
            [0, F(-3.0, 0.2 * s, 1.55, 3, 0, 3.4, 60, 0)],
            [0.45, F(-3.6, 0.6 * s, 1.35, 2, 0, 2.6, 58, 0.2)],
            [1.5, F(-3.7, 1.25 * s, 1.05, 0, 0, 1.0, 53, 0.5)],
            [6.5, F(-3.1, 1.5 * s, 1.25, 0, 0, 0.9, 50, 0.45)],
          ],
          T,
        );
    }
  }

  /** Medium-shot floor for the cinematics: the lens stays ≥ MIN_SHOT from the runner's head. */
  private keepMedium(runnerPos: THREE.Vector3): void {
    const head = this.tmp.set(runnerPos.x, runnerPos.y + 1.62, runnerPos.z);
    const d = this.pos.distanceTo(head);
    if (d >= MIN_SHOT) return;
    const dir = this.pos.clone().sub(head);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
    this.pos.copy(head).addScaledVector(dir.normalize(), MIN_SHOT);
    this.constrain(this.pos);
  }

  update(dt: number, runnerPos: THREE.Vector3, runnerYaw: number, intensity: number): void {
    this.t += dt;
    this.modeT += dt;
    // The game clamps a frame to 50 ms of presentation time. On a device (or a capture) running at a
    // frame or two a second, a settled move (title → setup, the result framing) therefore took
    // tens of seconds of real time, and the setup showed the title's view with only the runner's
    // head above the dock. Outside the run the springs follow real time too (capped at 1 s a frame);
    // presentation keyframes still run on game time.
    const now = performance.now();
    const wall = this.wallClock && this.lastWall > 0 ? Math.min(1, (now - this.lastWall) / 1000) : 0;
    this.lastWall = now;
    // Clarity round 21: in the settled shots without keyframes (title, setup) every step of the
    // shot — springs, clearance, the fit into the free band — runs on one dt, the frame's real time
    // capped at 0.25 s. With the springs on real time (up to 1 s a frame) and the fit on 50 ms of
    // presentation, a device at a frame every few seconds never settled: the runner sank behind the
    // dock, then rose out of the top of the frame. (Crash and cash-out shots, keyed to presentation
    // time, keep their springs on real time as before.)
    const settled = this.mode === 'title' || this.mode === 'setup';
    if (settled) dt = Math.max(dt, Math.min(wall, 0.25));
    const sdt = this.mode === 'run' || this.mode === 'lead' ? dt : settled ? dt : Math.max(dt, wall);
    const fov = this.computeTarget(runnerPos, runnerYaw, intensity, dt);
    this.clearance(dt);
    const running = this.mode === 'run';
    const stiff = running ? 7.5 : this.mode === 'title' ? 1.2 : this.mode === 'lead' ? 2.4 : 3.2;
    dampV(this.pos, this.targetPos, stiff, sdt);
    if (running) {
      // Hold the chase distance along the route; springs only carry sway and height. For the first
      // moments of a run the hold is loose, so the runner bursts away before the lens catches up.
      const along = this.tmp.copy(this.targetPos).sub(this.pos).dot(this.fwd);
      const hold = 30 * (0.12 + 0.88 * ease(this.modeT / 0.9));
      this.pos.addScaledVector(this.fwd, along * (1 - Math.exp(-dt * hold)));
    }
    if (this.mode === 'cashout' || this.mode === 'crash') {
      // Settled shots: keep up with a runner still carrying speed (a big escape's run-out) along the
      // route, so the figure never shrinks into the distance while the springs catch up.
      const along = this.tmp.copy(this.targetPos).sub(this.pos).dot(this.fwd);
      // An escape's run-out carries real speed for its first second: keep up harder then.
      // (Round 20: and a fall's first second — the dive over the drum, the slam — carries him on at
      // run speed: a slack follow read as the lens backing away. The output spring smooths it.)
      const k = this.mode === 'cashout' && this.modeT < 1.6 ? 10 : this.mode === 'crash' && this.modeT < 1.4 ? 16 : 6;
      this.pos.addScaledVector(this.fwd, along * (1 - Math.exp(-dt * k)));
    }
    dampV(this.look, this.targetLook, stiff * 1.4, sdt);
    this.constrain(this.pos);
    if (this.mode === 'cashout' || this.mode === 'crash') this.keepMedium(runnerPos);
    // Never let the lens dip under the runner's feet.
    this.pos.y = Math.max(this.pos.y, runnerPos.y + 0.6);
    // Portrait screens: open the vertical angle so the way ahead still fits across.
    const a = this.camera.aspect;
    const portrait = a < 1 ? Math.min(1.55, 1 + (1 - a) * 0.95) : 1;
    this.fovKick *= Math.exp(-dt * 2.2);
    this.fov = damp(this.fov, Math.min((fov + this.fovKick) * portrait, 96), 2.5, sdt);

    // Operator: footfall bob and a little sway on a spring.
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const fk = Math.exp(-h * JOLT_K);
      this.bobV += this.joltY * (1 - fk) / JOLT_K;
      this.swayV += this.joltX * (1 - fk) / JOLT_K;
      this.joltY *= fk;
      this.joltX *= fk;
      this.bobV += (-160 * this.bob - 15 * this.bobV) * h;
      this.bob += this.bobV * h;
      this.swayV += (-60 * this.sway - 9 * this.swayV) * h;
      this.sway += this.swayV * h;
    }
    // Bank a touch into turns.
    const yawRate = dt > 0 ? angleDelta(this.lastYaw, runnerYaw) / dt : 0;
    this.lastYaw = runnerYaw;
    const bank = 0.08 * (1 + 0.25 * this.drive);
    this.dutch = damp(this.dutch, running ? THREE.MathUtils.clamp(yawRate * bank, -0.12, 0.12) * this.motionScale : 0, 3, dt);

    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const m = this.shakeEnabled ? this.motionScale : 0;
    // Continuous tremor rises with intensity; trauma adds sharp shake on impacts.
    const base = running ? 0.008 + 0.045 * intensity * intensity : 0.003;
    const amp = (base + this.trauma * this.trauma * 0.35) * m;
    const t = this.t;
    // Round 20 (motion critic): the impact part of the shake heaves at 1.5-2.5 Hz (a heavy knock,
    // ≤ 5 cm/frame² at 30 fps), not the tremor's 3-7 Hz buzz, which at impact amplitude jerked the
    // lens ~40 cm/frame². Its heave is also 30 % smaller.
    const tA = base * m;
    const kA = this.trauma * this.trauma * 0.24 * m;
    const sx = (Math.sin(t * 17.3) * 0.6 + Math.sin(t * 31.1 + 1.3) * 0.4) * tA + (Math.sin(t * 8.3) * 0.6 + Math.sin(t * 12.1 + 1.3) * 0.4) * kA;
    const sy = (Math.sin(t * 21.7 + 0.7) * 0.6 + Math.sin(t * 43.3 + 2.1) * 0.4) * tA + (Math.sin(t * 10.1 + 0.7) * 0.6 + Math.sin(t * 13.3 + 2.1) * 0.4) * kA;
    // A slow handheld breath outside the run; in the run, an operator's sway (low, uneven).
    const breathe = running ? 0 : Math.sin(t * 0.7) * 0.012 * this.motionScale;
    const hand = running ? this.motionScale * (0.6 + 0.4 * intensity) : 0;
    const hx = (Math.sin(t * 1.13) * 0.6 + Math.sin(t * 2.31 + 1.0) * 0.4) * 0.035 * hand;
    const hy = (Math.sin(t * 1.57 + 0.4) * 0.6 + Math.sin(t * 2.9 + 2.2) * 0.4) * 0.022 * hand;
    const hr = (Math.sin(t * 0.83 + 0.9) * 0.7 + Math.sin(t * 1.9) * 0.3) * 0.009 * hand;

    this.camera.position.copy(this.pos);
    // (Round 20: the shake and the footfall bob go on after the output spring below, which would
    // otherwise swallow them; the spring smooths the shot, not the deliberate tremor.)
    this.camera.position.addScaledVector(this.right, this.sway + hx);
    this.camera.position.y += breathe + hy;
    this.camera.lookAt(this.look);
    this.camera.fov = this.fov;
    // Round 18: the title too (its high pass looked down the way ahead with him just under the
    // bottom edge): the boots tilt up into the band, never a stand-back (settled shots only).
    // (Round 20: the result card comes in on real time, so the composition beside it does too: on
    // the slow motion's clock the lens took a second to move him out from behind the 60x card.)
    const rdt = this.realDt > 0 ? this.realDt : dt;
    this.keepInFrame(this.bodyAt ?? runnerPos, dt, rdt);
    this.rollKick *= Math.exp(-dt * 2.6);
    this.camera.rotateZ(this.dutch + hr + this.rollKick);
    this.camera.fov = this.fov;
    this.revealK += ((this.revealed && (this.mode === 'crash' || this.mode === 'cashout') ? 1 : 0) - this.revealK) * (1 - Math.exp(-rdt * 2.5));
    // The title fly-over rides high over the causeway, level with the arch crowns: their stones
    // passed a metre or two above the lens and filled the top of a phone frame as huge, soft blocks.
    // Nothing the title is about is nearer than the runner, so its near plane follows him: up to
    // 6.5 m out on the high pass (the floor is ≥ 9 m below it there), ~1.5 m on the low pass.
    // The setup on a wide screen stands back down the corridor: the walls right beside the lens are
    // clipped the same way (nothing it frames is nearer than ~40 % of the way to the runner).
    if (this.mode === 'title' || this.mode === 'setup') {
      const d = this.camera.position.distanceTo(this.tmp.copy(runnerPos).setY(runnerPos.y + 1));
      this.camera.near = this.mode === 'title' ? Math.min(6.5, Math.max(0.1, 0.55 * d)) : Math.min(3.5, Math.max(0.1, 0.4 * d));
    } else this.camera.near = 0.1;
    // The game's own corrections (the ceiling, the guard that draws a lens out of a wall) act on
    // the shot before the output spring, so they too are jerk-limited.
    this.preOutput?.(dt);
    this.smoothOut(dt);
    this.camera.position.addScaledVector(this.right, sx);
    this.camera.position.y += sy + this.bob;
    this.camera.rotateZ((Math.sin(t * 13.1) * 0.5 + Math.sin(t * 7.7)) * amp * 0.06); // (≤ ~2° of roll at full trauma: no Dutch angle)
    this.applyShift(dt);
    this.camera.updateProjectionMatrix();
  }

  private shift = 0;
  private shiftTarget = 0;
  /** Compose for the part of the screen the interface leaves free (px covered at top/bottom). */
  setInsets(top: number, bottom: number, heightPx: number): void {
    this.shiftTarget = Math.min(0.32, Math.max(-0.1, (bottom - top) / 2 / Math.max(1, heightPx)));
    this.free = Math.min(1, Math.max(0.3, 1 - (Math.max(0, top) + Math.max(0, bottom)) / Math.max(1, heightPx)));
    this.insetTop = Math.min(0.45, Math.max(0, top / Math.max(1, heightPx)));
    this.insetBottom = Math.min(0.6, Math.max(0, bottom / Math.max(1, heightPx)));
  }
  /** Fraction of the screen height the interface leaves free (1 with no insets). */
  private free = 1;
  private insetTop = 0;
  private insetBottom = 0;

  /**
   * Keep the whole runner, boots to head, in the band the interface leaves free. In the unshifted
   * projection (NDC y, before the view offset moves the frame by `shift`) that band runs from
   * -1 - 2s + 2b (the dock's top edge) to 1 - 2s - 2t (the top bar's lower edge). The frame first
   * tilts down until the boots clear the dock line; if the head would then leave the top of the band,
   * it stands further back and tries again. Only lowers the aim or pulls back, never the reverse.
   */
  /** Follow real time in the springs outside the run (set by the game: false while it steps QA time). */
  wallClock = true;
  private lastWall = 0;

  /**
   * The runner, whole, in the part of the frame the interface leaves free — every frame, whatever
   * the springs are doing. The composed targets (fitInBand, the setup shot, resultFrame) aim for
   * this; the lens trails them on springs (further behind the faster he runs, and for long seconds on
   * a slow device), so the real view is checked here and corrected directly:
   *  - settled shots (setup, falls, escapes) stand back along the view until boots to crown and
   *    both arms fit, then tilt and pan just enough to bring him inside;
   *  - the run and the lead tilt down until the boots clear the cash-out plate (never so far that
   *    the crown leaves the band), and pan so no arm leaves the side margin (~16 pt on a phone).
   * In unshifted NDC the band runs from -1 - 2s + 2b (the dock's top edge) to 1 - 2s - 2t.
   */
  /** Eased stand-back distance of a settled shot (m along the view; see keepInFrame). */
  private standBack = 0;
  private standBackV = 0;
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();
  /**
   * Round 17 — the result shot. Once the result card is up (revealK), the runner is framed big (head
   * to boots ≥ ~30 % of the frame height) and, on a landscape screen whose interface is a centre
   * column (card + dock), composed on a third beside that column so the card never covers him.
   * Portrait keeps him centred in the band between card and dock. `sideK` and the size target ease
   * in critically damped.
   */
  setUiColumn(left: number, right: number, topBar: number, widthPx: number, heightPx: number): void {
    this.uiCol = widthPx > 0 ? [left / widthPx, right / widthPx] : null;
    this.uiTopBar = Math.min(0.3, Math.max(0, topBar / Math.max(1, heightPx)));
  }
  private uiCol: [number, number] | null = null;
  /** Real (unscaled) frame time, set by the game before update(): the interface runs on it. */
  realDt = 0;
  /** The result card lands within about half a second (set by the game). */
  revealSoon = false;
  private uiTopBar = 0;
  private sideK = 0;
  private sideV = 0;
  private sideX = 0;
  /**
   * Round 18: where the figure actually is (ground height), when a clip carries him off the
   * composition's subject (the 50x+ slide turns about a point metres from his hips). The shot
   * composes on the eased subject; keeping him in frame measures the body itself.
   */
  bodyAt: THREE.Vector3 | null = null;
  /** Round 18: world positions of the posed limbs (head, hands, feet) to keep in frame, or null. */
  bodyPts: THREE.Vector3[] | null = null;
  private tmp4 = new THREE.Vector3();

  private keepInFrame(runnerPos: THREE.Vector3, dt = 1 / 60, rdt = dt): void {
    // (Looking down into the gap after him; once the lens has closed in on him lying on the ledge's
    // stone, he is framed again.)
    if (this.mode === 'crash' && this.gap > 0.3 && this.closeK < 0.5) return;
    const c = this.camera;
    const s = this.shift;
    // (Round 20: from just before the card lands, too — set by the game half a second ahead — so he
    // is already moving out from behind where it will stand.)
    const result = (this.mode === 'cashout' || this.mode === 'crash') ? Math.max(this.revealK, this.revealSoon ? 0.02 : 0) : 0;
    // Landscape with a centre interface column: compose beside it, on the wider free side.
    let sideWant = 0;
    // (Ahead of the card the column reported is the dock's, the full width: the card's own, centred
    // and about 45% wide on landscape, is taken until it is up.)
    const col: [number, number] | null = this.revealK < 0.01 && this.revealSoon ? [0.27, 0.72] : this.uiCol;
    if (result > 0.01 && c.aspect > 1.15 && col) {
      const [l, r] = col;
      if (r - l < 0.62) {
        sideWant = 1;
        const leftRoom = l;
        const rightRoom = 1 - r;
        // The centre of the wider free side, in NDC x (a third of the way in from the edge).
        const target = leftRoom >= rightRoom ? l * 0.55 : r + (1 - r) * 0.45;
        if (this.sideK < 0.02) this.sideX = target * 2 - 1;
      }
    }
    const ws = 5.5;
    this.sideV += (ws * ws * (sideWant - this.sideK) - 2 * ws * this.sideV) * rdt;
    this.sideK = THREE.MathUtils.clamp(this.sideK + this.sideV * rdt, 0, 1);
    // (The band beside the column only once the card is actually landing: ahead of it the dock still
    // stands under him, and the pan alone starts early.)
    const side = Math.min(this.sideK, this.revealK * 1.5);
    // Beside the column, the free band is the full height under the top bar (the shift eases to 0).
    // (The title stands his boots clear of its footer line, a little higher than the dock margin.)
    const lo = THREE.MathUtils.lerp(-1 - 2 * s + 2 * this.insetBottom + (this.mode === 'title' ? 0.24 : 0.11), -1 - 2 * s + 0.08, side) + (this.mode === 'cashout' ? 0.08 : 0); // (the slide's legs swing out: footroom too)
    // (Round 20: the celebration's leaps and raised arms move faster than the jerk-limited lens
    // turns: the cash-out keeps more headroom so the lag never takes his head or hands off the frame.)
    const head = this.mode === 'cashout' ? 0.14 : 0;
    const hi = THREE.MathUtils.lerp(1 - 2 * s - 2 * this.insetTop - 0.05, 1 - 2 * s - 2 * this.uiTopBar - 0.06, side) - head;
    if (hi - lo < 0.2) return;
    const tanV = Math.tan((this.fov * Math.PI) / 360);
    const tanH = tanV * c.aspect;
    const mx = 1 - 0.09 - (this.mode === 'cashout' ? (this.camera.aspect < 1 ? 0.1 : 0.06) : 0); // side margin in NDC (16 pt of a 390 pt phone)
    const settled = this.mode === 'setup' || this.mode === 'crash' || this.mode === 'cashout';
    const pts = this.framePts;
    const measure = () => {
      c.updateMatrixWorld();
      const inv = this.tmpInv.copy(c.matrixWorld).invert();
      pts[0]!.copy(runnerPos);
      pts[1]!.copy(runnerPos).setY(runnerPos.y + 1.85);
      pts[2]!.copy(runnerPos).setY(runnerPos.y + 1.2).addScaledVector(this.right, -0.45);
      pts[3]!.copy(runnerPos).setY(runnerPos.y + 1.2).addScaledVector(this.right, 0.45);
      const m = this.frameM;
      m.feet = m.head = m.left = m.right = 0;
      m.depth = 0;
      for (let i = 0; i < 4; i++) {
        const p = pts[i]!.applyMatrix4(inv);
        if (p.z > -0.3) return false;
        const x = p.x / -p.z;
        const y = p.y / -p.z;
        if (i === 0) m.feet = y;
        if (i === 1) m.head = y;
        if (i === 0 || i === 1) m.depth += -p.z / 2;
        // Round 18: the extent over every point. (It took the shoulder points by name, so with the
        // lens looking back at him, his right on the frame's left, both collapsed onto the feet:
        // no width, no side margin, no stand-back for it.)
        m.left = i === 0 ? x : Math.min(m.left, x);
        m.right = i === 0 ? x : Math.max(m.right, x);
      }
      // Round 18: the limbs as posed (a slide throws the legs a metre out from the hips): widen
      // the extent to take them in (never narrower than the standing figure above).
      if (this.bodyPts) {
        for (const b of this.bodyPts) {
          const p = this.tmp4.copy(b).applyMatrix4(inv);
          if (p.z > -0.3) continue;
          const x = p.x / -p.z;
          const y = p.y / -p.z;
          m.left = Math.min(m.left, x);
          m.right = Math.max(m.right, x);
          m.feet = Math.min(m.feet, y);
          m.head = Math.max(m.head, y);
        }
      }
      return true;
    };
    if (!measure()) return;
    const m = this.frameM;
    {
      // Too big for the band (or the width): stand back along the view. Eased (round 16): when the
      // result card and dock arrive (or the shot settles) the band shrinks at once, and an instant
      // stand-back cut the lens several metres back in one frame.
      let want = 0;
      if (settled) {
        const needV = (m.head - m.feet) / ((hi - lo) * tanV * 0.92);
        const needH = (m.right - m.left) / ((side > 0.5 ? 0.6 : 2 * mx) * tanH * 0.92);
        const k = Math.max(needV, needH);
        if (k > 1) want = Math.min(3.5, m.depth * (k - 1));

        // Never back into the scenery behind the lens (a wall, a statue): stop short of the first
        // solid on the way out from his chest.
        if (want > 0.05) {
          c.getWorldDirection(this.tmp);
          const from = this.tmp2.set(runnerPos.x, runnerPos.y + 1.3, runnerPos.z);
          const to = this.tmp3.copy(c.position).addScaledVector(this.tmp, -want);
          const len = from.distanceTo(to);
          const hit = this.occlude(from, to);
          if (hit !== null && hit < len) want = Math.max(0, want - (len - hit) - 0.5);
        }
      }
      // Critically damped (it starts from rest, so the dolly-out has no lurch at its first frame).
      const w = 4;
      this.standBackV += (w * w * (want - this.standBack) - 2 * w * this.standBackV) * dt;
      this.standBack = Math.max(0, this.standBack + this.standBackV * dt);
      if (Math.abs(this.standBack) > 0.01) {
        c.getWorldDirection(this.tmp);
        c.position.addScaledVector(this.tmp, -this.standBack);
        if (!measure()) return;
      }
    }
    // Vertical: boots above the dock line first; then the crown under the top of the band.
    const loT = lo * tanV;
    const hiT = hi * tanV;
    let tilt = 0;
    if (m.feet < loT) tilt = -(Math.atan(loT) - Math.atan(m.feet));
    else if (settled && m.head > hiT) tilt = Math.atan(m.head) - Math.atan(hiT);
    if (tilt < 0) tilt = -Math.min(-tilt, Math.max(0, Math.atan(hiT) - Math.atan(m.head)));
    else if (tilt > 0) tilt = Math.min(tilt, Math.max(0, Math.atan(m.feet) - Math.atan(loT)));
    if (Math.abs(tilt) > 1e-4) c.rotateX(tilt);
    // Horizontal: both arms inside the side margins.
    const mT = mx * tanH;
    let pan = 0;
    if (m.left < -mT) pan = Math.atan(-mT) - Math.atan(m.left);
    else if (m.right > mT) pan = -(Math.atan(m.right) - Math.atan(mT));
    // The result shot on landscape: pan so he stands on a third, beside the interface column.
    if (this.sideK > 0.001) {
      const cx = (m.left + m.right) / 2;
      const want = Math.atan(this.sideX * tanH) - Math.atan(cx);
      pan = THREE.MathUtils.lerp(pan, want, this.sideK);
      // Round 18: the third never pushes a limb past the side margins (the 50x+ slide's turn
      // swings him a metre or two across the frame).
      const pMin = Math.atan(-mT) - Math.atan(m.left);
      const pMax = Math.atan(mT) - Math.atan(m.right);
      if (pMin <= pMax) pan = THREE.MathUtils.clamp(pan, pMin, pMax);
    }
    // (Round 20: about the world's vertical. About the lens's own Y, a pan on a shot looking down
    // (the crash close-in) rolled the horizon by up to ~25°.)
    if (Math.abs(pan) > 1e-4) c.rotateOnWorldAxis(WORLD_UP, pan);
  }
  private framePts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private frameM = { feet: 0, head: 0, left: 0, right: 0, depth: 0 };
  private tmpInv = new THREE.Matrix4();

  private fitInBand(f: Frame): Frame {
    const s = this.shiftTarget;
    // The bottom margin clears the gem crest that stands proud of the cash-out plate's top edge.
    const lo = -1 - 2 * s + 2 * this.insetBottom + 0.11;
    const hi = 1 - 2 * s - 2 * this.insetTop - 0.05;
    if (hi - lo < 0.2) return f;
    const a = this.camera.aspect;
    const lens = Math.min(96, f.fov * (a < 1 ? Math.min(1.55, 1 + (1 - a) * 0.95) : 1));
    const tanHF = Math.tan((lens * Math.PI) / 360);
    const H = 1.8; // boots to crown, metres
    const U = f.up;
    let D = Math.max(0.5, -f.along);
    const reach = f.lAlong + D;
    const theta0 = Math.atan2(U - f.lUp, reach);
    let theta = theta0;
    for (let i = 0; i < 10; i++) {
      const tMin = Math.atan2(U, D) + Math.atan(lo * tanHF);
      const tMax = Math.atan(hi * tanHF) - Math.atan2(H - U, D);
      theta = Math.max(theta0, tMin);
      if (theta <= tMax) break;
      D *= 1.1;
    }
    if (theta === theta0 && D === -f.along) return f;
    const k = D / Math.max(0.5, -f.along);
    return { ...f, along: -D, lat: f.lat * k, lUp: U - Math.tan(theta) * (f.lAlong + D) };
  }

  private applyShift(dt: number) {
    // A settled shot under the result card centres the band between the card and the dock, which
    // can sit higher than the run's own limits allow.
    const cine = this.revealK > 0.001 ? Math.min(0.32, Math.max(-0.3, (this.insetBottom - this.insetTop) / 2)) : this.shiftTarget;
    const target = lerp(lerp(this.shiftTarget, cine, this.revealK), 0, Math.min(this.sideK, this.revealK * 1.5));
    this.shift += (target - this.shift) * (1 - Math.exp(-dt * 3));
    const c = this.camera;
    if (Math.abs(this.shift) < 0.001) {
      if (c.view) c.clearViewOffset();
      return;
    }
    const w = 1000;
    const h = w / c.aspect;
    c.setViewOffset(w, h, 0, this.shift * h, w, h);
  }

  setAspect(a: number): void {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
