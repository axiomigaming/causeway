import * as THREE from 'three';
import type { Kit } from './assets';
import { WATER_Y } from './water';

/**
 * Rigid bodies for collapses (round 20: a real, if small, physics step).
 *
 * Each piece is a box (its geometry's bounds, scaled) with a mass and an inertia tensor. A fixed
 * 1/120 s step integrates gravity (9.81 m/s²), and resolves contacts with impulses at the actual
 * contact points (the box's corners against the floor, its faces against a gorge's walls), with
 * restitution and Coulomb friction, so an off-centre landing turns into spin, a slab hinges over
 * the lip it overhangs, a pier pivots on its foot and topples, and a stone that lands on an edge
 * tips over. Pieces knock into each other (sphere contacts). Hard landings chip off small
 * fragments; a piece that comes to rest sleeps. In water they slow, sink and breathe bubbles.
 * Deterministic for a given sequence of frames (fixed step; randomness only from Math.random,
 * which the QA films seed).
 */
interface Body {
  mesh: THREE.Mesh;
  /** Centre of mass (world) and its offset from the mesh origin, in the mesh's local frame (scaled). */
  x: THREE.Vector3;
  com: THREE.Vector3;
  q: THREE.Quaternion;
  vel: THREE.Vector3;
  /** Angular velocity, world space (rad/s). */
  spin: THREE.Vector3;
  /** Half extents of the collision box (m). */
  half: THREE.Vector3;
  invMass: number;
  /** Inverse inertia, body frame (diagonal). */
  invI: THREE.Vector3;
  radius: number;
  ground: (x: number, z: number) => number | null;
  walls: Walls | null;
  restitution: number;
  friction: number;
  splashed: boolean;
  splashT: number;
  age: number;
  heavy: boolean;
  breakInto: number;
  breakAfter: number;
  rest: boolean;
  sleepT: number;
  lastHit: number;
  chips: number;
  shard: boolean;
  tag?: string;
}

/** A gorge's side walls: below `top`, the lateral offset from `origin` along `right` stays within ±half. */
export interface Walls {
  origin: THREE.Vector3;
  right: THREE.Vector3;
  half: number;
  top: number;
}

export interface ImpactEvent {
  pos: THREE.Vector3;
  speed: number;
  water: boolean;
  mass: number;
  /** True when the body broke apart at this impact. */
  broke?: boolean;
  /** A wall or another piece (not the floor). */
  side?: boolean;
  tag?: string;
}

export interface SpawnOpts {
  settle?: boolean;
  scale?: number;
  heavy?: boolean;
  /** Break into this many fragments on the first hard landing. */
  breakInto?: number;
  /** Break apart in mid-air after this many seconds (a floor slab cracking up as it drops). */
  breakAfter?: number;
  /** Material key from the kit (kit pieces only; fragments always show raw broken stone). */
  mat?: string;
  /** Side walls to bounce off (a gorge). */
  walls?: Walls;
  /** Bounciness (default 0.25; heavy pieces 0.05). */
  restitution?: number;
  /** A name carried on its impact events (e.g. 'column'). */
  tag?: string;
}

const SHARD_KINDS = 6;
/** An impact's weight for the effects: about the piece's size in metres, times 1.5. */
const sizeK = (b: { half: THREE.Vector3 }) => 1.5 * Math.cbrt(8 * b.half.x * b.half.y * b.half.z);
const G = 9.81;
const STEP = 1 / 120;
const DENSITY = 2400;

