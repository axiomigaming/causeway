import * as THREE from 'three';
import type { Kit } from './assets';
import { forward, left } from './path';
import type { LandmarkKind } from './style';
import { WATER_Y } from './water';

/**
 * World rounds 12–13: hero landmarks that only some worlds show (style.ts picks them), staged where the
 * chase camera looks. Each stands straight ahead of an open approach (a bridge, stepping slabs, a low
 * causeway) beyond a corner: for the 3–6 s run-up it fills the far end of the view, then the route turns
 * away from it and it slides past on the outside of the bend. They are colossal (18–25 m above the water)
 * so they read against the sky, and a touch of haze sits them back in the air.
 *
 * Built from kit pieces, their placement baked into geometry copies, in a frame whose origin is the
 * focal point and whose +z faces the approaching runner.
 */
interface Part {
  piece: string;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  /** Euler x, z (YXZ order with rotY). */
  tilt?: [number, number];
  s?: number;
}

const KINDS: Record<LandmarkKind, Part[]> = {
  // A colossal guardian toppled into the river, leaning against the current, its head broken off beside it.
  fallen_colossus: [
    { piece: 'guardian_1', x: 0, y: WATER_Y - 4.5, z: 0, rotY: 0.35, tilt: [-0.42, 0.18], s: 3.9 },
    { piece: 'head_0', x: 11, y: WATER_Y - 2.4, z: 7, rotY: -0.8, tilt: [0.3, -0.5], s: 2.4 },
    { piece: 'rock_big_1', x: -7, y: WATER_Y - 3.0, z: 6, rotY: 1.2, s: 0.55 },
  ],
  // A giant face rising out of the water to the brow, gazing back down the causeway.
  river_head: [
    { piece: 'head_1', x: 0, y: WATER_Y - 6.0, z: 0, rotY: 0.15, tilt: [0.06, 0], s: 4.6 },
    { piece: 'rubble_3', x: -9, y: WATER_Y - 0.4, z: 8, rotY: 0.6, s: 4.0 },
    { piece: 'rubble_2', x: 10, y: WATER_Y - 0.4, z: 6, rotY: 2.1, s: 3.2 },
  ],
  // The top tiers and shrine of a drowned pyramid break the water line, its stair toward the runner.
  sunken_temple: [{ piece: 'temple_0', x: 0, y: WATER_Y - 16, z: -6, rotY: 0, s: 2.3 }],
  // A sheer jungle cliff rising straight out of the river.
  jungle_cliff: [
    { piece: 'cliff_wall_2', x: 0, y: WATER_Y - 2, z: 0, rotY: Math.PI / 2, s: 1.35 },
    { piece: 'cliff_wall_2_veg', x: 0, y: WATER_Y - 2, z: 0, rotY: Math.PI / 2, s: 1.35 },
    { piece: 'cliff_wall_2_trees', x: 0, y: WATER_Y - 2, z: 0, rotY: Math.PI / 2, s: 1.35 },
  ],
  // The lone columns of a vanished hall, standing in the water at different heights.
  column_grove: [
    { piece: 'column_lone_0', x: -9, y: WATER_Y - 2.0, z: 4, s: 1.9 },
    { piece: 'column_lone_0', x: -2, y: WATER_Y - 0.5, z: -3, rotY: 1.3, s: 2.1 },
    { piece: 'column_lone_0', x: 6, y: WATER_Y - 4.0, z: 2, rotY: 2.2, s: 1.8 },
    { piece: 'column_lone_0', x: 12, y: WATER_Y - 6.5, z: 8, rotY: 0.4, tilt: [0.15, -0.3], s: 1.9 },
    { piece: 'column_lone_0', x: 2, y: WATER_Y - 7.0, z: 9, rotY: 2.9, tilt: [-0.25, 0.4], s: 1.7 },
  ],
};

export interface Landmark {
  kind: LandmarkKind;
  /** Route distance of the corner it stands beyond: in view for the run-up to it. */
  s: number;
  root: THREE.Group;
}

const HAZE = new THREE.Color(0x9fb7bd);

export class Landmarks {
  readonly list: Landmark[] = [];
  private readonly hazed = new Map<string, THREE.Material>();

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
  ) {}

  /** The kit material, lifted toward the haze (they stand 40–60 m out over water). */
  private material(key: string): THREE.Material | undefined {
    let m = this.hazed.get(key);
    if (!m) {
      const base = this.kit.mat.get(key) as THREE.MeshStandardMaterial | undefined;
      if (!base) return undefined;
      const c = base.clone();
      c.color.multiplyScalar(0.88);
      c.emissive = HAZE.clone().multiplyScalar(0.1);
      this.hazed.set(key, c);
      m = c;
    }
    return m;
  }

  /**
   * Stage `kind` beyond a corner whose start frame is (`p0`, `yaw0`): `ahead` m on along the approach,
   * `outside` m toward the outside of the bend (+1 right, −1 left), facing the runner.
   */
  place(kind: LandmarkKind, s: number, p0: THREE.Vector3, yaw0: number, ahead: number, outside: number): Landmark {
    const at = p0.clone().addScaledVector(forward(yaw0), ahead).addScaledVector(left(yaw0), -outside);
    const root = new THREE.Group();
    root.name = `landmark_${kind}`;
    root.matrixAutoUpdate = false;
    root.matrix.makeRotationY(yaw0).setPosition(at.x, 0, at.z);
    for (const p of KINDS[kind]) {
      const g = this.kit.geo.get(p.piece);
      const key = this.kit.matOf.get(p.piece);
      const mat = key ? this.material(key) : undefined;
      if (!g || !mat) continue;
      const sc = p.s ?? 1;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt?.[0] ?? 0, p.rotY ?? 0, p.tilt?.[1] ?? 0, 'YXZ')),
        new THREE.Vector3(sc, sc, sc),
      );
      const gg = g.clone().applyMatrix4(m);
      gg.computeBoundingSphere();
      const mesh = new THREE.Mesh(gg, mat);
      mesh.name = `landmark|${p.piece}`;
      mesh.matrixAutoUpdate = false;
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
    for (const l of [...this.list]) if (l.s < s - 150) this.remove(l);
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
