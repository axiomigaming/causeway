import * as THREE from 'three';
import type { Kit } from './assets';
import { frameMatrix, type Path } from './path';
import { PATH_HALF } from './sections';

/**
 * Round 11: obstacle props for the obstacle director (FX). The world owns their geometry; the director
 * decides when (from the current multiplier, never the fall point), places them on the route with
 * Track.spawnObstacle and animates them (a trunk crashing down, a lintel dropping, a column rolling in).
 *
 * Each obstacle is a group at the route frame of its arc length `s` (local x across the path, +y up,
 * −z along the run), built from kit pieces. Its children are separate meshes, so they can be animated
 * one by one; `rest` holds each child's resting matrix.
 *
 *   log     a fallen jungle trunk across the way, resting on the slabs: jump it
 *   pillar  a toppled stone column across the way: jump it
 *   beam    a stone lintel fallen onto two broken posts at the parapets: slide under it
 *   bough   a whole tree trunk leaning across from one parapet to the other: slide under it
 */
export type ObstacleKind = 'log' | 'pillar' | 'beam' | 'bough';

export interface Obstacle {
  kind: ObstacleKind;
  /** Arc length of its centre line. */
  s: number;
  /** What the runner must do: clear its top (jump) or pass under its underside (slide). */
  action: 'jump' | 'slide';
  /** Height above the path of its top (jump) or of its underside over the path (slide), m. */
  clearance: number;
  /** Arc-length span it occupies along the route. */
  sNear: number;
  sFar: number;
  root: THREE.Group;
  /** The children's resting local matrices (for the director's animations to return to). */
  rest: THREE.Matrix4[];
}


const _v = new THREE.Vector3();

