import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Kit } from '../src/world/assets';

/**
 * World round 23: the kit as the route sees it — every piece a box with its real bounds
 * (tests/kit-bounds.json, read from public/assets/kit.glb). Corner clearance measures standing scenery
 * by these bounds; with empty pieces every corner was clear in the tests while in the game a landmark's
 * corner was blocked every time, so its open run-up was staged over and over (65 % of the route).
 * Regenerate the bounds after a kit bake that moves or resizes scenery pieces.
 */
export function boundsKit(): Kit {
  const geo = new Map<string, THREE.BufferGeometry>();
  const matOf = new Map<string, string>();
  const bounds = JSON.parse(readFileSync(new URL('./kit-bounds.json', import.meta.url), 'utf8')) as Record<string, number[]>;
  for (const [n, b] of Object.entries(bounds)) {
    const g = new THREE.BoxGeometry(b[3]! - b[0]!, b[4]! - b[1]!, b[5]! - b[2]!);
    g.translate((b[0]! + b[3]!) / 2, (b[1]! + b[4]!) / 2, (b[2]! + b[5]!) / 2);
    geo.set(n, g);
    matOf.set(n, 'stone');
  }
  const mat = new Map<string, THREE.Material>([['stone', new THREE.MeshBasicMaterial()]]);
  return { geo, mat, matOf } as unknown as Kit;
}
