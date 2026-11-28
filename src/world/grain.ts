import * as THREE from 'three';
import type { Kit } from './assets';

/**
 * World round 29 (the critic: the low surface roots in the forest read as green tubes, their bark's
 * furrows running straight up the world): the direction each root, log and limb runs, per vertex, so the
 * bark's furrows can follow it (caustics.ts patchBark). The kit ships no grain UV, so it is read off the
 * mesh once at load: round a vertex, a few rings of the mesh (welded across the atlas's seams), the
 * normals of a tube sweep the plane across it, and the direction they leave out — the smallest eigen-
 * vector of their scatter — is the way the tube runs. `aGrain`: xyz that direction (the piece's frame),
 * w how sure (0 where the surface is flat, a root's foot on the ground). Every bark piece carries it
 * (trunks and limbs too: a felled trunk's furrows run along it), so they all still merge into one call.
 */
export function bakeGrain(kit: Kit): void {
  for (const [name, g] of kit.geo) {
    if (kit.matOf.get(name) !== 'bark' || g.getAttribute('aGrain')) continue;
    g.setAttribute('aGrain', new THREE.BufferAttribute(grainOf(g), 4));
  }
}

/** Carry a placement's rotation and scale into a merged copy's grain (BufferGeometry.applyMatrix4 does not). */
export function placeGrain(g: THREE.BufferGeometry, m: THREE.Matrix4): void {
  const at = g.getAttribute('aGrain') as THREE.BufferAttribute | undefined;
  if (!at) return;
  const n3 = new THREE.Matrix3().setFromMatrix4(m);
  const v = new THREE.Vector3();
  for (let i = 0; i < at.count; i++) {
    v.set(at.getX(i), at.getY(i), at.getZ(i));
    if (v.lengthSq() < 1e-8) continue;
    v.applyMatrix3(n3).normalize();
    at.setXYZ(i, v.x, v.y, v.z);
  }
  at.needsUpdate = true;
}

