import * as THREE from 'three';
import { WATER_Y } from './water';

/**
 * Stone by the water (world art, round 5). Two cheap terms patched into the kit's stone, rock and
 * wood materials:
 *  - caustics: sunlight thrown back off the rippling water dances in bright, wandering lines over
 *    the stone in a band just above the surface, strongest on faces turned to the water;
 *  - wet stone: a darker, glossier band at the waterline, and around the foot of each waterfall
 *    (the nearest few, fed from the track every frame) everything within the spray is wet and shines.
 * Both are functions of world position only: no extra passes, no textures.
 */
export const MAX_FEET = 6;

export const causticUniforms = {
  uCausticTime: { value: 0 },
  uCausticStrength: { value: 1 },
  /** Scanned detail normals on the near stone (0 = off: the lightest tier). */
  uDetail: { value: 1 },
  uDetailReady: { value: 0 },
  uDetailMap: { value: null as THREE.Texture | null },
  /** Rain: every surface wet (0..1), on top of the waterline and spray. */
  uRainWet: { value: 0 },
  /** xyz: foot of a waterfall (world), w: reach of its spray (m). w = 0: unused. */
  uFeet: { value: Array.from({ length: MAX_FEET }, () => new THREE.Vector4(0, -1e4, 0, 0)) },
};

const VERT_PARS = /* glsl */ `
varying vec3 vWetPos;
varying vec3 vWetN;
#ifdef WET_EDGES
attribute float aHalf;
varying vec3 vTileP;
varying float vHalf;
#endif`;

const VERT = /* glsl */ `
{
  vec4 wetP = vec4(transformed, 1.0);
  vec3 wetN = objectNormal;
  #ifdef USE_INSTANCING
    wetP = instanceMatrix * wetP;
    wetN = mat3(instanceMatrix) * wetN;
  #endif
  vWetPos = (modelMatrix * wetP).xyz;
  vWetN = normalize(mat3(modelMatrix) * wetN);
  #ifdef WET_EDGES
    vTileP = position;
    vHalf = aHalf;
  #endif
}`;

const FRAG_PARS = /* glsl */ `
varying vec3 vWetPos;
varying vec3 vWetN;
#ifdef WET_EDGES
varying vec3 vTileP;
varying float vHalf;
#endif
uniform float uCausticTime;
uniform float uCausticStrength;
uniform vec4 uFeet[${MAX_FEET}];
uniform float uRainWet;
// Iterated turbulence (after joltz0r's water shader): bright filaments that wander and merge.
float causticAt(vec2 w, float t) {
  vec2 p = mod(w, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    // (Guarded: a sine of exactly 0 divided by zero; keep every term finite.)
    float sx = sin(i.x + tt), sy = cos(i.y + tt);
    sx = (sx < 0.0 ? -1.0 : 1.0) * max(abs(sx), 1e-3);
    sy = (sy < 0.0 ? -1.0 : 1.0) * max(abs(sy), 1e-3);
    c += 1.0 / max(length(vec2(p.x * 0.005 / sx, p.y * 0.005 / sy)), 1e-3);
  }
  c = clamp(c / 3.0, 0.0, 8.0);
  c = 1.17 - pow(c, 1.4);
  return min(pow(abs(c), 8.0), 8.0);
}
float pdH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pdN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pdH(i), pdH(i + vec2(1, 0)), f.x), mix(pdH(i + vec2(0, 1)), pdH(i + vec2(1, 1)), f.x), f.y);
}
float wetAt(vec3 p) {
  float h = p.y - (${WATER_Y.toFixed(3)});
  float wet = smoothstep(0.5, 0.04, h) * step(-1.5, h);
  for (int k = 0; k < ${MAX_FEET}; k++) {
    vec4 f = uFeet[k];
    if (f.w <= 0.0) continue;
    float d = distance(p.xz, f.xz);
    wet = max(wet, smoothstep(f.w, f.w * 0.35, d) * smoothstep(6.0, 0.5, p.y - f.y));
  }
  return wet;
}`;

// Round 11: detail normals from a photoscan. The baked atlases hold the shape of each stone; up close
// they read as soft clay. detail_stone.webp is a 1K tile cut from the Poly Haven "rock_face" scan
// (CC0, see THIRD_PARTY_NOTICES.md): R,G = its tangent normal, B = cavity (AO and height). It is
// projected three ways in world space (triplanar, each plane's tilt added to the surface normal), at
// two scales, and fades out with distance, so the near walls, pavers and boards get real pores, grain
// and pitting. It is fetched only on the tiers that use it (ensureDetailMap); until it arrives the
// term is simply off.
import detailUrl from './detail_stone.webp?url';

