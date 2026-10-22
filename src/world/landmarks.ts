import * as THREE from 'three';
import type { Kit } from './assets';
import { forward, left } from './path';
import type { LandmarkKind } from './style';
import { patchWetStone } from './caustics';
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
  /** 'light': keep the stone's colour, moss and contrast (the colossus and the head, which the full
   * lift washed to pale ghosts against the sun). */
  haze?: 'light' | 'face';
}

// QA (dev builds only): ?headyaw= overrides the fallen head's yaw.
const QA_HEAD_YAW = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('headyaw') ? Number(new URLSearchParams(location.search).get('headyaw')) : 0.3;

const KINDS: Record<LandmarkKind, Part[]> = {
  // A drowned colossus: its fallen head (≈45 m) lying on its cheek in the river, face turned to the
  // runner on one side of the way, its stone hand (≈30 m) rising from the water on the other, palm to
  // the runner, fingers curled: the approach heads between them.
  fallen_colossus: [
    { piece: 'head_0', x: 0, y: WATER_Y - 1, z: 2, rotY: QA_HEAD_YAW, tilt: [0.12, -0.4], s: 10.5, haze: 'face' },
    { piece: 'hand_colossal_0', x: -25, y: WATER_Y - 6, z: -2, rotY: 0.4, tilt: [0.08, 0.1], s: 17, haze: 'light' },
    { piece: 'rubble_3', x: -10, y: WATER_Y - 0.8, z: 2, rotY: 2.0, s: 5.0, haze: 'light' },
    // Fragments of it in the water beside the approach.
    { piece: 'column_fallen_0', x: 0, y: WATER_Y - 0.6, z: 48, rotY: 0.9, s: 2.2, near: true },
    { piece: 'rubble_3', x: -22, y: WATER_Y - 0.8, z: 60, rotY: 2.0, s: 2.6, near: true },
    { piece: 'rock_mid_1', x: -1, y: WATER_Y - 0.4, z: 68, rotY: 0.4, s: 1.6, near: true },
  ],
  // A giant face (≈40 m from the water to the crown) rising from the river to the chin, gazing back
  // down the approach, fallen blocks heaped at its jaw.
  river_head: [
    { piece: 'head_1', x: -6, y: WATER_Y + 5.1, z: -4, rotY: 0.15, tilt: [-0.05, 0], s: 7.0, haze: 'light' },
    { piece: 'rubble_3', x: 14, y: WATER_Y - 0.8, z: 10, rotY: 0.6, s: 5.5, haze: 'light' },
    { piece: 'rubble_2', x: -18, y: WATER_Y - 0.8, z: 4, rotY: 2.1, s: 4.5, haze: 'light' },
    // A palm islet and a stele beside the approach.
    { piece: 'rock_big_0', x: -23, y: WATER_Y - 4.2, z: 52, rotY: 1.1, s: 0.32, near: true },
    { piece: 'palm_1_trunk', x: -23, y: WATER_Y + 1.2, z: 52, rotY: 0.3, s: 0.9, near: true },
    { piece: 'palm_1_crown', x: -23, y: WATER_Y + 1.2, z: 52, rotY: 0.3, s: 0.9, near: true },
    { piece: 'stele_1', x: -1, y: WATER_Y - 0.8, z: 46, rotY: 0.5, tilt: [0.12, -0.1], s: 2.0, near: true },
  ],
  // A step pyramid ≈75 m across, sunk so that its upper tiers and shrine break the water: broad
  // stepped terraces, wider than they are tall in the frame, its stair toward the runner.
  sunken_temple: [
    { piece: 'temple_0', x: -10, y: WATER_Y - 6, z: -36, rotY: 0, s: [4.5, 3.0, 4.5] },
    // A drowned stele and a feathered-serpent post beside the approach.
    { piece: 'stele_0', x: -2, y: WATER_Y - 1.2, z: 50, rotY: 0.4, tilt: [0.1, 0.15], s: 1.7, near: true },
    { piece: 'serpent_0', x: -21, y: WATER_Y - 0.8, z: 58, rotY: -0.8, s: 3.0, near: true },
    { piece: 'rubble_1', x: -2, y: WATER_Y - 0.6, z: 66, rotY: 1.3, s: 2.5, near: true },
  ],
  // A sheer jungle cliff rising straight out of the river.
  jungle_cliff: [
    { piece: 'cliff_wall_2', x: -5, y: WATER_Y - 2.7, z: -8, rotY: Math.PI / 2, s: 1.9 },
    { piece: 'cliff_wall_2_veg', x: -5, y: WATER_Y - 2.7, z: -8, rotY: Math.PI / 2, s: 1.9 },
    { piece: 'cliff_wall_2_trees', x: -5, y: WATER_Y - 2.7, z: -8, rotY: Math.PI / 2, s: 1.9 },
    // A big tree on a boulder and roots in the water beside the approach.
    { piece: 'rock_mid_2', x: 0, y: WATER_Y - 0.6, z: 52, rotY: 1.7, s: 1.8, near: true },
    { piece: 'tree_big_1_trunk', x: 1, y: WATER_Y + 0.6, z: 53, rotY: 2.4, s: 0.7, near: true },
    { piece: 'tree_big_1_crown', x: 1, y: WATER_Y + 0.6, z: 53, rotY: 2.4, s: 0.7, near: true },
    { piece: 'roots_1', x: -21, y: WATER_Y + 0.2, z: 62, rotY: 0.7, s: 1.6, near: true },
  ],
  // The 25–30 m columns of a vanished hall standing in the water, some leaning, some fallen against
  // others, at different depths.
  column_grove: [
    // (Light haze, round 16: under the full haze the stone read as bleached plaster in the golden look.)
    { piece: 'column_lone_0', x: -14, y: WATER_Y - 2.5, z: 4, s: 3.22, haze: 'light' },
    { piece: 'column_lone_0', x: -6, y: WATER_Y - 1, z: -4, rotY: 1.3, s: 3.45, haze: 'light' },
    { piece: 'column_lone_0', x: 2, y: WATER_Y - 3.5, z: 2, rotY: 2.2, s: 3.10, haze: 'light' },
    { piece: 'column_lone_0', x: 10, y: WATER_Y - 1.5, z: -6, rotY: 0.7, s: 3.33, haze: 'light' },
    { piece: 'column_lone_0', x: 18, y: WATER_Y - 4.5, z: 4, rotY: 2.9, s: 2.99, haze: 'light' },
    { piece: 'column_lone_0', x: -2, y: WATER_Y - 5.5, z: -16, rotY: 0.2, s: 3.45, haze: 'light' },
    { piece: 'column_lone_0', x: 14, y: WATER_Y - 7.5, z: 12, rotY: 0.4, tilt: [0.1, -0.42], s: 3.22, haze: 'light' },
    { piece: 'column_lone_0', x: -10, y: WATER_Y - 8.5, z: 14, rotY: 2.9, tilt: [-0.2, 0.5], s: 2.99, haze: 'light' },
    { piece: 'column_lone_0', x: 6, y: WATER_Y - 2.5, z: -14, rotY: 1.9, tilt: [0.15, 0.22], s: 3.33, haze: 'light' },
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

/** Kit materials that take the landmark-scale scan detail. */
const STONE = new Set(['statue', 'stoneA', 'stoneB', 'temple', 'glyph', 'rock', 'cliff']);

/** Aerial perspective: the haze colour they are pushed toward, and how far. */
const HAZE = new THREE.Color(0xb6cbd8);

export class Landmarks {
  readonly list: Landmark[] = [];
  private readonly hazed = new Map<string, THREE.Material>();

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
  ) {}

  /**
   * The kit material pushed into the air: darker albedo and a cool lift (lighter, bluer, less
   * contrast), full or light. Either way the scan detail is laid on at a landmark scale (caustics.ts
   * DETAIL_FAR), so the surface holds up at 7–11x.
   */
  private material(key: string, near: boolean, haze: 'light' | 'face' | 'full'): THREE.Material | undefined {
    const base = this.kit.mat.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!base || near) return base;
    const id = `${key}|${haze}`;
    let m = this.hazed.get(id);
    if (!m) {
      const c = base.clone();
      if (haze === 'face') {
        // The fallen head's own material: light haze and a warm bounce off the river into its face,
        // so the features read against the low sun.
        c.color.multiply(new THREE.Color(0.92, 0.94, 0.98));
        c.emissive = new THREE.Color(0xffc796).multiplyScalar(0.2);
        // The bounce is a fill from the viewer's side, not a flat glow: strongest on the planes that face
        // the lens (cheek, brow, the bridge of the nose), falling off where they turn away, so the
        // features keep their relief against the backlight.
        c.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= pow(max(normal.z, 0.0), 1.6) * 1.1;',
          );
        };
        c.customProgramCacheKey = () => 'faceFill';
      } else if (haze === 'light') {
        c.color.multiply(new THREE.Color(0.9, 0.93, 0.98));
        c.emissive = HAZE.clone().multiplyScalar(0.035);
      } else {
        c.color.multiply(new THREE.Color(0.72, 0.78, 0.86));
        c.emissive = HAZE.clone().multiplyScalar(0.11);
      }
      delete c.userData.wetStone;
      if (STONE.has(key)) patchWetStone(c, false, false, 0.9, false, false, true);
      this.hazed.set(id, c);
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
      const mat = key ? this.material(key, !!p.near, p.haze ?? 'full') : undefined;
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
