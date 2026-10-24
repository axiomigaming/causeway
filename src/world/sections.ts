import { intensityOf } from './choreo';
import { groundY, type GroundKind } from './land';
import * as THREE from 'three';
import { Rng } from '../engine/rng';
import { evalSeg, type Segment } from './path';

/**
 * Section library. A section is laid out in its own local space: origin on the
 * path at its start, −Z forward, +X to the runner's right. Everything except the
 * walkable surface is merged per material; the walkable surface is kept as
 * separate tiles so the way can visibly give out under a crash.
 */
export type SectionType =
  | 'start'
  | 'corridor'
  | 'bridge'
  | 'arcade'
  | 'gate'
  | 'tall'
  | 'plaza'
  | 'stairsDown'
  | 'stairsUp'
  | 'cliff'
  | 'ruins'
  | 'avenue'
  | 'gorge'
  | 'boardwalk'
  | 'tunnel'
  | 'statues'
  | 'sunken'
  | 'roots'
  | 'colossi'
  | 'ledge'
  | 'turnL'
  | 'turnR'
  | 'stepping'
  | 'approach'
  // World round 21: land.
  | 'forest'
  | 'forestWall'
  | 'cutting'
  | 'overgrown'
  | 'ravine';

export interface Placement {
  piece: string;
  m: THREE.Matrix4;
}

export interface Waterfall {
  m: THREE.Matrix4; // local; the sheet spans x ∈ [−w/2, w/2], y ∈ [0, −h]
  w: number;
  h: number;
  /** How far the sheet bows out along its local +Z by its foot (m; default 1.6). */
  bow?: number;
  /** Placed relative to the path (it pours onto the causeway), not to the water. */
  path?: boolean;
}

export interface Layout {
  type: SectionType;
  len: number;
  turn: number;
  dy: number;
  props: Placement[];
  tiles: Placement[];
  falls: Waterfall[];
  /** Which crash stagings suit this place. */
  hazards: ('chasm' | 'gate' | 'rockfall')[];
  /** Tall structures near the path (for rockfall sources and camera framing). */
  walls: 'none' | 'low' | 'tall' | 'cliff';
  /** Round 11 crescendo: 0 intact .. 1 ruined (see Builder.ruin). */
  ruin: number;
  /** World round 21: the section runs on land (a ground mesh: forest floor or a dry ravine), not water. */
  ground?: GroundKind;
  /**
   * World round 21, for the crash stagings: what this place offers — a pillar at the edge that can
   * topple across (topple), a fallen log or column beside the way (trip), rock faces close at the side
   * (rockfall), a lower stone level a drop down on side -1/1 (lower).
   */
  features?: { topple?: boolean; trip?: boolean; rockfall?: boolean; lower?: number };
}

export const PATH_HALF = 2.2;
const TILE = 4;
/** The water surface in section space (sections at other elevations are corrected at spawn). */
const WL = -2.2;

/** Pieces that sit on the water surface: they follow the water, not the path, when a section is lowered. */
export function isWaterPiece(piece: string): boolean {
  return piece.startsWith('lily_') || piece.startsWith('foam_');
}

/** Yaw that turns a piece modelled facing +Z toward the path from `side`, a little toward the runner. */
function faceIn(side: number, toward = 0.7): number {
  return Math.atan2(-side, toward);
}

class Builder {
  props: Placement[] = [];
  tiles: Placement[] = [];
  falls: Waterfall[] = [];
  /** The section's length (set before it is built; land seats things on the ground by it). */
  len = 0;
  constructor(
    readonly rng: Rng,
    readonly density: { foliage: number; scenery: number },
    /** Which variant of the section type this is (styles rotate through variants). */
    readonly variant = 0,
    /**
     * Round 11 crescendo: how far gone this variant is (0 intact, lush .. 1 ruined, dramatic). The
     * track spawns variants whose ruin matches the CURRENT multiplier's intensity (presentation only).
     */
    readonly ruin = 0,
  ) {}

  /** Share of a section's parapet runs built as carved walls (glyph band, fret crest): a third of the
   * variants are carved stretches, the rest only now and then. */
  get carving(): number {
    return this.variant % 3 === 1 ? 0.65 : 0.12;
  }

  /** A round pillar; the whole ones (pillar_0, 5 m) often carry a carved capital. */
  pillar(piece: string, x: number, y: number, z: number, rotY = 0) {
    this.place(piece, x, y, z, rotY);
    if (piece === 'pillar_0' && this.rng.chance(0.7)) this.place('pillar_cap_0', x, y + 5.0, z, rotY);
  }

  place(piece: string, x: number, y: number, z: number, rotY = 0, s: number | [number, number, number] = 1, tilt?: [number, number]) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt?.[0] ?? 0, rotY, tilt?.[1] ?? 0, 'YXZ'));
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    m.compose(new THREE.Vector3(x, y, z), q, sc);
    this.props.push({ piece, m });
  }

  tile(piece: string, x: number, y: number, z: number, rotY = 0, s: [number, number, number] = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(...s),
    );
    this.tiles.push({ piece, m });
  }

  /** A wall piece running from z0 toward −Z for 4 m, on `side` (−1 left, +1 right). */
  wall(piece: string, side: number, x: number, y: number, z0: number) {
    // Pieces run along −Z from their origin; flip half of them for variety (they are near-symmetric).
    const flip = this.rng.chance(0.5);
    const z = flip ? z0 - TILE : z0;
    const ry = flip ? Math.PI : 0;
    this.place(piece, side * x, y, z, ry);
    // Ragged walls carry their own ivy, draped over the crests of their columns.
    if (IVY.has(piece) && this.foliage(0.6)) this.place(`${piece}_ivy`, side * x, y, z, ry);
  }

  /** Rubble strewn along the foot of whatever stands at the path's edge on `side`, 4 m from z0 (dense on High, sparse on Low). */
  edgeRubble(side: number, z0: number, x = PATH_HALF - 0.45, y = 0, p = 1) {
    const d = this.density.scenery;
    if (!this.rng.chance(p * 0.92 * d * Math.sqrt(d))) return;
    // The strip's wall side is its local +X: on the left, turn it end for end.
    const piece = `scatter_edge_${this.rng.int(0, 2)}`;
    if (side > 0) this.place(piece, x, y, z0, 0);
    else this.place(piece, -x, y, z0 - TILE, Math.PI);
  }

  /** Grit and pebbles across a 4 m stretch of the path. */
  pathRubble(z0: number, y = 0, p = 1) {
    const d = this.density.scenery;
    if (!this.rng.chance(p * 0.42 * d * d)) return;
    const flip = this.rng.chance(0.5);
    this.place(`scatter_path_${this.rng.int(0, 1)}`, 0, y + 0.005, flip ? z0 - TILE : z0, flip ? Math.PI : 0);
  }

  foliage(p: number) {
    return this.rng.chance(p * this.density.foliage);
  }

  /** A band of foam where a stone face along the path meets the water, 4 m long from z0 toward −Z. */
  /** Small water dressing (foam, lilies, moss) costs draw calls: the lightest tier goes without. */
  get rich() {
    return this.density.scenery >= 0.5;
  }

  foam(side: number, x: number, z0: number, len = TILE) {
    if (!this.rich) return;
    this.place('foam_strip', side * x, WL, z0, 0, [side, 1, len / TILE]);
  }

  /** A ring of foam around something standing in the water. */
  foamRing(x: number, z: number, r: number) {
    if (!this.rich) return;
    this.place('foam_ring', x, WL, z, this.rng.range(0, 6.28), [r, 1, r]);
  }

  lilies(x: number, z: number, s = 1) {
    if (!this.rich) return;
    if (this.foliage(0.9)) this.place(`lily_${this.rng.int(0, 2)}`, x, WL + 0.01, z, this.rng.range(0, 6.28), s);
  }
}

// ------------------------------------------------------------------ shared dressing
const LOW_WALLS = ['wall_low_0', 'wall_low_1', 'wall_low_2', 'wall_low_3'];
/** Their heights (blender/build_kit.py): where a bush on the crest sits. */
const LOW_WALL_H: Record<string, number> = { wall_low_0: 1.3, wall_low_1: 1.6, wall_low_2: 1.15, wall_low_3: 1.8 };
/** Wall pieces modelled with an ivy companion (`<piece>_ivy`, the leaf atlas). */
const IVY = new Set([...LOW_WALLS, 'wall_mid_0', 'wall_mid_1']);
const FLOORS = ['floor_0', 'floor_1', 'floor_0', 'floor_1', 'floor_2'];

/** Cliff faces modelled in Blender: [piece, length along the path, height above the water]. */
const CLIFFS = [
  ['cliff_wall_0', 24, 18],
  ['cliff_wall_1', 24, 23],
  ['cliff_wall_2', 28, 27],
] as const;

/**
 * A cliff face along the path on `side`, its face `x` metres out, centred on z: the rock, the plants
 * clinging to its ledges and the trees on its crest (three pieces, one placement). Returns its height.
 */
function cliffWall(b: Builder, side: number, x: number, z: number, i = b.rng.int(0, CLIFFS.length - 1), sy = 1): number {
  const [piece, , h] = CLIFFS[i]!;
  const ry = (side > 0 ? 0 : Math.PI) + b.rng.range(-0.08, 0.08);
  const s: [number, number, number] = [1, sy, 1];
  b.place(piece, side * x, WL, z, ry, s);
  b.place(`${piece}_veg`, side * x, WL, z, ry, s);
  if (b.rich) b.place(`${piece}_trees`, side * x, WL, z, ry, s);
  // World round 19: the cliff's end toward the runner is a sheer cut face 7 m deep, flat and dark in
  // its own shadow (a hard-edged slab in front of the rock): a big tree and a boulder grow against it.
  const L = CLIFFS[i]![1];
  if (b.foliage(0.9)) {
    const t = b.rng.int(0, 1);
    const tr = b.rng.range(0, 6.28);
    const ts = b.rng.range(0.95, 1.15);
    b.place(`tree_big_${t}_trunk`, side * (x + 2.6), WL, z + L / 2 + 2.6, tr, ts);
    b.place(`tree_big_${t}_crown`, side * (x + 2.6), WL, z + L / 2 + 2.6, tr, ts);
  }
  b.place(`rock_big_${b.rng.int(0, 2)}`, side * (x + 4.5), WL - 1.4, z + L / 2 + 1.2, b.rng.range(0, 6.28), [0.5, 0.6, 0.45]);
  if (b.foliage(0.8)) jungleBank(b, side, x + 0.5, z + L / 2 + 4, 0, 1);
  return h * sy;
}

/** A waterfall pouring off a cliff face `x` out on `side`, from `top` above the water, bowing toward the path. */
function cliffFall(b: Builder, side: number, x: number, z: number, top: number, w: number) {
  const fm = new THREE.Matrix4().compose(
    new THREE.Vector3(side * x, WL + top, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-side * Math.PI) / 2),
    new THREE.Vector3(1, 1, 1),
  );
  b.falls.push({ m: fm, w, h: top });
  b.foamRing(side * (x - 1.5), z, w * 0.9);
}

// ------------------------------------------------------------------ round 5: jungle and vistas
/**
 * A 16 m wall of jungle on `side`, centred on z, its front `x` out from the path's axis (it rises
 * from below the water to ~8 m above the path). Phones get them too: they are a few hundred
 * triangles of cards each, and they are most of what makes the place read as jungle.
 */
function jungleBank(b: Builder, side: number, x: number, z: number, y = 0, p = 1) {
  if (!b.foliage(p)) return;
  b.place(`jungle_bank_${b.rng.int(0, 2)}`, side * x, y, z, (side > 0 ? 0 : Math.PI) + b.rng.range(-0.06, 0.06), [1, b.rng.range(0.85, 1.15), 1]);
}

/** A limb leaning out from the bank on `side` and arching over the way at z: leaves over the top of the shot, dappled light on the path. */
function canopy(b: Builder, side: number, z: number, y = 0, p = 1) {
  if (!b.foliage(p)) return;
  const i = b.rng.int(0, 1);
  const ry = (side > 0 ? 0 : Math.PI) + b.rng.range(-0.3, 0.3);
  const s = b.rng.range(0.9, 1.1);
  b.place(`canopy_${i}_limb`, 0, y, z, ry, s);
  b.place(`canopy_${i}`, 0, y, z, ry, s);
}

/** Green tumbling over the crest (at height y) of the wall on `side` that runs 4 m from z0, down its inner face. */
function spill(b: Builder, side: number, z0: number, y: number, x = PATH_HALF + 0.02, p = 1) {
  if (!b.foliage(p)) return;
  const i = b.rng.int(0, 1);
  // Modelled on the right, spanning 4 m along −Z from its origin: on the left turn it end for end.
  if (side > 0) b.place(`spill_${i}`, x, y, z0 - b.rng.range(0, 0.6), b.rng.range(-0.05, 0.05));
  else b.place(`spill_${i}`, -x, y, z0 - TILE + b.rng.range(0, 0.6), Math.PI + b.rng.range(-0.05, 0.05));
}

/**
 * World round 20: a wet boulder breaking the surface out in the water (the water is opaque: anything
 * set on it reads as floating, anything under it is gone). Returns the height of its top, for what
 * stands on it (rubble, a drum, moss, a shrub, a banana).
 */
function islet(b: Builder, x: number, z: number, s = 0.45): number {
  b.place(`rock_mid_${b.rng.int(0, 2)}`, x, WL - 0.5, z, b.rng.range(0, 6.28), [s, s * 1.1, s]);
  b.foamRing(x, z, 2.2 * s + 0.4);
  return WL - 0.5 + 1.4 * s * 1.1 - 0.12;
}

function bananas(b: Builder, x: number, y: number, z: number, p = 1) {
  // (Round 20: out over the water, on an islet of its own, never with its foot in the air.)
  if (Math.abs(x) > PATH_HALF + 0.95 && y > WL - 0.2 && y < -0.2) {
    if (!b.foliage(p)) return;
    y = islet(b, x, z, 0.6) - 0.3;
  }
  if (b.foliage(p)) b.place(`banana_${b.rng.int(0, 1)}`, x, y, z, b.rng.range(0, 6.28), b.rng.range(0.8, 1.15));
}

