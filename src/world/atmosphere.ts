import * as THREE from 'three';
import { WATER_Y } from './water';

/**
 * Aerial perspective for every fogged material: exponential height fog (thick over the
 * water, thinning with altitude, integrated along the view ray so towers rise out of it)
 * and in-scattering toward the sun, so the haze glows gold looking into the light and
 * stays cooler looking away. A second, thin layer hugs the water: mist lying on it that
 * thickens with distance and wreathes the feet of the walls. It replaces three's fog
 * chunks, so it must be installed before any program compiles.
 *
 * The sun direction and the mist are live uniforms shared by every program (plain objects,
 * which three's uniform cloning passes by reference), so the light can turn with the route.
 */
export interface AtmosphereOptions {
  /** Warm haze away from the sun. */
  color: THREE.ColorRepresentation;
  /** Haze looking into the sun. */
  sunColor: THREE.ColorRepresentation;
  density: number;
  /** Per-metre falloff of density with height above the water. */
  falloff: number;
  /** Mist on the water: density at the surface (per metre) and its scale height (metres). */
  mistDensity: number;
  mistHeight: number;
}

export const ATMOSPHERE: AtmosphereOptions = {
  // Cool blue-green haze away from the sun (aerial perspective: depth layers fade toward the sky),
  // warm gold looking into the light.
  color: 0x8db2b9,
  sunColor: 0xf6d6a0,
  density: 0.0022,
  falloff: 0.05,
  mistDensity: 0.012,
  mistHeight: 1.1,
};

/** Shared by reference into every fogged program. Update the fields, never replace the objects. */
export const atmosphereUniforms = {
  fogSunDir: { value: { x: 0.3, y: 0.35, z: -0.88 } },
  /** x: time (s), y: mist density scale (0 = off), z: unused, w: overcast (0 clear .. 1: no warm sun glow in the haze). */
  fogMist: { value: { x: 0, y: 1, z: 0, w: 0 } },
  /** Round 11 looks: the sky's final tint (xyz) and desaturation (w), e.g. a storm's slate overcast. */
  skyLook: { value: { x: 1, y: 1, z: 1, w: 0 } },
  /** World round 19: the scene fog's colour (xyz) and density (w), for the backdrop's own haze. */
  skyHaze: { value: { x: 0.55, y: 0.7, z: 0.73, w: 0.0022 } },
};

export function setSkyLook(tint: readonly [number, number, number], desat: number, overcast = 0): void {
  const v = atmosphereUniforms.skyLook.value;
  [v.x, v.y, v.z] = tint;
  v.w = desat;
  atmosphereUniforms.fogMist.value.w = overcast;
}

let installed = false;

/** Give a ShaderMaterial made before installation (or by hand) the shared atmosphere uniforms. */
export function patchFogUniforms(m: THREE.Material): void {
  const sm = m as THREE.ShaderMaterial;
  if (!sm.isShaderMaterial || !sm.fog || !sm.uniforms) return;
  sm.uniforms.fogSunDir ??= { value: atmosphereUniforms.fogSunDir.value };
  sm.uniforms.fogMist ??= { value: atmosphereUniforms.fogMist.value };
}

export function setAtmosphereSun(dir: THREE.Vector3): void {
  const v = atmosphereUniforms.fogSunDir.value;
  v.x = dir.x;
  v.y = dir.y;
  v.z = dir.z;
}

export function setAtmosphereMist(time: number, amount: number, fog?: { color: THREE.Color; density: number }): void {
  const v = atmosphereUniforms.fogMist.value;
  v.x = time;
  v.y = amount;
  if (fog) {
    const h = atmosphereUniforms.skyHaze.value;
    h.x = fog.color.r;
    h.y = fog.color.g;
    h.z = fog.color.b;
    h.w = fog.density;
  }
}

