import * as THREE from 'three';

/**
 * World round 17: moss that reads as moss, not smooth green plastic. The cushions keep their geometry
 * (no shells: no extra passes); their own material adds, in the fragment shader:
 * - a fibre speckle: a fine world-space grain in the albedo (the pile of the moss), fading out with
 *   distance before it can shimmer;
 * - a colour breakup: yellow-green tufts, dark hollows and a few rusty sporophyte patches;
 * - fuzz: at grazing angles the fibres catch the light and the cushion's rim goes pale and soft.
 */
export function makeMossMaterial(flora: THREE.Material): THREE.Material {
  const m = (flora as THREE.MeshStandardMaterial).clone();
  m.name = 'moss';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMossP;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  {
    vec4 mp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      mp = instanceMatrix * mp;
    #endif
    vMossP = (modelMatrix * mp).xyz;
  }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vMossP;
float mH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float mN(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mH(i), mH(i + vec3(1, 0, 0)), f.x), mix(mH(i + vec3(0, 1, 0)), mH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mH(i + vec3(0, 0, 1)), mH(i + vec3(1, 0, 1)), f.x), mix(mH(i + vec3(0, 1, 1)), mH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float tuft = mN(vMossP * 2.3);
    float clump = mN(vMossP * 4.0 + 3.1);
    vec3 tint = mix(vec3(0.85, 0.9, 0.72), vec3(1.14, 1.1, 0.84), smoothstep(0.3, 0.75, tuft));
    diffuseColor.rgb *= tint * mix(0.86, 1.04, clump);
    // Sporophytes: a rusty haze over a few patches.
    float spore = smoothstep(0.72, 0.86, mN(vMossP * 3.7 + 11.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 0.95, 0.55), spore * 0.5);
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    // The pile: a fine fibre speckle in the albedo and a fibre normal (a bump field through screen
    // derivatives drew zebra stripes at this scale), both fading out with distance before they shimmer.
    float dist = length(vViewPosition);
    float k = 1.0 - smoothstep(3.0, 9.0, dist);
    if (k > 0.0) {
      diffuseColor.rgb *= 1.0 + k * 0.16 * (mH(floor(vMossP * 90.0)) - 0.5);
      // Fibre normal: the world-space gradient of a soft tuft field (finite differences, no screen
      // derivatives) tilts the shading tuft by tuft.
      vec3 q = vMossP * 14.0;
      float h0 = mN(q);
      vec3 g = vec3(mN(q + vec3(0.25, 0.0, 0.0)), mN(q + vec3(0.0, 0.25, 0.0)), mN(q + vec3(0.0, 0.0, 0.25))) - h0;
      vec3 gv = mat3(viewMatrix) * g;
      vec3 bn = normal - (gv - normal * dot(gv, normal)) * 1.6 * k;
      float bl = length(bn);
      if (bl > 1e-6) normal = bn / bl;
    }
    // Fuzz: fibres lit at grazing angles soften and pale the rim.
    float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.4 + vec3(0.02, 0.025, 0.008), rim * 0.45);
  }`,
      );
  };
  m.customProgramCacheKey = () => 'moss17';
  return m;
}