/** A thin fall pouring off the crest of a tall wall on `side` onto the causeway's edge (reference: a fall splashing onto the path). */
function pathFall(b: Builder, side: number, z: number, top: number) {
  const fm = new THREE.Matrix4().compose(
    new THREE.Vector3(side * (PATH_HALF + 0.62), top, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-side * Math.PI) / 2),
    new THREE.Vector3(1, 1, 1),
  );
  // Bowed out far enough to land on the causeway's edge, so the spray and the wet stone are on the way.
  b.falls.push({ m: fm, w: b.rng.range(2.2, 3.0), h: top + 0.05, bow: 1.25, path: true });
  spill(b, side, z + 2, top - 0.15, PATH_HALF + 0.12);
}

type Vista = 'arch' | 'guardians' | 'temple' | 'towers' | 'falls';

/**
 * Something for the eye to run toward at the end of a section: a gateway the path passes through,
 * colossi flanking it, a temple or twin towers rising beside it, a fall pouring off a cliff.
 */
/**
 * Round 11: a colossal guardian standing in the water close beside the way (ref18): twice life-size
 * and more, sunk to the knees, turned toward the runner, vines down its shoulders.
 */
function colossus(b: Builder, side: number, z: number, p = 1) {
  if (!b.rng.chance(p)) return;
  const x = side * b.rng.range(5.4, 6.4);
  b.place(b.rng.chance(0.65) ? 'guardian_0' : 'guardian_1', x, WL + 0.35, z, faceIn(side, 0.7), b.rng.range(1.55, 1.85));
  b.foamRing(x, z, 2.8);
  if (b.foliage(0.7)) b.place('vines_0', x - side * 0.4, WL + 6.4, z, faceIn(side, 0.7), [0.55, 0.9, 1]);
}

/** Round 11: a tall ruined temple front just off the path, its broken top against the sky. */
function ruinFront(b: Builder, side: number, z: number, p = 1) {
  if (!b.rng.chance(p)) return;
  const x = side * b.rng.range(8.5, 10.5);
  b.place(`facade_${b.rng.int(0, 1)}`, x, WL + 0.2, z, faceIn(side, b.rng.range(1.6, 2.6)), b.rng.range(0.8, 0.95));
  b.foamRing(x, z, 5);
  if (b.foliage(0.8)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, x, WL + 0.4, z + 2, b.rng.range(0, 6.28), 1.1);
}

function vista(b: Builder, len: number, kinds: Vista[], p = 0.7) {
  // Variants rotate through the kinds (so every landmark shows up among a type's variants); the
  // remaining variants roll for one.
  const rolled = b.rng.chance(p);
  const kind = b.variant < kinds.length ? kinds[b.variant]! : b.rng.pick(kinds);
  if (b.variant >= kinds.length && !rolled) return;
  const z = -len + 1.5;
  const side = b.rng.chance(0.5) ? -1 : 1;
  switch (kind) {
    case 'arch': {
      b.place('arch_1', 0, 0, z, b.rng.chance(0.5) ? 0 : Math.PI);
      // Its piers stand out past the causeway's edge: boulders heaped under them.
      for (const sd of [-1, 1]) {
        b.place(`rock_mid_${b.rng.int(0, 2)}`, sd * 3.7, WL + 0.9, z, b.rng.range(0, 6.28), [0.6, 0.8, 0.55]);
        b.foamRing(sd * 3.7, z, 1.6);
      }
      if (b.foliage(0.9)) b.place('vines_1', b.rng.range(-1.5, 1.5), 8.0, z + 0.6, 0, [1, 1.0, 1]);
      if (b.foliage(0.9)) b.place(`bush_${b.rng.int(0, 3)}`, b.rng.range(-2.5, 2.5), 8.3, z, 0, 1.1);
      break;
    }
    case 'guardians':
      for (const sd of [-1, 1]) {
        const x = sd * b.rng.range(4.6, 5.2);
        b.place(sd < 0 || b.rng.chance(0.7) ? 'guardian_0' : 'guardian_1', x, WL + 0.45, z, faceIn(sd, 1.2), b.rng.range(1.3, 1.45));
        b.foamRing(x, z, 2.5);
        jungleBank(b, sd, Math.abs(x) + 3.5, z - 4, 0, 0.6);
      }
      break;
    case 'temple': {
      const x = side * b.rng.range(10, 13);
      // A talud-tablero pyramid (16 m across at scale 1), its stair turned toward the way.
      b.place(b.rng.chance(0.7) ? 'temple_0' : 'temple_1', x + side * 3, WL + 0.2, -len - 3, faceIn(side, 1.5), b.rng.range(0.75, 0.9));
      b.foamRing(x, -len - 3, 5.5);
      if (b.foliage(0.8)) {
        const t = b.rng.int(0, 1);
        b.place(`tree_big_${t}_trunk`, x + side * 6, WL, -len - 6, b.rng.range(0, 6.28), 1.1);
        b.place(`tree_big_${t}_crown`, x + side * 6, WL, -len - 6, b.rng.range(0, 6.28), 1.1);
      }
      jungleBank(b, -side, 9, -len + 2, 0, 0.8);
      break;
    }
    case 'towers':
      for (const sd of [-1, 1]) {
        const x = sd * b.rng.range(7.5, 9);
        b.place(sd < 0 ? 'tower_0' : 'tower_1', x, WL - 0.3, z - 1, faceIn(sd, 1.0), b.rng.range(0.95, 1.1));
        b.foamRing(x, z - 1, 3.2);
      }
      break;
    case 'falls': {
      if (!b.rich) break;
      const x = b.rng.range(11, 13);
      const h = cliffWall(b, side, x, -len - 2, b.rng.int(1, 2), b.rng.range(1.0, 1.2));
      cliffFall(b, side, x - 0.8, -len + 2, h * 0.75, b.rng.range(3.2, 4.4));
      break;
    }
  }
}

function floorRun(b: Builder, z0: number, n: number, y = 0, broken = 0.12, medallion = 0.07) {
  // Ruined variants: more cracked and broken slabs.
  broken = Math.min(0.85, broken + 0.45 * b.ruin);
  for (let i = 0; i < n; i++) {
    const piece = b.rng.chance(broken) ? 'floor_2' : b.rng.chance(medallion) ? 'floor_medallion_0' : b.rng.pick(FLOORS.slice(0, 4));
    const flip = b.rng.chance(0.5);
    // Flipping a tile end-for-end hides the repeat of the slab pattern.
    if (flip) b.tile(piece, 0, y, z0 - TILE * i - TILE, Math.PI);
    else b.tile(piece, 0, y, z0 - TILE * i, 0);
    b.pathRubble(z0 - TILE * i, y, 0.6 + broken * 2);
  }
}