function grainOf(g: THREE.BufferGeometry): Float32Array {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const count = pos.count;
  const out = new Float32Array(count * 4);
  if (!nrm) return out;
  // Weld coincident vertices (the atlas's seams split them).
  const ids = new Int32Array(count);
  const key = new Map<string, number>();
  const wp: number[] = [];
  const wn0: number[] = [];
  for (let i = 0; i < count; i++) {
    const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
    let id = key.get(k);
    if (id === undefined) {
      id = wp.length / 3;
      key.set(k, id);
      wp.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      wn0.push(0, 0, 0);
    }
    ids[i] = id;
    wn0[id * 3] = wn0[id * 3]! + nrm.getX(i);
    wn0[id * 3 + 1] = wn0[id * 3 + 1]! + nrm.getY(i);
    wn0[id * 3 + 2] = wn0[id * 3 + 2]! + nrm.getZ(i);
  }
  const W = wp.length / 3;
  const wn = Float64Array.from(wn0);
  for (let i = 0; i < W; i++) {
    const l = Math.hypot(wn[i * 3]!, wn[i * 3 + 1]!, wn[i * 3 + 2]!) || 1;
    wn[i * 3]! /= l;
    wn[i * 3 + 1]! /= l;
    wn[i * 3 + 2]! /= l;
  }
  const adj: Set<number>[] = Array.from({ length: W }, () => new Set<number>());
  const idx = g.getIndex();
  const tri = idx ? idx.count / 3 : count / 3;
  for (let t = 0; t < tri; t++) {
    const a = ids[idx ? idx.getX(t * 3) : t * 3]!, b = ids[idx ? idx.getX(t * 3 + 1) : t * 3 + 1]!, c = ids[idx ? idx.getX(t * 3 + 2) : t * 3 + 2]!;
    adj[a]!.add(b).add(c);
    adj[b]!.add(a).add(c);
    adj[c]!.add(a).add(b);
  }
  const dir = new Float32Array(W * 3);
  const conf = new Float32Array(W);
  const seen = new Int32Array(W).fill(-1);
  for (let i = 0; i < W; i++) {
    // A few rings round the vertex.
    let front = [i];
    seen[i] = i;
    const ring = [i];
    for (let d = 0; d < 3 && ring.length < 90; d++) {
      const next: number[] = [];
      for (const f of front) for (const j of adj[f]!) if (seen[j] !== i) ((seen[j] = i), next.push(j), ring.push(j));
      front = next;
    }
    let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;
    for (const j of ring) {
      const x = wn[j * 3]!, y = wn[j * 3 + 1]!, z = wn[j * 3 + 2]!;
      c0 += x * x;
      c1 += x * y;
      c2 += x * z;
      c3 += y * y;
      c4 += y * z;
      c5 += z * z;
    }
    const tr = c0 + c3 + c5;
    // Smallest eigenvector of C: the largest of (tr·I − C), by power iteration.
    // (Seeded off the vertex's own normal so the start is never orthogonal to the answer by chance.)
    let vx = 0.577 + 0.3 * wn[i * 3 + 1]!, vy = 0.577 + 0.3 * wn[i * 3 + 2]!, vz = 0.577 + 0.3 * wn[i * 3]!;
    let lam = 0;
    for (let it = 0; it < 24; it++) {
      const x: number = (tr - c0) * vx - c1 * vy - c2 * vz;
      const y: number = -c1 * vx + (tr - c3) * vy - c4 * vz;
      const z: number = -c2 * vx - c4 * vy + (tr - c5) * vz;
      lam = Math.hypot(x, y, z) || 1;
      vx = x / lam;
      vy = y / lam;
      vz = z / lam;
    }
    // Its eigenvalue in C (how much the normals still turn along it) against the mean spread: a tube's
    // normals leave it out entirely; a flat patch's leave out two directions alike (no answer).
    const along = tr - lam;
    const nx = wn[i * 3]!, ny = wn[i * 3 + 1]!, nz = wn[i * 3 + 2]!;
    // The spread across: the normals' scatter about the vertex's own normal, in the plane it leaves.
    let spread = 0;
    for (const j of ring) {
      const dn = wn[j * 3]! * nx + wn[j * 3 + 1]! * ny + wn[j * 3 + 2]! * nz;
      spread += 1 - dn * dn;
    }
    spread /= ring.length;
    dir[i * 3] = vx;
    dir[i * 3 + 1] = vy;
    dir[i * 3 + 2] = vz;
    conf[i] = smoothstep(0.02, 0.12, spread) * (1 - smoothstep(0.08, 0.3, along / Math.max(tr, 1e-6)));
  }
  // One sign across each connected piece (opposite signs would cancel across a triangle), then a few
  // passes of smoothing over the rings, weighted by confidence (bark knuckles and ridges jitter it).
  const flipped = new Uint8Array(W);
  for (let s0 = 0; s0 < W; s0++) {
    if (flipped[s0]) continue;
    flipped[s0] = 1;
    const stack = [s0];
    while (stack.length) {
      const a = stack.pop()!;
      for (const b of adj[a]!) {
        if (flipped[b]) continue;
        flipped[b] = 1;
        if (dir[a * 3]! * dir[b * 3]! + dir[a * 3 + 1]! * dir[b * 3 + 1]! + dir[a * 3 + 2]! * dir[b * 3 + 2]! < 0) {
          dir[b * 3]! *= -1;
          dir[b * 3 + 1]! *= -1;
          dir[b * 3 + 2]! *= -1;
        }
        stack.push(b);
      }
    }
  }
  let cur = dir;
  for (let pass = 0; pass < 4; pass++) {
    const nxt = new Float32Array(W * 3);
    for (let i = 0; i < W; i++) {
      const c0 = conf[i]! + 0.05;
      let x: number = cur[i * 3]! * c0, y: number = cur[i * 3 + 1]! * c0, z: number = cur[i * 3 + 2]! * c0;
      for (const j of adj[i]!) {
        const s = cur[i * 3]! * cur[j * 3]! + cur[i * 3 + 1]! * cur[j * 3 + 1]! + cur[i * 3 + 2]! * cur[j * 3 + 2]! < 0 ? -1 : 1;
        const w = (conf[j]! + 0.05) * s;
        x += cur[j * 3]! * w;
        y += cur[j * 3 + 1]! * w;
        z += cur[j * 3 + 2]! * w;
      }
      // Kept in the tangent plane.
      const nx = wn[i * 3]!, ny = wn[i * 3 + 1]!, nz = wn[i * 3 + 2]!;
      const dn = x * nx + y * ny + z * nz;
      x -= dn * nx;
      y -= dn * ny;
      z -= dn * nz;
      const l = Math.hypot(x, y, z) || 1;
      nxt[i * 3] = x / l;
      nxt[i * 3 + 1] = y / l;
      nxt[i * 3 + 2] = z / l;
    }
    cur = nxt;
  }
  for (let i = 0; i < count; i++) {
    const id = ids[i]!;
    out[i * 4] = cur[id * 3]!;
    out[i * 4 + 1] = cur[id * 3 + 1]!;
    out[i * 4 + 2] = cur[id * 3 + 2]!;
    out[i * 4 + 3] = conf[id]!;
  }
  return out;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
