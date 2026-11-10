import * as THREE from 'three';

/**
 * Foliage shading (world art, round 5), patched over the loader's leaf material (alpha test + wind):
 *  - the clumps' authored normals point out of each clump, so a card seen from behind must keep its
 *    normal (three flips it for double-sided materials, which turns half of every bush black);
 *  - sunlight through the leaves: looking toward the sun, leaves glow yellow-green;
 *  - large-scale colour drift across the jungle (fresher, yellower, bluer patches), so repeated
 *    clumps never read as copies;
 *  - a little darkening low in each plant (the inside of a mass is in its own shade).
 */
export const foliageUniforms = {
  uLeafTrans: { value: 1 },
  /** 1: cards seen edge-on dissolve (0 for QA). */
  uLeafEdge: { value: 1 },
  /**
   * 1 (Low, no MSAA): the alpha test cuts on the pixel's coverage, read from the atlas's soft edge
   * ramp, dithered in screen space (a stable 4×4 ordered pattern), which the FXAA pass resolves.
   * QA hunt: on phone Low the crowns' cut-outs stood as stair-stepped, blocky silhouettes.
   */
  uLeafSoft: { value: 0 },
};
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__foliage = foliageUniforms;

export function upgradeLeafMaterial(m: THREE.Material): void {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial || sm.userData.leaf5) return;
  sm.userData.leaf5 = true;
  // Blender 4.2 exports alpha-clipped materials as alphaMode BLEND, so the loader hands the leaves
  // over with depth writes off: anything drawn after a bush (a cliff behind it, a wall) painted
  // straight over it, and whole jungle masses vanished. They are alpha-tested and opaque.
  sm.transparent = false;
  sm.depthWrite = true;
  // The constant glow the loader gave the leaves is now directional (below).
  sm.emissive.setHex(0x0c1404);
  // The atlas clusters carry their own light and shade (rendered lit in Blender): lit again here
  // they would bleach on the sun side, so the albedo comes down a little and leans green.
  sm.color.setRGB(0.84, 0.9, 0.76);
  sm.roughness = 0.9;
  sm.envMapIntensity = 0.5;
  const prev = sm.onBeforeCompile;
  sm.userData.prevCompile = prev;
  sm.onBeforeCompile = (shader, renderer) => {
    prev?.call(sm, shader, renderer);
    shader.uniforms.uLeafTrans = foliageUniforms.uLeafTrans;
    shader.uniforms.uLeafEdge = foliageUniforms.uLeafEdge;
    shader.uniforms.uLeafSoft = foliageUniforms.uLeafSoft;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeafW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLeafW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLeafW;
        uniform float uLeafTrans;
        uniform float uLeafEdge;
        uniform float uLeafSoft;
        float leafBayer(vec2 f) {
          // 4×4 ordered dither, thresholds in (0, 1).
          vec2 p = mod(floor(f), 4.0);
          int i = int(p.x) + 4 * int(p.y);
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return (m[i] + 0.5) / 16.0;
        }
        float leafH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float leafN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(leafH(i), leafH(i + vec2(1, 0)), f.x), mix(leafH(i + vec2(0, 1)), leafH(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float lv = leafN(vLeafW.xz * 0.11) * 0.65 + leafN(vLeafW.xz * 0.37 + 7.0) * 0.35;
          diffuseColor.rgb *= mix(vec3(0.7, 0.8, 0.72), vec3(0.95, 0.9, 0.66), lv);
          // World round 27: and each plant its own (a ~1.3 m cell): side by side, two copies of one fern
          // or grass tuft were the same green, leaf for leaf — older and darker, fresher and yellower.
          float pc = leafH(floor(vLeafW.xz * 0.75) + 17.0);
          diffuseColor.rgb *= mix(vec3(0.82, 0.88, 0.8), vec3(1.08, 1.06, 0.88), pc);
          // A leaf facing the sun takes the full low sun: pale texels (fern tips, young fronds) would
          // burn out to white. A gamma on the albedo keeps the lights green and deepens the greens.
          // The atlas is painted bright (it reads under Blender's soft sky); under a sun of 13 a fern
          // facing it went to white. Bring it into the stone's albedo range.
          diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.15)) * 0.8;
        }`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `{
          // Round 9: far away a leaf card's mipmapped alpha thins out and its pale texels average up,
          // so distant crowns read as flat, pale cut-outs against the haze. Past ~30 m the silhouette
          // fills in (a softer alpha threshold) and the green deepens.
          float leafFar = smoothstep(30.0, 90.0, length(vLeafW - cameraPosition));
          #ifdef USE_MAP
          // Round 14 (clarity): the alpha comes from a mip no coarser than level 2. At the small mips a
          // whole card's alpha averages to one value, so with the softened threshold below each distant
          // card turned into one solid square (blocky 8-16 px tiles over the crowns, lit bright by the
          // translucency near the sun). The clamped mip keeps the card's leaf cut-out.
          {
            vec2 leafTs = vec2(textureSize(map, 0));
            vec2 lx = dFdx(vMapUv * leafTs), ly = dFdy(vMapUv * leafTs);
            float leafLod = 0.5 * log2(max(max(dot(lx, lx), dot(ly, ly)), 1e-8));
            diffuseColor.a = textureLod(map, vMapUv, clamp(leafLod, 0.0, 2.0)).a * opacity;
          }
          #endif
          diffuseColor.a = mix(diffuseColor.a, smoothstep(0.22, 0.55, diffuseColor.a), leafFar);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.82, 0.7), leafFar);
        }
        #if defined(USE_ALPHATEST) && !defined(ALPHA_TO_COVERAGE)
        if (uLeafSoft > 0.5) {
          // Round 28: the atlas now carries a soft alpha ramp at every leaf edge (world round 27), so the
          // filtered alpha itself says how much of this pixel the leaf covers: its distance from the
          // cut over its screen-space gradient, a ~1 px coverage ramp, dithered (stable 4x4) for FXAA to
          // resolve. (The round-22 block took four taps and cut each at the threshold, which threw that
          // ramp away and stippled every edge.) One fetch fewer than before, and the alpha is the one the
          // far-crown softening above already shaped.
          float aw = max(fwidth(diffuseColor.a), 0.02);
          float cov = clamp((diffuseColor.a - alphaTest) / aw + 0.5, 0.0, 1.0);
          if (cov <= leafBayer(gl_FragCoord.xy)) discard;
        } else if (diffuseColor.a < alphaTest) discard;
        #else
        #include <alphatest_fragment>
        #endif
        // Past the alpha test a leaf is opaque: the frame's alpha channel marks water for the
        // reflection pass, and a leaf left at its texel alpha (≤ 0.6 in the mips of a cluster)
        // was taken for water and painted over with the sky.
        // With alpha-to-coverage (MSAA tiers) the alpha IS the coverage: three's alphatest chunk has
        // already sharpened it to 1 inside the leaf and a ~1 px ramp at its edge, so it is left alone
        // there (only those edge samples carry < 1, and they resolve over what lies behind).
        #ifndef ALPHA_TO_COVERAGE
        diffuseColor.a = 1.0;
        #endif
        {
          // Cards seen edge-on smear their texture into streaks: dissolve them as they turn away.
          vec3 ng = normalize(cross(dFdx(vLeafW), dFdy(vLeafW)));
          float face = abs(dot(ng, normalize(cameraPosition - vLeafW)));
          if (uLeafEdge > 0.5 && leafH(gl_FragCoord.xy * 0.37 + vLeafW.xz) > smoothstep(0.06, 0.3, face)) discard;
          // Cinematics hook (round 15): leaves within ~0.75 m of the lens dissolve (screen dither; a wider
          // band stippled whole bushes dark), so
          // the low chase lens ducking under a lintel or brushing a banana plant at the path's edge
          // never fills the frame with one flat leaf card.
          float lensD = length(vLeafW - cameraPosition);
          if (leafH(gl_FragCoord.xy * 0.53 + 3.1) > smoothstep(0.3, 0.75, lensD)) discard;
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif
        {
          // A clump normal may face away from the eye (the far side of a card): keep its light, but
          // tip it toward the viewer so the sheen stays a leaf's, not a mirror's at grazing angles.
          vec3 eyeV = normalize(vViewPosition);
          float nv = dot(normal, eyeV);
          if (nv < 0.15) normal = normalize(normal + eyeV * (0.15 - nv));
          #ifdef USE_FOG
          // The side of a mass turned from the sun is in its own shade (the fill light behind the lens
          // would otherwise flatten every backlit bush to a pale card); its rim glows instead (below).
          float toSun = dot(normal, normalize((viewMatrix * vec4(fogSunDir, 0.0)).xyz));
          diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(-0.6, 0.5, toSun));
          #endif
        }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        // Leaves are matte: horizontal fronds seen from a low camera sit at grazing angles, where
        // Fresnel took the low sun to a white sheen that hid the leaf.
        material.specularColor *= 0.12;
        material.specularF90 *= 0.12;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_FOG
        {
          vec3 toFrag = normalize(vLeafW - cameraPosition);
          float into = max(dot(toFrag, fogSunDir), 0.0);
          float trans = pow(into, 6.0) * 0.45;
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.95, 0.55) * trans * uLeafTrans;
        }
        #endif`,
      );
  };
  const prevKey = sm.customProgramCacheKey?.bind(sm);
  sm.customProgramCacheKey = () => `${prevKey?.() ?? ''}|leaf5`;
  sm.needsUpdate = true;
}
