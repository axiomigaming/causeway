import * as THREE from 'three';
import type { Rng } from '../engine/rng';
import { OBSTACLES, obstacleTiming, type Obstacle } from '../world/runner';

/**
 * The obstacle director: set pieces on the way ahead that the runner always clears (presentation
 * only — the outcome is the server's). Which, when and how many come from the CURRENT multiplier's
 * tier and the cosmetic RNG only, never from the hidden fall point. Nothing here runs after the
 * round settles (no near-miss staging after a cash-out): the game stops calling update() and
 * reset() clears what is left.
 *
 * Pacing: a calm straight stretch, then a burst of 1–3 set pieces a couple of seconds apart; the
 * calm shortens and the bursts grow (and turn spectacular) with the tier.
 *
 * Set pieces (placeholders built from kit meshes until dedicated art lands):
 *   log      a fallen trunk across the way → he jumps it (jump_log)
 *   beam     a low fallen lintel on two posts → he slides under it (slide); at tier 1+ it often slams
 *            down onto the floor right behind him
 *   pillar   a column topples across the way ahead of him → he vaults it (vault) (tier 1+)
 *   blocks   the slabs ahead crack loose and drift apart over the water → he leaps each gap
 *            (leap_gap, 2–3 leaps); the loose slabs tilt and sink (tier 2+)
 *   rocks    rocks rain down beside the way (the game's 'stones' cue) (tier 1+)
 *   boulder  near miss: a boulder thunders across the way just in front of him (tier 2+)
 *   tile     near miss: the slab he just left drops into the water (tier 1+)
 * And wherever the route bends hard, he cuts the corner on the outside foot (turn_cut_L/R).
 *
 * Timing: a move must take off where the piece is. Each piece is placed ~2.5 s ahead; the director
 * then calls runner.obstacle() so that its start foot, the clip's takeoff and the piece line up, and
 * nudges the route speed by a few percent while he approaches (sRate) so the residual error of up to
 * half a stride closes smoothly instead of the move firing early or late.
 */
export type SetPiece = 'log' | 'blocks' | 'pillar' | 'beam' | 'boulder' | 'tile' | 'rocks';

/** Weights per tier (0–4). */
const TABLE: readonly (readonly (readonly [SetPiece, number])[])[] = [
  [['log', 3], ['beam', 2]],
  [['log', 3], ['beam', 2], ['pillar', 2], ['tile', 1], ['rocks', 1]],
  [['log', 2], ['beam', 2], ['pillar', 2], ['tile', 2], ['blocks', 3], ['boulder', 1], ['rocks', 1]],
  [['log', 1], ['beam', 2], ['pillar', 3], ['tile', 2], ['blocks', 3], ['boulder', 2], ['rocks', 1]],
  [['log', 1], ['beam', 2], ['pillar', 3], ['tile', 2], ['blocks', 4], ['boulder', 3], ['rocks', 1]],
];

/** Pure pacing rule: the calm before the next burst (s) and the burst's size, by tier. */
export function nextBurst(rng: Rng, tier: number): { calm: number; count: number; gap: number } {
  const t = Math.max(0, Math.min(4, tier));
  const calm = [6.5, 5, 4, 3, 2.4][t]! * rng.range(0.75, 1.3);
  const count = t === 0 ? rng.int(1, 2) : rng.int(Math.min(2, t), Math.min(3, 1 + t));
  const gap = [2.4, 2.2, 2.0, 1.8, 1.6][t]! * rng.range(0.9, 1.2);
  return { calm, count, gap };
}

export function pickPiece(rng: Rng, tier: number): SetPiece {
  return rng.weighted(TABLE[Math.max(0, Math.min(4, tier))]!);
}

/**
 * The timing error (s) of starting a move now, wrapped to the nearest start foot: the move's start
 * foot comes round once per gait cycle, so an error of a whole cycle is no error at all.
 */
export function wrapCycle(err: number, period: number): number {
  return err - period * Math.round(err / period);
}