export function installAtmosphere(scene: THREE.Scene, sunDir: THREE.Vector3, o: AtmosphereOptions = ATMOSPHERE): void {
  scene.fog = new THREE.FogExp2(o.color, o.density);
  setAtmosphereSun(sunDir.clone().normalize());
  if (installed) return;
  installed = true;
  // Every built-in program and every ShaderMaterial merged from UniformsLib.fog from now on.
  const shared = { fogSunDir: atmosphereUniforms.fogSunDir, fogMist: atmosphereUniforms.fogMist };
  Object.assign(THREE.UniformsLib.fog, shared);
  for (const lib of Object.values(THREE.ShaderLib)) {
    if (lib.uniforms && 'fogColor' in lib.uniforms) Object.assign(lib.uniforms, { fogSunDir: { value: shared.fogSunDir.value }, fogMist: { value: shared.fogMist.value } });
  }
  installSkyGrade();
  const sun = new THREE.Color(o.sunColor);
  const C = THREE.ShaderChunk as Record<string, string>;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 fogSunDir;
  uniform vec4 fogMist;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float fogLayer(float b, float dy) {
    float x = b * dy;
    return abs(x) > 1e-3 ? (1.0 - exp(-x)) / x : 1.0;
  }
#endif`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    // View-space offset back to world space (the view matrix is a rotation + translation).
    vec3 fogW = (vec4(vFogView, 0.0) * viewMatrix).xyz;
    float fogDist = length(fogW);
    vec3 fogDir = fogW / max(fogDist, 1e-4);
    float fogH0 = max(cameraPosition.y - (${WATER_Y.toFixed(2)}), 0.0);
    float fogDy = fogW.y;
    // Round 8: the first stretch of air in front of the lens is clear (in-scatter close to the
    // camera only greyed the whole frame); the haze builds beyond it, so distance keeps its depth.
    float fogNearClear = smoothstep(14.0, 70.0, fogDist); // round 10: a clear near field (crash results)
    float fogOpt = fogDensity * fogDist * fogNearClear * exp(-${o.falloff.toFixed(4)} * fogH0) * fogLayer(${o.falloff.toFixed(4)}, fogDy);
    float fogFactor = 1.0 - exp(-fogOpt);
    float fogSun = max(dot(fogDir, fogSunDir), 0.0);
    // Warm only close around the sun: a broad warm in-scatter laid a milky veil over every
    // sun-facing frame (round 5).
    vec3 fogCol = mix(fogColor, ${glslVec3(sun)}, pow(fogSun, 18.0) * 0.35 * (1.0 - fogMist.w));
    // Far away the haze thickens to the sky's own horizon colour.
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 0.86));
    if (fogMist.y > 0.0) {
      // Mist lying on the water: a thin exponential layer, drifting in slow banks.
      float mb = ${(1 / o.mistHeight).toFixed(4)};
      float mh = max(cameraPosition.y - (${WATER_Y.toFixed(2)}), 0.0);
      float mOpt = ${o.mistDensity.toFixed(4)} * fogMist.y * fogDist * fogNearClear * exp(-mb * mh) * fogLayer(mb, fogDy);
      vec3 fogP = cameraPosition + fogW;
      float bank = 0.55 + 0.45 * sin(fogP.x * 0.07 + fogMist.x * 0.11) * sin(fogP.z * 0.05 - fogMist.x * 0.07 + 1.3);
      // (Round 19: at most 0.38 — at 0.5 a ruin 100 m out turned milky white, a ghost on the water.)
      float mist = (1.0 - exp(-mOpt * bank)) * 0.38;
      vec3 mistCol = mix(mix(vec3(0.84, 0.89, 0.87), ${glslVec3(sun)} * 1.05, pow(fogSun, 6.0) * 0.5 * (1.0 - fogMist.w)), fogColor * 1.25, fogMist.w * 0.7);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, mistCol, mist);
    }
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif`;
}

function glslVec3(v: THREE.Vector3 | THREE.Color): string {
  const [a, b, c] = v instanceof THREE.Color ? [v.r, v.g, v.b] : [v.x, v.y, v.z];
  return `vec3(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)})`;
}

/**
 * Round 9: the sky as the camera sees it. A portrait (phone) frame shows a lot of sky, most of it the
 * pale band around the low sun ahead, which read flat grey-brown after the grade. Away from the sun and
 * up toward the zenith the panorama is pushed to a deeper blue-teal (at the same luminance, a touch
 * darker); close to the sun it stays warm. Patched into three's background shader (one program).
 */
function installSkyGrade(): void {
  const bc = THREE.ShaderLib.backgroundCube as { uniforms: Record<string, { value: unknown }>; fragmentShader: string };
  if (bc.uniforms.skySun) return;
  bc.uniforms.skySun = { value: atmosphereUniforms.fogSunDir.value };
  bc.uniforms.skyLook = { value: atmosphereUniforms.skyLook.value };
  bc.uniforms.skyHaze = { value: atmosphereUniforms.skyHaze.value };
  bc.uniforms.skyMist = { value: atmosphereUniforms.fogMist.value };
  bc.fragmentShader = bc.fragmentShader
    .replace(
      'uniform float backgroundIntensity;',
      `uniform float backgroundIntensity;
