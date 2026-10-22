import * as THREE from 'three';
import type { Kit } from './assets';
import { forward, left } from './path';
import type { LandmarkKind } from './style';
import { WATER_Y } from './water';

/**
 * World rounds 12–14: hero landmarks that only some worlds show (style.ts picks them), staged where the
 * chase camera looks. Each stands straight ahead of an open approach (track.ts forces three 'approach'
 * sections over open water and a corner) beyond the corner: for the run-up it fills the far end of the
 * view, then the route turns away from it and it slides past on the outside of the bend.
 *
 * They are colossal — a head ~40 m from the water, a 45 m guardian lying toppled across the river, a
 * pyramid ~70 m across sunk to its upper tiers, a grove of 20–30 m columns — and pushed into the air
 * (lighter, bluer, softer) so they read as huge and far, not small and near. Each also brings its own
 * foreground dressing beside the approach, so no two reveals look alike.
 *
 * Built from kit pieces, their placement baked into geometry copies, in a frame whose origin is the
 * focal point, whose +z faces the approaching runner and whose +x points to the outside of the bend
 * (the frame is mirrored for the other turn). The approach runs along x = −10 from z = +30 (the corner).
 */
interface Part {
  piece: string;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  /** Euler x, z (YXZ order with rotY). */
  tilt?: [number, number];
  /** Uniform scale, or per axis. */
  s?: number | [number, number, number];
  /** Foreground dressing beside the approach: not hazed, and not part of the landmark's silhouette. */
  near?: boolean;
}

const KINDS: Record<LandmarkKind, Part[]> = {
  // A colossal guardian (≈45 m) toppled across the river on its side, its shoulders and head reared out
  // of the water, its feet sunk; the broken-off head of another lies face-up in the shallows nearby.
  fallen_colossus: [
    { piece: 'guardian_1', x: -20, y: WATER_Y - 8, z: -16, rotY: Math.PI, tilt: [0, -(Math.PI / 2 - 0.32)], s: 9.5 },
    { piece: 'head_0', x: 14, y: WATER_Y - 6, z: 6, rotY: 0.6, tilt: [-1.1, 0.25], s: 4.4 },
    // Fragments of it in the water beside the approach.
    { piece: 'column_fallen_0', x: 0, y: WATER_Y - 0.6, z: 48, rotY: 0.9, s: 2.2, near: true },
    { piece: 'rubble_3', x: -22, y: WATER_Y - 0.8, z: 60, rotY: 2.0, s: 2.6, near: true },
    { piece: 'rock_mid_1', x: -1, y: WATER_Y - 0.4, z: 68, rotY: 0.4, s: 1.6, near: true },
  ],
  // A giant face (≈40 m from the water to the crown) rising from the river to the chin, gazing back
  // down the approach, fallen blocks heaped at its jaw.
  river_head: [
    { piece: 'head_1', x: 0, y: WATER_Y + 4.5, z: -12, rotY: 0.15, tilt: [-0.05, 0], s: 6.2 },
    { piece: 'rubble_3', x: 19, y: WATER_Y - 0.8, z: 6, rotY: 0.6, s: 5.5 },
    { piece: 'rubble_2', x: -6, y: WATER_Y - 0.8, z: 8, rotY: 2.1, s: 4.5 },
    // A palm islet and a stele beside the approach.
    { piece: 'rock_big_0', x: -23, y: WATER_Y - 4.2, z: 52, rotY: 1.1, s: 0.32, near: true },
    { piece: 'palm_1_trunk', x: -23, y: WATER_Y + 1.2, z: 52, rotY: 0.3, s: 0.9, near: true },
    { piece: 'palm_1_crown', x: -23, y: WATER_Y + 1.2, z: 52, rotY: 0.3, s: 0.9, near: true },
    { piece: 'stele_1', x: -1, y: WATER_Y - 0.8, z: 46, rotY: 0.5, tilt: [0.12, -0.1], s: 2.0, near: true },
  ],
  // A step pyramid ≈75 m across, sunk so that its upper tiers and shrine break the water: broad
  // stepped terraces, wider than they are tall in the frame, its stair toward the runner.
  sunken_temple: [
    { piece: 'temple_0', x: 4, y: WATER_Y - 22, z: -28, rotY: 0, s: [4.3, 3.0, 4.3] },
    // A drowned stele and a feathered-serpent post beside the approach.
    { piece: 'stele_0', x: -1, y: WATER_Y - 1.5, z: 50, rotY: 0.4, tilt: [0.1, 0.15], s: 2.8, near: true },
    { piece: 'serpent_0', x: -21, y: WATER_Y - 0.8, z: 58, rotY: -0.8, s: 3.0, near: true },
    { piece: 'rubble_1', x: -2, y: WATER_Y - 0.6, z: 66, rotY: 1.3, s: 2.5, near: true },
  ],
  // A sheer jungle cliff rising straight out of the river.
  jungle_cliff: [
    { piece: 'cliff_wall_2', x: 0, y: WATER_Y - 2.7, z: -8, rotY: Math.PI / 2, s: 1.9 },
    { piece: 'cliff_wall_2_veg', x: 0, y: WATER_Y - 2.7, z: -8, rotY: Math.PI / 2, s: 1.9 },
    { piece: 'cliff_wall_2_trees', x: 0, y: WATER_Y - 2.7, z: -8, rotY: Math.PI / 2, s: 1.9 },
    // A big tree on a boulder and roots in the water beside the approach.
    { piece: 'rock_mid_2', x: 0, y: WATER_Y - 0.6, z: 52, rotY: 1.7, s: 1.8, near: true },
    { piece: 'tree_big_1_trunk', x: 1, y: WATER_Y + 0.6, z: 53, rotY: 2.4, s: 0.7, near: true },
    { piece: 'tree_big_1_crown', x: 1, y: WATER_Y + 0.6, z: 53, rotY: 2.4, s: 0.7, near: true },
    { piece: 'roots_1', x: -21, y: WATER_Y + 0.2, z: 62, rotY: 0.7, s: 1.6, near: true },
  ],
  // The 25–30 m columns of a vanished hall standing in the water, some leaning, some fallen against
  // others, at different depths.
  column_grove: [
    { piece: 'column_lone_0', x: -6, y: WATER_Y - 4, z: 4, s: 2.8 },
    { piece: 'column_lone_0', x: 2, y: WATER_Y - 2, z: -4, rotY: 1.3, s: 3.0 },
    { piece: 'column_lone_0', x: 10, y: WATER_Y - 5, z: 2, rotY: 2.2, s: 2.7 },
    { piece: 'column_lone_0', x: 18, y: WATER_Y - 3, z: -6, rotY: 0.7, s: 2.9 },
    { piece: 'column_lone_0', x: 26, y: WATER_Y - 6, z: 4, rotY: 2.9, s: 2.6 },
    { piece: 'column_lone_0', x: 6, y: WATER_Y - 7, z: -16, rotY: 0.2, s: 3.0 },
    { piece: 'column_lone_0', x: 22, y: WATER_Y - 9, z: 12, rotY: 0.4, tilt: [0.1, -0.42], s: 2.8 },
    { piece: 'column_lone_0', x: -2, y: WATER_Y - 10, z: 14, rotY: 2.9, tilt: [-0.2, 0.5], s: 2.6 },
    { piece: 'column_lone_0', x: 14, y: WATER_Y - 4, z: -14, rotY: 1.9, tilt: [0.15, 0.22], s: 2.9 },
    // A broken pier and a fallen shaft beside the approach.
    { piece: 'pillar_1', x: -1, y: WATER_Y - 0.8, z: 50, rotY: 0.3, s: 2.2, near: true },
    { piece: 'column_fallen_1', x: -22, y: WATER_Y - 0.9, z: 58, rotY: 1.2, s: 1.8, near: true },
  ],
};