/** A box with UVs in metres / 1.5 (kit textures tile about every 1.5 m), not stretched per face. */
function boxUV(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // Face order: +x, −x, +y, −y, +z, −z (4 vertices each): (u, v) spans (d, h), (w, d), (w, h).
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f]![0]) / 1.5, (uv.getY(i) * dims[f]![1]) / 1.5);
    }
  uv.needsUpdate = true;
  return g;
}

export interface FrameAt {
  pos: THREE.Vector3;
  yaw: number;
  fwd: THREE.Vector3;
  right: THREE.Vector3;
}

export interface Tile {
  piece: string;
  world: THREE.Matrix4;
  near: number;
  far: number;
}

/** What the director needs from the game (closures over its internals). */
export interface ObstacleHost {
  s(): number;
  speed(): number;
  running(): boolean;
  rng(): Rng;
  frameAt(s: number): FrameAt;
  /** A stretch the obstacle can stand on: plain floor, no stairs, nothing scripted on it. */
  clearRun(s0: number, s1: number): boolean;
  /** Collapsible floor tiles whose near edge lies in [s0, s1], in order. */
  tiles(s0: number, s1: number): Tile[];
  hideTile(t: Tile): void;
  add(o: THREE.Object3D): void;
  remove(o: THREE.Object3D): void;
  material(key: string): THREE.Material | undefined;
  geometry(piece: string): THREE.BufferGeometry | undefined;
  /** The runner's gait (runner.gait()). */
  gait(): { phase: number; cadence: number; running: boolean };
  /** runner.obstacle(): the wait (s) before the move starts, or −1. */
  obstacle(name: Obstacle, distance?: number): number;
  debris(piece: string, m: THREE.Matrix4, vel: THREE.Vector3, spin: THREE.Vector3, opts?: { breakInto?: number; breakAfter?: number; mat?: string; scale?: number }): void;
  dust(at: THREE.Vector3, k: number, vel?: THREE.Vector3): void;
  shake(k: number): void;
  sound(name: string, k: number): void;
  /** How far behind the runner (along the route) the lens is, metres. */
  lensBack(): number;
  /** One of the game's run cues ('stones': rocks raining beside the way). */
  cue(name: 'stones', k: number): void;
}

interface Live {
  kind: SetPiece | 'turn';
  s: number;
  objs: THREE.Object3D[];
  /** Per-frame animation; returns false when the piece is done (behind and settled). */
  tick: (dt: number, ds: number) => boolean;
  /** An overhead piece: the world height of its underside while it stands (else null). */
  ceil?: () => number | null;
}

/** A move the runner owes a set piece: `at` is where the middle of the move (the apex) must be. */
interface Plan {
  name: Obstacle;
  at: number;
  dist: number;
  /** After the call: seconds until the apex, takeoff and landing (counted down). */
  called: boolean;
  tApex: number;
  tTake: number;
  tLand: number;
  onTake?: () => void;
  onLand?: () => void;
}

export class ObstacleDirector {
  private live: Live[] = [];
  private plans: Plan[] = [];
  private calmIn = 3;
  private burstLeft = 0;
  private gapIn = 0;
  private nextGap = 2;
  /** Route distance of the last piece: pieces never crowd each other. */
  private lastS = -1e9;
  private turnS = -1e9;
  private tier = 0;
  enabled = true;
  /** Route-speed correction (m/s) while a move lines up with its piece: add to the runner's ds/dt. */
  sRate = 0;
  /** Count by kind (QA). */
  readonly fired: Record<string, number> = {};

  constructor(private h: ObstacleHost) {}

  reset(): void {
    for (const l of this.live) for (const o of l.objs) this.h.remove(o);
    this.live.length = 0;
    this.plans.length = 0;
    this.calmIn = 3;
    this.burstLeft = 0;
    this.gapIn = 0;
    this.lastS = -1e9;
    this.turnS = -1e9;
    this.sRate = 0;
  }