/** Irregular faceted stone fragments (unit size ≈ 1 m across), built once. */
function shardGeometries(): THREE.BufferGeometry[] {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < SHARD_KINDS; k++) {
    const g = new THREE.IcosahedronGeometry(0.5, k % 3 === 0 ? 1 : 0);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    // One squash per shard (slabs, wedges, chunks), then jitter each corner consistently.
    const sx = 0.7 + rnd() * 0.6;
    const sy = 0.35 + rnd() * 0.5;
    const sz = 0.7 + rnd() * 0.6;
    const seen = new Map<string, THREE.Vector3>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let v = seen.get(key);
      if (!v) {
        const j = 0.75 + rnd() * 0.5;
        v = new THREE.Vector3(p.getX(i) * sx * j, p.getY(i) * sy * j, p.getZ(i) * sz * j);
        // Cut a flat face on one side now and then: a fracture plane.
        if (v.y > 0.12 * sy && k % 2 === 0) v.y = 0.12 * sy;
        seen.set(key, v);
      }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    const flat = g.index ? g.toNonIndexed() : g;
    flat.computeVertexNormals();
    flat.computeBoundingSphere();
    flat.computeBoundingBox();
    out.push(flat);
  }
  return out;
}

/**
 * Raw broken stone for fragments: the inside of a block, not its dressed or tiled face. Rough,
 * matte, with a granular mottle (no texture lookups; a little procedural noise in the shader).
 */
function rawStone(tint: THREE.Color): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95, metalness: 0, flatShading: true });
  m.name = 'rawStone';
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRawP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRawP = position * 7.0;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRawP;\nfloat rawH(vec3 p){ return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float n = rawH(vRawP) * 0.6 + rawH(vRawP * 2.7) * 0.4; diffuseColor.rgb *= 0.78 + 0.34 * n; }');
  };
  return m;
}

export class Debris {
  readonly root = new THREE.Group();
  private bodies: Body[] = [];
  private shards = shardGeometries();
  private raw: THREE.MeshStandardMaterial;
  /** Most bodies alive at once (quality budget); the oldest small pieces go first. */
  budget = 60;
  /** Fragments a breaking chunk splits into (quality budget). */
  shardBudget = 4;
  onImpact: (e: ImpactEvent) => void = () => {};
  /** Bubbles rising where a piece sank (position, strength 0..1). */
  onBubbles: (p: THREE.Vector3, k: number) => void = () => {};
  private acc = 0;

  constructor(private kit: Kit) {
    this.root.name = 'debris';
    this.raw = rawStone(new THREE.Color(0.58, 0.5, 0.4));
  }

  private geoOf(piece: string): THREE.BufferGeometry | undefined {
    if (piece.startsWith('shard_')) return this.shards[(+piece.slice(6) || 0) % SHARD_KINDS];
    return this.kit.geo.get(piece);
  }

  private matOf(piece: string, key?: string): THREE.Material | undefined {
    // Fragments are the broken inside of stone, whatever they broke from.
    if (piece.startsWith('shard_')) return this.raw;
    if (key) return this.kit.mat.get(key);
    return this.kit.mat.get(this.kit.matOf.get(piece)!);
  }

