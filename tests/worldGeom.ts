import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { groundY } from '../src/world/land';
import { evalSeg } from '../src/world/path';
import { isWaterPiece, type Layout } from '../src/world/sections';
import { Track } from '../src/world/track';
import { boundsKit } from './kitBounds';

/**
 * World round 26: the kit's real geometry for the world checks (grounding, the running line). Bounding
 * boxes are far too coarse for them: a limb arching over the way, a shrub on a boulder, a bush on a
 * parapet's crest. Every piece's vertices (and its triangles' centroids, so a large flat face crossing a
 * box with no vertex inside it still counts), as placed in a layout's own frame.
 */
let kit: Map<string, Float32Array> | null = null;

export async function kitPoints(): Promise<Map<string, Float32Array>> {
  if (kit) return kit;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(new URL('../public/assets/kit.glb', import.meta.url).pathname);
  const out = new Map<string, Float32Array>();
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const pts: number[] = [];
    // (Nodes carry their own rotation — the fallen log is modelled along its length in y.)
    const M = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const v = new THREE.Vector3();
    const put = (q: number[]) => {
      v.set(q[0]!, q[1]!, q[2]!).applyMatrix4(M);
      pts.push(v.x, v.y, v.z);
    };
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, a);
        put(a);
      }
      if (idx) {
        for (let i = 0; i < idx.getCount(); i += 3) {
          pos.getElement(idx.getScalar(i), a);
          pos.getElement(idx.getScalar(i + 1), b);
          pos.getElement(idx.getScalar(i + 2), c);
          put([(a[0]! + b[0]! + c[0]!) / 3, (a[1]! + b[1]! + c[1]!) / 3, (a[2]! + b[2]! + c[2]!) / 3]);
        }
      }
    }
    out.set(node.getName(), new Float32Array(pts));
  }
  kit = out;
  return out;
}

/** The water surface in a layout's own frame. */
export const WL = -2.2;

/**
 * Pieces that hang from, wrap or grow on something else, or are meant to float: not checked for
 * grounding (what carries them is checked).
 */
export const HANGING = /^(foam|lily_|vines_|spill_|canopy_|.*_ivy$|.*_crown$|.*_veg$|.*_trees$|.*_gold$)/;

/** What the runner may brush: grass and ferns at the legs, the pebbles underfoot. */
export const SOFT = /^(grass_|fern_|moss_|scatter_path_)/;

/** Foliage (cards and clumps: a body passes through them visibly). */
export const FOLIAGE = /^(grass_|fern_|bush_|banana_|shrub_mass_|jungle_bank_|vines_|spill_|canopy_\d$|palm_\d_crown|tree_big_\d_crown|jungle_\d_crown|.*_ivy$|.*_veg$|moss_)/;

/** A placement's points in the layout's frame (every `step`-th point). */
export function placedPoints(pts: Float32Array, m: THREE.Matrix4, step = 1): Float32Array {
  const e = m.elements;
  const n = Math.floor(pts.length / 3 / step);
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = k * step * 3;
    const x = pts[i]!, y = pts[i + 1]!, z = pts[i + 2]!;
    out[k * 3] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    out[k * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    out[k * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }
  return out;
}

/**
 * A coarse height field over a layout's solid props and tiles: per 0.25 m cell, the highest point of each
 * piece in it (so a piece's support is measured against the others, never itself).
 */
export class SupportField {
  private cells = new Map<number, Map<number, number>>();
  private static key(x: number, z: number) {
    return Math.round(x * 4) * 100003 + Math.round(z * 4);
  }
  add(p: Float32Array, owner: number) {
    for (let i = 0; i < p.length; i += 3) {
      const k = SupportField.key(p[i]!, p[i + 2]!);
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = new Map()));
      const y = p[i + 1]!;
      const v = c.get(owner);
      if (v === undefined || y > v) c.set(owner, y);
    }
  }
  /** Highest surface of any piece but `self` within `r` m of (x, z), or -Infinity. */
  at(x: number, z: number, r = 0.25, self = Number.NaN): number {
    let best = -Infinity;
    const n = Math.ceil(r * 4);
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const c = this.cells.get(SupportField.key(x + i / 4, z + j / 4));
        if (!c) continue;
        for (const [o, v] of c) if (o !== self && v > best) best = v;
      }
    return best;
  }
}