  /**
   * The round settled (cash-out or fall): no more moves, beats or near misses. Pieces still ahead
   * crumble away in a puff of dust (they must not stand in the escape's way or the fall's staging);
   * the ones behind stay where they lie.
   */
  settle(): void {
    this.plans.length = 0;
    this.sRate = 0;
    this.burstLeft = 0;
    const s = this.h.s();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      if (l.s < s - 1 || l.objs.length === 0) {
        // Behind him: keep the objects, stop any animation (a slam or a roll would be staging).
        if (l.objs.length) this.live[i] = { ...l, tick: (_dt, ds) => ds > -30 };
        else this.live.splice(i, 1);
        continue;
      }
      for (const o of l.objs) {
        this.h.dust(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), 0.5);
        this.h.remove(o);
      }
      this.live.splice(i, 1);
    }
  }

  /** The lowest underside of a standing overhead piece within ~1 m of route distance `s`, or null. */
  ceilingAt(s: number): number | null {
    let best: number | null = null;
    for (const l of this.live) {
      if (!l.ceil || Math.abs(l.s - s) > 1.1) continue;
      const y = l.ceil();
      if (y !== null && (best === null || y < best)) best = y;
    }
    return best;
  }

  /** True while a move is lined up or in the air (other beats — hops, ducks, glances — hold off). */
  get busy(): boolean {
    return this.plans.length > 0;
  }

  /** Each frame while running (and only then). `tier` is the current multiplier's tier. */
  update(dt: number, tier: number, stageT: number): void {
    this.tier = tier;
    const s = this.h.s();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      if (!l.tick(dt, l.s - s)) {
        for (const o of l.objs) this.h.remove(o);
        this.live.splice(i, 1);
      }
    }
    this.steer(dt);
    if (!this.enabled || !this.h.running() || stageT < 2.2) return;
    this.turns();
    if (this.burstLeft > 0) {
      this.gapIn -= dt;
      if (this.gapIn <= 0) {
        if (this.spawn(tier)) this.burstLeft--;
        this.gapIn = this.burstLeft > 0 ? this.nextGap : 0.4;
        if (this.burstLeft === 0) this.calmIn = nextBurst(this.h.rng(), tier).calm;
      }
      return;
    }
    this.calmIn -= dt;
    if (this.calmIn <= 0) {
      const b = nextBurst(this.h.rng(), tier);
      this.burstLeft = b.count;
      this.nextGap = b.gap;
      this.gapIn = 0;
    }
  }

  /** Force one (QA): returns whether it was placed. */
  force(kind: SetPiece, lead = 2.5): boolean {
    // QA: clear the way first (pending moves and spacing), so the piece always goes in.
    this.plans.length = 0;
    this.lastS = -1e9;
    return this.place(kind, lead);
  }

  // ---------------------------------------------------------------- timing

  private plan(name: Obstacle, at: number, dist = 2.25, hooks: Pick<Plan, 'onTake' | 'onLand'> = {}): void {
    this.plans.push({ name, at, dist, called: false, tApex: 0, tTake: 0, tLand: 0, ...hooks });
    this.plans.sort((a, b) => a.at - b.at);
  }

  /** Line the next move up with its piece, call it on the right foot, fire its takeoff/landing beats. */
  private steer(dt: number): void {
    this.sRate = 0;
    const p = this.plans[0];
    if (!p) return;
    const v = Math.max(1, this.h.speed());
    const eta = (p.at - this.h.s()) / v;
    if (p.called) {
      p.tApex -= dt;
      p.tTake -= dt;
      p.tLand -= dt;
      if (p.tTake <= 0 && p.onTake) {
        p.onTake();
        p.onTake = undefined;
      }
      if (p.tLand <= 0) {
        p.onLand?.();
        this.plans.shift();
        return;
      }
      // The clip is committed: close what is left of the gap between the apex and the piece.
      if (p.tApex > 0.05) this.sRate = THREE.MathUtils.clamp(((eta - p.tApex) * v) / Math.max(0.25, p.tApex), -0.2 * v, 0.2 * v);
      return;
    }
    if (eta < -0.5) {
      // Missed (he was busy): drop it rather than jump after the fact.
      this.plans.shift();
      return;
    }
    const g = this.h.gait();
    const T = obstacleTiming(p.name, g.cadence, v, p.dist);
    const apex = 0.5 * (T.takeoff + T.land);
    const period = 1 / Math.max(0.5, g.cadence);
    const from = OBSTACLES[p.name].from;
    let wait = from < 0 ? 0 : ((((from - g.phase + 1) % 1) + 1) % 1) * period;
    // Mirror runner.obstacle(): a foot that has only just passed (or is about to) starts the move now.
    if (wait < 0.01 || wait > 0.98 * period) wait = 0;
    const err = eta - apex - wait;
    if (err <= 0.5 * period && g.running) {
      const w = this.h.obstacle(p.name, p.dist);
      if (w < 0) {
        this.plans.shift();
        return;
      }
      p.called = true;
      p.tApex = w + apex;
      p.tTake = w + T.takeoff;
      p.tLand = w + T.land;
      return;
    }
    // Approach: spread the error (wrapped to the nearest start foot) over the run-up.
    this.sRate = THREE.MathUtils.clamp((wrapCycle(err, period) * v) / Math.max(0.6, eta - apex), -0.12 * v, 0.12 * v);
  }

  // ---------------------------------------------------------------- pacing

  private spawn(tier: number): boolean {
    const kind = pickPiece(this.h.rng(), tier);
    if (this.place(kind, 2.5)) return true;
    return kind !== 'log' && this.place('log', 2.5);
  }

  private place(kind: SetPiece, lead: number): boolean {
    const v = Math.max(4, this.h.speed());
    const s = this.h.s();
    const at = s + v * lead;
    // Room for the move and its recovery (and the near misses never on top of a move).
    if (at - this.lastS < Math.max(10, v * 1.6)) return false;
    if (this.plans.some((p) => Math.abs(p.at - at) < v * 1.4)) return false;
    let ok = false;
    switch (kind) {
      case 'log':
        ok = this.log(at);
        break;
      case 'beam':
        ok = this.beam(at);
        break;
      case 'pillar':
        ok = this.pillar(at);
        break;
      case 'blocks':
        ok = this.blocks(s + v * 2.2);
        break;
      case 'boulder':
        ok = this.boulder();
        break;
      case 'tile':
        ok = this.tile();
        break;
      case 'rocks':
        this.h.cue('stones', 0.6);
        ok = true;
        break;
    }
    if (ok) {
      if (kind !== 'boulder' && kind !== 'tile' && kind !== 'rocks') this.lastS = at;
      this.fired[kind] = (this.fired[kind] ?? 0) + 1;
    }
    return ok;
  }

  /** Hard bends ahead: he cuts the corner, planting the outside foot (turn_cut_L/R). */
  private turns(): void {
    const s = this.h.s();
    const v = Math.max(4, this.h.speed());
    const a = s + v * 1.2;
    if (a - this.turnS < 14 || this.plans.length) return;
    const y0 = this.h.frameAt(a).yaw;
    const y1 = this.h.frameAt(a + 8).yaw;
    let d = y1 - y0;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // The bend sections turn 0.28–0.5 rad over 8 m; a 90° corner (if the world adds one) far more.
    if (Math.abs(d) < 0.26) return;
    this.turnS = a;
    // Positive yaw turns the forward vector to the left.
    this.plan(d > 0 ? 'turn_cut_L' : 'turn_cut_R', a + 2, 2.25, { onTake: () => this.h.sound('whoosh_jump', 0.3) });
    this.fired.turn = (this.fired.turn ?? 0) + 1;
  }

  private placeAcross(o: THREE.Object3D, f: FrameAt, y: number) {
    o.position.copy(f.pos).setY(f.pos.y + y);
    o.rotation.set(0, f.yaw, 0);
  }

  private landDust(at: number, k: number): void {
    const f = this.h.frameAt(at);
    this.h.dust(f.pos, k, f.fwd.clone().multiplyScalar(1.5));
  }

  // ---------------------------------------------------------------- set pieces

  private log(at: number): boolean {
    if (!this.h.clearRun(at - 3, at + 3)) return false;
    const f = this.h.frameAt(at);
    const bark = this.h.material('bark') ?? this.h.material('wood') ?? this.h.material('floor');
    const m = new THREE.Group();
    // A real jungle trunk from the kit, felled across the way (a plain cylinder if the kit lacks one).
    const trunk = this.h.geometry(this.h.rng().chance(0.5) ? 'jungle_0_trunk' : 'jungle_1_trunk') ?? this.h.geometry('palm_0_trunk');
    const L = 5.8;
    if (trunk) {
      if (!trunk.boundingBox) trunk.computeBoundingBox();
      const bb = trunk.boundingBox!;
      const h = Math.max(0.5, bb.max.y - bb.min.y);
      const w = Math.max(0.1, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z));
      // Its lower part is the thick one: keep a 0.55–0.7 m girth whatever the source tree.
      const r = THREE.MathUtils.clamp(0.62 / w, 0.4, 1.6);
      const t = new THREE.Mesh(trunk, bark);
      t.scale.set(r, L / h, r);
      t.rotation.z = Math.PI / 2;
      t.position.set(L / 2 + bb.min.y * (L / h), 0.3, -(bb.min.z + bb.max.z) * 0.5 * r);
      t.castShadow = t.receiveShadow = true;
      m.add(t);
    } else {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, L, 10, 1).rotateZ(Math.PI / 2), bark);
      t.position.y = 0.3;
      t.castShadow = t.receiveShadow = true;
      m.add(t);
    }
    this.placeAcross(m, f, 0);
    m.rotateY(this.h.rng().range(-0.15, 0.15));
    this.h.add(m);
    this.plan('jump_log', at, 2.25, {
      onTake: () => this.h.sound('whoosh_jump', 0.5),
      onLand: () => {
        this.landDust(this.h.s(), 0.5);
        this.h.sound('land_heavy', 0.5);
        this.h.shake(0.06);
      },
    });
    this.live.push({ kind: 'log', s: at, objs: [m], tick: (_dt, ds) => ds > -25 });
    return true;
  }

  private beam(at: number): boolean {
    if (!this.h.clearRun(at - 3, at + 3)) return false;
    const f = this.h.frameAt(at);
    const g = new THREE.Group();
    const mat = this.h.material('stoneB') ?? this.h.material('floor');
    // Underside at 1.22 m: the slide clears 1.05 m.
    const top = 1.47;
    const beam = new THREE.Mesh(boxUV(5.6, 0.5, 0.7), mat);
    beam.position.y = top;
    beam.rotation.z = this.h.rng().range(-0.05, 0.05);
    const posts = [-2.6, 2.6].map((x) => {
      const p = new THREE.Mesh(boxUV(0.55, top - 0.25, 0.6), mat);
      p.position.set(x, (top - 0.25) / 2, 0);
      return p;
    });
    for (const o of [beam, ...posts]) {
      o.castShadow = o.receiveShadow = true;
      g.add(o);
    }
    this.placeAcross(g, f, 0);
    this.h.add(g);
    const slam = this.tier >= 1 && this.h.rng().chance(0.65);
    let fall = -1;
    this.plan('slide', at, 2.25, { onTake: () => this.h.sound('slide_scrape', 0.6) });
    this.live.push({
      kind: 'beam', s: at, objs: [g],
      // While it stands, the lens (which follows a couple of metres behind him) must duck under it too.
      ceil: () => (fall < 0 ? f.pos.y + top - 0.25 : null),
      tick: (dt, ds) => {
        // Near miss: once the lens is through as well, the lintel slams down right behind it — the
        // crack, the jolt and the dust rolling forward past the lens (it would crush the lens before).
        if (slam && fall < 0 && ds < -(this.h.lensBack() + 0.9)) fall = 0;
        if (fall >= 0 && fall < 1) {
          if (fall === 0) this.h.sound('wood_crack', 0.6);
          fall = Math.min(1, fall + dt / 0.3);
          beam.position.y = top - (top - 0.3) * fall * fall;
          beam.rotation.z += dt * 0.5;
          for (const p of posts) p.rotation.z = (p.position.x > 0 ? -1 : 1) * 0.35 * fall;
          if (fall >= 1) {
            this.h.dust(f.pos, 1, f.fwd.clone().multiplyScalar(3));
            this.h.shake(0.3);
            this.h.sound('land_heavy', 0.9);
          }
        }
        return ds > -30;
      },
    });
    return true;
  }

  private pillar(at: number): boolean {
    if (!this.h.clearRun(at - 3, at + 3)) return false;
    const geo = this.h.geometry('pillar_0');
    const mat = this.h.material('stoneB');
    if (!geo || !mat) return false;
    const f = this.h.frameAt(at);
    const side = this.h.rng().chance(0.5) ? 1 : -1;
    const pivot = new THREE.Group();
    pivot.position.copy(f.pos).addScaledVector(f.right, side * 2.9);
    pivot.rotation.set(0, f.yaw, 0);
    const col = new THREE.Mesh(geo, mat);
    // Sized so it lies across the whole way (5.2 m) at vaulting height (~0.8 m thick).
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const gh = Math.max(0.5, bb.max.y - bb.min.y);
    const gw = Math.max(0.1, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z));
    const xz = THREE.MathUtils.clamp(0.8 / gw, 0.2, 1.5);
    col.scale.set(xz, 5.2 / gh, xz);
    col.position.y = -bb.min.y * (5.2 / gh);
    col.castShadow = col.receiveShadow = true;
    pivot.add(col);
    this.h.add(pivot);
    // It goes about 1.5 s before he arrives and lands ~0.6 s before he vaults it: the danger is seen.
    const v = Math.max(4, this.h.speed());
    let t = -Math.max(0.05, (at - this.h.s()) / v - 1.5);
    let landed = false;
    this.plan('vault', at, 2.25, {
      onTake: () => this.h.sound('whoosh_jump', 0.5),
      onLand: () => {
        this.landDust(this.h.s(), 0.4);
        this.h.sound('land_heavy', 0.45);
      },
    });
    this.live.push({
      kind: 'pillar', s: at, objs: [pivot],
      tick: (dt, ds) => {
        t += dt;
        if (t > -0.25 && t - dt <= -0.25) this.h.sound('stone_split', 0.5);
        if (t > 0 && !landed) {
          // Topple about the base toward the way: an accelerating fall, a small bounce.
          const k = Math.min(1, (t / 0.8) ** 2);
          // +Z roll takes the column's top (+Y) toward −X: from the right side (+1) that is the way.
          pivot.rotation.z = side * (Math.PI / 2) * k;
          // It rolls onto its side: the axis ends a radius above the floor, not half sunk into it.
          pivot.position.y = f.pos.y + 0.4 * k;
          if (k >= 1) {
            landed = true;
            this.h.dust(f.pos.clone().addScaledVector(f.right, side * 0.5), 1);
            this.h.shake(0.3);
            this.h.sound('tree_fall', 0.8);
          }
        } else if (landed && t < 1.1) pivot.rotation.z = side * (Math.PI / 2 - 0.05 * Math.sin((t - 0.8) * 30) * Math.exp(-(t - 0.8) * 9));
        return ds > -30;
      },
    });
    return true;
  }

  private blocks(s0: number): boolean {
    const tiles = this.h.tiles(s0, s0 + 34);
    // Gaps far enough apart for leap, landing and the next run-up (a leap is ~1.1 s).
    const v = Math.max(4, this.h.speed());
    const want = this.h.rng().int(2, 3);
    const gaps: Tile[] = [];
    for (const t of tiles) {
      if (gaps.length >= want) break;
      const last = gaps[gaps.length - 1];
      if (!last || t.near - last.far >= Math.max(9, v * 1.35)) gaps.push(t);
    }
    if (gaps.length < 2) return false;
    const mat = this.h.material('floor');
    const objs: THREE.Object3D[] = [];
    const moving: { o: THREE.Mesh; dir: number; spin: number; start: number; at: number; tile: Tile }[] = [];
    for (const t of gaps) {
      const geo = this.h.geometry(t.piece);
      if (!geo || !mat) return false;
    }
    for (const t of gaps) {
      this.h.hideTile(t);
      const o = new THREE.Mesh(this.h.geometry(t.piece)!, mat);
      t.world.decompose(o.position, o.quaternion, o.scale);
      o.castShadow = o.receiveShadow = true;
      this.h.add(o);
      objs.push(o);
      const at = 0.5 * (t.near + t.far);
      // Drift apart before he reaches them: sideways and down, opening the gap he must leap.
      const eta = (t.near - this.h.s()) / v;
      moving.push({ o, dir: this.h.rng().chance(0.5) ? 1 : -1, spin: this.h.rng().range(0.3, 0.7), start: Math.max(0, eta - 1.7), at, tile: t });
      this.plan('leap_gap', at, t.far - t.near + 0.8, {
        onTake: () => this.h.sound('whoosh_jump', 0.6),
        onLand: () => {
          this.landDust(this.h.s(), 0.55);
          this.h.sound('land_heavy', 0.6);
          this.h.shake(0.08);
        },
      });
    }
    let t = 0;
    this.h.sound('stone_split', 0.8);
    this.live.push({
      kind: 'blocks', s: gaps[gaps.length - 1]!.far, objs,
      tick: (dt, ds) => {
        t += dt;
        for (const m of moving) {
          const k = t - m.start;
          if (k <= 0) continue;
          const f = this.h.frameAt(m.at);
          if (k - dt <= 0) {
            this.h.sound('stone_split', 0.6);
            this.h.dust(f.pos, 0.6);
          }
          // Out of the way first (sideways, tilting), then sinking for good.
          const side = Math.min(1, k / 1.1);
          m.o.position.addScaledVector(f.right, m.dir * dt * 2.6 * (1 - side * 0.5));
          m.o.position.y -= dt * (0.4 + 2.4 * Math.max(0, k - 0.9) ** 1.5);
          m.o.rotateOnWorldAxis(f.fwd, m.dir * dt * m.spin);
          m.o.visible = m.o.position.y > f.pos.y - 6;
        }
        return ds > -12 || t < 9;
      },
    });
    return true;
  }

  private boulder(): boolean {
    // Near miss: a boulder thunders across the way just in front of him (crossing behind him would
    // put it through the chase lens, ~2 m back): it crosses the centre line ~0.7 s before he gets there.
    const geo = this.h.geometry('rock_mid_0');
    const mat = this.h.material('rock') ?? this.h.material('stoneA');
    if (!geo || !mat) return false;
    const v = Math.max(4, this.h.speed());
    const cross = this.h.s() + v * 1.6;
    const f = this.h.frameAt(cross);
    const side = this.h.rng().chance(0.5) ? 1 : -1;
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(0.85);
    m.castShadow = true;
    const start = f.pos.clone().addScaledVector(f.right, side * 6).setY(f.pos.y + 0.8);
    m.position.copy(start);
    this.h.add(m);
    // It crosses the centre line ~0.9 s from now.
    let t = -0.1;
    this.h.sound('tree_fall', 0.45);
    this.live.push({
      kind: 'boulder', s: cross, objs: [m],
      tick: (dt) => {
        t += dt;
        if (t < 0) return true;
        m.position.copy(start).addScaledVector(f.right, -side * 6.6 * t);
        m.position.y = start.y + Math.abs(Math.sin(t * 7)) * 0.25 * Math.exp(-t);
        m.rotateOnWorldAxis(f.fwd, side * dt * 6.5);
        if (t > 0.9 && t - dt <= 0.9) {
          this.h.dust(f.pos, 0.7, f.right.clone().multiplyScalar(-side * 2));
          this.h.shake(0.2);
          this.h.sound('land_heavy', 0.5);
        }
        return t < 2.4;
      },
    });
    return true;
  }

  private tile(): boolean {
    // Near miss: the slab he has just left drops into the water.
    const s = this.h.s();
    const v = Math.max(4, this.h.speed());
    const t = this.h.tiles(s + v * 0.2, s + v * 1.2)[0];
    if (!t) return false;
    let k = -((t.far - s) / v + 0.1);
    let gone = false;
    this.live.push({
      kind: 'tile', s: t.far, objs: [],
      tick: (dt) => {
        k += dt;
        if (!gone && k >= 0) {
          gone = true;
          this.h.hideTile(t);
          this.h.debris(t.piece, t.world, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(this.h.rng().range(-1, 1), 0, this.h.rng().range(-1, 1)), { breakInto: 4, breakAfter: 0.4 });
          this.h.dust(new THREE.Vector3().setFromMatrixPosition(t.world), 0.6);
          this.h.shake(0.15);
          this.h.sound('stone_split', 0.6);
        }
        return k < 1;
      },
    });
    return true;
  }
}
