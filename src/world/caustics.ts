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
  /** World round 16: the lightest tier's one planar detail fetch on the near paving (0 = off). */
  uDetailLite: { value: 0 },
  /** Rain: every surface wet (0..1), on top of the waterline and spray. */
  uRainWet: { value: 0 },
  /**
   * World round 28: the world's stone (style.ts STONES): rgb the family's colour (relative to the
   * baked sandstone's own luminance), w how far the masonry is moved to it (0: the sandstone as baked).
   */
  uStoneFamily: { value: new THREE.Vector4(1, 1, 1, 0) },
  /**
   * World round 29: what a family adds over its colour (style.ts StoneFamily.rich): x value contrast,
   * y lichen, z moss, w wet edges (0: none, the families before round 29).
   */
  uStoneRich: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** World round 28: weathering across a wall (0..1): broad stains and streaks that break the atlas's repeat. */
  uStoneVar: { value: 1 },
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
uniform vec4 uStoneFamily;
uniform vec4 uStoneRich;
uniform float uStoneVar;
// World round 29: a stone family's wet edges (set with its colour, read by the wet term's roughness).
float famWet = 0.0;
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
uniform float uDetailLite;
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
  #ifdef DETAIL_FAR
  // Hero landmarks (40–90 m away, 7–11x scale): the scan at a landmark scale, never faded.
  float k = uDetail * DETAIL_AMP;
  #else
  // QA hunt #13: within a few metres of the lens the baked atlas is magnified past its texel density
  // (the filtering is already trilinear at 16x anisotropy), so a pier or wall beside the lens read
  // as soft clay. The scan's grain carries more of the surface there: 1.8x inside 4 m, 1x from 9 m.
  float k = uDetail * DETAIL_AMP * (1.0 - smoothstep(14.0, 30.0, dist)) * (1.0 + 0.8 * (1.0 - smoothstep(4.0, 9.0, dist)));
  #endif
  if (k > 0.0) {
    vec3 wn = vWetN;
    vec3 w = pow(abs(wn), vec3(4.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    #ifdef DETAIL_FAR
    vec4 a = dtTri(vWetPos * 0.11, w, wn);
    float fine = 1.0;
    vec4 b = dtTri(vWetPos * 0.37 + 0.37, w, wn);
    #else
    vec4 a = dtTri(vWetPos * 0.8, w, wn);
    // A finer octave (offset so the two tiles never line up), faded before it shimmers.
    float fine = 1.0 - smoothstep(4.0, 10.0, dist);
    vec4 b = dtTri(vWetPos * 2.9 + 0.37, w, wn);
    #endif
    vec3 dw = a.xyz * 1.5 + b.xyz * 0.8 * fine;
    // World round 27 (the coordinator: a pier ~4 m from the lens still read blotchy and soft — the
    // atlas magnified past its texels): within 6 m a third, finest octave of the scan (offset again,
    // ~14 cm a tile): crisp grains, pits and hairline cracks in the normal and in the albedo, over the
    // atlas's soft blotches. Faded out before it could shimmer.
    float finest = 0.0;
    vec4 c3 = vec4(0.0, 0.0, 0.0, 0.5);
    #ifndef DETAIL_FAR
    finest = 1.0 - smoothstep(2.5, 6.0, dist);
    if (finest > 0.0) {
      c3 = dtTri(vWetPos * 7.3 + 1.91, w, wn);
      dw += c3.xyz * 0.6 * finest;
    }
    #endif
    vec3 dv = mat3(viewMatrix) * dw;
    vec3 bn = normal + dv * k;
    float bl = length(bn);
    // NaN guard (an exactly cancelling tilt would be normalize(0), which bloom smeared over the frame).
    if (bl > 1e-4) normal = bn / bl;
    float cav = mix(a.w, a.w * (0.6 + 0.8 * b.w), fine);
    cav = mix(cav, cav * (0.7 + 0.6 * c3.w), finest);
    diffuseColor.rgb *= mix(1.0, 0.62 + 0.7 * cav, min(1.0, k * 1.2));
  }
}
#ifdef WET_EDGES
// World round 16, the lightest tier: the paving alone gets one planar fetch of the scan in the
// nearest metres (the soft mobile slab textures repeated one blemish slab after slab).
else if (uDetailLite > 0.0 && uDetailReady > 0.0) {
  // (Top faces only — a planar fetch streaks down a slab's sides — and softer than the full tiers'.)
  float k = uDetailLite * DETAIL_AMP * 0.6 * (1.0 - smoothstep(7.0, 18.0, length(vViewPosition))) * smoothstep(0.75, 0.95, vWetN.y);
  if (k > 0.0) {
    vec3 t = texture2D(uDetailMap, vWetPos.xz * 0.8).rgb;
    vec2 a = t.rg * 2.0 - 1.0;
    vec3 bn = normal + (mat3(viewMatrix) * vec3(a.x, 0.0, a.y)) * 1.5 * k;
    float bl = length(bn);
    if (bl > 1e-4) normal = bn / bl;
    diffuseColor.rgb *= mix(1.0, 0.62 + 0.7 * t.b, min(1.0, k * 1.2));
  }
}
#elif !defined(DETAIL_FAR)
// World round 28, the lightest tier (the critic: a pier block and the collapse's blocks beside the lens
// read as big blurry cubes): masonry within ~7-15 m of the lens takes one fetch of the scan, on the plane
// its face is most turned to (~70 cm a tile, between the full tiers' two octaves): grains, pits and edges
// where the atlas is magnified past its texels. Faded out before it could shimmer.
else if (uDetailLite > 0.0 && uDetailReady > 0.0) {
  float dist = length(vViewPosition);
  float k = uDetailLite * DETAIL_AMP * (1.0 - smoothstep(7.0, 15.0, dist));
  if (k > 0.0) {
    vec3 an = abs(vWetN);
    vec3 s = sign(vWetN);
    vec3 t;
    vec3 dw;
    if (an.x >= an.y && an.x >= an.z) {
      t = texture2D(uDetailMap, vWetPos.zy * 1.4 + 0.37).rgb;
      vec2 a = t.rg * 2.0 - 1.0;
      dw = vec3(0.0, a.y, a.x * s.x);
    } else if (an.y >= an.z) {
      t = texture2D(uDetailMap, vWetPos.xz * 1.4 + 0.37).rgb;
      vec2 a = t.rg * 2.0 - 1.0;
      dw = vec3(a.x * s.y, 0.0, a.y);
    } else {
      t = texture2D(uDetailMap, vWetPos.xy * 1.4 + 0.37).rgb;
      vec2 a = t.rg * 2.0 - 1.0;
      dw = vec3(a.x * s.z, a.y, 0.0);
    }
    vec3 bn = normal + (mat3(viewMatrix) * dw) * 1.3 * k;
    float bl = length(bn);
    if (bl > 1e-4) normal = bn / bl;
    diffuseColor.rgb *= mix(1.0, 0.6 + 0.75 * t.b, min(1.0, k * 1.1));
  }
}
#endif`;

/**
 * World round 19: specular anti-aliasing (Kaplanyan / Tokuyoshi, after Toksvig). The final shading
 * normal (normal map and scanned detail included) varies inside a pixel; widen the roughness by that
 * variance so a sharp wet lobe cannot alias into per-pixel sparkle. Inserted after the normal is final.
 */
const FRAG_SPEC_AA = /* glsl */ `
{
  vec3 dnx = dFdx(normal), dny = dFdy(normal);
  float variance = 0.25 * (dot(dnx, dnx) + dot(dny, dny));
  float kernel = min(2.0 * variance, 0.18);
  roughnessFactor = sqrt(clamp(roughnessFactor * roughnessFactor + kernel, 0.0, 1.0));
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
// (World round 19: wet stone shines less with distance: past ~10 m a pixel covers too many bumps for a
// 0.22 lobe, and the low sun turned them into per-pixel glitter that bloom spread into soft squares.)
float wetRough = mix(0.22, 0.45, abs(vWetN.y));
wetRough = max(wetRough, mix(0.22, 0.42, smoothstep(10.0, 45.0, length(vViewPosition))));
roughnessFactor = mix(roughnessFactor, wetRough, wetK);
// (World round 29: a stone family's wet edges, see FRAG_FAMILY.)
roughnessFactor = mix(roughnessFactor, 0.3, famWet);
{
  // World round 27 (the owner: where stone meets the water the line is hard, as if cut): the water laps
  // the stone. A swash a few centimetres high rides up and down the face in slow waves, leaving a band
  // of soaked, darkened stone and a broken line of foam at its edge; just under the surface the stone
  // takes the water's own green, so the opaque water's edge has something to blend into.
  float hW = vWetPos.y - (${WATER_Y.toFixed(3)});
  if (hW > -0.2 && hW < 0.45) {
    float lapT = uCausticTime;
    float swash = 0.035 + 0.04 * sin(lapT * 1.1 + dot(vWetPos.xz, vec2(0.83, 0.57))) + 0.02 * sin(lapT * 2.3 + dot(vWetPos.xz, vec2(-1.7, 2.1)));
    float soak = smoothstep(swash + 0.3, swash, hW);
    diffuseColor.rgb *= mix(1.0, 0.58, soak);
    roughnessFactor = mix(roughnessFactor, 0.28, soak * 0.8);
    float lapN = pdN(vWetPos.xz * 2.6 + vec2(lapT * 0.32, -lapT * 0.21)) * 0.6 + pdN(vWetPos.xz * 8.0 + vWetPos.y * 3.0 - lapT * 0.5) * 0.4;
    float line = smoothstep(swash + 0.08, swash + 0.02, hW) * smoothstep(swash - 0.07, swash - 0.015, hW);
    // Foam clings to the faces the water runs along; a flat top at the swash's height would take it
    // over its whole face (white tiles).
    float foam = line * smoothstep(0.3, 0.7, lapN) * (1.0 - smoothstep(0.45, 0.8, abs(vWetN.y)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.77, 0.73), foam * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.11, 0.09), smoothstep(0.0, -0.12, hW) * 0.7);
  }
}
#ifdef WET_EDGES
if (vHalf > 0.0) {
  // World round 12: where the paving meets the parapets — grime and wear in the last ~0.7 m, moss
  // creeping out of the joint, dead leaves gathered against the wall. The slab's own local x is the
  // distance across the path (aHalf: half its width), so it follows every tile, mirrored or turned.
  float e = smoothstep(vHalf - 0.62, vHalf - 0.04, abs(vTileP.x));
  float n1 = pdN(vWetPos.xz * 3.1);
  float n2 = pdN(vWetPos.xz * 11.0 + 2.0);
  diffuseColor.rgb *= mix(1.0, mix(0.48, 0.74, n1), e);
  float moss = e * smoothstep(0.4, 0.62, n1 * 0.7 + n2 * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.14, 0.05) * (0.7 + 0.6 * n2), moss * 0.75);
  float litter = e * smoothstep(0.7, 0.76, pdN(vWetPos.xz * 6.5 + 9.0));
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

/**
 * World round 28. Two terms on the baked albedo, before any lighting:
 *  - weathering (the critic: one brick wall, repeated tile after tile down a gorge): broad stains and
 *    warm/cool patches a few metres across, and darker run-off streaks down vertical faces, all in world
 *    space, so no two stretches of the same wall piece match;
 *  - the world's stone family (the critic: worlds 3 and 7 the same sandstone causeway): the masonry is
 *    moved toward the family's colour at the baked texel's own luminance, keeping a little of its chroma,
 *    so a limestone, basalt or red tezontle world keeps every block's grain and wear.
 * Four value-noise taps; no texture reads (every tier).
 */
/** How much of the baked texel's own chroma a stone family keeps (its grain and stains, not its hue). */
export const FAMILY_CHROMA = 0.08;
const FRAG_FAMILY = /* glsl */ `
{
  vec3 sp = vWetPos;
  float wA = pdN(sp.xz * 0.23 + sp.y * vec2(0.17, -0.11));
  float wC = pdN(sp.xz * 0.9 - sp.y * 0.6 + 11.0);
  float wB = pdN(vec2((sp.x + sp.z) * 1.7, sp.y * 0.3) + 5.3);
  float vary = uStoneVar * STONE_VAR;
  diffuseColor.rgb *= 1.0 + vary * ((wA - 0.5) * 0.38 + (wC - 0.5) * 0.16);
  diffuseColor.rgb *= 1.0 - vary * (1.0 - abs(vWetN.y)) * smoothstep(0.55, 0.82, wB) * smoothstep(0.3, 0.7, wA) * 0.3;
  diffuseColor.rgb *= mix(vec3(1.0), mix(vec3(0.93, 0.98, 1.06), vec3(1.06, 1.0, 0.92), wA), 0.7 * vary);
  float fl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 fam = fl * uStoneFamily.rgb + (diffuseColor.rgb - vec3(fl)) * ${FAMILY_CHROMA.toFixed(3)};
  diffuseColor.rgb = mix(diffuseColor.rgb, max(fam, vec3(0.0)), uStoneFamily.w * STONE_FAMILY);
  // World round 29 (the critic: world 7's basalt cold, grey and dull beside the others): a family may
  // add value contrast about its own middle tone (the joints and the bake's shade deeper, the dressed
  // faces brighter), moss in the joints and on the tops, lichen on the open faces (grey-green crusts,
  // rust-orange spots) and wet edges (water held in the joints and running down the faces: darker and
  // glossy, see FRAG_WET). In world space, so no two blocks match.
  float famK = uStoneFamily.w * STONE_FAMILY;
  if (famK > 0.0 && uStoneRich.x + uStoneRich.y + uStoneRich.z + uStoneRich.w > 0.0) {
    vec3 c = diffuseColor.rgb;
    float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
    float mid = 0.26 * max(dot(uStoneFamily.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.05);
    float r = l / mid;
    c *= mix(1.0, pow(r, uStoneRich.x), famK);
    float crev = 1.0 - smoothstep(0.45, 0.95, r);
    float up = smoothstep(0.5, 0.85, vWetN.y);
    float n1 = pdN(sp.xz * 1.7 + sp.y * 0.9);
    float n2 = pdN(sp.xz * 5.3 - sp.y * 2.1 + 3.7);
    float moss = uStoneRich.z * clamp(crev * 0.9 + up * smoothstep(0.4, 0.65, n1), 0.0, 1.0) * smoothstep(0.3, 0.6, n1 * 0.6 + n2 * 0.4);
    c = mix(c, vec3(0.05, 0.068, 0.022) * (0.75 + 0.6 * n2), moss * famK);
    float open = (1.0 - crev) * (1.0 - moss);
    float lp = smoothstep(0.56, 0.68, pdN(sp.xz * 2.3 + sp.y * vec2(1.1, -0.7) + 7.0)) * smoothstep(0.2, 0.7, n2) * open;
    float lo = smoothstep(0.83, 0.88, pdN(sp.xz * 7.3 - sp.y * vec2(2.3, 1.7) + 1.3)) * smoothstep(0.45, 0.7, n1) * open;
    c = mix(c, vec3(0.26, 0.27, 0.22) * (0.8 + 0.4 * n2), lp * uStoneRich.y * 0.8 * famK);
    c = mix(c, vec3(0.34, 0.2, 0.08) * (0.8 + 0.4 * n1), lo * uStoneRich.y * 0.6 * famK);
    float run = (1.0 - abs(vWetN.y)) * smoothstep(0.55, 0.78, pdN(vec2((sp.x + sp.z) * 2.2, sp.y * 0.35) + 2.0));
    famWet = uStoneRich.w * famK * clamp(max(crev * 0.8, run) * (1.0 - moss), 0.0, 1.0);
    c *= 1.0 - 0.3 * famWet;
    diffuseColor.rgb = c;
  }
}`;

/** Patch a standard material (once). Chains any existing onBeforeCompile. */
export function patchWetStone(m: THREE.Material, caustics = true, moss = false, detail = 0, puddles = false, edges = false, far = false, family = 1, vary = 1): void {
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
    if (far) shader.fragmentShader = '#define DETAIL_FAR\n' + shader.fragmentShader;
    if (edges) {
      shader.vertexShader = '#define WET_EDGES\n' + shader.vertexShader;
      shader.fragmentShader = '#define WET_EDGES\n' + shader.fragmentShader;
    }
    if (detail > 0) shader.fragmentShader = `#define DETAIL_AMP ${detail.toFixed(3)}\n` + shader.fragmentShader;
    const fam = family > 0 || vary > 0;
    if (fam) shader.fragmentShader = `#define STONE_FAMILY ${family.toFixed(3)}\n#define STONE_VAR ${vary.toFixed(3)}\n` + shader.fragmentShader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\n${fam ? FRAG_FAMILY : ''}`)
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}\n${detail > 0 ? DETAIL_PARS : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${detail > 0 ? FRAG_DETAIL : ''}\n${FRAG_SPEC_AA}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAG_WET}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${caustics ? FRAG_CAUSTIC : ''}`);
  };
  sm.customProgramCacheKey = () => `${prevKey?.() ?? ''}|wet28${caustics ? 'c' : ''}${moss ? 'm' : ''}${puddles ? 'p' : ''}${edges ? 'e' : ''}${far ? 'f' : ''}${detail}|${family}|${vary}`;
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

