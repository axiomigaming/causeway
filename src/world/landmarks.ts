import * as THREE from 'three';
import type { Kit } from './assets';
import { frameMatrix, type Path } from './path';
import type { LandmarkKind } from './style';
import { WATER_Y } from './water';

/**
 * World round 12: hero landmarks that only some worlds show (style.ts picks them), set out in the river
 * well clear of the causeway (|x| ≥ 16 m in the route's frame), so that runs differ by more than their
 * scenarios: a toppled colossus lying half-drowned, a giant head rising from the river, the roof tiers of
 * a sunken pyramid, a jungle cliff, a grove of lone columns standing in the water. Built from kit pieces,
 * their placement baked into geometry copies (as the sections' props are), one small group each.
 */
interface Part {
  piece: string;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  tilt?: [number, number];
  s?: number;
}

const KINDS: Record<LandmarkKind, (side: number) => Part[]> = {
  // A colossal guardian toppled into the river, lying on its side, half under water; its head nearby.
  fallen_colossus: (sd) => [
    { piece: 'guardian_1', x: sd * 22, y: WATER_Y - 0.8, z: 0, rotY: sd * 0.4, tilt: [0, sd * Math.PI / 2], s: 2.3 },
    { piece: 'head_0', x: sd * 27, y: WATER_Y - 1.2, z: -9, rotY: -sd * 2.2, tilt: [0.35, sd * 0.25], s: 2.2 },
    { piece: 'rock_mid_1', x: sd * 19, y: WATER_Y + 0.2, z: 4, rotY: 1.1, s: 1.4 },
  ],
  // A giant face rising out of the water, gazing at the causeway.
  river_head: (sd) => [
    { piece: 'head_1', x: sd * 20, y: WATER_Y - 2.4, z: 0, rotY: sd > 0 ? Math.PI / 2 : -Math.PI / 2, tilt: [0.08, 0], s: 3.2 },
    { piece: 'rubble_3', x: sd * 17, y: WATER_Y - 0.1, z: 5, rotY: 0.6, s: 2.5 },
  ],
  // Only the top tiers and the shrine of a drowned pyramid break the surface.
  sunken_temple: (sd) => [{ piece: 'temple_0', x: sd * 30, y: WATER_Y - 10.5, z: 0, rotY: sd > 0 ? Math.PI / 2 : -Math.PI / 2, s: 1.25 }],
  // A sheer jungle cliff rising from the river.
  jungle_cliff: (sd) => {
    const ry = sd > 0 ? 0 : Math.PI;
    return [
      { piece: 'cliff_wall_2', x: sd * 24, y: WATER_Y, z: 6, rotY: ry, s: 1.1 },
      { piece: 'cliff_wall_2_veg', x: sd * 24, y: WATER_Y, z: 6, rotY: ry, s: 1.1 },
      { piece: 'cliff_wall_2_trees', x: sd * 24, y: WATER_Y, z: 6, rotY: ry, s: 1.1 },
    ];
  },
  // Lone columns of a vanished hall, standing in the water at different heights.
  column_grove: (sd) => [
    { piece: 'column_lone_0', x: sd * 17, y: WATER_Y - 1.0, z: -4, s: 1.0 },
    { piece: 'column_lone_0', x: sd * 21, y: WATER_Y - 3.5, z: 3, rotY: 1.3, s: 1.1 },
    { piece: 'column_lone_0', x: sd * 25, y: WATER_Y - 2.0, z: -10, rotY: 2.2, s: 0.95 },
    { piece: 'column_lone_0', x: sd * 19, y: WATER_Y - 5.5, z: 10, rotY: 0.4, tilt: [0.2, sd * 0.35], s: 1.0 },
  ],
};

export interface Landmark {
  kind: LandmarkKind;
  s: number;
  root: THREE.Group;
}

export class Landmarks {
  readonly list: Landmark[] = [];

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    private readonly path: Path,
  ) {}

  /** Set `kind` out on `side` (−1 left, +1 right) of the route at arc length `s`. */
  place(kind: LandmarkKind, s: number, side: number): Landmark {
    const f = this.path.sample(s);
    const root = new THREE.Group();
    root.name = `landmark_${kind}`;
    root.matrixAutoUpdate = false;
    // In the route's frame, but at the water's height whatever the path's elevation.
    root.matrix.copy(frameMatrix({ pos: new THREE.Vector3(f.pos.x, 0, f.pos.z), yaw: f.yaw }));
    for (const p of KINDS[kind](side)) {
      const g = this.kit.geo.get(p.piece);
      const key = this.kit.matOf.get(p.piece);
      if (!g || !key) continue;
      const s = p.s ?? 1;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt?.[0] ?? 0, p.rotY ?? 0, p.tilt?.[1] ?? 0, 'YXZ')),
        new THREE.Vector3(s, s, s),
      );
      const gg = g.clone().applyMatrix4(m);
      gg.computeBoundingSphere();
      const mesh = new THREE.Mesh(gg, this.kit.mat.get(key));
      mesh.name = `landmark|${p.piece}`;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    root.updateMatrixWorld(true);
    this.parent.add(root);
    const l = { kind, s, root };
    this.list.push(l);
    return l;
  }

  /** Drop the ones far behind the run. */
  trim(s: number): void {
    for (const l of [...this.list]) if (l.s < s - 120) this.remove(l);
  }

  clear(): void {
    for (const l of [...this.list]) this.remove(l);
  }

  private remove(l: Landmark): void {
    this.list.splice(this.list.indexOf(l), 1);
    this.parent.remove(l.root);
    for (const c of l.root.children as THREE.Mesh[]) c.geometry.dispose();
  }
}