/** The running line's floor height at section-local (x, z): the tiles under it (stairs, ramps). */
export function lineAt(layout: Layout, t: number): { x: number; z: number } {
  // The route as the track lays it (a corner's quarter arc, a plaza's bend, a straight).
  const f = evalSeg({ s0: 0, len: layout.len, p0: new THREE.Vector3(), yaw0: 0, turn: layout.turn ?? 0, dy: 0 }, t * layout.len, { pos: new THREE.Vector3(), yaw: 0 });
  return { x: f.pos.x, z: f.pos.z };
}

export interface Finding {
  piece: string;
  at: [number, number, number];
  what: string;
}

/**
 * Grounding: every placed piece rests on something. Its contact points (its points within 6 cm of its
 * lowest) are compared with what is under them — the land's ground, the tiles, another solid piece, or,
 * under the water's surface, the bed. A piece whose every contact point clears its support by more
 * than `gap` flies (or floats, when what is under it is only water); one with more than `bury` of its
 * height under the ground at its centre is half sunk.
 */
export function groundingFindings(layout: Layout, pts: Map<string, Float32Array>, gap = 0.05, bury = 0.3): Finding[] {
  const out: Finding[] = [];
  const field = new SupportField();
  const placed: { piece: string; p: Float32Array; k: number; hangs: boolean }[] = [];
  layout.tiles.forEach((pl, k) => {
    const g = pts.get(pl.piece);
    if (g) field.add(placedPoints(g, pl.m, 2), -1 - k);
  });
  layout.props.forEach((pl, k) => {
    const g = pts.get(pl.piece);
    if (!g) return;
    const p = placedPoints(g, pl.m, 1);
    // (Hanging roots hang from a crest or a cliff when upright; laid down, they lie on the ground.)
    const hangs = HANGING.test(pl.piece) || (/^roots_/.test(pl.piece) && pl.m.elements[5]! > 0.5);
    placed.push({ piece: pl.piece, p, k, hangs });
    // Solid props carry what stands on them (foliage carries nothing).
    if (!FOLIAGE.test(pl.piece) && !HANGING.test(pl.piece) && !isWaterPiece(pl.piece)) field.add(p, k);
  });
  const ground = (x: number, z: number) => (layout.ground ? groundY(layout.ground, x, z, layout.len, layout.features?.lower ?? 0) : -Infinity);
  for (const { piece, p, k: self, hangs } of placed) {
    if (hangs || isWaterPiece(piece)) continue;
    let lo = Infinity, hi = -Infinity, cx = 0, cz = 0;
    for (let i = 0; i < p.length; i += 3) {
      lo = Math.min(lo, p[i + 1]!);
      hi = Math.max(hi, p[i + 1]!);
      cx += p[i]!;
      cz += p[i + 2]!;
    }
    cx /= p.length / 3;
    cz /= p.length / 3;
    const h = Math.max(0.05, hi - lo);
    // Contact points, thinned to at most ~40.
    const contact: number[] = [];
    for (let i = 0; i < p.length; i += 3) if (p[i + 1]! < lo + 0.06) contact.push(i);
    const stride = Math.max(1, Math.floor(contact.length / 40));
    let minGap = Infinity;
    let inWater = false;
    for (let k = 0; k < contact.length; k += stride) {
      const i = contact[k]!;
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      // Under the water's surface: it reaches the bed (the water hides how far).
      if (y < WL - 0.05 && !layout.ground) {
        minGap = -1;
        break;
      }
      const s = Math.max(ground(x, z), field.at(x, z, 0.3, self));
      if (s === -Infinity) {
        if (y < WL + 0.3) inWater = true;
        continue;
      }
      minGap = Math.min(minGap, y - s);
    }
    if (minGap > gap) out.push({ piece, at: [+cx.toFixed(1), +lo.toFixed(2), +cz.toFixed(1)], what: minGap === Infinity ? (inWater ? 'floats on the water' : 'hangs in the air') : `flies ${minGap.toFixed(2)} m` });
    if (layout.ground) {
      // Sunk: the share of its footprint (0.15 m cells) whose top is under the ground there — what the
      // eye loses; a moss cushion's own underside is not counted, a fern seated in a slope's uphill half is.
      const top = new Map<string, [number, number, number]>();
      for (let i = 0; i < p.length; i += 3) {
        const key = `${Math.floor(p[i]! / 0.15)},${Math.floor(p[i + 2]! / 0.15)}`;
        const c = top.get(key);
        if (!c || p[i + 1]! > c[1]) top.set(key, [p[i]!, p[i + 1]!, p[i + 2]!]);
      }
      let under = 0;
      for (const [x, y, z] of top.values()) if (y < ground(x, z) - 0.01) under++;
      const sunk = under / Math.max(1, top.size);
      void h;
      if (sunk > bury && !/^(rock_|cliff_wall_|foundation_|jungle_bank_|shrub_mass_|root_giant_|roots_|tree_|palm_|jungle_\d_trunk|wall_)/.test(piece)) out.push({ piece, at: [+cx.toFixed(1), +lo.toFixed(2), +cz.toFixed(1)], what: `${(sunk * 100).toFixed(0)} % sunk` });
    }
  }
  return out;
}