let detailMap: THREE.Texture | null = null;
export function ensureDetailMap(): void {
  if (detailMap || typeof document === 'undefined') return;
  detailMap = new THREE.TextureLoader().load(detailUrl, () => (causticUniforms.uDetailReady.value = 1));
  detailMap.wrapS = detailMap.wrapT = THREE.RepeatWrapping;
  detailMap.colorSpace = THREE.NoColorSpace;
  detailMap.anisotropy = 4;
  causticUniforms.uDetailMap.value = detailMap;
}

const DETAIL_PARS = /* glsl */ `
uniform float uDetail;
uniform float uDetailReady;
uniform sampler2D uDetailMap;
// One triplanar lookup: xyz = world-space tilt to add to the normal, w = cavity (0 deep .. 1 proud).
vec4 dtTri(vec3 p, vec3 w, vec3 n) {
  vec3 tx = texture2D(uDetailMap, p.zy).rgb, ty = texture2D(uDetailMap, p.xz).rgb, tz = texture2D(uDetailMap, p.xy).rgb;
  vec2 ax = tx.rg * 2.0 - 1.0, ay = ty.rg * 2.0 - 1.0, az = tz.rg * 2.0 - 1.0;
  vec3 s = sign(n);
  vec3 d = w.x * vec3(0.0, ax.y, ax.x * s.x) + w.y * vec3(ay.x * s.y, 0.0, ay.y) + w.z * vec3(az.x * s.z, az.y, 0.0);
  return vec4(d, dot(w, vec3(tx.b, ty.b, tz.b)));
}`;

const FRAG_DETAIL = /* glsl */ `
if (uDetail > 0.0 && uDetailReady > 0.0) {
  float dist = length(vViewPosition);
  float k = uDetail * DETAIL_AMP * (1.0 - smoothstep(14.0, 30.0, dist));
  if (k > 0.0) {
    vec3 wn = vWetN;
    vec3 w = pow(abs(wn), vec3(4.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    vec4 a = dtTri(vWetPos * 0.8, w, wn);
    // A finer octave (offset so the two tiles never line up), faded before it shimmers.
    float fine = 1.0 - smoothstep(4.0, 10.0, dist);
    vec4 b = dtTri(vWetPos * 2.9 + 0.37, w, wn);
    vec3 dw = a.xyz * 1.5 + b.xyz * 0.8 * fine;
    vec3 dv = mat3(viewMatrix) * dw;
    vec3 bn = normal + dv * k;
    float bl = length(bn);
    // NaN guard (an exactly cancelling tilt would be normalize(0), which bloom smeared over the frame).
    if (bl > 1e-4) normal = bn / bl;
    float cav = mix(a.w, a.w * (0.6 + 0.8 * b.w), fine);
    diffuseColor.rgb *= mix(1.0, 0.62 + 0.7 * cav, min(1.0, k * 1.2));
  }
}`;

const FRAG_WET = /* glsl */ `
#ifdef WET_MOSS
{
  // Pale, grey texels on faces turned to the sky (dust, bleached lichen in the bake) read as snow
  // under the low sun: on rock and cliff they become moss.
  float ml = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float msat = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) - min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b);
  float msr = msat / max(max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b), 1e-3);
  float mk = smoothstep(0.55, 0.85, vWetN.y) * smoothstep(0.18, 0.32, ml) * (1.0 - smoothstep(0.3, 0.5, msr));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.14, 0.035) * (0.8 + ml), mk);
}
#endif
// Rain wets everything: sky-facing faces most, walls in streaks.
float wetK = max(wetAt(vWetPos), uRainWet * mix(0.55, 1.0, smoothstep(0.2, 0.8, vWetN.y)));
diffuseColor.rgb *= mix(1.0, 0.66, wetK);
// Wet faces shine; flat ones less (a mirror-flat wet slab would just show the sky's blue).
roughnessFactor = mix(roughnessFactor, mix(0.22, 0.45, abs(vWetN.y)), wetK);
#ifdef WET_EDGES
if (vHalf > 0.0) {
  // World round 12: where the paving meets the parapets — grime and wear in the last ~0.7 m, moss
  // creeping out of the joint, dead leaves gathered against the wall. The slab's own local x is the
  // distance across the path (aHalf: half its width), so it follows every tile, mirrored or turned.
  float e = smoothstep(vHalf - 0.75, vHalf - 0.04, abs(vTileP.x));
  float n1 = pdN(vWetPos.xz * 3.1);
  float n2 = pdN(vWetPos.xz * 11.0 + 2.0);
  diffuseColor.rgb *= mix(1.0, mix(0.6, 0.82, n1), e);
  float moss = e * e * smoothstep(0.42, 0.68, n1 * 0.7 + n2 * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.14, 0.05) * (0.7 + 0.6 * n2), moss * 0.75);
  float litter = e * smoothstep(0.78, 0.84, pdN(vWetPos.xz * 6.5 + 9.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.3, 0.18, 0.07), vec3(0.46, 0.32, 0.12), n2), litter * 0.85);
  roughnessFactor = mix(roughnessFactor, 0.95, e * 0.5);
}
#endif
{
#ifdef WET_PUDDLES
  // Round 11 detail: puddles standing in the hollows of the slabs (a few when dry, spreading with
  // the rain): dark, still, mirror-smooth, with a damp rim.
  float up = smoothstep(0.92, 0.98, vWetN.y);
  if (up > 0.0) {
    float pn = pdN(vWetPos.xz * 0.42) * 0.65 + pdN(vWetPos.xz * 1.3 + 4.1) * 0.35;
    float lvl = mix(0.74, 0.56, uRainWet);
    float pud = smoothstep(lvl, lvl + 0.03, pn) * up;
    float rim = smoothstep(lvl - 0.08, lvl, pn) * up;
    diffuseColor.rgb *= mix(1.0, 0.8, rim) * mix(1.0, 0.55, pud);
    roughnessFactor = mix(mix(roughnessFactor, 0.4, rim * 0.6), 0.04, pud);
  }
#endif
}`;

