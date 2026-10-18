import * as THREE from 'three';
import type { Rng } from '../engine/rng';

/**
 * The obstacle director: set pieces on the way ahead that the runner always clears (presentation
 * only — the outcome is the server's). Which, when and how many come from the CURRENT multiplier's
 * tier and the cosmetic RNG only, never from the hidden fall point.
 *
 * Pacing: a calm stretch, then a burst of 1–3 set pieces a few seconds apart; the calm shortens
 * and the bursts grow (and turn spectacular) with the tier.
 *
 * Set pieces (each a placeholder built from kit materials until dedicated art and clips land):
 *   log      a fallen trunk across the way → he jumps it ('jump_log')
 *   blocks   the slabs ahead crack and drift apart over the water → he leaps the gaps ('leap_gap'),
 *            they tilt and sink behind him (tiers 2+)
 *   pillar   a pillar topples across the way ahead → he vaults it ('vault') (tiers 1+)
 *   beam     a low fallen beam → he slides under it ('slide'); at tier 2+ it slams down behind him
 *   boulder  near miss: a boulder rolls across the way just behind him (tiers 2+)
 *   tile     near miss: the slab he just left collapses into the water (tiers 1+)
 */
export type SetPiece = 'log' | 'blocks' | 'pillar' | 'beam' | 'boulder' | 'tile';

/** Weights per tier (0–4). */
const TABLE: readonly (readonly (readonly [SetPiece, number])[])[] = [
  [['log', 3], ['beam', 1]],
  [['log', 3], ['beam', 2], ['pillar', 1], ['tile', 1]],
  [['log', 2], ['beam', 2], ['pillar', 2], ['tile', 2], ['blocks', 2], ['boulder', 1]],
  [['log', 1], ['beam', 2], ['pillar', 3], ['tile', 2], ['blocks', 3], ['boulder', 2]],
  [['log', 1], ['beam', 2], ['pillar', 3], ['tile', 2], ['blocks', 4], ['boulder', 3]],
];

/** Pure pacing rule: the calm before the next burst (s) and the burst's size, by tier. */
export function nextBurst(rng: Rng, tier: number): { calm: number; count: number; gap: number } {
  const t = Math.max(0, Math.min(4, tier));
  const calm = [9, 6.5, 4.5, 3.2, 2.4][t]! * rng.range(0.7, 1.3);
  const count = t === 0 ? 1 : rng.int(1, Math.min(3, 1 + t));
  const gap = [3, 2.6, 2.2, 1.9, 1.6][t]! * rng.range(0.85, 1.2);
  return { calm, count, gap };
}

export function pickPiece(rng: Rng, tier: number): SetPiece {
  return rng.weighted(TABLE[Math.max(0, Math.min(4, tier))]!);
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
  rng: () => Rng;
  frameAt(s: number): FrameAt;
  /** A stretch the obstacle can stand on: a plain run of floor with nothing scripted on it. */
  clearRun(s0: number, s1: number): boolean;
  /** Collapsible floor tiles whose near edge lies in [s0, s1], in order. */
  tiles(s0: number, s1: number): Tile[];
  hideTile(t: Tile): void;
  add(o: THREE.Object3D): void;
  remove(o: THREE.Object3D): void;
  material(key: string): THREE.Material | undefined;
  geometry(piece: string): THREE.BufferGeometry | undefined;
  /** The runner's move at the right moment: kind, seconds until his feet must clear, duration, height. */
  move(kind: 'jump' | 'leap' | 'vault' | 'slide', t: number, dur: number, h: number): void;
  debris(piece: string, m: THREE.Matrix4, vel: THREE.Vector3, spin: THREE.Vector3, opts?: { breakInto?: number; breakAfter?: number; mat?: string }): void;
  dust(at: THREE.Vector3, k: number, vel?: THREE.Vector3): void;
  shake(k: number): void;
  sound(name: string, k: number): void;
}

interface Live {
  kind: SetPiece;
  s: number;
  objs: THREE.Object3D[];
  /** Per-frame animation; returns false when the piece is done (behind and settled). */
  tick: (dt: number, ds: number) => boolean;
}

export class ObstacleDirector {
  private live: Live[] = [];
  private calmIn = 4;
  private burstLeft = 0;
  private gapIn = 0;
  private lastS = -1e9;
  /** Off for reduced motion? No: kept, the moves are gentler (the host scales them). */
  enabled = true;
  /** Count by kind (QA). */
  readonly fired: Record<string, number> = {};

  constructor(private h: ObstacleHost) {}

  reset(): void {
    for (const l of this.live) for (const o of l.objs) this.h.remove(o);
    this.live.length = 0;
    this.calmIn = 4;
    this.burstLeft = 0;
    this.gapIn = 0;
    this.lastS = -1e9;
  }