export class Obstacles {
  readonly list: Obstacle[] = [];
  private readonly bounds = new Map<string, THREE.Box3>();
  /** The members laid by the current spawn (centre height, thickness, tilt). */
  private readonly laid: { y: number; thick: number; tilt: number }[] = [];

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    private readonly path: Path,
  ) {}

  private box(piece: string): THREE.Box3 | null {
    let b = this.bounds.get(piece);
    if (!b) {
      const g = this.kit.geo.get(piece);
      if (!g) return null;
      if (!g.boundingBox) g.computeBoundingBox();
      b = g.boundingBox!.clone();
      this.bounds.set(piece, b);
    }
    return b;
  }

  /** A kit piece as its own mesh, its long axis (`axis` of its geometry) laid along local x. */
  private lay(root: THREE.Group, piece: string, axis: 'x' | 'y' | 'z', length: number, thick: number, at: THREE.Vector3, tilt = 0, spin = 0): THREE.Mesh | null {
    const g = this.kit.geo.get(piece);
    const b = this.box(piece);
    if (!g || !b) return null;
    const size = b.getSize(new THREE.Vector3());
    const centre = b.getCenter(new THREE.Vector3());
    const L = size[axis];
    const T = Math.max(axis === 'x' ? Math.max(size.y, size.z) : axis === 'y' ? Math.max(size.x, size.z) : Math.max(size.x, size.y), 1e-3);
    const sl = length / Math.max(L, 1e-3);
    const st = thick / T;
    const scale = new THREE.Vector3(st, st, st);
    scale[axis] = sl;
    // Rotate the long axis onto x, then tilt about z (one end up) and spin about it (vary the face).
    const q = new THREE.Quaternion();
    if (axis === 'y') q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    else if (axis === 'z') q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spin);
    const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
    const rot = qt.multiply(qa).multiply(q);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(), rot, scale);
    // Centre the piece's bounds on `at`.
    const c = centre.clone().applyMatrix4(m);
    m.setPosition(at.x - c.x, at.y - c.y, at.z - c.z);
    const mesh = this.mesh(piece, g, m);
    mesh.receiveShadow = true;
    root.add(mesh);
    this.laid.push({ y: at.y, thick, tilt });
    return mesh;
  }

  private piece(root: THREE.Group, piece: string, x: number, y: number, z: number, rotY = 0, s: number | [number, number, number] = 1): THREE.Mesh | null {
    const g = this.kit.geo.get(piece);
    if (!g) return null;
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), sc);
    const mesh = this.mesh(piece, g, m);
    root.add(mesh);
    return mesh;
  }

  /**
   * The placement is baked into a copy of the geometry (as the sections' merged props are; the kit's
   * patched materials drew nothing under a rotated, non-uniformly scaled model matrix), so every
   * child rests at the identity. userData.centre is its centre in the obstacle's frame: the pivot to
   * rotate it about when animating.
   */
  private mesh(piece: string, g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.Mesh {
    const gg = g.clone().applyMatrix4(m);
    gg.computeBoundingBox();
    gg.computeBoundingSphere();
    const mesh = new THREE.Mesh(gg, this.kit.mat.get(this.kit.matOf.get(piece) ?? '') ?? undefined);
    mesh.name = `obstacle|${piece}`;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = true;
    mesh.userData.centre = gg.boundingBox!.getCenter(new THREE.Vector3());
    return mesh;
  }

  /** Place an obstacle across the route at arc length `s`. `seed` varies its dressing (cosmetic). */
  spawn(kind: ObstacleKind, s: number, seed = 0): Obstacle {
    const root = new THREE.Group();
    root.name = `obstacle_${kind}`;
    const f = this.path.sample(s);
    root.matrixAutoUpdate = false;
    root.matrix.copy(frameMatrix(f));
    root.matrixWorldNeedsUpdate = true;
    const r = (k: number) => {
      const x = Math.sin((seed + 1) * 12.9898 + k * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const W = 2 * (PATH_HALF + 0.9);
    let action: Obstacle['action'] = 'jump';
    switch (kind) {
      case 'log': {
        // A jungle trunk, 0.75 m thick, its ends on the parapets' feet; ferns sprouting by it.
        this.lay(root, 'jungle_0_trunk', 'y', W + 1.4, 0.75, _v.set(0, 0.33, 0), (r(1) - 0.5) * 0.06, r(2) * 6.28);
        this.piece(root, `fern_${r(3) < 0.5 ? 0 : 1}`, -PATH_HALF + 0.3, 0, 0.5, r(4) * 6.28, 0.7);
        this.piece(root, 'moss_2', PATH_HALF * (r(5) - 0.5), 0.62, 0, r(6) * 6.28, 0.6);
        break;
      }
      case 'pillar': {
        // A toppled column, drums askew, rubble where it broke.
        this.lay(root, r(1) < 0.5 ? 'column_fallen_0' : 'column_fallen_1', 'z', W + 0.6, 0.85, _v.set(0, 0.38, 0), (r(2) - 0.5) * 0.05, r(3) * 6.28);
        this.piece(root, `rubble_${Math.floor(r(4) * 4)}`, PATH_HALF * 0.6, 0, -1.1, r(5) * 6.28, 0.7);
        break;
      }
      case 'beam': {
        // Two broken posts at the parapets and a cracked lintel fallen across them: 1.3 m under it.
        action = 'slide';
        for (const sd of [-1, 1]) this.piece(root, 'pillar_2', sd * (PATH_HALF + 0.45), 0, 0, r(1 + sd) * 6.28, [0.9, 0.5, 0.9]);
        this.lay(root, 'column_fallen_1', 'z', W + 0.8, 0.6, _v.set(0, 1.62, 0), (r(4) - 0.5) * 0.08, r(5) * 6.28);
        this.piece(root, 'vines_2', 0.4, 1.4, 0, 0, [0.6, 0.35, 0.6]);
        break;
      }
      case 'bough': {
        // A whole trunk fallen across from one parapet to the far side, leaning: 1.2 m under its
        // low end, its crown spilling over the parapet.
        action = 'slide';
        const side = r(1) < 0.5 ? -1 : 1;
        const tilt = side * 0.16;
        this.lay(root, 'jungle_1_trunk', 'y', W + 3, 0.7, _v.set(0, 1.95, 0), tilt, r(2) * 6.28);
        this.piece(root, `bush_${Math.floor(r(3) * 4)}`, side * (PATH_HALF + 2.2), 2.4, 0, r(4) * 6.28, 1.1);
        this.piece(root, 'vines_1', -side * 0.6, 1.9, 0, 0, [0.6, 0.4, 0.6]);
        break;
      }
    }
    // Clearance over the walkable width (|x| < PATH_HALF), from the laid pieces' centre lines: a
    // tilted member is highest/lowest at the path's edge.
    let top = 0;
    let under = Infinity;
    let half = 0.4;
    for (const l of this.laid) {
      const rise = Math.abs(Math.sin(l.tilt)) * PATH_HALF;
      const r = l.thick / 2 / Math.max(Math.cos(l.tilt), 0.5);
      top = Math.max(top, l.y + rise + r);
      under = Math.min(under, l.y - rise - r);
      half = Math.max(half, l.thick / 2);
    }
    this.laid.length = 0;
    const zMin = -half - 0.1;
    const zMax = half + 0.1;
    const o: Obstacle = {
      kind,
      s,
      action,
      clearance: action === 'jump' ? top : Number.isFinite(under) ? under : 1.2,
      sNear: s - zMax,
      sFar: s - zMin,
      root,
      rest: (root.children as THREE.Mesh[]).map((c) => c.matrix.clone()),
    };
    this.parent.add(root);
    this.list.push(o);
    return o;
  }

  remove(o: Obstacle): void {
    const i = this.list.indexOf(o);
    if (i >= 0) this.list.splice(i, 1);
    this.parent.remove(o.root);
    for (const c of o.root.children as THREE.Mesh[]) c.geometry.dispose();
  }

  /** Drop the ones the run has left behind. */
  trim(s: number): void {
    for (const o of [...this.list]) if (o.sFar < s - 30) this.remove(o);
  }

  clear(): void {
    for (const o of [...this.list]) this.remove(o);
  }

  /** Obstacles overlapping [sFrom, sTo]. */
  within(sFrom: number, sTo: number): Obstacle[] {
    return this.list.filter((o) => o.sFar > sFrom && o.sNear < sTo);
  }
}