function lowWalls(b: Builder, z0: number, n: number, sides: number[] = [-1, 1], opts: { gaps?: number; foundation?: boolean } = {}) {
  // Ruined variants: more parapet stretches collapsed into rubble.
  const gaps = (opts.gaps ?? 0.12) + 0.3 * b.ruin;
  for (const side of sides) {
    let carvedRun = false;
    for (let i = 0; i < n; i++) {
      const z = z0 - TILE * i;
      if (opts.foundation !== false) {
        b.wall(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', side, PATH_HALF + 0.42, 0, z);
        b.foam(side, PATH_HALF + 0.84, z);
      }
      if (b.foliage(0.3)) b.place(`fern_${b.rng.int(0, 1)}`, side * (PATH_HALF - 0.05), -0.05, z - b.rng.range(0.4, 3.6), b.rng.range(0, 6.28), b.rng.range(0.6, 0.95));
      if (b.rich && b.foliage(0.25)) b.place(`moss_${b.rng.pick([0, 2])}`, side * (PATH_HALF + 0.05), 0, z - b.rng.range(0.5, 3.5), b.rng.range(0, 6.28), b.rng.range(0.7, 1.1));
      b.edgeRubble(side, z);
      if (b.rng.chance(gaps)) {
        b.place(`rubble_${b.rng.int(0, 3)}`, side * (PATH_HALF + 0.6), 0, z - 2, b.rng.range(0, 6.28));
        if (b.ruin > 0.5) b.place(`rubble_${b.rng.int(0, 3)}`, side * (PATH_HALF + 0.9), 0, z - b.rng.range(0.5, 3.5), b.rng.range(0, 6.28), b.rng.range(0.8, 1.2));
        continue;
      }
      if (b.rng.chance(b.carving)) {
        // A carved parapet; a feathered-serpent post guards the start of each carved run.
        b.wall(`wall_carved_${b.rng.int(0, 1)}`, side, PATH_HALF + 0.36, 0, z);
        if (!carvedRun) b.place('serpent_0', side * (PATH_HALF + 0.36), 0, z + 0.45, 0);
        carvedRun = true;
        if (b.foliage(0.3)) b.place(`roots_${b.rng.int(0, 1)}`, side * (PATH_HALF + 0.75), 1.7, z - 2, -side * Math.PI / 2, [0.55, b.rng.range(0.4, 0.6), 1]);
        continue;
      }
      carvedRun = false;
      const lw = b.rng.pick(LOW_WALLS);
      b.wall(lw, side, PATH_HALF + 0.36, 0, z);
      // Round 11 detail: now and then roots creeping over the parapet and down its sides.
      if (b.rich && b.foliage(0.14)) b.place(`roots_${b.rng.int(0, 1)}`, side * (PATH_HALF + 0.75), 1.5, z - b.rng.range(1, 3), -side * Math.PI / 2, [0.5, b.rng.range(0.35, 0.5), 0.9]);
      // (World round 19: seated into the wall's crest by its own height; at a fixed 0.9–1.4 m one
      // floated over the low, ragged walls and their gaps.)
      if (b.foliage(0.4)) b.place(`bush_${b.rng.int(0, 3)}`, side * (PATH_HALF + 0.42), LOW_WALL_H[lw]! * b.rng.range(0.42, 0.55), z - b.rng.range(0.8, 3.2), b.rng.range(0, 6.28), b.rng.range(0.55, 0.9));
      // Green spilling over the wall's outer side, down toward the water: against the foundation's
      // face (it stood 0.3 m out from it, over open water), only where there is one.
      else if (opts.foundation !== false && b.foliage(0.3)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, side * (PATH_HALF + 0.9), b.rng.range(-0.5, -0.1), z - b.rng.range(1, 3), b.rng.range(0, 6.28), b.rng.range(0.6, 0.85));
      if (b.foliage(0.55)) b.place(`grass_${b.rng.int(0, 1)}`, side * (PATH_HALF - 0.2), 0, z - b.rng.range(0.3, 3.7), b.rng.range(0, 6.28), b.rng.range(0.7, 1.1));
      // Round 11: denser vegetation hanging off the parapets (ref17/19).
      if (b.foliage(0.38)) b.place(`vines_0`, side * (PATH_HALF + 0.95), b.rng.range(1.0, 1.5), z - 2, side * Math.PI / 2, [0.9, b.rng.range(0.5, 0.8), 1]);
      spill(b, side, z, b.rng.range(1.05, 1.3), PATH_HALF + 0.02, 0.3);
      bananas(b, side * (PATH_HALF + b.rng.range(1.3, 1.9)), -0.9, z - b.rng.range(0.5, 3.5), 0.1);
    }
  }
}

/** Islands, trees, rocks and ruins out in the water on both sides. */
function scenery(b: Builder, len: number, opts: { minX?: number; sides?: number[]; big?: boolean; cliffs?: boolean } = {}) {
  const minX = opts.minX ?? 7;
  const sides = opts.sides ?? [-1, 1];
  const d = b.density.scenery;
  for (const side of sides) {
    for (let z = -2; z > -len; z -= b.rng.range(5, 9)) {
      // (Round 21: a floor on the thinning — at phone density half the slots stood empty: bare water.)
      if (!b.rng.chance(0.5 * d + 0.45)) continue;
      const x = side * b.rng.range(minX, minX + 22);
      const zz = z + b.rng.range(-2, 2);
      const kind = b.rng.weighted([
        ['island', 5],
        ['palm', 3],
        ['ruin', 1.4],
        ['rocks', 1.5],
        ['head', 0.45],
        ['column', 0.7],
        ['stones', 0.6],
      ] as const);
      if (kind === 'island' || kind === 'palm') {
        const s = b.rng.range(0.9, 2.3);
        b.place(`rock_mid_${b.rng.int(0, 2)}`, x, -2.2 + s * 0.25, zz, b.rng.range(0, 6.28), [s * 1.3, s * 0.6, s * 1.3]);
        b.foamRing(x, zz, s * 2.1);
        if (b.rich && b.foliage(0.6)) b.place(`moss_${b.rng.int(0, 1)}`, x + b.rng.range(-0.6, 0.6), -2.2 + s * 0.5, zz + b.rng.range(-0.6, 0.6), b.rng.range(0, 6.28), s * 0.8);
        if (kind === 'palm' || b.rng.chance(0.5)) {
          const pi = b.rng.int(0, 2);
          const ps = b.rng.range(0.8, 1.15);
          const ry = b.rng.range(0, 6.28);
          b.place(`palm_${pi}_trunk`, x, -2.2 + s * 0.45, zz, ry, ps);
          b.place(`palm_${pi}_crown`, x, -2.2 + s * 0.45, zz, ry, ps);
        }
        // (Kept over the rock's crown and settled into it: a metre out to the side on a small island it
        // hung over open water.)
        if (b.foliage(0.8)) b.place(`bush_${b.rng.int(0, 3)}`, x + b.rng.range(-1, 1) * 0.45 * s, -2.2 + s * 0.62, zz + b.rng.range(-1, 1) * 0.45 * s, b.rng.range(0, 6.28), b.rng.range(0.8, 1.4));
        if (b.foliage(0.6)) {
          const t = b.rng.int(0, 1);
          const ts = b.rng.range(0.75, 1.05);
          const ry = b.rng.range(0, 6.28);
          b.place(`tree_big_${t}_trunk`, x + side * 3, -2.4, zz - 2, ry, ts);
          b.place(`tree_big_${t}_crown`, x + side * 3, -2.4, zz - 2, ry, ts);
        }
        if (b.foliage(0.5)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, x, -2.2 + s * 0.35, zz, b.rng.range(0, 6.28), s * 0.7);
        else bananas(b, x + b.rng.range(-1, 1), -2.2 + s * 0.5, zz + b.rng.range(-1, 1), 0.5);
      } else if (kind === 'ruin') {
        const r = b.rng.weighted([
          ['pillar_0', 2],
          ['pillar_1', 2],
          ['pillar_2', 2],
          ['stele_0', 1],
          ['wall_mid_0', 1.5],
          ['wall_mid_1', 1.5],
        ] as const);
        b.place(r, x, -2.3, zz, b.rng.range(0, 6.28), b.rng.range(0.9, 1.25), [b.rng.range(-0.08, 0.08), b.rng.range(-0.08, 0.08)]);
        b.foamRing(x, zz, 1.4);
        if (b.foliage(0.6)) b.place(`bush_${b.rng.int(0, 3)}`, x, -1.8, zz + 1, b.rng.range(0, 6.28), 1.2);
      } else if (kind === 'head') {
        // A colossal face sunk to the chin, watching the causeway.
        const s = b.rng.range(0.9, 1.3);
        b.place(`head_${b.rng.int(0, 1)}`, x, WL - 0.5 * s, zz, faceIn(side, b.rng.range(0.4, 1.2)), s);
        b.foamRing(x, zz, 2.6 * s);
        b.lilies(x - side * 2.5, zz + 2, 1.2);
        if (b.foliage(0.7)) b.place('vines_0', x, WL + 4.6 * s, zz, faceIn(side, 0.7), [0.5, 0.6, 1]);
      } else if (kind === 'column') {
        b.place(`column_fallen_${b.rng.int(0, 1)}`, x, WL - 0.35, zz, b.rng.range(0, 6.28), b.rng.range(0.9, 1.3));
        b.foamRing(x, zz, 2.2);
        if (b.rich && b.foliage(0.5)) b.place(`moss_${b.rng.int(0, 1)}`, x, WL + 0.6, zz, 0, 0.9);
      } else if (kind === 'stones') {
        b.place('steps_water_0', x, WL, zz, b.rng.range(0, 6.28), b.rng.range(0.8, 1.2));
        b.lilies(x + b.rng.range(-2, 2), zz + b.rng.range(-2, 2), b.rng.range(0.9, 1.4));
      } else {
        for (let k = 0; k < 3; k++) {
          const s = b.rng.range(0.6, 1.5);
          const rx = x + b.rng.range(-3, 3);
          const rz = zz + b.rng.range(-3, 3);
          b.place(`rock_mid_${b.rng.int(0, 2)}`, rx, -2.3, rz, b.rng.range(0, 6.28), s);
          b.foamRing(rx, rz, s * 1.7);
        }
      }
    }
    // Lily pads in the calm water close to the causeway.
    for (let z = -b.rng.range(1, 5); z > -len; z -= b.rng.range(6, 12)) b.lilies(side * b.rng.range(minX - 3.2, minX + 2), z, b.rng.range(0.8, 1.4));
    // The middle ground closes in: a jungle-clad cliff face across the water, or a temple.
    // (Phones go without: the gorge and cliff sections still bring their own.)
    if (opts.cliffs !== false && b.rich && b.rng.chance(0.42 * d + 0.18)) {
      const x = b.rng.range(minX + 12, minX + 24);
      const r = b.rng.next();
      if (r < 0.72) cliffWall(b, side, x, -len / 2 + b.rng.range(-3, 3), undefined, b.rng.range(0.9, 1.25));
      else {
        b.place(r < 0.84 ? 'temple_0' : 'temple_1', side * x, WL + 0.2, -b.rng.range(0, len), faceIn(side, b.rng.range(0.7, 1.6)), b.rng.range(0.8, 1.05));
        b.foamRing(side * x, -len / 2, 5.5);
      }
    }
    if (opts.big !== false && b.rng.chance(0.4 * d + 0.1)) {
      const x = side * b.rng.range(28, 55);
      const t = b.rng.pick(['tower_0', 'tower_1', 'temple_0', 'temple_1', 'rock_big_0', 'arch_1']);
      const s = t.startsWith('rock') ? b.rng.range(1.2, 2.2) : t.startsWith('temple') ? b.rng.range(0.9, 1.3) : b.rng.range(1.1, 1.6);
      b.place(t, x, -2.6, -b.rng.range(0, len), b.rng.range(0, 6.28), s);
      if (t.startsWith('tower') || t === 'arch_1') {
        const pi = b.rng.int(0, 1);
        b.place(`tree_big_${pi}_trunk`, x + 6, -2.4, -len / 2, 0, 1.1);
        b.place(`tree_big_${pi}_crown`, x + 6, -2.4, -len / 2, 0, 1.1);
      }
    }
  }
}

// ------------------------------------------------------------------ section builders
type Build = (b: Builder, len: number) => Pick<Layout, 'hazards' | 'walls'> & { turn?: number; dy?: number; ground?: GroundKind; features?: Layout['features'] };

/**
 * Round 11: a real 90° corner, Temple Run style. The path is one quarter circle of radius TURN_R (≈ 7 m)
 * (arc-length continuous, so the run logic and the camera just follow it) over a square pivot plaza:
 * parapets and foundations along the outer edge, a corner pier where they meet, a short curved
 * parapet and a stele on the inside of the bend. Built as a left turn; turnR is its mirror image
 * (track.ts mirrors it), so both read the same.
 */
export const TURN_R = 4.5;
const TURN_LEN = (TURN_R * Math.PI) / 2;

function turnCorner(b: Builder): ReturnType<Build> {
  const R = TURN_R;
  const out = PATH_HALF + 0.36;
  // The plaza: one wide slab under the whole bend (x −6.2…3.8, z 0…−7.4), tucked 2 cm under the
  // exit leg's first slabs where they overlap.
  b.tile('floor_wide_0', -1.2, -0.02, 0, 0, [1, 1, 0.92]);
  b.pathRubble(-1, 0, 0.5);
  // Outer edge, along the entry (x = +out) and across the exit (z = −(R + out)): foundations,
  // parapets and foam, the outside wall of the corner.
  for (const z0 of [0, -4]) {
    const len = z0 === 0 ? 4 : R + out - 4;
    b.place(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', PATH_HALF + 0.42, 0, z0, 0, [1, 1, len / 4]);
    b.foam(1, PATH_HALF + 0.84, z0, len);
    b.place(b.rng.pick(LOW_WALLS), out, 0, z0, 0, [1, 1, len / 4]);
    b.edgeRubble(1, z0);
  }
  const back = -(R + out);
  // Across the exit: from the corner to where the exit leg's own parapet begins (x = −R).
  for (const [x0, len] of [[out, 4], [out - 4, R + out - 4]] as const) {
    b.place(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', x0, 0, back - 0.06, Math.PI / 2, [1, 1, len / 4]);
    b.place(b.rng.pick(LOW_WALLS), x0, 0, back, Math.PI / 2, [1, 1, len / 4]);
  }
  // The corner pier where the two parapets meet, a bush and grass on it.
  b.pillar('pillar_0', out + 0.3, 0, back - 0.3, Math.PI / 4);
  if (b.foliage(0.8)) b.place(`bush_${b.rng.int(0, 3)}`, out + 0.6, 0.4, back - 0.8, 0, 1.0);
  if (b.foliage(0.6)) b.place(`grass_${b.rng.int(0, 1)}`, out - 0.6, 0, back + 0.7, 0, 1.0);
  // Inside of the bend (radius < R − PATH_HALF = 2.3 m round the pivot at x = −R): a stele and a
  // stump, fern and moss, nothing on the line the runner takes.
  b.place('stele_1', -R + 1.0, 0, -0.9, Math.PI / 4, 0.9);
  b.place(`rubble_${b.rng.int(0, 3)}`, -R + 0.4, 0, -1.6, b.rng.range(0, 6.28));
  if (b.foliage(0.7)) b.place(`fern_${b.rng.int(0, 1)}`, -R + 1.6, 0, -0.4, 0, 0.8);
  if (b.rich && b.foliage(0.5)) b.place(`moss_${b.rng.int(0, 2)}`, -R + 0.6, 0, -0.6, 0, 0.7);
  // Green behind the outer corner (the
  // inside is where the exit leg's own world begins).
  jungleBank(b, 1, PATH_HALF + 4.5, -3, 0, 0.8);
  // No canopy here: its limb arched across the entry lane runs right along the exit leg, and the camera
  // filmed leaves at the exit of every corner. A big tree stands outside the bend instead.
  if (b.foliage(0.6)) {
    const t = b.rng.int(0, 1);
    const ry = b.rng.range(0, 6.28);
    b.place(`tree_big_${t}_trunk`, PATH_HALF + 6.5, WL, -R - 4.5, ry, 0.8);
    b.place(`tree_big_${t}_crown`, PATH_HALF + 6.5, WL, -R - 4.5, ry, 0.8);
  }
  // (No scenery of its own: it is built after the corner's clearance check and could stand in the way
  // the route takes next.)
  return { turn: Math.PI / 2, hazards: ['rockfall'], walls: 'low' };
}


// ------------------------------------------------------------------ world round 21: land
/** Section types that run on land (Layout.ground set): forest floor, forest walls, cutting, overgrown plaza, ravine. */
export const LAND_TYPES: SectionType[] = ['forest', 'forestWall', 'cutting', 'overgrown', 'ravine'];
export const isLand = (t: SectionType | string | undefined): boolean => !!t && (LAND_TYPES as string[]).includes(t);

/** Height of the ground at (x, z) in a land section (see land.ts), less a little so nothing hovers on a bump. */
function gy(b: Builder, x: number, z: number, kind: GroundKind = 'land'): number {
  return groundY(kind, x, z, b.len) - 0.12 - 0.05 * b.rng.range(0, 1);
}

/** A tree on the forest floor: trunk and crown together (never a bare trunk on a phone). */
function landTree(b: Builder, x: number, z: number, s: number, kind: GroundKind = 'land', p = 1) {
  if (!b.foliage(p)) return;
  const ry = b.rng.range(0, 6.28);
  const y = gy(b, x, z, kind) - 0.2;
  const k = b.rng.int(0, 3);
  if (k < 2) {
    b.place(`tree_big_${k}_trunk`, x, y, z, ry, s);
    b.place(`tree_big_${k}_crown`, x, y, z, ry, s);
  } else if (k === 2) {
    const j = b.rng.int(0, 1);
    b.place(`jungle_${j}_trunk`, x, y, z, ry, s * 1.1);
    b.place(`jungle_${j}_crown`, x, y, z, ry, s * 1.1);
  } else {
    const j = b.rng.int(0, 2);
    b.place(`palm_${j}_trunk`, x, y, z, ry, s * 0.95);
    b.place(`palm_${j}_crown`, x, y, z, ry, s * 0.95);
  }
}

/**
 * The near band of a forest side (2.8–6 m out): undergrowth at the causeway's foot — ferns, grass,
 * bushes, a banana, moss, low roots and leaf litter — then the mid band (6–16 m): big trunks with
 * buttress roots and crowns, shrubs between them; and the far band (16–40 m): more crowns and banks of
 * jungle rising up the slope, so the frame is full and layered to the hills.
 */
function forestSide(b: Builder, side: number, len: number, dense = 1) {
  for (let z = -b.rng.range(0, 1.5); z > -len; z -= b.rng.range(1.6, 2.8) / dense) {
    const x = side * b.rng.range(2.9, 5.5);
    const r = b.rng.range(0, 1);
    const y = gy(b, x, z);
    if (r < 0.3 && b.foliage(0.9)) b.place(`fern_${b.rng.int(0, 1)}`, x, y, z, b.rng.range(0, 6.28), b.rng.range(0.9, 1.4));
    else if (r < 0.5 && b.foliage(0.8)) b.place(`grass_${b.rng.int(0, 1)}`, x, y, z, b.rng.range(0, 6.28), b.rng.range(0.9, 1.3));
    else if (r < 0.68 && b.foliage(0.85)) b.place(`bush_${b.rng.int(0, 3)}`, x + side * 0.6, y + 0.3, z, b.rng.range(0, 6.28), b.rng.range(0.8, 1.25));
    else if (r < 0.76 && b.foliage(0.7)) b.place(`banana_${b.rng.int(0, 1)}`, x + side * 0.8, y - 0.3, z, b.rng.range(0, 6.28), b.rng.range(0.9, 1.2));
    else if (r < 0.86 && b.rich) b.place(`moss_${b.rng.int(0, 2)}`, x, y + 0.02, z, b.rng.range(0, 6.28), b.rng.range(1, 1.6));
    else if (r < 0.93) b.place(`scatter_edge_${b.rng.int(0, 2)}`, side * 3.4, y + 0.08, z, side > 0 ? 0 : Math.PI);
    else if (b.foliage(0.6)) b.place(`roots_${b.rng.int(0, 1)}`, x, y + 0.2, z, b.rng.range(0, 6.28), [0.8, 0.25, 0.7], [Math.PI / 2, 0]);
  }
  for (let z = -b.rng.range(1, 4); z > -len - 2; z -= b.rng.range(5, 8) / dense) {
    const x = side * b.rng.range(6.5, 12);
    landTree(b, x, z, b.rng.range(0.9, 1.25), 'land', 0.95);
    if (b.foliage(0.7)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, side * b.rng.range(5.5, 9), gy(b, side * 7, z - 2.5) - 0.2, z - 2.5, b.rng.range(0, 6.28), b.rng.range(0.8, 1.2));
  }
  for (let z = -b.rng.range(0, 6); z > -len - 4; z -= b.rng.range(7, 11) / dense) {
    const x = side * b.rng.range(16, 34);
    landTree(b, x, z, b.rng.range(1.0, 1.4), 'land', 0.8);
  }
  for (let z = -8; z > -len - 8; z -= 16) jungleBank(b, side, b.rng.range(13, 18), z, gy(b, side * 15, z) - 0.4, 0.9);
}

/** A tall pillar standing at the causeway's edge, close enough to topple across it (crash: topple). */
function edgePillar(b: Builder, side: number, z: number) {
  b.place(b.rng.chance(0.5) ? 'pillar_topple_0' : 'pillar_1', side * (PATH_HALF + 0.7), gy(b, side * 3, z) + 0.1, z, b.rng.range(0, 6.28));
}

/** A lower stone terrace beside the way on `side` (crash: a drop to a lower level): slabs 1.6 m down, a footing face. */
function lowerTerrace(b: Builder, side: number, z0: number, n: number) {
  for (let i = 0; i < n; i++) {
    const z = z0 - TILE * i;
    b.place(b.rng.pick(FLOORS.slice(0, 4)), side * (PATH_HALF + 2.6), -1.6, z, b.rng.chance(0.5) ? 0 : Math.PI, [1.15, 1, 1]);
    b.place(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', side * (PATH_HALF + 0.42), -1.6, z, 0);
    if (b.foliage(0.5)) b.place(`fern_${b.rng.int(0, 1)}`, side * (PATH_HALF + b.rng.range(1.6, 3.6)), -1.6, z - b.rng.range(0.5, 3.5), b.rng.range(0, 6.28), 1.1);
  }
  b.place(`rubble_${b.rng.int(0, 3)}`, side * (PATH_HALF + 3.2), -1.6, z0 - TILE * n * 0.5, b.rng.range(0, 6.28));
}

const LAND_BUILDERS: Partial<Record<SectionType, { lengths: number[]; build: Build }>> = {
  forest: {
    // The causeway on the forest floor: undergrowth to its edges, big trees close by, the hills beyond.
    lengths: [16, 20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.18, 0.04);
      for (const side of [-1, 1]) for (let i = 0; i < n; i++) b.edgeRubble(side, -TILE * i);
      lowWalls(b, 0, n, [b.rng.pick([-1, 1])], { gaps: 0.5, foundation: false });
      for (const side of [-1, 1]) forestSide(b, side, len);
      // A fallen log or column across the forest floor beside the way (crash: trip).
      if (b.rng.chance(0.6)) {
        const side = b.rng.pick([-1, 1]);
        b.place(b.rng.chance(0.5) ? 'log_fallen_0' : `column_fallen_${b.rng.int(0, 1)}`, side * 5.4, gy(b, side * 5.4, -len / 2) + 0.05, -len * b.rng.range(0.3, 0.7), b.rng.range(-0.4, 0.4));
      }
      canopy(b, b.rng.pick([-1, 1]), -len * b.rng.range(0.3, 0.7), 0, 0.7);
      return { hazards: ['gate', 'rockfall'], walls: 'low', ground: 'land', features: { trip: true } };
    },
  },
  forestWall: {
    // Dense forest walls: big trunks with buttress roots right at the causeway's edge, crowns closing
    // overhead, a canopy limb across the way.
    lengths: [20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.25, 0.03);
      for (const side of [-1, 1]) {
        for (let z = -b.rng.range(1, 3); z > -len + 2; z -= b.rng.range(5, 7.5)) {
          const x = side * b.rng.range(4.2, 5.6);
          landTree(b, x, z, b.rng.range(1.1, 1.35));
          // Buttress roots running from the trunk to the causeway's edge.
          if (b.foliage(0.9)) {
            const k = b.rng.int(0, 1);
            if (side > 0) b.place(`root_giant_${k}`, PATH_HALF + 0.36, gy(b, 3, z), z + 2, 0, [0.9, 0.8, 0.9]);
            else b.place(`root_giant_${k}`, -(PATH_HALF + 0.36), gy(b, -3, z), z - 2, Math.PI, [0.9, 0.8, 0.9]);
          }
        }
        forestSide(b, side, len, 1.2);
      }
      edgePillar(b, b.rng.pick([-1, 1]), -len * b.rng.range(0.4, 0.7));
      canopy(b, -1, -len * 0.3, 0, 0.9);
      canopy(b, 1, -len * 0.75, 0, 0.9);
      return { hazards: ['gate', 'rockfall'], walls: 'tall', ground: 'land', features: { topple: true, trip: true } };
    },
  },
  cutting: {
    // A hillside cutting: the causeway passes through the hill between faces of exposed rock, jungle
    // hanging over their crests, boulders at their feet (crash: rockfall from the side).
    lengths: [20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.3, 0);
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) b.edgeRubble(side, -TILE * i);
        cliffWall(b, side, b.rng.range(7.5, 8.2), -len / 2, b.rng.int(0, 1), b.rng.range(0.42, 0.55));
        // (Round 22: rock is the heaviest piece in the kit — 1.3k and 5k triangles a boulder: a few,
        // fewer on phones, with ferns and litter between them.)
        const lean = b.density.scenery < 0.5;
        for (let z = -2; z > -len; z -= b.rng.range(6, 9) * (lean ? 1.6 : 1)) {
          b.place(`rock_mid_${b.rng.int(0, 2)}`, side * b.rng.range(3.6, 4.6), gy(b, side * 4, z) - 0.3, z, b.rng.range(0, 6.28), b.rng.range(0.35, 0.6));
          // The cut's lower face: exposed rock stepping up to the cliff.
          if (b.rng.chance(lean ? 0.2 : 0.45)) b.place(`rock_big_${b.rng.int(0, 2)}`, side * b.rng.range(5.6, 6.6), gy(b, side * 6, z) - 0.8, z - 1, b.rng.range(0, 6.28), [0.32, 0.35, 0.28]);
          else b.place(`scatter_edge_${b.rng.int(0, 2)}`, side * 4.8, gy(b, side * 4.8, z) + 0.05, z - 2, side > 0 ? 0 : Math.PI);
          if (b.foliage(0.7)) b.place(`fern_${b.rng.int(0, 1)}`, side * b.rng.range(3.0, 3.8), gy(b, side * 3.3, z), z - 1.5, b.rng.range(0, 6.28), 1.2);
        }
        for (let z = -4; z > -len - 4; z -= b.rng.range(6, 9)) landTree(b, side * b.rng.range(14, 22), z, b.rng.range(1.0, 1.3), 'land', 0.9);
      }
      return { hazards: ['rockfall', 'gate'], walls: 'cliff', ground: 'land', features: { rockfall: true } };
    },
  },
  overgrown: {
    // An overgrown plaza in the forest: a wide paved court, toppled and standing pillars, stelae, roots
    // across the slabs, and on one side a lower terrace a flight down (crash: a drop to a lower level).
    lengths: [16, 20],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.45, 0.12);
      const low = b.rng.pick([-1, 1]);
      lowerTerrace(b, low, 0, n);
      const hi = -low;
      for (let i = 0; i < n; i++) {
        const z = -TILE * i;
        b.place(b.rng.pick(FLOORS.slice(0, 4)), hi * (PATH_HALF + 2.0), -0.02, z, b.rng.chance(0.5) ? 0 : Math.PI, [1, 1, 1]);
        b.pathRubble(z, 0, 1.4);
      }
      for (let z = -2; z > -len; z -= b.rng.range(5, 8)) {
        if (b.rng.chance(0.55)) edgePillar(b, hi, z);
        else b.place(b.rng.pick(['stele_0', 'stele_1', 'pillar_0', 'pillar_2']), hi * (PATH_HALF + 3.2), 0, z, b.rng.range(0, 6.28));
        if (b.foliage(0.6)) b.place(`roots_${b.rng.int(0, 1)}`, hi * (PATH_HALF + 1.4), 0.15, z - 1, b.rng.range(0, 6.28), [0.9, 0.3, 0.8], [Math.PI / 2, 0]);
      }
      b.place(`column_fallen_${b.rng.int(0, 1)}`, hi * (PATH_HALF + 2.2), 0.05, -len * b.rng.range(0.3, 0.7), b.rng.range(-0.5, 0.5));
      forestSide(b, hi, len, 0.9);
      // Beyond the lower terrace the forest goes on at its level.
      for (let z = -2; z > -len - 4; z -= b.rng.range(5, 8)) landTree(b, low * b.rng.range(9.5, 16), z, b.rng.range(1, 1.3));
      for (let z = -6; z > -len - 8; z -= 16) jungleBank(b, low, b.rng.range(14, 18), z, gy(b, low * 15, z) - 0.4, 0.9);
      return { hazards: ['gate', 'rockfall'], walls: 'low', ground: 'land', features: { topple: true, trip: true, lower: low } };
    },
  },
  ravine: {
    // A ravine with a dry riverbed: the causeway on its footing across the bed, boulders and drift on
    // the stones below, banks of rock and jungle rising either side (crash: rockfall; chasm, a drop to the bed).
    lengths: [20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.2, 0);
      lowWalls(b, 0, n, [-1, 1], { gaps: 0.4 });
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) b.wall('foundation_1', side, PATH_HALF + 0.42, 0, -TILE * i);
        // (Round 22: half the boulders, fewer still on phones: rock was a third of the frame's triangles.)
        for (let z = -1; z > -len; z -= b.rng.range(5, 8) * (b.density.scenery < 0.5 ? 1.5 : 1)) {
          const x = side * b.rng.range(3.4, 7);
          b.place(`rock_mid_${b.rng.int(0, 2)}`, x, gy(b, x, z, 'ravine') - 0.2, z, b.rng.range(0, 6.28), b.rng.range(0.25, 0.6));
          if (b.rng.chance(0.25)) b.place('log_fallen_0', x, gy(b, x, z, 'ravine'), z - 1, b.rng.range(0, 6.28), 0.8);
          if (b.foliage(0.4)) b.place(`grass_${b.rng.int(0, 1)}`, x + side, gy(b, x + side, z, 'ravine'), z - 1, b.rng.range(0, 6.28), 1.2);
        }
        cliffWall(b, side, b.rng.range(9.5, 11), -len / 2, b.density.scenery < 0.5 ? 0 : b.rng.int(0, 2), b.rng.range(0.55, 0.75));
        for (let z = -3; z > -len - 4; z -= b.rng.range(6, 9)) landTree(b, side * b.rng.range(15, 24), z, b.rng.range(1.0, 1.3), 'ravine', 0.9);
      }
      return { hazards: ['chasm', 'rockfall'], walls: 'cliff', ground: 'ravine', features: { rockfall: true } };
    },
  },
};