  update(dt: number, tier: number, stageT: number): void {
    const s = this.h.s();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      if (!l.tick(dt, l.s - s)) {
        for (const o of l.objs) this.h.remove(o);
        this.live.splice(i, 1);
      }
    }
    if (!this.enabled || !this.h.running() || stageT < 2.5) return;
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
  private nextGap = 2;

  /** Force one (QA): returns whether it was placed. */
  force(kind: SetPiece, lead = 2.2): boolean {
    return this.place(kind, lead);
  }

  private spawn(tier: number): boolean {
    const kind = pickPiece(this.h.rng(), tier);
    // Seen from far enough to read (about 2 s ahead), never on top of another piece.
    if (this.place(kind, 2.2)) return true;
    return kind !== 'log' && this.place('log', 2.2);
  }

  private place(kind: SetPiece, lead: number): boolean {
    const v = Math.max(4, this.h.speed());
    const s = this.h.s();
    const at = s + v * lead;
    if (at - this.lastS < 9) return false;
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
        ok = this.blocks(s + v * 2.0);
        break;
      case 'boulder':
        ok = this.boulder();
        break;
      case 'tile':
        ok = this.tile();
        break;
    }
    if (ok) {
      this.lastS = at;
      this.fired[kind] = (this.fired[kind] ?? 0) + 1;
    }
    return ok;
  }

  /** Seconds until the runner reaches route distance `sAt` at his current speed. */
  private eta(sAt: number): number {
    return (sAt - this.h.s()) / Math.max(1, this.h.speed());
  }

  private placeAcross(o: THREE.Object3D, f: FrameAt, y: number) {
    o.position.copy(f.pos).setY(f.pos.y + y);
    o.rotation.set(0, f.yaw, 0);
  }

  private log(at: number): boolean {
    if (!this.h.clearRun(at - 3, at + 3)) return false;
    const f = this.h.frameAt(at);
    const geo = new THREE.CylinderGeometry(0.3, 0.34, 5.4, 10, 1).rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(geo, this.h.material('bark') ?? this.h.material('wood'));
    m.castShadow = m.receiveShadow = true;
    this.placeAcross(m, f, 0.3);
    m.rotateY(this.h.rng().range(-0.15, 0.15));
    this.h.add(m);
    this.h.move('jump', this.eta(at), 0.62, 0.85);
    let landed = false;
    this.live.push({
      kind: 'log', s: at, objs: [m],
      tick: (_dt, ds) => {
        if (!landed && ds < -1.2) {
          landed = true;
          this.h.dust(this.h.frameAt(at + 1.6).pos, 0.5);
          this.h.sound('land_heavy', 0.5);
        }
        return ds > -25;
      },
    });
    this.h.sound('whoosh_jump', 0.5);
    return true;
  }

  private beam(at: number): boolean {
    if (!this.h.clearRun(at - 3, at + 3)) return false;
    const f = this.h.frameAt(at);
    const g = new THREE.Group();
    const mat = this.h.material('stoneB') ?? this.h.material('statue');
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 0.7), mat);
    beam.position.y = 1.25;
    beam.rotation.z = this.h.rng().range(-0.08, 0.08);
    const posts = [-2.55, 2.55].map((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.6), mat);
      p.position.set(x, 0.7, 0);
      return p;
    });
    for (const o of [beam, ...posts]) {
      o.castShadow = o.receiveShadow = true;
      g.add(o);
    }
    this.placeAcross(g, f, 0);
    this.h.add(g);
    this.h.move('slide', this.eta(at), 0.95, 0.5);
    const slam = this.h.rng().chance(0.6);
    let fall = -1;
    this.live.push({
      kind: 'beam', s: at, objs: [g],
      tick: (dt, ds) => {
        // Near miss: right after he is through, the beam slams down onto the floor behind him.
        if (slam && fall < 0 && ds < -1.0) {
          fall = 0;
          this.h.sound('stone_split', 0.7);
        }
        if (fall >= 0 && fall < 1) {
          fall = Math.min(1, fall + dt / 0.28);
          beam.position.y = 1.25 - 0.95 * fall * fall;
          beam.rotation.z += dt * 0.4;
          if (fall >= 1) {
            this.h.dust(f.pos, 0.8);
            this.h.shake(0.25);
            this.h.sound('land_heavy', 0.8);
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
    pivot.position.copy(f.pos).addScaledVector(f.right, side * 2.7);
    pivot.rotation.set(0, f.yaw, 0);
    const col = new THREE.Mesh(geo, mat);
    col.scale.set(0.55, 0.95, 0.55);
    col.castShadow = col.receiveShadow = true;
    pivot.add(col);
    this.h.add(pivot);
    // It goes about 1.2 s before he arrives and lands ~0.5 s before he vaults it.
    const startIn = Math.max(0.1, this.eta(at) - 1.3);
    let t = -startIn;
    let landed = false;
    this.h.move('vault', this.eta(at), 0.7, 1.05);
    this.live.push({
      kind: 'pillar', s: at, objs: [pivot],
      tick: (dt, ds) => {
        t += dt;
        if (t > 0 && !landed) {
          // Topple about the base toward the path: an accelerating fall, a small bounce.
          const k = Math.min(1, (t / 0.75) ** 2);
          pivot.rotation.z = -side * (Math.PI / 2) * k;
          if (k >= 1) {
            landed = true;
            this.h.dust(f.pos.clone().addScaledVector(f.right, side * 0.5), 0.9);
            this.h.shake(0.3);
            this.h.sound('tree_fall', 0.8);
          }
        }
        return ds > -30;
      },
    });
    this.h.sound('stone_split', 0.4);
    return true;
  }

  private blocks(s0: number): boolean {
    const tiles = this.h.tiles(s0, s0 + 16);
    if (tiles.length < 4) return false;
    // Every other slab cracks loose and drifts away (gaps of one slab), 2–3 gaps.
    const gaps = tiles.filter((_, i) => i % 2 === 1).slice(0, this.h.rng().int(2, 3));
    const objs: THREE.Object3D[] = [];
    const moving: { o: THREE.Mesh; dir: number; spin: number; start: number; near: number }[] = [];
    for (const t of gaps) {
      this.h.hideTile(t);
      const geo = this.h.geometry(t.piece);
      const mat = this.h.material('floor');
      if (!geo || !mat) continue;
      const o = new THREE.Mesh(geo, mat);
      t.world.decompose(o.position, o.quaternion, o.scale);
      o.castShadow = o.receiveShadow = true;
      this.h.add(o);
      objs.push(o);
      // Drift apart before he reaches them: sideways and down, opening the gap.
      const eta = this.eta(t.near);
      moving.push({ o, dir: this.h.rng().chance(0.5) ? 1 : -1, spin: this.h.rng().range(0.4, 0.9), start: Math.max(0, eta - 1.6), near: t.near });
      this.h.move('leap', eta - 0.05, Math.max(0.42, (t.far - t.near + 0.6) / Math.max(4, this.h.speed())), 0.75);
    }
    if (!moving.length) return false;
    let t = 0;
    this.h.sound('stone_split', 0.8);
    this.live.push({
      kind: 'blocks', s: tiles[tiles.length - 1]!.far, objs,
      tick: (dt, ds) => {
        t += dt;
        for (const m of moving) {
          const k = t - m.start;
          if (k <= 0) continue;
          const f = this.h.frameAt(m.near + 2);
          // Out of the way first (sideways, tilting, sliding down), then sinking for good.
          const side = Math.min(1, k / 1.1);
          m.o.position.addScaledVector(f.right, m.dir * dt * 2.4 * (1 - side * 0.5));
          m.o.position.y -= dt * (0.6 + 2.2 * Math.max(0, k - 0.8));
          m.o.rotateOnWorldAxis(f.fwd, m.dir * dt * m.spin);
          if (k > 0 && k - dt <= 0) this.h.dust(f.pos, 0.6);
        }
        return ds > -10 || t < 8;
      },
    });
    // The slabs he lands on tilt and settle after him (cosmetic shudder via dust and shake).
    for (const g of gaps) this.h.dust(this.h.frameAt(g.near).pos, 0.4);
    return true;
  }

  private boulder(): boolean {
    // Near miss: a boulder rolls across the way just behind him.
    const geo = this.h.geometry('rock_mid_0');
    const mat = this.h.material('rock');
    if (!geo || !mat) return false;
    const behind = this.h.s() - 2.2;
    const f = this.h.frameAt(behind + this.h.speed() * 0.9);
    const side = this.h.rng().chance(0.5) ? 1 : -1;
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(0.8);
    m.castShadow = true;
    const start = f.pos.clone().addScaledVector(f.right, side * 5.5).setY(f.pos.y + 0.8);
    m.position.copy(start);
    this.h.add(m);
    let t = -0.9;
    this.h.sound('tree_fall', 0.5);
    this.live.push({
      kind: 'boulder', s: behind, objs: [m],
      tick: (dt) => {
        t += dt;
        if (t < 0) return true;
        m.position.copy(start).addScaledVector(f.right, -side * 7.5 * t);
        m.rotateOnWorldAxis(f.fwd, side * dt * 6.5);
        if (t > 0.6 && t - dt <= 0.6) {
          this.h.dust(m.position, 0.7, f.right.clone().multiplyScalar(-side * 2));
          this.h.shake(0.2);
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
    const tiles = this.h.tiles(s + v * 0.2, s + v * 1.2);
    const t = tiles[0];
    if (!t) return false;
    const eta = this.eta(t.far) + 0.12;
    let k = -eta;
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
