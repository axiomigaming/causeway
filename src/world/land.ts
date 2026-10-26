import * as THREE from 'three';

/**
 * World round 21: land. The causeway leaves the lagoon and runs through jungle on solid ground: forest
 * floor, dense forest walls, hillside cuttings, an overgrown plaza, a ravine with a dry riverbed. The
 * ground is one mesh per section, built from a height field that is a pure function of the section's
 * local position (so the builder can seat what it places on it), shelving into the water at the ends
 * of a run of land (a shore, never a cut edge).
 */
export type GroundKind = 'land' | 'ravine';

const WL = -2.2;

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise, 0..1. */
export function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Ground height (path-relative metres) at section-local (x, z), z running 0 .. −len. The noise fades
 * out over the last 5 m at each end, so every section of a run meets its neighbours on the same profile.
 */
export function groundY(kind: GroundKind, x: number, z: number, len: number): number {
  const ax = Math.abs(x);
  const taper = smooth(0, 5, -z) * smooth(0, 5, z + len);
  const n = (vnoise(x * 0.18 + 3.1, z * 0.18) - 0.5) * taper;
  const n2 = (vnoise(x * 0.05 - 7.0, z * 0.05 + 1.3) - 0.5) * taper;
  if (kind === 'ravine') {
    // A dry riverbed 1.75 m down either side of the causeway's footing, rising steeply to banks ~6 m up.
    const bed = -1.75 + n * 0.25; // (round 22: above the water — at -2.6 the "dry" bed was flooded)
    const bank = 6.5 + n2 * 2.5;
    return bed + (bank - bed) * smooth(7.5, 13, ax);
  }
  // Forest floor: just below the paving by the footing, rolling, and rising into wooded hills at the sides.
  const near = -0.32 + n * 0.12 * smooth(3.2, 5, ax);
  const rise = (1.2 + n2 * 2.4) * smooth(9, 38, ax) + n * 0.6 * smooth(5, 12, ax);
  return near + rise;
}

/** The water's level (path-relative) for a section `toWater` m from it. */
export const groundWater = (toWater: number) => WL + toWater;

/**
 * The ground mesh for a section of `len` m. At an end with no land beyond it (`rampIn` at z = 0,
 * `rampOut` at z = −len) the ground shelves down into the water over ~7 m, its shoreline ragged.
 */
export function makeGroundGeometry(kind: GroundKind, len: number, rampIn: boolean, rampOut: boolean, toWater = 0, seed = 0): THREE.BufferGeometry {
  const xs: number[] = [];
  for (let x = -60; x <= 60.001; x += x < -14 || x >= 14 ? 3 : 1) xs.push(x);
  const zs: number[] = [];
  const nz = Math.max(4, Math.round(len / 1.5));
  // A metre past each end, under the neighbour's first tiles (no seam at the joint).
  for (let k = 0; k <= nz; k++) zs.push(1 - ((len + 2) * k) / nz);
  const water = groundWater(toWater) - 0.9;
  const pos: number[] = [];
  for (const z of zs) {
    for (const x of xs) {
      let y = groundY(kind, x, z, len);
      // Under the causeway itself the ground stays below the footing.
      if (Math.abs(x) < 2.9) y = Math.min(y, -0.45);
      const ragged = 2 + 4 * vnoise(x * 0.21 + 9.0, seed * 0.37);
      // Distances in from each end (positive inside the section).
      if (rampIn) y = y + (water - y) * (1 - smooth(-1, ragged + 3, -z));
      if (rampOut) y = y + (water - y) * (1 - smooth(-1, ragged + 3, z + len));
      pos.push(x, y, z);
    }
  }
  const idx: number[] = [];
  const W = xs.length;
  for (let r = 0; r < zs.length - 1; r++) {
    for (let c = 0; c < W - 1; c++) {
      const a = r * W + c, b = a + 1, d = a + W, e = d + 1;
      idx.push(a, b, d, b, e, d); // (counter-clockwise from above: facing up)
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * The forest floor: dark soil under leaf litter, moss in patches and on the flats, bare rock on the
 * steep banks, all procedural (world-space noise; no texture, nothing to download).
 */
export function makeGroundMaterial(): THREE.MeshLambertMaterial {
  // (Round 22: no specular at all — looking toward the low sun the rough floor caught a grazing
  // sheen and went pale grey-cream across the whole frame; leaf litter and soil are matte.)
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.name = 'ground';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGW;
varying vec3 vGN;
float gH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec2 p = vGW.xz;
    float n1 = gN(p * 0.35), n2 = gN(p * 1.7 + 4.0), n3 = gN(p * 6.0 + 9.0), n4 = gN(p * 19.0);
    vec3 soil = vec3(0.075, 0.055, 0.04) * (0.8 + 0.4 * n2);
    // Leaf litter: warm browns and ochres, a speckle of single leaves.
    vec3 litter = mix(vec3(0.16, 0.09, 0.04), vec3(0.26, 0.17, 0.07), n3) * (0.75 + 0.5 * n4);
    vec3 c = mix(soil, litter, smoothstep(0.35, 0.65, n2 * 0.6 + n4 * 0.4));
    // Moss on the flats, in patches.
    float flat_ = smoothstep(0.75, 0.95, vGN.y);
    c = mix(c, vec3(0.07, 0.11, 0.03) * (0.8 + 0.5 * n3), smoothstep(0.5, 0.7, n1) * flat_ * 0.85);
    // Bare rock on the steep banks.
    float steep = 1.0 - smoothstep(0.55, 0.8, vGN.y);
    c = mix(c, vec3(0.22, 0.15, 0.1) * (0.7 + 0.5 * n2), steep * 0.85);
    // Wet and dark where it shelves into the water.
    c *= mix(1.0, 0.55, smoothstep(${(WL + 0.6).toFixed(2)}, ${(WL - 0.1).toFixed(2)}, vGW.y));
    // Under the canopy: broad soft dapples of shade (the sun here is ~13: on phones, with no shadow
    // maps, the open floor lit full went to pale cream), and a forest floor is dark anyway.
    float dap = gN(p * 0.09 + 2.0) * 0.6 + gN(p * 0.31 + 5.0) * 0.4;
    c *= 0.5 * mix(0.45, 1.0, smoothstep(0.35, 0.7, dap));
    diffuseColor.rgb = c;
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    // A little relief from the litter (world-space finite differences; no screen derivatives).
    vec2 p = vGW.xz * 2.2;
    float h0 = gN(p), hx = gN(p + vec2(0.3, 0.0)), hz = gN(p + vec2(0.0, 0.3));
    vec3 g = mat3(viewMatrix) * vec3(hx - h0, 0.0, hz - h0);
    float k = 1.0 - smoothstep(6.0, 25.0, length(vViewPosition));
    normal = normalize(normal - g * 0.9 * k);
  }`,
      );
  };
  m.customProgramCacheKey = () => 'ground21';
  return m;
}
