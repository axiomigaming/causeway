import * as THREE from 'three';

/**
 * World round 17: moss that reads as moss, not smooth green plastic. The cushions keep their geometry
 * (no shells: no extra passes); their own material adds, in the fragment shader:
 * - a fibre normal: a fine world-space noise bumped through the screen derivatives (the pile of the
 *   moss), fading out with distance before it can shimmer;
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
    float clump = mN(vMossP * 7.0 + 3.1);
    vec3 tint = mix(vec3(0.72, 0.8, 0.55), vec3(1.25, 1.18, 0.78), smoothstep(0.3, 0.75, tuft));
    diffuseColor.rgb *= tint * mix(0.72, 1.08, clump);
    // Sporophytes: a rusty haze over a few patches.
    float spore = smoothstep(0.72, 0.86, mN(vMossP * 3.7 + 11.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 0.95, 0.55), spore * 0.5);
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    // The pile: a fine height field bumped through the screen derivatives (perturbNormalArb).
    float dist = length(vViewPosition);
    float k = 0.55 * (1.0 - smoothstep(4.0, 14.0, dist));
    if (k > 0.0) {
      float h = mN(vMossP * 34.0) * 0.6 + mN(vMossP * 71.0) * 0.4;
      vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
      float dhx = dFdx(h), dhy = dFdy(h);
      vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
      float det = dot(dpx, r1);
      vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
      vec3 bn = abs(det) * normal - grad * k;
      float bl = length(bn);
      if (bl > 1e-6) normal = bn / bl;
    }
    // Fuzz: fibres lit at grazing angles soften and pale the rim.
    float rim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.55 + vec3(0.025, 0.03, 0.01), rim * 0.55);
  }`,
      );
  };
  m.customProgramCacheKey = () => 'moss17';
  return m;
}