uniform vec3 skySun;
uniform vec4 skyLook;
uniform vec4 skyHaze;
uniform vec4 skyMist;
float skyH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skyN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyH(i), skyH(i + vec2(1, 0)), f.x), mix(skyH(i + vec2(0, 1)), skyH(i + vec2(1, 1)), f.x), f.y); }
float skyF(vec2 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * skyN(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }`,
    )
    .replace(
      'texColor.rgb *= backgroundIntensity;',
      `texColor.rgb *= backgroundIntensity;
      {
        vec3 skyD = normalize(vWorldDirection);
        float skyEl = clamp(skyD.y, 0.0, 1.0);
        float skyToSun = max(dot(skyD, normalize(skySun)), 0.0);
        float zen = smoothstep(0.02, 0.5, skyEl) * (1.0 - pow(skyToSun, 6.0) * 0.8);
        float skyL = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        // Round 10: further toward teal-blue (portrait frames are 35–45 % sky).
        texColor.rgb = mix(texColor.rgb, skyL * vec3(0.5, 0.9, 1.5), zen * 0.85) * (1.0 - zen * 0.2);
        texColor.rgb *= mix(vec3(1.0), vec3(1.07, 1.0, 0.88), pow(skyToSun, 3.0) * (1.0 - skyEl));
        // World round 19: the panorama's shore and hills stand ~250 m out and more, but the sphere is
        // not fogged: the scene's own haze (as the 3D world gets it) laid over the horizon band, so a
        // ruin 100 m out, already hazed, is never paler than the land behind it (it read as a ghost).
        {
          float band = smoothstep(0.06, 0.0, skyD.y) * smoothstep(-0.3, -0.04, skyD.y);
          float hz = clamp(1.0 - exp(-skyHaze.w * 160.0), 0.0, 0.4) * band;
          // World round 22: the land in the panorama (its giant trees and karst stand up to ~20° above
          // the horizon) is 250–1500 m out, yet its darkest crowns were rendered with almost no haze:
          // they stood against the sky as flat black cut-outs beside the fogged 3D trees, which then read
          // as pale ghosts. Every dark panorama texel (land, not sky) takes the haze the scene's own fog
          // gives at ~300 m, more the darker it is (sky texels, already near the haze, barely change).
          float hzL = dot(skyHaze.rgb, vec3(0.2126, 0.7152, 0.0722));
          float land = smoothstep(0.75, 0.2, skyL / max(hzL, 1e-3)) * smoothstep(0.42, 0.18, skyD.y) * smoothstep(-0.35, -0.05, skyD.y);
          // (Round 23: balanced — a flat grey wash took the far layer's depth and colour: the land's
          // haze is held a touch darker than the sky's, so the far bank still stands off the sky behind
          // it, and the crowns keep part of their own green.)
          float hzLand = clamp(1.0 - exp(-skyHaze.w * 300.0), 0.0, 0.42) * land;
          vec3 hzCol = mix(skyHaze.rgb, skyHaze.rgb * 0.86, land);
          vec3 texChroma = texColor.rgb - vec3(skyL);
          float hzA = max(hz, hzLand);
          texColor.rgb = mix(texColor.rgb, hzCol, hzA) + texChroma * hzLand * 0.55;
        }
        // World round 27 (the owner: the sky and the distance read as a cheap backdrop — a smooth gradient
        // with faint wisps over flat, dark cut-out hills): clouds and mist.
        {
          float hzL2 = dot(skyHaze.rgb, vec3(0.2126, 0.7152, 0.0722));
          float isSky = smoothstep(0.32, 0.6, skyL / max(hzL2, 1e-3));
          // Mist lying at the foot of the far hills: their bases fade into the haze, their crowns stand
          // out (they stood as one flat dark shape from crown to waterline).
          float foot = smoothstep(0.1, 0.0, skyD.y) * smoothstep(-0.2, -0.02, skyD.y) * (1.0 - isSky);
          texColor.rgb = mix(texColor.rgb, skyHaze.rgb * 1.02, foot * 0.35);
          // A layer of fair-weather cloud, projected on a plane overhead and drifting: broken cumulus near
          // the horizon thinning toward the zenith, lit on the side toward the sun and grey in its own
          // shade, only over the sky's own texels (the hills keep their silhouettes).
          if (skyD.y > 0.0 && isSky > 0.0) {
            vec2 cp = skyD.xz / (skyD.y + 0.08) * 0.9 + vec2(skyMist.x * 0.006, skyMist.x * 0.0025);
            float n = skyF(cp + skyF(cp * 0.6 + 3.1) * 0.9);
            float cover = smoothstep(0.44, 0.66, n) * smoothstep(0.012, 0.08, skyD.y) * (1.0 - 0.5 * smoothstep(0.4, 0.9, skyD.y));
            vec2 toS = normalize(skySun.xz + 1e-4) * 0.08;
            float lit = clamp((n - skyF(cp + toS + skyF(cp * 0.6 + 3.1) * 0.9)) * 4.0 + 0.55, 0.0, 1.0);
            float sunNear = pow(skyToSun, 4.0);
            vec3 shade = skyHaze.rgb * vec3(0.72, 0.76, 0.84);
            vec3 light = mix(vec3(0.93, 0.92, 0.88), vec3(1.05, 0.93, 0.76), sunNear) * max(skyL, hzL2) * 1.25;
            vec3 cloud = mix(shade, light, lit);
            texColor.rgb = mix(texColor.rgb, cloud, cover * isSky * 0.8);
          }
        }
        // Round 11 looks (a storm's overcast): drain and tint; the warm glow round the sun goes too.
        float skyL2 = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        texColor.rgb = mix(texColor.rgb, vec3(skyL2), skyLook.w) * skyLook.xyz;
      }`,
    );
}