/**
 * The running line: nothing solid in the runner's way — a box 0.6 m wide and 2.0 m tall over the floor
 * along the line (designed obstacles are not in a layout). Grass and ferns may brush his legs; a
 * foliage card at body height is flagged too (he would pass through it).
 */
export function corridorFindings(layout: Layout, pts: Map<string, Float32Array>, half = 0.3, height = 2.0): Finding[] {
  const out: Finding[] = [];
  const floor = new SupportField();
  layout.tiles.forEach((pl, k) => {
    const g = pts.get(pl.piece);
    if (g) floor.add(placedPoints(g, pl.m, 2), -1 - k);
  });
  // The line, sampled every 0.25 m.
  const n = Math.ceil((layout.turn ? 7.1 : layout.len) / 0.25);
  const line: { x: number; z: number; y: number; dx: number; dz: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const a = lineAt(layout, k / n);
    const p0 = lineAt(layout, Math.max(0, k / n - 0.01)), p1 = lineAt(layout, Math.min(1, k / n + 0.01));
    const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
    const fy = floor.at(a.x, a.z, 0.3);
    line.push({ x: a.x, z: a.z, y: Number.isFinite(fy) ? fy : 0, dx: dx / l, dz: dz / l });
  }
  for (const pl of layout.props) {
    if (SOFT.test(pl.piece) || isWaterPiece(pl.piece) || /^scatter_/.test(pl.piece)) continue;
    const g = pts.get(pl.piece);
    if (!g) continue;
    const p = placedPoints(g, pl.m, 1);
    let worst: Finding | null = null;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      for (const s of line) {
        const along = (x - s.x) * s.dx + (z - s.z) * s.dz;
        if (Math.abs(along) > 0.13) continue;
        const across = Math.abs((x - s.x) * -s.dz + (z - s.z) * s.dx);
        if (across > half) continue;
        const up = y - s.y;
        if (up < 0.06 || up > height) continue;
        if (!worst) worst = { piece: pl.piece, at: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], what: `${across.toFixed(2)} m from the line, ${up.toFixed(2)} m up` };
        break;
      }
      if (worst) break;
    }
    if (worst) out.push(worst);
  }
  return out;
}

/** The 16 worlds the world checks walk (QA seeds `${n}-0.5`). */
export const CHECK_SEEDS = [3, 7, 11, 19, 23, 31, 42, 58, 64, 77, 83, 97, 105, 118, 126, 141];
/** Desktop High's and phone Low's densities and view distances (config/quality.ts). */
export const CHECK_TIERS = [
  { name: 'high', density: { foliage: 1, scenery: 1 }, view: 165 },
  { name: 'low', density: { foliage: 0.45, scenery: 0.4 }, view: 95 },
];

/** Every distinct section layout the track lays over each world's first `len` m, at each tier, named. */
export async function collectLayouts(len = 1200, seeds = CHECK_SEEDS, tiers = CHECK_TIERS): Promise<Map<Layout, string>> {
  const layouts = new Map<Layout, string>();
  for (const tier of tiers) {
    const track = new Track(boundsKit());
    await track.prepare(tier.density);
    track.viewDistance = tier.view;
    for (const w of seeds) {
      track.reset(`${w}-0.5`);
      for (let s = 0; s < len; s += 20) {
        track.update(s, 0);
        for (const sec of track.sections) if (!layouts.has(sec.layout)) layouts.set(sec.layout, `${tier.name} w${w} ${sec.type}`);
      }
    }
  }
  return layouts;
}

/** Findings as lines for an assertion message (the first `n`). */
export const findingLines = (fs: (Finding & { name: string })[], n = 20) => fs.slice(0, n).map((f) => `${f.name}: ${f.piece} ${f.what} @${f.at.join(',')}`);