const BUILDERS = {
  turnL: { lengths: [TURN_LEN], build: (b) => turnCorner(b) },
  stepping: {
    // Round 11: the causeway as separate slabs over open water — each 4 m slab on its own pier, no
    // parapet, foam churning in every joint — so the obstacle director can set them drifting apart
    // and sinking (Track.slabsIn).
    lengths: [16, 20],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.1, 0);
      for (let i = 0; i <= n; i++) {
        const z = -TILE * i;
        for (const side of [-1, 1]) {
          if (i < n) b.foam(side, PATH_HALF + 0.3, z, TILE);
          // A broken pier stump under each joint, a block or two tumbled into the water.
          if (i < n) b.place(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', side * (PATH_HALF + 0.1), -0.25, z - TILE * 0.5, Math.PI / 2, [0.6, 1, 0.5]);
          // (Round 20: a block tumbled onto a boulder breaking the surface; set on the water it floated.)
          if (b.rng.chance(0.35)) {
            const rx = side * b.rng.range(3.2, 4.4);
            const rz = z - b.rng.range(0.5, 3.5);
            b.place(`rubble_${b.rng.int(0, 1)}`, rx, islet(b, rx, rz, 0.55), rz, b.rng.range(0, 6.28), 0.5);
          }
          if (b.rich && b.foliage(0.3)) b.place(`lily_${b.rng.int(0, 2)}`, side * b.rng.range(4, 7), WL + 0.02, z - b.rng.range(0, 4), b.rng.range(0, 6.28));
        }
        b.foamRing(0, z, 2.6);
      }
      for (let z = -b.rng.range(3, 6); z > -len; z -= b.rng.range(7, 10)) {
        const side = b.rng.chance(0.5) ? -1 : 1;
        const x = side * b.rng.range(3.4, 4.4);
        b.place(`rock_mid_${b.rng.int(0, 2)}`, x, WL + 0.3, z, b.rng.range(0, 6.28), [0.5, 0.4, 0.5]);
        b.foamRing(x, z, 1.1);
      }
      scenery(b, len, { minX: 9 });
      vista(b, len, ['arch', 'guardians', 'towers', 'falls'], 0.5);
      return { hazards: ['chasm'], walls: 'none' };
    },
  },
  approach: {
    // World round 13: the run-up to a hero landmark (track.ts forces it; never picked by the pacing).
    // Slabs on piers over open water like 'stepping', but no landmark of its own at the far end and
    // scenery kept well out to the sides: the view down the route is water and sky, and the landmark.
    lengths: [16, 20],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.1, 0);
      for (let i = 0; i < n; i++) {
        const z = -TILE * i;
        for (const side of [-1, 1]) {
          b.foam(side, PATH_HALF + 0.3, z, TILE);
          b.place(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', side * (PATH_HALF + 0.1), -0.25, z - TILE * 0.5, Math.PI / 2, [0.6, 1, 0.5]);
          if (b.rng.chance(0.3)) {
            const rx = side * b.rng.range(3.2, 4.4);
            const rz = z - b.rng.range(0.5, 3.5);
            b.place(`rubble_${b.rng.int(0, 1)}`, rx, islet(b, rx, rz, 0.55), rz, b.rng.range(0, 6.28), 0.5);
          }
          if (b.rich && b.foliage(0.35)) b.place(`lily_${b.rng.int(0, 2)}`, side * b.rng.range(4, 8), WL + 0.02, z - b.rng.range(0, 4), b.rng.range(0, 6.28));
        }
        b.foamRing(0, z, 2.6);
      }
      // The view down the approach stays open for the landmark (which brings its own dressing:
      // landmarks.ts), but its sides are never empty water (round 21: four of these in a row, on a
      // phone, read as a bugged, empty map): islets close beside the way, a palm or a shrub on them,
      // a broken pier, drowned columns further out.
      for (const side of [-1, 1]) {
        for (let z = -b.rng.range(2, 5); z > -len; z -= b.rng.range(6, 9)) {
          const x = side * b.rng.range(5.5, 11);
          const top = islet(b, x, z, b.rng.range(0.6, 0.9));
          const r = b.rng.range(0, 1);
          if (r < 0.4) {
            const j = b.rng.int(0, 2);
            const ry = b.rng.range(0, 6.28);
            b.place(`palm_${j}_trunk`, x, top - 0.3, z, ry, b.rng.range(0.8, 1.05));
            b.place(`palm_${j}_crown`, x, top - 0.3, z, ry, b.rng.range(0.8, 1.05));
          } else if (r < 0.75) b.place(`shrub_mass_${b.rng.int(0, 1)}`, x, top - 0.3, z, b.rng.range(0, 6.28), b.rng.range(0.7, 1.0));
          else b.place(b.rng.pick(['pillar_1', 'pillar_2', 'stele_0']), x, top - 0.2, z, b.rng.range(0, 6.28), 0.9);
        }
        // (Round 22: a near layer and a far shore — w23/31/77 still read as open water to the horizon.)
        for (let z = -b.rng.range(0, 3); z > -len; z -= b.rng.range(5, 7)) {
          const x = side * b.rng.range(3.6, 5.2);
          const top = islet(b, x, z, b.rng.range(0.35, 0.5));
          if (b.foliage(0.8)) b.place(`grass_${b.rng.int(0, 1)}`, x, top - 0.1, z, b.rng.range(0, 6.28), b.rng.range(1.0, 1.4));
          else b.place(`moss_${b.rng.int(0, 2)}`, x, top - 0.05, z, 0, 1);
        }
        // (No far shore here: it stood on the exit leg of the landmark's corner and blocked it.
        // Instead a second islet within 7 m carries a palm or a shrub mass, filling the near water.)
        for (let z = -b.rng.range(2, 5); z > -len; z -= b.rng.range(7, 10)) {
          const x = side * b.rng.range(5.4, 7.0);
          const top = islet(b, x, z, b.rng.range(0.55, 0.75));
          if (b.rng.chance(0.5) && b.foliage(0.9)) {
            const j = b.rng.int(0, 2);
            const ry = b.rng.range(0, 6.28);
            b.place(`palm_${j}_trunk`, x, top - 0.3, z, ry, b.rng.range(0.85, 1.1));
            b.place(`palm_${j}_crown`, x, top - 0.3, z, ry, b.rng.range(0.85, 1.1));
          } else b.place(`shrub_mass_${b.rng.int(0, 1)}`, x, top - 0.35, z, b.rng.range(0, 6.28), b.rng.range(0.8, 1.1));
        }
        if (b.rng.chance(0.6)) {
          const cx = side * b.rng.range(13, 20);
          const cz = -b.rng.range(2, len - 2);
          b.place('column_lone_0', cx, WL - 1.5, cz, b.rng.range(0, 6.28), b.rng.range(0.9, 1.1));
          b.foamRing(cx, cz, 1.6);
        }
      }
      return { hazards: ['chasm'], walls: 'none' };
    },
  },
  turnR: { lengths: [TURN_LEN], build: (b) => turnCorner(b) },
  start: {
    lengths: [12],
    build: (b) => {
      b.tile('floor_wide_0', 0, -0.02, 4, 0, [1, 1, 1]);
      floorRun(b, -4, 2, 0, 0);
      b.place('arch_0', 0, 0, 3.2);
      for (const side of [-1, 1]) {
        b.place('stele_0', side * 4.2, 0, -0.5, side * 0.3);
        b.pillar('pillar_0', side * 4.4, 0, -3.6);
        b.place(`bush_${b.rng.int(1, 3)}`, side * 4.6, 0.2, 1.2, 0, 1.1);
        b.place(`grass_1`, side * 3.6, 0, -2.2, 0, 1.1);
        b.place(`palm_${side > 0 ? 0 : 2}_trunk`, side * 6.5, -2.2, -1, 0, 1);
        b.place(`palm_${side > 0 ? 0 : 2}_crown`, side * 6.5, -2.2, -1, 0, 1);
      }
      lowWalls(b, -4, 2, [-1, 1], { gaps: 0 });
      for (const side of [-1, 1]) jungleBank(b, side, 7.5, -2, 0, 0.8);
      // World round 16: the causeway's beginning, behind the start (the result shots look back down
      // the way): a flight of steps rising out of the water to the plaza, stepping stones across the
      // shallows, a ruined gate over them, and rock and jungle closing the view — never a cut edge.
      b.place('stairs_0', 0, 0, 4, Math.PI);
      b.place('stairs_0', 0, -1.6, 8, Math.PI);
      b.place('steps_water_0', 0.4, WL + 0.3, 20, 0, 1.2);
      b.place('lintel_gate_0', 0, WL + 0.2, 14.5, Math.PI, 1.05);
      for (const side of [-1, 1]) {
        b.place('foundation_0', side * (PATH_HALF + 0.42), -1.6, 8, Math.PI, [1, 1, 1]);
        b.place(`rock_mid_${b.rng.int(0, 2)}`, side * 3.6, WL + 0.4, 11, b.rng.range(0, 6.28), [0.8, 0.6, 0.9]);
        b.foamRing(side * 3.6, 11, 1.6);
        jungleBank(b, side, 6.5, 16, 0, 1);
        b.place(`rock_big_${side > 0 ? 1 : 2}`, side * 14, WL - 1, 30, b.rng.range(0, 6.28), 0.75);
      }
      b.place('rock_big_0', 0, WL - 2, 38, 0.6, [1.1, 0.8, 1.0]);
      // (One check for both: on a phone the trunk stood bare when only its crown was thinned out.)
      if (b.foliage(1)) {
        b.place('tree_big_0_trunk', -5, WL, 26, 1.2, 1.0);
        b.place('tree_big_0_crown', -5, WL, 26, 1.2, 1.0);
      }
      scenery(b, 12);
      return { hazards: ['gate'], walls: 'low' };
    },
  },
  corridor: {
    lengths: [16, 20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n);
      lowWalls(b, 0, n);
      for (let z = -b.rng.range(3, 6); z > -len; z -= b.rng.range(6, 11)) {
        const side = b.rng.chance(0.5) ? -1 : 1;
        b.place(b.rng.pick(['pillar_1', 'pillar_2', 'stele_1']), side * (PATH_HALF + 1.3), 0, z, b.rng.range(0, 6.28));
      }
      // Jungle heaped behind the walls on one side or both, a limb over the way.
      const lush = b.rng.pick([-1, 1]);
      for (const side of [-1, 1]) if (side === lush || b.rng.chance(0.45)) for (let z = -7; z > -len - 4; z -= 15) jungleBank(b, side, PATH_HALF + 2.2, z);
      canopy(b, b.rng.pick([-1, 1]), -b.rng.range(4, len - 4), 0, 0.55);
      scenery(b, len);
      vista(b, len, ['arch', 'guardians', 'temple', 'towers', 'falls'], 0.65);
      {
        const side = b.rng.pick([-1, 1]);
        colossus(b, side, -len * b.rng.range(0.3, 0.6), 0.4);
        ruinFront(b, -side, -len * b.rng.range(0.3, 0.7), 0.3);
      }
      return { hazards: ['chasm', 'rockfall'], walls: 'low' };
    },
  },
  bridge: {
    lengths: [12, 16, 20],
    build: (b, len) => {
      const n = len / TILE;
      const style = (['rope', 'gorge', 'plain', 'rope'] as const)[b.variant % 4]!;
      for (let i = 0; i < n; i++) {
        const p = b.rng.chance(0.5) ? 'planks_0' : 'planks_1';
        if (b.rng.chance(0.5)) b.tile(p, 0, 0, -TILE * i, 0);
        else b.tile(p, 0, 0, -TILE * i - TILE, Math.PI);
        if (style !== 'plain') b.place('rope_rail_0', 0, 0, -TILE * i, 0);
      }
      if (style === 'gorge') {
        // Cliffs close in on both sides, a fall pouring from each; the planks cross the gap between.
        for (const side of [-1, 1]) {
          const cx = b.rng.range(8, 9.5);
          const h = cliffWall(b, side, cx, -len / 2, b.rng.int(0, 2), b.rng.range(0.95, 1.2));
          const fz = -len * b.rng.range(0.45, 0.7);
          cliffFall(b, side, cx - 0.8, fz, h * 0.7, 3.2);
          for (let k = 0; k < 3; k++) if (b.foliage(0.8)) b.place(`bush_${b.rng.int(0, 3)}`, side * b.rng.range(7.5, 9.5), b.rng.range(2, 9), -b.rng.range(0, len), 0, b.rng.range(1, 1.6));
          if (b.foliage(0.9)) b.place(`roots_1`, side * 8, b.rng.range(7, 10), -len * b.rng.range(0.1, 0.35), -side * Math.PI / 2, [1.5, 1.8, 1]);
          b.place(`palm_${b.rng.int(0, 2)}_trunk`, side * 9.5, 4, -len * 0.85, 0, 0.9);
          b.place(`palm_${b.rng.int(0, 2)}_crown`, side * 9.5, 4, -len * 0.85, 0, 0.9);
        }
      }
      for (const side of [-1, 1]) {
        b.place(b.rng.pick(['pillar_1', 'pillar_2']), side * 2.4, -2.3, 0.2, b.rng.range(0, 6));
        b.place(b.rng.pick(['pillar_1', 'pillar_2']), side * 2.4, -2.3, -len - 0.2, b.rng.range(0, 6));
        for (let z = -3; z > -len; z -= b.rng.range(4, 8)) {
          if (b.rng.chance(0.5)) b.place(`rock_mid_${b.rng.int(0, 2)}`, side * b.rng.range(3.5, 6), -2.4, z, b.rng.range(0, 6), b.rng.range(0.5, 0.9));
        }
      }
      if (style !== 'gorge') {
        for (const side of [-1, 1]) jungleBank(b, side, b.rng.range(11, 14), -len / 2, 0, 0.5);
        scenery(b, len, { minX: 6 });
        vista(b, len, ['arch', 'towers', 'temple'], 0.55);
      } else canopy(b, b.rng.pick([-1, 1]), -len * b.rng.range(0.3, 0.7), 0, 0.5);
      for (const side of [-1, 1]) b.foamRing(side * 2.4, 0.2, 0.9), b.foamRing(side * 2.4, -len - 0.2, 0.9);
      return { hazards: ['chasm'], walls: style === 'gorge' ? 'tall' : 'none' };
    },
  },
  arcade: {
    lengths: [16, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.08);
      for (let z = -2; z > -len; z -= 8) {
        b.place(b.rng.chance(0.7) ? 'arch_0' : 'arch_1', 0, 0, z, b.rng.chance(0.5) ? 0 : Math.PI);
        if (b.foliage(0.8)) b.place(b.rng.chance(0.5) ? 'vines_1' : 'vines_2', b.rng.range(-1.5, 1.5), 8.2, z + 0.5, 0, [1, 1.1, 1]);
        if (b.foliage(0.5)) b.place(`roots_${b.rng.int(0, 1)}`, b.rng.pick([-1, 1]) * b.rng.range(3.6, 4.4), 7.6, z + 0.7, 0, [0.6, b.rng.range(0.8, 1.2), 1]);
        if (b.foliage(0.6)) b.place(`bush_${b.rng.int(0, 3)}`, b.rng.range(-3, 3), 8.6, z, 0, 1);
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          b.wall(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', side, PATH_HALF + 0.42, 0, -TILE * i);
          b.foam(side, PATH_HALF + 0.84, -TILE * i);
          if (b.foliage(0.5)) b.place(`grass_${b.rng.int(0, 1)}`, side * (PATH_HALF - 0.1), 0, -TILE * i - 2, 0, 0.9);
          if (b.foliage(0.35)) b.place(`fern_${b.rng.int(0, 1)}`, side * (PATH_HALF - 0.05), -0.05, -TILE * i - b.rng.range(0.5, 3.5), b.rng.range(0, 6.28), 0.8);
        }
      }
      jungleBank(b, b.rng.pick([-1, 1]), 9, -len / 2, 0, 0.45);
      scenery(b, len, { minX: 9 });
      return { hazards: ['gate', 'rockfall', 'chasm'], walls: 'tall' };
    },
  },
  gate: {
    lengths: [8],
    build: (b) => {
      floorRun(b, 0, 2, 0, 0);
      b.place('arch_1', 0, 0, -4);
      b.place('vines_1', 0, 9.2, -3.4, 0, [1.2, 1.2, 1]);
      for (const side of [-1, 1]) {
        b.wall('wall_tall_' + b.rng.int(0, 1), side, 5.6, 0, 0);
        b.wall('wall_tall_' + b.rng.int(0, 1), side, 5.6, 0, -4);
        if (b.variant % 2 === 0) b.place(side < 0 ? 'guardian_0' : b.rng.pick(['guardian_0', 'guardian_1']), side * 3.55, 0, -0.9, faceIn(side, 1.4), 0.78);
        else b.place('stele_1', side * 3.3, 0, -0.6, side * -0.2);
        b.place(`bush_${b.rng.int(0, 3)}`, side * 4.8, 5.0, -2, 0, 1.2);
        if (b.foliage(0.7)) b.place(`roots_${b.rng.int(0, 1)}`, side * (PATH_HALF + 1.2), 5.1, -2, -side * Math.PI / 2, [0.9, 1, 1]);
      }
      scenery(b, 8, { minX: 10 });
      return { hazards: ['gate'], walls: 'tall' };
    },
  },
  tall: {
    lengths: [16, 20],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n);
      const fallSide = b.rng.chance(0.5) ? -1 : 1;
      const fallTile = b.variant % 3 === 1 || b.rng.chance(0.25) ? b.rng.int(1, n - 2) : -1;
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const z = -TILE * i;
          if (side === fallSide && i === fallTile) {
            b.wall(`wall_tall_${b.rng.int(0, 1)}`, side, PATH_HALF + 0.6, 0, z);
            pathFall(b, side, z - 2, 5.1);
            continue;
          }
          const r = b.rng.next();
          if (r < 0.15) b.wall(b.rng.pick(['wall_mid_0', 'wall_mid_1']), side, PATH_HALF + 0.5, 0, z);
          else if (r < 0.4) {
            b.wall(`relief_wall_${b.rng.int(0, 1)}`, side, PATH_HALF + 0.52, 0, z);
            b.wall(`wall_low_${b.rng.int(0, 3)}`, side, PATH_HALF + 0.7, 3.2, z);
          } else {
            b.wall(`wall_tall_${b.rng.int(0, 1)}`, side, PATH_HALF + 0.6, 0, z);
            spill(b, side, z, 5.0, PATH_HALF + 0.12, 0.25);
          }
          b.edgeRubble(side, z, PATH_HALF - 0.4);
          if (b.foliage(0.3)) b.place(`roots_${b.rng.int(0, 1)}`, side * (PATH_HALF + 0.1), b.rng.range(4.4, 5.0), z - 2, -side * Math.PI / 2, [b.rng.range(0.7, 1), b.rng.range(0.8, 1.2), 1]);
          if (b.foliage(0.3)) b.place(`fern_${b.rng.int(0, 1)}`, side * (PATH_HALF - 0.05), -0.05, z - b.rng.range(0.5, 3.5), b.rng.range(0, 6.28), 0.85);
          if (b.foliage(0.55)) b.place('vines_0', side * (PATH_HALF + 0.15), b.rng.range(3.8, 4.8), z - 2, -side * Math.PI / 2, [1, b.rng.range(0.8, 1.3), 1]);
          if (b.foliage(0.5)) b.place(`bush_${b.rng.int(0, 3)}`, side * (PATH_HALF + 0.7), b.rng.range(4.2, 5.0), z - b.rng.range(0, 4), 0, b.rng.range(0.7, 1.1));
          if (b.foliage(0.35)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, side * (PATH_HALF + 1.4), b.rng.range(4.4, 5.0), z - 2, b.rng.range(0, 6.28), b.rng.range(0.7, 1.0));
          if (b.foliage(0.4)) b.place(`grass_${b.rng.int(0, 1)}`, side * (PATH_HALF - 0.15), 0, z - 1.5, 0, 0.9);
        }
      }
      scenery(b, len, { minX: 12, big: true });
      return { hazards: ['gate', 'rockfall'], walls: 'tall' };
    },
  },
  plaza: {
    lengths: [8],
    build: (b, len) => {
      const turn = (b.rng.chance(0.5) ? 1 : -1) * b.rng.range(0.28, 0.5);
      const mid = evalSeg({ s0: 0, len, p0: new THREE.Vector3(), yaw0: 0, turn, dy: 0 }, len / 2, { pos: new THREE.Vector3(), yaw: 0 });
      // Longer than the arc and a hair lower: it tucks under the neighbours' tiles at both ends.
      b.tile('floor_wide_0', mid.pos.x - Math.sin(mid.yaw) * -4.3, -0.02, mid.pos.z - Math.cos(mid.yaw) * -4.3, mid.yaw, [1.05, 1, 1.08]);
      const o = new THREE.Vector3();
      for (const side of [-1, 1]) {
        for (const t of [0.15, 0.85]) {
          const f = evalSeg({ s0: 0, len, p0: new THREE.Vector3(), yaw0: 0, turn, dy: 0 }, len * t, { pos: new THREE.Vector3(), yaw: 0 });
          o.set(Math.cos(f.yaw) * side * 5.2, 0, -Math.sin(f.yaw) * side * 5.2).add(f.pos);
          const piece = b.rng.pick(['pillar_0', 'pillar_1', 'stele_0', 'pillar_2']);
          b.pillar(piece, o.x, 0, o.z, b.rng.range(0, 6.28));
          if (b.foliage(0.7)) b.place(`bush_${b.rng.int(0, 3)}`, o.x + b.rng.range(-0.8, 0.8), 0, o.z + b.rng.range(-0.8, 0.8), 0, b.rng.range(0.8, 1.2));
        }
        const f = evalSeg({ s0: 0, len, p0: new THREE.Vector3(), yaw0: 0, turn, dy: 0 }, len * 0.5, { pos: new THREE.Vector3(), yaw: 0 });
        o.set(Math.cos(f.yaw) * side * 4.2, 0, -Math.sin(f.yaw) * side * 4.2).add(f.pos);
        if (b.rng.chance(0.6)) b.place('drum_0', o.x, 0, o.z, b.rng.range(0, 6.28));
        else b.place(`rubble_${b.rng.int(1, 3)}`, o.x, 0, o.z, b.rng.range(0, 6.28));
        if (b.rich && b.foliage(0.8)) b.place(`moss_${b.rng.int(0, 2)}`, o.x + b.rng.range(-1, 1), 0, o.z + b.rng.range(-1, 1), 0, 1);
        if (b.foliage(0.8)) b.place(`fern_${b.rng.int(0, 1)}`, o.x + b.rng.range(-1, 1), 0, o.z + b.rng.range(-1, 1), b.rng.range(0, 6.28), 1);
      }
      {
        const side = b.rng.chance(0.5) ? -1 : 1;
        const f = evalSeg({ s0: 0, len, p0: new THREE.Vector3(), yaw0: 0, turn, dy: 0 }, len * 0.5, { pos: new THREE.Vector3(), yaw: 0 });
        o.set(Math.cos(f.yaw) * side * 8.5, 0, -Math.sin(f.yaw) * side * 8.5).add(f.pos);
        if (b.variant % 2 === 0) b.place(`head_${b.rng.int(0, 1)}`, o.x, WL - 0.4, o.z, f.yaw + faceIn(side, 0.5), 1.1);
        else b.place(`column_fallen_${b.rng.int(0, 1)}`, o.x, WL + 0.1, o.z, b.rng.range(0, 6.28), 1.2);
        b.foamRing(o.x, o.z, 2.8);
      }
      scenery(b, len, { minX: 9 });
      return { hazards: ['rockfall', 'gate'], walls: 'none', turn };
    },
  },
  stairsDown: {
    lengths: [12],
    build: (b) => {
      b.tile('stairs_0', 0, 0, 0, 0);
      floorRun(b, -4, 2, -1.6);
      lowWalls(b, -4, 2, [-1, 1], { gaps: 0.1 });
      for (const side of [-1, 1]) {
        b.wall('foundation_1', side, PATH_HALF + 0.42, 0, 0);
        b.pillar('pillar_0', side * 3.1, 0, 0.3);
      }
      jungleBank(b, b.rng.pick([-1, 1]), PATH_HALF + 2.2, -6, -1.6, 0.45);
      canopy(b, b.rng.pick([-1, 1]), -6, -1.6, 0.3);
      scenery(b, 12);
      return { hazards: ['chasm', 'rockfall'], walls: 'low', dy: -1.6 };
    },
  },
  stairsUp: {
    lengths: [12],
    build: (b) => {
      b.tile('stairs_0', 0, 1.6, -4, Math.PI);
      floorRun(b, -4, 2, 1.6);
      lowWalls(b, -4, 2, [-1, 1], { gaps: 0.1 });
      for (const side of [-1, 1]) {
        b.wall('foundation_0', side, PATH_HALF + 0.42, 0, 0);
        b.place('pillar_1', side * 3.1, 1.6, -4.3);
      }
      jungleBank(b, b.rng.pick([-1, 1]), PATH_HALF + 2.2, -6, 1.6, 0.45);
      canopy(b, b.rng.pick([-1, 1]), -6, 1.6, 0.3);
      scenery(b, 12);
      return { hazards: ['chasm', 'rockfall'], walls: 'low', dy: 1.6 };
    },
  },
  cliff: {
    lengths: [20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n);
      const side = b.rng.chance(0.5) ? -1 : 1;
      lowWalls(b, 0, n, [-side], { gaps: 0.1 });
      for (let i = 0; i < n; i++) b.wall('foundation_1', side, PATH_HALF + 0.42, 0, -TILE * i);
      // The cliff: a towering stratified face close over the path, a waterfall pouring down it.
      const h = cliffWall(b, side, 8.2, -len / 2, 2, b.rng.range(1.0, 1.15));
      b.place(`rock_mid_${b.rng.int(0, 2)}`, side * 5.5, -2.2, -len * 0.55, 0, 1.6);
      cliffFall(b, side, 7.4, -len * 0.55, h * 0.72, 4.2);
      b.lilies(side * 6.5, -len * 0.3, 1.3);
      b.lilies(side * 7, -len * 0.8, 1.1);
      for (let k = 0; k < 2; k++) if (b.foliage(0.8)) b.place(`roots_${b.rng.int(0, 1)}`, side * 7.6, b.rng.range(5, 9), -len * b.rng.range(0.2, 0.9), -side * Math.PI / 2, [1.4, 1.6, 1]);
      // (Round 20: each on a boulder at the cliff's foot; at -2.1 they sat on the water's surface.)
      for (let z = -2; z > -len; z -= 5) {
        if (!b.foliage(0.7)) continue;
        const sx = side * b.rng.range(5.5, 7);
        b.place(`shrub_mass_${b.rng.int(0, 1)}`, sx, islet(b, sx, z, 0.7) - 0.3, z, b.rng.range(0, 6.28), b.rng.range(0.8, 1.2));
      }
      canopy(b, side, -len * b.rng.range(0.15, 0.4), 0, 0.6);
      jungleBank(b, -side, b.rng.range(7.5, 9), -len / 2, 0, 0.5);
      scenery(b, len, { sides: [-side] });
      return { hazards: ['rockfall', 'chasm'], walls: 'cliff' };
    },
  },
  ruins: {
    lengths: [16, 20],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.3);
      lowWalls(b, 0, n, [-1, 1], { gaps: 0.35 });
      for (const side of [-1, 1]) {
        b.place(b.rng.pick(['tower_0', 'tower_1']), side * b.rng.range(11, 16), -2.4, -b.rng.range(2, len - 2), b.rng.range(0, 6));
        // (Round 20: on boulders breaking the surface, a drum fallen on its side in the shallows; at
        // -0.6 and -0.3 they hung 1.6–1.9 m in the air over the water.)
        for (let k = 0; k < 2; k++) {
          const rx = side * b.rng.range(3.4, 6);
          const rz = -b.rng.range(0, len);
          b.place(`rubble_${b.rng.int(0, 1)}`, rx, islet(b, rx, rz, 0.6), rz, b.rng.range(0, 6), 0.55);
        }
        {
          const dx = side * b.rng.range(3.4, 5);
          const dz = -b.rng.range(2, len - 2);
          b.place('drum_0', dx, WL - 0.22, dz, b.rng.range(0, 6), 1, [Math.PI / 2, 0]);
          b.foamRing(dx, dz, 1.0);
        }
        const cz = -b.rng.range(3, len - 3);
        if (b.rng.chance(0.6)) {
          const cx = side * b.rng.range(5.5, 7.5);
          b.place(`column_fallen_${b.rng.int(0, 1)}`, cx, WL + 0.2, cz, b.rng.range(0, 6.28));
          b.foamRing(cx, cz, 2.4);
        } else b.place('guardian_1', side * 5.6, WL + 0.3, cz, faceIn(side, 0.9), 0.9);
        for (let k = 0; k < 2; k++) if (b.rich && b.foliage(0.6)) b.place(`moss_${b.rng.int(0, 2)}`, side * (PATH_HALF + 0.05), 0, -b.rng.range(0, len), 0, b.rng.range(0.8, 1.3)); // (round 20: on the footing, not in the air)
      }
      jungleBank(b, b.rng.pick([-1, 1]), b.rng.range(7, 9), -len / 2, 0, 0.6);
      canopy(b, b.rng.pick([-1, 1]), -b.rng.range(4, len - 4), 0, 0.35);
      scenery(b, len, { minX: 9, big: false });
      vista(b, len, ['towers', 'temple', 'guardians', 'falls'], 0.6);
      {
        const side = b.rng.pick([-1, 1]);
        colossus(b, side, -len * b.rng.range(0.25, 0.55), 0.6);
        ruinFront(b, -side, -len * b.rng.range(0.3, 0.7), 0.55);
      }
      return { hazards: ['rockfall', 'chasm'], walls: 'low' };
    },
  },
  avenue: {
    lengths: [20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.1);
      lowWalls(b, 0, n, [-1, 1], { gaps: 0.45 });
      let k = 0;
      for (let z = -3; z > -len + 2; z -= 7.5, k++) {
        for (const side of [-1, 1]) {
          const x = side * 5.2;
          const broken = b.rng.chance(0.3);
          b.place(broken ? 'guardian_1' : 'guardian_0', x, WL + 0.45, z, faceIn(side, 0.25), b.rng.range(1.15, 1.3));
          b.foamRing(x, z, 2.4);
          b.lilies(x + side * 1.8, z - 3, b.rng.range(0.8, 1.2));
          if (b.rich && b.foliage(0.5)) b.place(`moss_${b.rng.int(0, 2)}`, x, WL + 1.05, z + 0.6, 0, 0.8);
        }
      }
      const hs = b.rng.chance(0.5) ? -1 : 1;
      if (b.variant % 3 === 1) {
        // The avenue leads the eye to a golden face on its lotus plinth.
        b.place('idol_0', hs * 11, WL, -len + 1, faceIn(hs, 1.6), 1.1);
        b.foamRing(hs * 11, -len + 1, 5.8);
      } else {
        b.place(`head_${b.rng.int(0, 1)}`, hs * 12, WL - 0.6, -len * 0.6, faceIn(hs, 0.6), 1.3);
        b.foamRing(hs * 12, -len * 0.6, 3.4);
        vista(b, len, ['arch', 'temple', 'falls'], 0.6);
      }
      for (const side of [-1, 1]) jungleBank(b, side, b.rng.range(8.5, 10), -len / 2, 0, 0.5);
      canopy(b, b.rng.pick([-1, 1]), -b.rng.range(4, len - 4), 0, 0.25);
      scenery(b, len, { minX: 13, big: true });
      return { hazards: ['chasm', 'gate'], walls: 'low' };
    },
  },
  gorge: {
    // The jungle gorge / temple valley: stratified cliffs close in on both sides, green clinging to
    // every ledge, waterfalls, and at its end either a gopura the path runs through, a golden face
    // gazing down the causeway, or temple towers and an idol standing in the water.
    lengths: [28, 32],
    build: (b, len) => {
      const n = len / TILE;
      const gate = b.variant % 2 === 0;
      floorRun(b, 0, n, 0, 0.06, 0.28);
      lowWalls(b, 0, gate ? n - 2 : n, [-1, 1], { gaps: 0.3 });
      const templeSide = b.rng.chance(0.5) ? -1 : 1;
      for (const side of [-1, 1]) {
        const wide = !gate && side === templeSide;
        // Overlapping cliff faces from just before the section to just past its end.
        let z = 3;
        let k = 0;
        while (z > -len - 3) {
          const i = b.rng.int(0, 2);
          const L = CLIFFS[i]![1];
          const x = (wide ? 15 : 8.6) + b.rng.range(0, 2.2);
          const h = cliffWall(b, side, x, Math.max(z - L / 2, -len - 3 + L / 2), i, b.rng.range(0.95, 1.25));
          if (k === 0 || b.rng.chance(0.5)) cliffFall(b, side, x - 0.8, Math.max(z - L * b.rng.range(0.3, 0.7), -len + 2), h * 0.7, b.rng.range(2.6, 4.2));
          z -= L * b.rng.range(0.82, 0.95);
          k++;
        }
        for (let zz = -2; zz > -len; zz -= b.rng.range(4, 7)) {
          if (b.foliage(0.7)) {
            const sx = side * b.rng.range(5, 7);
            b.place(`shrub_mass_${b.rng.int(0, 1)}`, sx, islet(b, sx, zz, 0.7) - 0.3, zz, b.rng.range(0, 6.28), b.rng.range(0.8, 1.3));
          }
          b.lilies(side * b.rng.range(4.5, 6.5), zz - 2, b.rng.range(0.8, 1.2));
        }
        if (b.foliage(0.8)) {
          const t = b.rng.int(0, 1);
          const tz = -len * b.rng.range(0.2, 0.6);
          const ry = b.rng.range(0, 6.28);
          const ts = b.rng.range(0.8, 1.0);
          b.place(`tree_big_${t}_trunk`, side * 6.6, -2.3, tz, ry, ts);
          b.place(`tree_big_${t}_crown`, side * 6.6, -2.3, tz, ry, ts);
        }
      }
      canopy(b, b.rng.pick([-1, 1]), -len * b.rng.range(0.15, 0.45), 0, 0.55);
      if (gate) {
        // The path runs through the gate's passage over the last tiles; the face looks straight down it.
        b.place('face_gate_0', 0, 0, -len + 8, 0);
        b.place('face_gate_0_gold', 0, 0, -len + 8, 0);
        for (const side of [-1, 1]) b.foam(side, 7.5, -len + 8, 7);
        if (b.foliage(0.9)) b.place('vines_2', 0, 15.5, -len + 8.6, 0, [1.8, 1.4, 1]);
      } else {
        // A temple tower stands in the widened side of the valley, a golden idol at its far end.
        b.place(b.rng.chance(0.6) ? 'temple_0' : 'temple_1', templeSide * 11.5, WL + 0.2, -len * 0.45, faceIn(templeSide, 0.9), b.rng.range(0.62, 0.7));
        b.foamRing(templeSide * 11.5, -len * 0.45, 5.5);
        b.place('idol_0', -templeSide * 7.8, WL, -len + 2, faceIn(-templeSide, 2.2), 0.95);
        b.foamRing(-templeSide * 7.8, -len + 2, 5.2);
      }
      return { hazards: ['rockfall', 'chasm'], walls: 'tall' };
    },
  },
  boardwalk: {
    // A weathered plank boardwalk skirting a mossy bank: boulders along the waterline, jungle heaped on
    // the bank (on some variants a ragged quay wall), open water on the other side.
    lengths: [16, 20, 24],
    build: (b, len) => {
      const n = len / TILE;
      const bank = b.rng.chance(0.5) ? -1 : 1;
      const quay = b.variant % 3 === 0;
      for (let i = 0; i < n; i++) {
        const p = b.rng.chance(0.5) ? 'planks_0' : 'planks_1';
        if (b.rng.chance(0.5)) b.tile(p, 0, 0, -TILE * i, 0);
        else b.tile(p, 0, 0, -TILE * i - TILE, Math.PI);
      }
      // Boulders along the waterline on both sides, bigger and thicker on the bank side.
      for (const side of [-1, 1]) {
        const big = side === bank;
        for (let z = -b.rng.range(0.5, 2); z > -len; z -= b.rng.range(big ? 1.6 : 2.6, big ? 3.2 : 5)) {
          const s = b.rng.range(0.32, 0.6) * (big ? 1.25 : 1);
          const x = side * b.rng.range(2.7, 3.3) * (big ? 1.05 : 1);
          b.place(`rock_mid_${b.rng.int(0, 2)}`, x, WL + s * 0.45, z, b.rng.range(0, 6.28), [s, s * b.rng.range(0.7, 1.0), s]);
          b.foamRing(x, z, s * 1.9);
          if (b.rich && b.foliage(big ? 0.45 : 0.2)) b.place(`moss_${b.rng.int(0, 2)}`, x, WL + s * 1.15, z, 0, s * 1.2);
        }
      }
      // The bank: heaped rock, a green mass on top, palms and big trees behind.
      for (let z = 0; z > -len - 2; z -= b.rng.range(3.5, 5.5)) {
        const x = bank * b.rng.range(5.0, 6.4);
        const s = b.rng.range(1.0, 1.6);
        b.place(`rock_mid_${b.rng.int(0, 2)}`, x, WL + 0.3, z, b.rng.range(0, 6.28), [s * 1.2, s * 0.75, s * 1.4]);
        if (b.foliage(0.95)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, x + bank * 0.4, WL + s * 1.35, z - b.rng.range(0, 1.5), b.rng.range(0, 6.28), b.rng.range(0.8, 1.15));
        if (b.foliage(0.6)) b.place(`bush_${b.rng.int(0, 3)}`, x - bank * b.rng.range(0.8, 1.6), WL + s * 1.1, z - b.rng.range(0.5, 2.5), b.rng.range(0, 6.28), b.rng.range(0.8, 1.2));
        if (b.foliage(0.45)) b.place(`fern_${b.rng.int(0, 1)}`, x - bank * 1.8, WL + s * 0.9, z - 1, b.rng.range(0, 6.28), 1.1);
        b.foam(bank, 3.8, z, 5);
      }
      if (quay) {
        // A ragged quay wall runs along the bank, the boardwalk skirting its foot.
        for (let i = 0; i < n; i++) {
          b.wall('foundation_0', bank, PATH_HALF + 1.55, 0, -TILE * i);
          b.wall(b.rng.pick(LOW_WALLS), bank, PATH_HALF + 1.55, 0, -TILE * i);
        }
      }
      for (let k = 0; k < 2; k++) {
        if (!b.foliage(0.85)) continue;
        const pi = b.rng.int(0, 2);
        const z = -len * b.rng.range(0.15, 0.85);
        b.place(`palm_${pi}_trunk`, bank * b.rng.range(6.5, 8), WL + 1.2, z, b.rng.range(0, 6.28), b.rng.range(0.85, 1.1));
        b.place(`palm_${pi}_crown`, bank * b.rng.range(6.5, 8), WL + 1.2, z, b.rng.range(0, 6.28), b.rng.range(0.85, 1.1));
      }
      if (b.foliage(0.9)) {
        const t = b.rng.int(0, 1);
        b.place(`tree_big_${t}_trunk`, bank * 9, WL, -len * 0.5, b.rng.range(0, 6.28), 1);
        b.place(`tree_big_${t}_crown`, bank * 9, WL, -len * 0.5, b.rng.range(0, 6.28), 1);
      }
      for (let z = -3; z > -len; z -= b.rng.range(5, 8)) b.lilies(-bank * b.rng.range(4.5, 7), z, b.rng.range(0.9, 1.3));
      // Jungle heaped on the bank behind the boulders, a limb leaning out over the boards.
      for (let z = -6; z > -len - 4; z -= 14) jungleBank(b, bank, b.rng.range(6.8, 7.6), z, WL + 1.6);
      for (let k = 0; k < 2; k++) bananas(b, bank * b.rng.range(4.6, 5.6), WL + 1.1, -b.rng.range(1, len - 1), 0.7);
      canopy(b, bank, -len * b.rng.range(0.3, 0.7), 0, 0.6);
      vista(b, len, ['temple', 'falls', 'guardians'], 0.5);
      colossus(b, -bank, -len * b.rng.range(0.3, 0.7), 0.45);
      if (b.rich) cliffWall(b, bank, b.rng.range(13, 16), -len / 2, undefined, b.rng.range(0.9, 1.15));
      scenery(b, len, { sides: [-bank], minX: 8 });
      return { hazards: ['chasm', 'rockfall'], walls: 'none' };
    },
  },
  tunnel: {
    // A dark vaulted passage through a ruin: a ragged portal hung with vines, 8–16 m of barrel vault, and
    // the bright way out at the far end. No room for the slab gate: the vault comes down instead.
    lengths: [20, 24, 28],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.1, 0.04);
      const mouthZ = -TILE;
      const k = Math.floor((len - TILE - 3.2) / TILE); // vault segments between the two portals
      const exitZ = mouthZ - 1.6 - TILE * k - 1.6;
      // Approach and way out: short walls up to the portals.
      lowWalls(b, 0, 1, [-1, 1], { gaps: 0 });
      b.place('tunnel_mouth_0', 0, 0, mouthZ, 0);
      b.place('tunnel_mouth_0', 0, 0, exitZ, Math.PI);
      for (let i = 0; i < k; i++) {
        const z = mouthZ - 1.6 - TILE * i;
        const v = `vault_${b.rng.int(0, 1)}`;
        if (b.rng.chance(0.5)) b.place(v, 0, 0, z, 0);
        else b.place(v, 0, 0, z - TILE, Math.PI);
        // Grit fallen from the vault along the kerbs.
        for (const side of [-1, 1]) b.edgeRubble(side, z, PATH_HALF - 0.4, 0, 0.8);
        // Roots and vines through the crown, the odd shaft of green.
        if (b.foliage(0.45)) b.place(`roots_${b.rng.int(0, 1)}`, b.rng.range(-0.4, 0.4), 6.6, z - b.rng.range(0.5, 3.5), 0, [0.35, b.rng.range(0.5, 0.8), 1]);
      }
      // Hanging vines across the mouth, jungle heaped over the portal and along the vault's back.
      for (const [z, face] of [[mouthZ, 1], [exitZ, -1]] as const) {
        if (b.foliage(0.95)) b.place('vines_2', b.rng.range(-0.8, 0.8), 6.3, z - face * 0.35, 0, [1.05, b.rng.range(0.5, 0.65), 1]);
        if (b.foliage(0.8)) b.place('vines_1', b.rng.range(-3, 3), 8.2, z + face * 0.1, 0, [1, 1.1, 1]);
        for (const side of [-1, 1]) {
          if (b.foliage(0.9)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, side * b.rng.range(2.5, 5), b.rng.range(6.8, 8.2), z - face * 0.8, b.rng.range(0, 6.28), b.rng.range(0.8, 1.1));
          if (b.foliage(0.6)) b.place(`roots_${b.rng.int(0, 1)}`, side * b.rng.range(3.5, 5.5), b.rng.range(7.5, 8.5), z + face * 0.05, 0, [0.8, b.rng.range(0.9, 1.3), 1]);
        }
      }
      for (let z = mouthZ - 3; z > exitZ; z -= b.rng.range(3, 5)) {
        if (b.foliage(0.8)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, b.rng.range(-2.5, 2.5), 6.9, z, b.rng.range(0, 6.28), b.rng.range(0.7, 1.0));
        // Bushes on the vault's sloping shoulders (a corbel vault: its back falls from ~7.4 m over the
        // middle to the springing at 3.2 m, 3.45 m out).
        if (b.foliage(0.55)) {
          const x = b.rng.range(1.6, 2.8);
          b.place(`bush_${b.rng.int(0, 3)}`, b.rng.pick([-1, 1]) * x, 3.2 + 4.2 * (1 - x / 3.45) + 0.2, z, 0, b.rng.range(0.9, 1.3));
        }
      }
      if (b.foliage(0.8)) {
        const t = b.rng.int(0, 1);
        const side = b.rng.pick([-1, 1]);
        b.place(`tree_big_${t}_trunk`, side * 7.5, WL, (mouthZ + exitZ) / 2, b.rng.range(0, 6.28), 0.95);
        b.place(`tree_big_${t}_crown`, side * 7.5, WL, (mouthZ + exitZ) / 2, b.rng.range(0, 6.28), 0.95);
      }
      for (const side of [-1, 1]) {
        for (let i = 1; i < n; i++) {
          b.wall(b.rng.chance(0.5) ? 'foundation_0' : 'foundation_1', side, 3.3, 0, -TILE * i);
          b.foam(side, 3.75, -TILE * i);
        }
      }
      scenery(b, len, { minX: 10, big: false });
      return { hazards: ['rockfall', 'chasm'], walls: 'tall' };
    },
  },
  statues: {
    // A causeway lined with carved guardians on plinths at the path's edge, ragged walls between
    // them, carved medallions underfoot, and at its end a lintel gate before tall ruined facades
    // (a lone column standing off to one side).
    lengths: [24, 28],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.08, 0.22);
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const z = -TILE * i;
          const statue = i % 2 === (side > 0 ? 1 : 0) && i < n - 1;
          if (!statue) {
            lowWalls(b, z, 1, [side], { gaps: 0.2 });
            continue;
          }
          b.wall('foundation_1', side, PATH_HALF + 0.42, 0, z);
          b.foam(side, PATH_HALF + 0.84, z);
          b.edgeRubble(side, z);
          const broken = b.rng.chance(0.3);
          b.place(broken ? 'guardian_1' : 'guardian_0', side * (PATH_HALF + 0.95), 0, z - 2, faceIn(side, 0.9), b.rng.range(0.62, 0.7));
          if (b.foliage(0.5)) b.place(`fern_${b.rng.int(0, 1)}`, side * (PATH_HALF + 0.2), 0, z - b.rng.range(0.5, 1.2), b.rng.range(0, 6.28), 0.8);
          if (b.rich && b.foliage(0.5)) b.place(`moss_${b.rng.int(0, 2)}`, side * (PATH_HALF + 0.9), 0.95 * 0.66, z - 2, 0, 0.8);
          if (b.foliage(0.45)) b.place('vines_0', side * (PATH_HALF + 1.6), b.rng.range(3.0, 3.6), z - 2, faceIn(side, 0.4), [0.45, 0.6, 1]);
        }
      }
      // The vanishing point: a lintel gate over the way, facades rising behind it, a lone column.
      const gz = -len + 3.5;
      b.place('lintel_gate_0', 0, 0, gz, b.rng.chance(0.5) ? 0 : Math.PI);
      // Its posts stand out past the causeway's edge: boulders heaped under them.
      for (const side of [-1, 1]) b.place(`rock_mid_${b.rng.int(0, 2)}`, side * 3.7, WL + 0.9, gz, b.rng.range(0, 6.28), [0.55, 0.75, 0.5]);
      if (b.foliage(0.9)) b.place('vines_1', b.rng.range(-1.5, 1.5), 8.3, gz + 0.6, 0, [0.9, 0.9, 1]);
      if (b.foliage(0.8)) b.place(`bush_${b.rng.int(0, 3)}`, b.rng.range(-3, 3), 8.4, gz, 0, 1.0);
      const fs = b.rng.chance(0.5) ? -1 : 1;
      b.place(`facade_${b.variant % 2}`, fs * b.rng.range(9.5, 11), WL + 0.2, -len - 2, faceIn(fs, 2.2), b.rng.range(1.0, 1.15));
      b.place(`facade_${(b.variant + 1) % 2}`, -fs * b.rng.range(10.5, 12.5), WL + 0.2, -len - 6, faceIn(-fs, 2.4), b.rng.range(0.9, 1.05));
      b.foamRing(fs * 10, -len - 2, 6);
      b.place('column_lone_0', -fs * b.rng.range(6.5, 8), WL - 0.3, -len * b.rng.range(0.45, 0.65), b.rng.range(0, 6.28), b.rng.range(0.95, 1.1));
      b.foamRing(-fs * 7, -len * 0.55, 2);
      for (const side of [-1, 1]) {
        if (b.foliage(0.8)) {
          const t = b.rng.int(0, 1);
          b.place(`tree_big_${t}_trunk`, side * 14, WL, -len - 4, b.rng.range(0, 6.28), 1.05);
          b.place(`tree_big_${t}_crown`, side * 14, WL, -len - 4, b.rng.range(0, 6.28), 1.05);
        }
        if (b.foliage(0.8)) b.place(`shrub_mass_${b.rng.int(0, 1)}`, side * 8.5, islet(b, side * 8.5, -len + 1, 0.8) - 0.3, -len + 1, b.rng.range(0, 6.28), 1.2); // (round 20: on a boulder, not the water)
      }
      jungleBank(b, -fs, 5.4, -len / 2 + 2, 0, 0.5);
      canopy(b, -fs, -len * b.rng.range(0.25, 0.5), 0, 0.4);
      scenery(b, len, { minX: 11, big: false, cliffs: b.variant % 2 === 1 });
      return { hazards: ['gate', 'rockfall', 'chasm'], walls: 'low' };
    },
  },
  // ---------------------------------------------------------------- round 11: new scenarios
  sunken: {
    // A flooded temple courtyard: the causeway runs across a sunken plaza, its walls half under water,
    // pillars and steles standing in it, stepped pyramids drowned to their upper tiers on both sides.
    lengths: [24, 28],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.22, 0.12);
      lowWalls(b, 0, n, [-1, 1], { gaps: 0.55 });
      for (const side of [-1, 1]) {
        // The drowned courtyard: a grid of pillars and steles standing in the water.
        for (let z = -3; z > -len + 2; z -= b.rng.range(5, 7.5)) {
          const x = side * b.rng.range(5.2, 6.4);
          const p = b.rng.pick(['pillar_0', 'pillar_1', 'pillar_2', 'stele_0']);
          if (p === 'stele_0') b.place(p, x, WL - 0.4, z, faceIn(side, 1), 1.1);
          else b.pillar(p, x, WL - 1.0, z, b.rng.range(0, 0.3));
          b.foamRing(x, z, 1.2);
          b.lilies(x + side * b.rng.range(1, 2.5), z - 2, b.rng.range(0.9, 1.3));
          if (b.rng.chance(0.4)) b.place('steps_water_0', side * b.rng.range(8, 11), WL, z - 3, b.rng.range(0, 6.28), 1.1);
        }
        // A drowned pyramid, only its upper tiers and shrine above the water.
        const px = side * b.rng.range(13, 17);
        const pz = -len * b.rng.range(0.3, 0.7);
        b.place(b.rng.chance(0.6) ? 'temple_0' : 'temple_1', px, WL - 4.2, pz, faceIn(side, 1.2), b.rng.range(0.85, 1.05));
        b.foamRing(px, pz, 6.5);
        b.place(`wall_mid_${b.rng.int(0, 1)}`, side * b.rng.range(8, 10), WL - 1.4, -len * b.rng.range(0.1, 0.9), b.rng.range(0, 6.28), 1);
      }
      scenery(b, len, { minX: 18, big: true, cliffs: false });
      vista(b, len, ['arch', 'guardians', 'temple'], 0.6);
      return { hazards: ['chasm', 'rockfall'], walls: 'low' };
    },
  },
  roots: {
    // The jungle takes the causeway back: giant roots heaved over the parapets, trees crowding both
    // banks, limbs arching overhead and green everywhere.
    lengths: [20, 24],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.25, 0.04);
      lowWalls(b, 0, n, [-1, 1], { gaps: 0.4 });
      for (const side of [-1, 1]) {
        for (let z = -7; z > -len - 4; z -= 14) jungleBank(b, side, PATH_HALF + 2.0, z);
        for (let z = -b.rng.range(2, 4); z > -len + 5; z -= b.rng.range(4.5, 7.5)) {
          // Giant roots heaved over the parapet (round 17: buttress roots that arch over the crest, flare
          // into fins on the paving and sink into its joints, a branch down the outer face to the water;
          // they were hanging tubes stretched into stakes). Modelled on the right wall, 4 m along −Z
          // from the origin: on the left, turned end for end.
          const k = b.rng.int(0, 1);
          if (b.rng.chance(0.7)) {
            if (side > 0) b.place(`root_giant_${k}`, PATH_HALF + 0.36, 0, z, 0);
            else b.place(`root_giant_${k}`, -(PATH_HALF + 0.36), 0, z - 4, Math.PI);
          }
          if (b.foliage(0.5)) bananas(b, side * b.rng.range(3.2, 4.2), -0.6, z - 1.5);
        }
        const t = b.rng.int(0, 1);
        const tz = -len * b.rng.range(0.25, 0.75);
        b.place(`tree_big_${t}_trunk`, side * b.rng.range(6, 7), WL, tz, b.rng.range(0, 6.28), b.rng.range(1.0, 1.15));
        b.place(`tree_big_${t}_crown`, side * b.rng.range(6, 7), WL, tz, b.rng.range(0, 6.28), b.rng.range(1.0, 1.15));
      }
      canopy(b, -1, -len * b.rng.range(0.15, 0.4), 0, 0.9);
      canopy(b, 1, -len * b.rng.range(0.55, 0.85), 0, 0.9);
      scenery(b, len, { minX: 12, big: false });
      return { hazards: ['chasm', 'rockfall'], walls: 'low' };
    },
  },
  colossi: {
    // An avenue of colossi: twice-life-size guardians stand in the water close beside the way on both
    // sides (ref18), ruined temple fronts tower behind them, an arch at the end.
    lengths: [28, 32],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.08, 0.18);
      lowWalls(b, 0, n, [-1, 1], { gaps: 0.35 });
      let k = 0;
      for (let z = -4; z > -len + 3; z -= b.rng.range(7.5, 9.5), k++) {
        for (const side of [-1, 1]) colossus(b, side, z + (side > 0 ? 0 : -2.5), 0.92);
      }
      for (const side of [-1, 1]) ruinFront(b, side, -len * b.rng.range(0.3, 0.8), 0.75);
      scenery(b, len, { minX: 16, big: true });
      vista(b, len, ['arch', 'temple', 'towers'], 0.85);
      return { hazards: ['gate', 'chasm', 'rockfall'], walls: 'low' };
    },
  },
  ledge: {
    // A ledge path along a cliff above the gorge: the rock face rises sheer beside the way, a fall pours
    // off a wall onto the path's edge, and on the other side open water and far cliffs drop away.
    lengths: [24, 28],
    build: (b, len) => {
      const n = len / TILE;
      floorRun(b, 0, n, 0, 0.12);
      const side = b.rng.chance(0.5) ? -1 : 1;
      lowWalls(b, 0, n, [-side], { gaps: 0.5 });
      const fallTile = b.rng.int(1, n - 2);
      for (let i = 0; i < n; i++) {
        const z = -TILE * i;
        b.wall('foundation_1', side, PATH_HALF + 0.42, 0, z);
        if (i === fallTile) {
          b.wall(`wall_tall_${b.rng.int(0, 1)}`, side, PATH_HALF + 0.6, 0, z);
          pathFall(b, side, z - 2, 5.1);
        } else {
          b.wall(b.rng.pick(LOW_WALLS), side, PATH_HALF + 0.36, 0, z);
          spill(b, side, z, b.rng.range(1.05, 1.3), PATH_HALF + 0.02, 0.4);
        }
        b.edgeRubble(side, z);
      }
      // The cliff, close and very tall, waterfalls down it.
      let z = 3;
      while (z > -len - 3) {
        const i = b.rng.int(0, 2);
        const L = CLIFFS[i]![1];
        const h = cliffWall(b, side, 7.6 + b.rng.range(0, 0.8), Math.max(z - L / 2, -len - 3 + L / 2), i, b.rng.range(1.15, 1.35));
        if (b.rng.chance(0.6)) cliffFall(b, side, 7.0, Math.max(z - L * b.rng.range(0.3, 0.7), -len + 2), h * 0.75, b.rng.range(2.8, 4.0));
        z -= L * b.rng.range(0.82, 0.95);
      }
      canopy(b, side, -len * b.rng.range(0.2, 0.6), 0, 0.5);
      scenery(b, len, { sides: [-side], minX: 9, big: true });
      return { hazards: ['rockfall', 'chasm'], walls: 'cliff' };
    },
  },
  ...LAND_BUILDERS,
} as Record<SectionType, { lengths: number[]; build: Build }>;