  spawn(piece: string, world: THREE.Matrix4, vel: THREE.Vector3, spin: THREE.Vector3, ground: (x: number, z: number) => number | null, opts: SpawnOpts = {}): THREE.Mesh | null {
    const geo = this.geoOf(piece);
    const mat = this.matOf(piece, opts.mat);
    if (!geo || !mat) return null;
    while (this.bodies.length >= this.budget) {
      // Over budget: drop what nobody will miss first — a resting pebble, then a small fragment,
      // then the oldest loose piece. Never the slab across the way.
      let i = this.bodies.findIndex((b) => !b.heavy && b.rest && b.shard);
      if (i < 0) i = this.bodies.findIndex((b) => !b.heavy && b.shard);
      if (i < 0) i = this.bodies.findIndex((b) => !b.heavy);
      if (i < 0) break;
      this.remove(i);
    }
    const mesh = new THREE.Mesh(geo, mat);
    world.decompose(mesh.position, mesh.quaternion, mesh.scale);
    if (opts.scale) mesh.scale.multiplyScalar(opts.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const half = bb.getSize(new THREE.Vector3()).multiply(mesh.scale).multiplyScalar(0.5);
    half.set(Math.max(0.03, half.x), Math.max(0.03, half.y), Math.max(0.03, half.z));
    const com = bb.getCenter(new THREE.Vector3()).multiply(mesh.scale);
    const x = com.clone().applyQuaternion(mesh.quaternion).add(mesh.position);
    const heavy = opts.heavy ?? false;
    const mass = DENSITY * 8 * half.x * half.y * half.z * (piece.startsWith('shard_') ? 0.6 : 1);
    const a = 2 * half.x;
    const b = 2 * half.y;
    const c = 2 * half.z;
    const invI = new THREE.Vector3(12 / (mass * (b * b + c * c)), 12 / (mass * (a * a + c * c)), 12 / (mass * (a * a + b * b)));
    this.bodies.push({
      mesh,
      x,
      com,
      q: mesh.quaternion.clone(),
      vel: vel.clone(),
      spin: spin.clone(),
      half,
      invMass: 1 / mass,
      invI,
      radius: (half.x + half.y + half.z) / 3,
      ground,
      walls: opts.walls ?? null,
      restitution: opts.restitution ?? (heavy ? 0.05 : 0.25),
      friction: heavy ? 0.9 : 0.6,
      splashed: false,
      splashT: 0,
      age: 0,
      heavy,
      breakInto: opts.breakInto ?? 0,
      breakAfter: opts.breakAfter ?? Infinity,
      rest: false,
      sleepT: 0,
      lastHit: -1,
      chips: 0,
      shard: piece.startsWith('shard_'),
      tag: opts.tag,
    });
    return mesh;
  }

  /** Split a body into fragments that carry its motion (and spin) and fly apart. */
  private shatter(i: number): void {
    const b = this.bodies[i]!;
    const n = Math.min(b.breakInto, this.shardBudget);
    const size = 2 * Math.cbrt(b.half.x * b.half.y * b.half.z);
    const pos = b.x.clone();
    const vel = b.vel.clone();
    const spin = b.spin.clone();
    const { ground, walls } = b;
    this.remove(i);
    for (let k = 0; k < n; k++) {
      const out = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 - 0.1, Math.random() - 0.5).normalize();
      const sc = (size / Math.cbrt(n)) * (0.6 + Math.random() * 0.35);
      const p = pos.clone().addScaledVector(out, size * 0.3);
      const w = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)), new THREE.Vector3(sc, sc, sc));
      // Each piece keeps the parent's velocity at its own position (v + ω × r), plus the crack's push.
      const r = p.clone().sub(pos);
      const v = vel.clone().add(spin.clone().cross(r)).addScaledVector(out, 0.8 + Math.random() * 1.6);
      const s = spin.clone().multiplyScalar(0.8).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5));
      this.spawn(`shard_${k % SHARD_KINDS}`, w, v, s, ground, { walls: walls ?? undefined });
    }
  }

  /** A hard landing knocks a chip or two off the corner that hit. */
  private chip(b: Body, at: THREE.Vector3, speed: number): void {
    if (b.chips >= 2 || b.radius < 0.22 || speed < 3.2 || this.bodies.length >= this.budget - 4) return;
    b.chips++;
    const n = speed > 6 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const sc = Math.min(0.2, b.radius * 0.35) * (0.6 + Math.random() * 0.5);
      const p = at.clone().setY(at.y + sc * 0.6);
      const w = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)), new THREE.Vector3(sc, sc, sc));
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.5, 1 + Math.random() * speed * 0.35, (Math.random() - 0.5) * 2.5).addScaledVector(b.vel, 0.3);
      this.spawn(`shard_${(k + b.chips) % SHARD_KINDS}`, w, v, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14), b.ground, { walls: b.walls ?? undefined });
    }
  }

  // Scratch.
  private tq = new THREE.Quaternion();
  private tv = new THREE.Vector3();
  private tr = new THREE.Vector3();
  private tn = new THREE.Vector3();
  private tt = new THREE.Vector3();
  private tw = new THREE.Vector3();
  private corner = new THREE.Vector3();
  private qi = new THREE.Quaternion();

  /** World inverse inertia applied to a vector: R · I⁻¹ · Rᵀ · v. */
  private invIw(b: Body, v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.qi.copy(b.q).invert();
    out.copy(v).applyQuaternion(this.qi).multiply(b.invI).applyQuaternion(b.q);
    return out;
  }

  /** An impulse at world point p (r = p − x) along unit n, removing the approach speed with restitution e and friction mu. Returns the normal impulse. */
  private contact(b: Body, r: THREE.Vector3, n: THREE.Vector3, e: number, mu: number): number {
    // Relative velocity of the contact point.
    const vp = this.tv.copy(b.spin).cross(r).add(b.vel);
    const vn = vp.dot(n);
    if (vn >= 0) return 0;
    const rn = this.tt.copy(r).cross(n);
    const k = b.invMass + n.dot(this.invIw(b, rn, this.tw).cross(r));
    // A slow contact does not bounce (no jitter at rest).
    const j = (-(1 + (vn < -1.2 ? e : 0)) * vn) / k;
    b.vel.addScaledVector(n, j * b.invMass);
    b.spin.add(this.invIw(b, rn.multiplyScalar(j), this.tw));
    // Friction along the sliding direction, capped by μ·j.
    const vp2 = this.tv.copy(b.spin).cross(r).add(b.vel);
    const vt = vp2.addScaledVector(n, -vp2.dot(n));
    const sl = vt.length();
    if (sl > 1e-5) {
      const t = vt.divideScalar(sl);
      const rt = this.tt.copy(r).cross(t);
      const kt = b.invMass + t.dot(this.invIw(b, rt, this.tw).cross(r));
      const jt = Math.min(sl / kt, mu * j);
      b.vel.addScaledVector(t, -jt * b.invMass);
      b.spin.add(this.invIw(b, rt.multiplyScalar(-jt), this.tw));
    }
    return j;
  }

  private step(dt: number): void {
    // Pieces knock into each other (spheres; a share of the impulse goes into spin).
    for (let i = 0; i < this.bodies.length; i++) {
      const a = this.bodies[i]!;
      for (let k = i + 1; k < this.bodies.length; k++) {
        const c = this.bodies[k]!;
        if (a.rest && c.rest) continue;
        if (a.splashed || c.splashed) continue;
        const d = this.tn.copy(c.x).sub(a.x);
        const rr = (a.radius + c.radius) * 0.85;
        const dist2 = d.lengthSq();
        if (dist2 >= rr * rr || dist2 < 1e-8) continue;
        const dist = Math.sqrt(dist2);
        const n = d.divideScalar(dist);
        const rv = this.tt.copy(c.vel).sub(a.vel).dot(n);
        const wa = a.rest ? 0 : a.invMass;
        const wc = c.rest ? 0 : c.invMass;
        if (wa + wc <= 0) continue;
        // Separate.
        const pen = rr - dist;
        a.x.addScaledVector(n, (-pen * wa) / (wa + wc));
        c.x.addScaledVector(n, (pen * wc) / (wa + wc));
        if (rv < 0) {
          const j = (-(1 + 0.2) * rv) / (wa + wc);
          a.vel.addScaledVector(n, -j * wa);
          c.vel.addScaledVector(n, j * wc);
          // A glancing knock sets both turning.
          this.tw.set(n.z, 0, -n.x).multiplyScalar(j * 0.15);
          a.spin.addScaledVector(this.tw, wa / Math.max(a.radius, 0.1));
          c.spin.addScaledVector(this.tw, -wc / Math.max(c.radius, 0.1));
          if (c.rest && j * wc > 0.3) c.rest = false;
          if (a.rest && j * wa > 0.3) a.rest = false;
          if (-rv > 2.5) this.onImpact({ pos: a.x.clone().addScaledVector(n, a.radius), speed: -rv, water: false, mass: Math.min(sizeK(a), sizeK(c)), side: true });
        }
      }
    }
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i]!;
      b.age += dt;
      if (b.rest) continue;
      if (b.breakInto > 0 && b.age >= b.breakAfter && !b.splashed) {
        this.onImpact({ pos: b.x.clone(), speed: 0, water: false, mass: sizeK(b), broke: true });
        this.shatter(i);
        continue;
      }
      // Integrate.
      if (b.splashed) {
        // Stone sinks: gravity less buoyancy, strong drag, the spin dies away.
        b.vel.y -= G * 0.58 * dt;
        b.vel.multiplyScalar(Math.exp(-2.6 * dt));
        b.spin.multiplyScalar(Math.exp(-2.2 * dt));
        b.splashT += dt;
      } else {
        b.vel.y -= G * dt;
        // A whisper of air drag on small pieces only.
        if (b.shard) b.vel.multiplyScalar(Math.exp(-0.05 * dt));
      }
      b.x.addScaledVector(b.vel, dt);
      // A heavy door drops in its grooves: it never turns.
      if (b.heavy) b.spin.set(0, 0, 0);
      const w = b.spin.length();
      if (w > 1e-5) {
        this.tq.setFromAxisAngle(this.tv.copy(b.spin).divideScalar(w), w * dt);
        b.q.premultiply(this.tq).normalize();
      }
      // Floor: the box's eight corners against the ground under each.
      let touching = false;
      let hit = 0;
      let deepest = 0;
      const hitAt = this.corner.set(0, 0, 0);
      let hits = 0;
      if (!b.splashed) {
        for (let pass = 0; pass < 2; pass++) {
          for (let cidx = 0; cidx < 8; cidx++) {
            const r = this.tr.set(cidx & 1 ? b.half.x : -b.half.x, cidx & 2 ? b.half.y : -b.half.y, cidx & 4 ? b.half.z : -b.half.z).applyQuaternion(b.q);
            const px = b.x.x + r.x;
            const py = b.x.y + r.y;
            const pz = b.x.z + r.z;
            const gy = b.ground(px, pz);
            if (gy === null || py >= gy) continue;
            // Only a contact near the surface (a corner deep below is over a lip's edge, not on it).
            if (gy - py > 0.6) continue;
            touching = true;
            deepest = Math.max(deepest, gy - py);
            const j = this.contact(b, r, this.tn.set(0, 1, 0), b.restitution, b.friction);
            if (pass === 0 && j > 0) {
              hit = Math.max(hit, j * b.invMass);
              hitAt.add(this.tv.set(px, gy, pz));
              hits++;
            }
          }
        }
        if (deepest > 0) b.x.y += deepest;
      }
      // Gorge walls: the box's corners against the two side planes below the lip.
      if (b.walls && !b.splashed && b.x.y < b.walls.top) {
        const W = b.walls;
        for (let cidx = 0; cidx < 8; cidx++) {
          const r = this.tr.set(cidx & 1 ? b.half.x : -b.half.x, cidx & 2 ? b.half.y : -b.half.y, cidx & 4 ? b.half.z : -b.half.z).applyQuaternion(b.q);
          const lat = (b.x.x + r.x - W.origin.x) * W.right.x + (b.x.z + r.z - W.origin.z) * W.right.z;
          const over = Math.abs(lat) - W.half;
          if (over <= 0) continue;
          const n = this.tn.copy(W.right).multiplyScalar(-Math.sign(lat));
          b.x.addScaledVector(n, over);
          const j = this.contact(b, r, n, 0.3, 0.5);
          if (j * b.invMass > 2.5 && b.age - b.lastHit > 0.15) {
            b.lastHit = b.age;
            this.onImpact({ pos: b.x.clone().add(r), speed: j * b.invMass, water: false, mass: sizeK(b), side: true });
          }
        }
      }
      if (hits > 0 && hit > 1.5 && b.age - b.lastHit > 0.12) {
        b.lastHit = b.age;
        hitAt.divideScalar(hits);
        if (b.breakInto > 0 && hit > 4) {
          this.onImpact({ pos: hitAt.clone(), speed: hit, water: false, mass: sizeK(b), broke: true });
          this.shatter(i);
          continue;
        }
        this.onImpact({ pos: hitAt.clone(), speed: hit, water: false, mass: sizeK(b), tag: b.tag });
        this.chip(b, hitAt, hit);
      }
      // Rolling resistance and sleep: a piece lying still on the floor goes to rest.
      if (touching) {
        // Rolling resistance on small pieces; anything barely moving and barely turning loses the
        // rest of its spin fast (no shimmer at rest). A pier pivoting on its foot keeps its swing.
        const w2 = b.spin.lengthSq();
        if (b.vel.lengthSq() < 0.05 && w2 < 0.4) b.spin.multiplyScalar(Math.exp(-6 * dt));
        else if (b.shard) b.spin.multiplyScalar(Math.exp(-1.2 * dt));
        if (b.vel.lengthSq() < 0.03 && b.spin.lengthSq() < 0.12) {
          b.sleepT += dt;
          if (b.sleepT > 0.35) {
            b.vel.set(0, 0, 0);
            b.spin.set(0, 0, 0);
            b.rest = true;
          }
        } else b.sleepT = 0;
      } else b.sleepT = 0;
      // Water: through the surface (a splash), then sinking.
      if (!b.splashed && b.x.y < WATER_Y) {
        const gy = b.ground(b.x.x, b.x.z);
        if (gy === null || gy < WATER_Y) {
          b.splashed = true;
          this.onImpact({ pos: new THREE.Vector3(b.x.x, WATER_Y, b.x.z), speed: -b.vel.y, water: true, mass: sizeK(b) });
          // The surface takes most of the speed at once.
          b.vel.multiplyScalar(0.45);
          b.spin.multiplyScalar(0.5);
        }
      }
      if (b.splashed) {
        const t = b.splashT;
        if (t < 1.8 && Math.floor((t - dt) / 0.2) !== Math.floor(t / 0.2)) this.onBubbles(this.tv.set(b.x.x, WATER_Y, b.x.z), Math.min(1, b.radius * 2) * (1 - t / 1.8));
        if (b.x.y < WATER_Y - 6) {
          this.remove(i);
          continue;
        }
      }
      // Loose pieces still moving after 30 s are dropped.
      if (b.age > 30 && !b.rest) this.remove(i);
    }
  }

  update(dt: number): void {
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= STEP) {
      this.step(STEP);
      this.acc -= STEP;
    }
    // Place the meshes (the origin from the centre of mass).
    for (const b of this.bodies) {
      b.mesh.quaternion.copy(b.q);
      b.mesh.position.copy(b.com).applyQuaternion(b.q).negate().add(b.x);
    }
  }

  private remove(i: number): void {
    const b = this.bodies[i]!;
    this.root.remove(b.mesh);
    this.bodies.splice(i, 1);
  }

  private box = new THREE.Box3();
  private lp = new THREE.Vector3();
  /** Is `p` inside a heavy body (the gate door)? */
  containsHeavy(p: THREE.Vector3): boolean {
    for (const b of this.bodies) {
      if (!b.heavy) continue;
      const g = b.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      b.mesh.updateMatrixWorld();
      this.lp.copy(p).applyMatrix4(this.inv.copy(b.mesh.matrixWorld).invert());
      if (this.box.copy(g.boundingBox!).expandByScalar(0.3).containsPoint(this.lp)) return true;
    }
    return false;
  }
  private inv = new THREE.Matrix4();

  /** Set a body's velocity (and optionally spin) now: a stone glancing off the runner. */
  kick(mesh: THREE.Mesh, vel: THREE.Vector3, spin?: THREE.Vector3): void {
    const b = this.bodies.find((x) => x.mesh === mesh);
    if (!b) return;
    b.vel.copy(vel);
    if (spin) b.spin.copy(spin);
    b.rest = false;
  }

  /** Bodies near `p` (within `r` m), for staging (e.g. where a toppled pier came to rest). */
  restingNear(p: THREE.Vector3, r: number): THREE.Mesh[] {
    return this.bodies.filter((b) => b.x.distanceTo(p) < r).map((b) => b.mesh);
  }

  clear(): void {
    for (let i = this.bodies.length - 1; i >= 0; i--) this.remove(i);
    this.acc = 0;
  }

  get count(): number {
    return this.bodies.length;
  }
}