// World round 23: near bark. The bark atlas is 1K for every trunk, limb and root in the kit: up close
// (the crash cameras sit beside the parapets, where the giant roots arch over) it read as a soft,
// blotchy green tube. detail_bark.webp is a 512 tile cut from the Poly Haven "bark_brown_02" scan
// (CC0, see THIRD_PARTY_NOTICES.md): R,G its tangent normal, B cavity. Projected three ways in world
// space at two scales, it gives the near bark real furrows, plates and pores, darkens the furrows,
// and fades out by 16 m. Fetched on every tier (it is small and the close-ups happen on phones too).
import barkDetailUrl from './detail_bark.webp?url';

const barkUniforms = {
  uBarkMap: { value: null as THREE.Texture | null },
  uBarkReady: { value: 0 },
};
let barkMap: THREE.Texture | null = null;
function ensureBarkMap(): void {
  if (barkMap || typeof document === 'undefined') return;
  barkMap = new THREE.TextureLoader().load(barkDetailUrl, () => (barkUniforms.uBarkReady.value = 1));
  barkMap.wrapS = barkMap.wrapT = THREE.RepeatWrapping;
  barkMap.colorSpace = THREE.NoColorSpace;
  barkMap.anisotropy = 4;
  barkUniforms.uBarkMap.value = barkMap;
}