/**
 * Round 11 crescendo: in the ruined variants, towers in the distance lean and break, their fallen
 * blocks heaped at their feet: the world falling apart as the multiplier climbs.
 */
function ruinedSkyline(b: Builder, len: number, ruin: number) {
  const n = ruin > 0.8 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const side = b.rng.chance(0.5) ? -1 : 1;
    const x = side * b.rng.range(30, 44);
    const z = -b.rng.range(0.2, 0.8) * len;
    const lean = b.rng.range(0.12, 0.26) * ruin;
    b.place(b.rng.pick(['tower_0', 'tower_1']), x, WL - 1.2, z, b.rng.range(0, 6.28), b.rng.range(1.0, 1.25), [b.rng.range(-1, 1) * lean, side * lean]);
    for (let k = 0; k < 3; k++) b.place(`rubble_${b.rng.int(0, 3)}`, x + b.rng.range(-4, 4), WL - 0.3, z + b.rng.range(-4, 4), b.rng.range(0, 6.28), b.rng.range(1.6, 2.6));
  }
}

export function buildLayout(type: SectionType, seed: string, density: { foliage: number; scenery: number }, len?: number, ruin = 0): Layout {
  const rng = new Rng(seed);
  const def = BUILDERS[type];
  const L = len ?? rng.pick(def.lengths);
  const b = new Builder(rng, density, Number(seed.split('#')[1] ?? 0) || 0, ruin);
  b.len = L;
  const r = def.build(b, L);
  // (Never on a corner: its towers 30–44 m out to the side stood on the exit leg of the bend.)
  if (ruin > 0.45 && b.rich && type !== 'start' && type !== 'tunnel' && type !== 'turnL' && type !== 'turnR') ruinedSkyline(b, L, ruin);
  return { type, len: L, turn: r.turn ?? 0, dy: r.dy ?? 0, props: b.props, tiles: b.tiles, falls: b.falls, hazards: r.hazards, walls: r.walls, ruin, ground: r.ground, features: r.features };
}