export interface Landmark {
  kind: LandmarkKind;
  /** Route distance of the corner it stands beyond: in view for the run-up to it. */
  s: number;
  root: THREE.Group;
  /** The landmark itself (root's first child); the dressing beside the approach is the second. */
  main: THREE.Group;
}

/** Aerial perspective: the haze colour they are pushed toward, and how far. */
const HAZE = new THREE.Color(0xb6cbd8);

export class Landmarks {
  readonly list: Landmark[] = [];
  private readonly hazed = new Map<string, THREE.Material>();

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
  ) {}

  /** The kit material pushed into the air: darker albedo, a cool lift (lighter, bluer, less contrast). */
  private material(key: string, near: boolean): THREE.Material | undefined {
    const base = this.kit.mat.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!base || near) return base;
    let m = this.hazed.get(key);
    if (!m) {
      const c = base.clone();
      c.color.multiply(new THREE.Color(0.66, 0.72, 0.8));
      c.emissive = HAZE.clone().multiplyScalar(0.16);
      this.hazed.set(key, c);
      m = c;
    }
    return m;
  }

  /**
   * Stage `kind` beyond a corner whose start frame is (`p0`, `yaw0`): `ahead` m on along the approach,
   * `outside` m toward the outside of the bend (positive: to the right), facing the runner.
   */
  place(kind: LandmarkKind, s: number, p0: THREE.Vector3, yaw0: number, ahead: number, outside: number): Landmark {
    const at = p0.clone().addScaledVector(forward(yaw0), ahead).addScaledVector(left(yaw0), -outside);
    const root = new THREE.Group();
    root.name = `landmark_${kind}`;
    root.matrixAutoUpdate = false;
    // Mirrored for a bend to the right, so +x is always the outside (three flips the winding of a
    // mesh whose world matrix mirrors).
    root.matrix.makeRotationY(yaw0).multiply(new THREE.Matrix4().makeScale(outside < 0 ? -1 : 1, 1, 1)).setPosition(at.x, 0, at.z);
    const main = new THREE.Group();
    const dressing = new THREE.Group();
    for (const g of [main, dressing]) {
      g.matrixAutoUpdate = false;
      root.add(g);
    }
    for (const p of KINDS[kind]) {
      const g = this.kit.geo.get(p.piece);
      const key = this.kit.matOf.get(p.piece);
      const mat = key ? this.material(key, !!p.near) : undefined;
      if (!g || !mat) continue;
      const sc = p.s ?? 1;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt?.[0] ?? 0, p.rotY ?? 0, p.tilt?.[1] ?? 0, 'YXZ')),
        typeof sc === 'number' ? new THREE.Vector3(sc, sc, sc) : new THREE.Vector3(...sc),
      );
      const gg = g.clone().applyMatrix4(m);
      gg.computeBoundingSphere();
      const mesh = new THREE.Mesh(gg, mat);
      mesh.name = `landmark|${p.piece}`;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = !!p.near;
      (p.near ? dressing : main).add(mesh);
    }
    root.updateMatrixWorld(true);
    this.parent.add(root);
    const l = { kind, s, root, main };
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
    l.root.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
  }
}