/** Near-camera bark furrows on the kit's bark material (see above). */
export function patchBark(m: THREE.Material): void {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial || sm.userData.barkDetail) return;
  sm.userData.barkDetail = true;
  ensureBarkMap();
  const prev = sm.onBeforeCompile;
  const prevKey = sm.customProgramCacheKey?.bind(sm);
  sm.onBeforeCompile = (shader, renderer) => {
    prev?.call(sm, shader, renderer);
    Object.assign(shader.uniforms, barkUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBkPos;\nvarying vec3 vBkN;\nvarying vec4 vBkG;\nattribute vec4 aGrain;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 bp = vec4(transformed, 1.0);
          vec3 bn = objectNormal;
          vec3 bg = aGrain.xyz;
          #ifdef USE_INSTANCING
            bp = instanceMatrix * bp;
            bn = mat3(instanceMatrix) * bn;
            bg = mat3(instanceMatrix) * bg;
          #endif
          vBkPos = (modelMatrix * bp).xyz;
          vBkN = normalize(mat3(modelMatrix) * bn);
          vBkG = vec4(mat3(modelMatrix) * bg, aGrain.w);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBkPos;
        varying vec3 vBkN;
        varying vec4 vBkG;
        uniform sampler2D uBarkMap;
        uniform float uBarkReady;
        // Triplanar: the scan's furrows run along its V, so each side plane keeps the frame's y as V.
        vec4 bkTri(vec3 p, vec3 w, vec3 n) {
          vec3 tx = texture2D(uBarkMap, p.zy).rgb, ty = texture2D(uBarkMap, p.xz).rgb, tz = texture2D(uBarkMap, p.xy).rgb;
          vec2 ax = tx.rg * 2.0 - 1.0, ay = ty.rg * 2.0 - 1.0, az = tz.rg * 2.0 - 1.0;
          vec3 s = sign(n);
          vec3 d = w.x * vec3(0.0, ax.y, ax.x * s.x) + w.y * vec3(ay.x * s.y, 0.0, ay.y) + w.z * vec3(az.x * s.z, az.y, 0.0);
          return vec4(d, dot(w, vec3(tx.b, ty.b, tz.b)));
        }
        float bkH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float bkN(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(bkH(i), bkH(i + vec3(1, 0, 0)), f.x), mix(bkH(i + vec3(0, 1, 0)), bkH(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(bkH(i + vec3(0, 0, 1)), bkH(i + vec3(1, 0, 1)), f.x), mix(bkH(i + vec3(0, 1, 1)), bkH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        // World round 29: the frame the furrows follow, as columns (x, the furrows' way, z): the way the
        // root, log or limb runs (grain.ts); world up where the grain is unsure (a root's foot on the ground).
        mat3 bkFrame(vec3 n) {
          vec3 t = vBkG.xyz - n * dot(vBkG.xyz, n);
          float sure = smoothstep(0.15, 0.45, vBkG.w) * step(1e-5, dot(t, t));
          if (sure < 0.5) return mat3(1.0);
          t = normalize(t);
          vec3 u1 = normalize(cross(t, abs(t.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          return mat3(u1, t, cross(u1, t));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // World round 29 (the critic: the roots read as green tubes): bark is bark. The atlas's own green
          // (moss baked on what was up when the piece was modelled: the side of a root laid flat) goes to
          // a brown-grey at the texel's value, greyer in weathered patches; moss only on what faces the sky
          // as placed, in patches with a broken edge.
          vec3 wn = normalize(vBkN);
          float bl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float gN = bkN(vBkPos * 0.9);
          // (Only the green goes: the bark's own browns stay, a little greyer in weathered patches.)
          float baked = smoothstep(-0.01, 0.03, diffuseColor.g - diffuseColor.r * 0.92);
          vec3 bc = mix(diffuseColor.rgb, bl * vec3(1.3, 0.95, 0.68), baked);
          bc = mix(bc, bl * vec3(1.06, 1.0, 0.93), 0.35 * smoothstep(0.45, 0.8, gN));
          float up = smoothstep(0.42, 0.82, wn.y);
          float mN = bkN(vBkPos * 1.6 + 3.1) * 0.65 + bkN(vBkPos * 6.0) * 0.35;
          float moss = up * smoothstep(0.42, 0.6, mN);
          vec3 mc = mix(vec3(0.07, 0.1, 0.03), vec3(0.17, 0.22, 0.06), bkN(vBkPos * 11.0));
          diffuseColor.rgb = mix(bc, mc, moss * 0.9);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uBarkReady > 0.0) {
          float bdist = length(vViewPosition);
          float k = 1.0 - smoothstep(6.0, 16.0, bdist);
          if (k > 0.0) {
            vec3 wn0 = normalize(vBkN);
            // (Projected in the grain's frame: the furrows run along the root.)
            mat3 F = bkFrame(wn0);
            vec3 wn = wn0 * F;
            vec3 bp = vBkPos * F;
            vec3 w = pow(abs(wn), vec3(4.0));
            w /= max(w.x + w.y + w.z, 1e-4);
            vec4 a = bkTri(bp * 1.6, w, wn);
            float fine = 1.0 - smoothstep(2.5, 7.0, bdist);
            vec4 b = bkTri(bp * 4.3 + 0.41, w, wn);
            vec3 dw = F * (a.xyz * 1.6 + b.xyz * 0.7 * fine);
            vec3 bn2 = normal + (mat3(viewMatrix) * dw) * k;
            float bl = length(bn2);
            if (bl > 1e-4) normal = bn2 / bl;
            float cav = mix(a.w, a.w * (0.65 + 0.7 * b.w), fine);
            // Deep, dark furrows between lighter plates (the soft atlas alone read as clay).
            diffuseColor.rgb *= mix(1.0, 0.42 + 0.95 * cav, k);
          }
        }`,
      );
  };
  sm.customProgramCacheKey = () => `${prevKey?.() ?? ''}|bark29`;
  sm.needsUpdate = true;
}

/**
 * World round 23: foliage at the lens. A crash or fall camera swinging close past the jungle dressing
 * filled a third of the frame with one blurred leaf. Leaves and plants within ~1.8 m of the camera
 * dissolve (a screen-space dither, so the alpha-tested cards need no sorting), gone inside 0.7 m.
 * Presentation only: shadows and the far leaf alpha (foliage.ts) are untouched.
 */
export function patchNearFade(m: THREE.Material): void {
  const sm = m as THREE.MeshStandardMaterial;
  if (sm.userData.nearFade) return;
  sm.userData.nearFade = true;
  const prev = sm.onBeforeCompile;
  const prevKey = sm.customProgramCacheKey?.bind(sm);
  sm.onBeforeCompile = (shader, renderer) => {
    prev?.call(sm, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `{
        float nf = smoothstep(0.7, 1.8, length(vViewPosition));
        float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (nf < 1.0 && ign > nf) discard;
      }
      #include <alphatest_fragment>`,
    );
  };
  sm.customProgramCacheKey = () => `${prevKey?.() ?? ''}|near23`;
  sm.needsUpdate = true;
}

/**
 * World round 29 (the critic: a cliff face beside the lens read as a smeared, stretched texture). The cliff
 * atlas is ~25 texels a metre over faces 20 m high, its scan box-projected and its streaks stretched
 * twelvefold in the bake: at 2-5 m every texel is a smear. Near the lens the face is re-textured in world
 * space, where every metre has the same density: the atlas keeps its broad light (the shade under each
 * shelf, the moss on it) at half its contrast and none of its hue; the stone's colour and grain come from
 * strata — beds of uneven thickness along the world's level, as the face was built (blender/stage.py
 * _sub_beds), each its own tone and hue, parted by dark seams that wander a little — and from the scan's
 * triplanar grain (the detail term, which also works the normals). By 40 m it is the atlas again.
 * Needs patchWetStone (its world position, normal and noise) on the same material.
 */
const FRAG_CLIFF = /* glsl */ `
{
  float cd = length(vViewPosition);
  float nk = 1.0 - smoothstep(22.0, 42.0, cd);
  cliffNear = nk;
  if (nk > 0.0) {
    vec3 at = diffuseColor.rgb;
    // (Its light from a coarser level of the atlas: the bake's streaks are a texel or two across.)
    #ifdef USE_MAP
    vec3 atc = diffuse * texture2D(map, vMapUv, 2.5).rgb;
    #else
    vec3 atc = at;
    #endif
    float al = max(dot(atc, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
    vec3 p = vWetPos;
    // Beds: two sets of uneven thickness (a thin one inside a thick one), their seams wandering
    // a few centimetres with the face.
    float warp = (pdN(p.xz * 0.11 + 3.7) - 0.5) * 0.7 + (pdN(vec2(p.x + p.z, p.y) * 0.9) - 0.5) * 0.08;
    float y1 = (p.y + warp) * 1.15;
    float b1 = floor(y1);
    float f1 = fract(y1);
    float y2 = (p.y + warp * 1.3) * 3.1 + pdH(vec2(b1, 4.1)) * 3.0;
    float b2 = floor(y2);
    float f2 = fract(y2);
    float h1 = pdH(vec2(b1, 17.3)), h2 = pdH(vec2(b2, 5.9)), h3 = pdH(vec2(b1, 41.7));
    float tone = (0.74 + 0.52 * h1) * (0.86 + 0.28 * h2);
    // Each thick bed its own hue: buff, rust, pale cream (as the bake's palette).
    vec3 hue = h3 < 0.45 ? vec3(1.48, 0.9, 0.62) : h3 < 0.78 ? vec3(1.62, 0.84, 0.52) : vec3(1.3, 0.98, 0.78);
    // Seams: dark partings at the thick beds' bases, fainter at the thin ones'.
    float seam = (1.0 - smoothstep(0.0, 0.07, f1)) * 0.6 + (1.0 - smoothstep(0.0, 0.05, f2)) * 0.3;
    // (The underside of each thick bed in shade a little way up: the beds read as ledges, not paint.)
    seam += (1.0 - smoothstep(0.0, 0.25, f1)) * 0.15;
    // Along each bed the stone varies (weathered and fresh patches), never streaked.
    float along = pdN(vec2((p.x - p.z) * 0.6, b1 * 3.3)) * 0.6 + pdN(p.xz * 2.3 + p.y * 1.7) * 0.4;
    tone *= 0.85 + 0.3 * along;
    // The atlas's broad light (the shade under each shelf) at a third of its contrast, about the face's
    // middle value; its darkest streaks clamped.
    float light = pow(clamp(al / 0.057, 0.2, 3.0), 0.33);
    vec3 st = 0.057 * hue * tone * light * (1.0 - min(seam, 0.75));
    // Moss on the shelves (what faces the sky, in patches), never in streaks down the face: the bake's
    // algae streaks — its darkest, greenest texels, stretched twelvefold — were the smear.
    float mN = pdN(p.xz * 1.3 + p.y * 0.7) * 0.6 + pdN(p.xz * 4.7 - p.y * 2.3) * 0.4;
    float moss = smoothstep(0.5, 0.85, vWetN.y) * smoothstep(0.42, 0.62, mN);
    st = mix(st, vec3(0.045, 0.06, 0.022) * (0.8 + 0.5 * mN) * light, moss);
    diffuseColor.rgb = mix(at, st, nk);
  }
}`;

/**
 * (The bake's streaks are in its normal and occlusion maps as much as in its colour — a face in shade,
 * lit by the sky alone, showed them all the same: near the lens the occlusion is read from a coarse level
 * and halved, and the baked normal relief two-thirds flattened toward the surface's own; the scan's
 * triplanar grain, added after it, carries the surface.)
 */
const FRAG_CLIFF_NORMAL = /* glsl */ `
normal = normalize(mix(normal, nonPerturbedNormal, 0.65 * cliffNear));`;
const CLIFF_AO = THREE.ShaderChunk.aomap_fragment.replace(
  'float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;',
  'float ambientOcclusion = ( mix( texture2D( aoMap, vAoMapUv ).r, texture2D( aoMap, vAoMapUv, 3.0 ).r, cliffNear ) - 1.0 ) * aoMapIntensity * ( 1.0 - 0.5 * cliffNear ) + 1.0;',
);

/** World round 29: the cliff faces re-textured near the lens (see FRAG_CLIFF). After patchWetStone. */
export function patchCliff(m: THREE.Material): void {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial || sm.userData.cliffRetex) return;
  sm.userData.cliffRetex = true;
  const prev = sm.onBeforeCompile;
  const prevKey = sm.customProgramCacheKey?.bind(sm);
  sm.onBeforeCompile = (shader, renderer) => {
    prev?.call(sm, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nfloat cliffNear = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_CLIFF}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_CLIFF_NORMAL}`)
      .replace('#include <aomap_fragment>', CLIFF_AO);
  };
  sm.customProgramCacheKey = () => `${prevKey?.() ?? ''}|cliff29`;
  sm.needsUpdate = true;
}