export const SECTION_TYPES = Object.keys(BUILDERS) as SectionType[];

/** Pacing: what can follow what, and how often. Elevation stays within one flight of stairs. */
/**
 * Biome beats (presentation only: a function of the current multiplier's intensity, never of the hidden
 * fall point). A run opens on the causeway over open water, passes the gates and the guardians, goes into
 * the sanctum (tunnels, tall walls, gorges) and ends in the chasm country (cliffs, gorges, rope bridges).
 * The beat's types get a strong bias; every type stays possible.
 */
export const BIOMES: { until: number; types: SectionType[] }[] = [
  // [Progression director] the beats change exactly at the run tiers (2×, 5×, 10×), on the shared model.
  { until: intensityOf(2), types: ['corridor', 'bridge', 'boardwalk', 'plaza', 'ruins', 'sunken', 'roots', 'forest', 'overgrown'] },
  { until: intensityOf(5), types: ['gate', 'statues', 'avenue', 'arcade', 'corridor', 'colossi', 'forestWall', 'forest'] },
  { until: intensityOf(10), types: ['tunnel', 'tall', 'gorge', 'arcade', 'statues', 'roots', 'cutting'] },
  { until: 2, types: ['cliff', 'gorge', 'bridge', 'tunnel', 'ledge', 'ravine', 'cutting'] },
];