const FRAG_CAUSTIC = /* glsl */ `
{
  float ch = vWetPos.y - (${WATER_Y.toFixed(3)});
  float band = smoothstep(2.8, 0.25, ch) * smoothstep(-0.25, 0.08, ch);
  float facing = 0.3 + 0.7 * (1.0 - abs(vWetN.y));
  float k = band * facing * uCausticStrength;
  if (k > 0.01) {
    vec2 cw = vWetPos.xz * 0.55 + vec2(vWetPos.y * 0.45, -vWetPos.y * 0.3);
    float cs = causticAt(cw, uCausticTime * 0.55) + 0.6 * causticAt(cw * 1.7 + 2.1, uCausticTime * 0.7);
    totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.93, 0.78) * min(cs, 2.5) * k * 1.6;
  }
}`;

/** Patch a standard material (once). Chains any existing onBeforeCompile. */
export function patchWetStone(m: THREE.Material, caustics = true, moss = false, detail = 0, puddles = false, edges = false): void {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial || sm.userData.wetStone) return;
  sm.userData.wetStone = true;
  const prev = sm.onBeforeCompile;
  const prevKey = sm.customProgramCacheKey?.bind(sm);
  sm.onBeforeCompile = (shader, renderer) => {
    prev?.call(sm, shader, renderer);
    Object.assign(shader.uniforms, causticUniforms);
    if (moss) shader.fragmentShader = '#define WET_MOSS\n' + shader.fragmentShader;
    if (puddles) shader.fragmentShader = '#define WET_PUDDLES\n' + shader.fragmentShader;
    if (edges) {
      shader.vertexShader = '#define WET_EDGES\n' + shader.vertexShader;
      shader.fragmentShader = '#define WET_EDGES\n' + shader.fragmentShader;
    }
    if (detail > 0) shader.fragmentShader = `#define DETAIL_AMP ${detail.toFixed(3)}\n` + shader.fragmentShader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${detail > 0 ? DETAIL_PARS : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${detail > 0 ? FRAG_DETAIL : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_WET}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${caustics ? FRAG_CAUSTIC : ''}`);
  };
  sm.customProgramCacheKey = () => `${prevKey?.() ?? ''}|wet${caustics ? 'c' : ''}${moss ? 'm' : ''}${puddles ? 'p' : ''}${edges ? 'e' : ''}${detail}`;
  sm.needsUpdate = true;
}

if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__caustics = causticUniforms;

const foot = new THREE.Vector4();
/** Feed the nearest falls' feet (in order of preference) and the clock. */
export function updateCaustics(time: number, feet: Iterable<THREE.Vector4>): void {
  causticUniforms.uCausticTime.value = time;
  const arr = causticUniforms.uFeet.value;
  let k = 0;
  for (const f of feet) {
    if (k >= MAX_FEET) break;
    arr[k++]!.copy(f);
  }
  for (; k < MAX_FEET; k++) arr[k]!.copy(foot.set(0, -1e4, 0, 0));
}