export function biomeOf(intensity: number): number {
  return BIOMES.findIndex((b) => intensity < b.until);
}

/**
 * Round 11: a run plan. Each world (a new one per round) favours one theme's scenario types, picked from
 * the world's own cosmetic seed and never the same as the last world's. Presentation only: the seed is
 * drawn on the client when the world is built, and knows nothing of the round's fall point.
 */
export const THEMES: { name: string; types: SectionType[] }[] = [
  { name: 'causeway', types: ['corridor', 'bridge', 'boardwalk', 'sunken'] },
  { name: 'jungle', types: ['roots', 'boardwalk', 'cliff', 'tunnel', 'forest', 'forestWall'] },
  { name: 'colossi', types: ['colossi', 'statues', 'avenue', 'gate'] },
  { name: 'gorge', types: ['ledge', 'gorge', 'cliff', 'bridge'] },
  { name: 'temples', types: ['sunken', 'plaza', 'ruins', 'arcade', 'tall'] },
];

export function nextType(rng: Rng, prev: SectionType, elevation: number, intensity: number, favor: SectionType[] = [], allow: (t: SectionType) => boolean = () => true): SectionType {
  const beat = BIOMES[biomeOf(intensity)]!.types;
  const w: [SectionType, number][] = [
    ['corridor', 4],
    ['bridge', 2.2],
    ['arcade', 1.6],
    ['gate', 1.2],
    ['tall', 1.8 + intensity],
    ['plaza', 1.6],
    ['cliff', 1.4 + 0.8 * intensity],
    ['ruins', 1.3],
    ['avenue', 1.2],
    ['gorge', 1.7 + 1.2 * intensity],
    ['boardwalk', 1.5],
    ['tunnel', 1.0 + 0.8 * intensity],
    ['statues', 1.2],
    ['sunken', 1.2],
    ['roots', 1.3],
    ['colossi', 1.1],
    ['ledge', 1.1 + 0.6 * intensity],
    // Real corners: more often as the run builds (the director's turns are part of the crescendo).
    ['stepping', 0.8 + 0.6 * intensity],
    ['turnL', 1.8 + 0.8 * intensity],
    ['turnR', 1.8 + 0.8 * intensity],
    [elevation > -0.5 ? 'stairsDown' : 'stairsUp', 1.1],
    // World round 21: land (a run of two to four; see Track.update).
    ['forest', 2.4],
    ['forestWall', 1.5],
    ['cutting', 1.1 + 0.7 * intensity],
    ['overgrown', 1.3],
    ['ravine', 0.9 + 0.9 * intensity],
  ];
  const options = w.filter(([t]) => (t !== prev || t === 'corridor') && allow(t)).map(([t, k]) => [t, (beat.includes(t) ? k * 2.2 : k) * (favor.includes(t) ? 2.4 : 1)] as [SectionType, number]);
  return rng.weighted(options);
}

export type { Segment };
