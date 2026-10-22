import * as THREE from 'three';

export const WATER_Y = -2.2;

/**
 * Open water: a large plane that follows the camera. Waves are analytic (no
 * texture), reflections come from the far-world panorama, and a hot glint
 * tracks the sun. Shallow, milky turquoise near the eye; deep green-blue far.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;

  constructor(backdrop: THREE.Texture, sunDir: THREE.Vector3) {
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSky: { value: null },
        uSunDir: { value: sunDir.clone() },
        uSunColor: { value: new THREE.Color(1.0, 0.82, 0.6) },
        uShallow: { value: new THREE.Color('#29b39a') }, // round 11: richer turquoise-green (ref17)
        uDeep: { value: new THREE.Color('#05473f') },
        uSkyYaw: { value: 0 },
        uMark: { value: 1 },
        uDetail: { value: 2 },
        uCamPos: { value: new THREE.Vector3() },
        // Cinematics (round 17): up to four splashes (x, z, start time, strength) ringing out.
        // QA (?qa&water0): the round-16 water without the round-17 ripples, for before/after crops.
        uRipple: { value: typeof location !== 'undefined' && /[?&]water0\b/.test(location.search) && /[?&]qa\b/.test(location.search) ? 0 : 1 },
        // Round 17: the causeway's centre line near the lens (x, z), so the water over its submerged
        // footings reads shallow: stone showing through, warmer, with caustics.
        uPath: { value: Array.from({ length: 16 }, () => new THREE.Vector2(1e5, 1e5)) },
        uShelf: { value: typeof location !== 'undefined' && /[?&]water0\b/.test(location.search) && /[?&]qa\b/.test(location.search) ? 0 : 1 },
        // QA (?qa&wdbg): the distance to the causeway's centre line (red bands a metre apart, green past its edge).
        uDbg: { value: typeof location !== 'undefined' && /[?&]wdbg\b/.test(location.search) && /[?&]qa\b/.test(location.search) ? 1 : 0 },
        uSplash: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
      },
    ]);
    this.uniforms.uSky!.value = backdrop;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform sampler2D uSky;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform int uDetail;
        uniform vec3 uCamPos;
        uniform float uSkyYaw;
        uniform float uMark;
        uniform vec4 uSplash[4];
        uniform float uRipple;
        uniform vec2 uPath[16];
        uniform float uShelf;
        uniform float uDbg;
        // Distance from p to the centre-line polyline.
        float pathDist(vec2 p) {
          float d = 1e9;
          for (int i = 0; i < 15; i++) {
            vec2 a = uPath[i], b = uPath[i + 1];
            vec2 ab = b - a;
            float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            d = min(d, length(p - a - ab * t));
          }
          return d;
        }
        varying vec3 vWorld;

        // Gradient noise and its analytic derivative (value noise, quintic): the close-range ripple
        // field. Three octaves at ~1.6 m, 0.6 m and 0.22 m, drifting in different directions.
        float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        vec3 wnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
          float a = wh(i), b = wh(i + vec2(1, 0)), c = wh(i + vec2(0, 1)), d = wh(i + vec2(1, 1));
          float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
          return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
        }
        vec2 ripples(vec2 p, float t, float dist) {
          vec2 g = vec2(0.0);
          float near = smoothstep(60.0, 6.0, dist);
          g += wnoise(p * 0.62 + vec2(t * 0.11, t * 0.07)).yz * 0.62 * 0.045;
          g += wnoise(p * 1.7 + vec2(-t * 0.23, t * 0.19)).yz * 1.7 * 0.016 * near;
          // The finest octave only where a pixel still covers less than its wavelength (no shimmer).
          float fine = smoothstep(18.0, 3.0, dist);
          g += wnoise(p * 4.6 + vec2(t * 0.41, -t * 0.37)).yz * 4.6 * 0.0055 * fine;
          return g;
        }
        // Splashes: a ring of waves running out from the impact (gradient of a damped radial wave)
        // and the foam it throws, both fading as it spreads.
        vec2 splashGrad(vec2 p, float t, out float foam) {
          vec2 g = vec2(0.0);
          foam = 0.0;
          for (int i = 0; i < 4; i++) {
            vec4 s = uSplash[i];
            float age = t - s.z;
            if (age < 0.0 || age > 4.0 || s.w <= 0.0) continue;
            vec2 d = p - s.xy;
            float r = length(d) + 1e-4;
            float front = 0.6 + age * 2.6;
            float env = exp(-age * 0.9) * s.w * smoothstep(front + 0.6, front - 0.4, r) * exp(-max(0.0, front - r) * 0.55);
            float ph = (r - front) * 7.0;
            g += d / r * cos(ph) * 0.09 * env;
            // Foam: churned white water at the centre, breaking up into drifting patches (smooth
            // noise, never a dotted ring) and fading over 2–3 s; only a faint line on the crest.
            // Round 18: a soft white disc read as a cotton ball from above. Now: a small core of
            // white water that boils for a second, then marbled patches (sharp-edged noise,
            // carried outward) inside the spreading front with dark water between, thinning out
            // over 2–3 s.
            vec2 adv = p - d / r * min(age, 2.0) * 0.5;
            float churn = wnoise(adv * 2.6 + vec2(age * 0.5, -age * 0.35)).x * 0.6 + wnoise(adv * 6.5 - age * 0.8).x * 0.4;
            float core = smoothstep(0.45 + age * 0.45, 0.0, r) * exp(-age * 2.2) * (0.75 + 0.25 * churn);
            float band = smoothstep(front * 0.9 + 0.3, front * 0.55, r) * exp(-age * 0.75);
            float marble = smoothstep(0.46 + age * 0.05, 0.68 + age * 0.05, churn) * (0.7 + 0.3 * wnoise(adv * 13.0 + age).x);
            foam += s.w * (core * 0.9 + band * marble * 0.55);
          }
          return g;
        }

        vec2 waveGrad(vec2 p, float t) {
          vec2 g = vec2(0.0);
          // Directional wave trains; derivative of sum of sines.
          const int N = 6;
          vec2 dirs[6] = vec2[6](vec2(0.8, 0.6), vec2(-0.6, 0.8), vec2(0.3, -0.95), vec2(-0.9, -0.2), vec2(0.5, 0.86), vec2(-0.2, 0.98));
          float amp = 0.055, freq = 0.55, speed = 1.1;
          for (int i = 0; i < N; i++) {
            if (i >= 2 + uDetail * 2) break;
            float ph = dot(dirs[i], p) * freq + t * speed * (1.0 + float(i) * 0.13);
            g += dirs[i] * cos(ph) * amp * freq;
            amp *= 0.62; freq *= 1.85; speed *= 1.25;
          }
          return g;
        }

        vec3 skySample(vec3 d) {
          d = normalize(d);
          // The panorama turns with the light (see Game: the sky follows the route's heading).
          float cy = cos(uSkyYaw), sy = sin(uSkyYaw);
          d = vec3(cy * d.x - sy * d.z, d.y, sy * d.x + cy * d.z);
          vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5);
          return texture2D(uSky, uv).rgb;
        }

        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float dist = length(cameraPosition - vWorld);
          vec2 g = waveGrad(vWorld.xz, uTime);
          // Flatten waves with distance to avoid shimmer.
          g *= 1.0 / (1.0 + dist * 0.02);
          // Round 17: multi-scale ripples on every tier (the close water read as a flat sheet).
          g += ripples(vWorld.xz, uTime, dist) * uRipple;
          float splashFoam;
          g += splashGrad(vWorld.xz, uTime, splashFoam);
          // Round 11: fine ripples close to the eye break the mirror into glitter (ref17).
          if (uDetail > 1) {
            vec2 rp = vWorld.xz * 3.1;
            vec2 rg = vec2(cos(rp.x + uTime * 2.3 + sin(rp.y * 0.7)), cos(rp.y * 1.13 - uTime * 1.9 + sin(rp.x * 0.6)));
            g += rg * 0.02 * smoothstep(28.0, 4.0, dist);
          }
          vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 refl = skySample(R);
          // (The sRGB texture is decoded to linear by the sampler.)
          float depthLook = smoothstep(0.0, 1.0, dot(V, vec3(0.0, 1.0, 0.0)));
          // Looking down into it the water is clear turquoise; toward the horizon it reads deep.
          vec3 body = mix(uDeep, uShallow, depthLook * 0.8 + 0.04);
          // Deep teal-green in the middle distance, a clearer jade close under the eye.
          body = mix(body, uShallow * 1.15, smoothstep(14.0, 3.0, dist) * 0.35);
          body *= mix(0.7, 1.0, smoothstep(90.0, 8.0, dist));
          // Looking down (little mirror) the ripples still read: the body brightens and darkens
          // with the surface slope, as the bed's light refracts through it.
          body *= clamp(1.0 + (g.x * 1.7 - g.y * 1.3) * 3.0 * depthLook, 0.75, 1.3);
          // Light scattered inside wave crests.
          float crest = clamp(g.x * 3.0 + g.y * 2.0, 0.0, 1.0);
          body += uShallow * crest * 0.25;
          // Caustic-looking light playing in the shallows under the eye: a warped interference
          // pattern, strongest looking down and close, gone by the middle distance.
          if (uDetail > 0) {
            vec2 q = vWorld.xz * 0.55;
            for (int k = 0; k < 2; k++) q += vec2(sin(q.y * 1.3 + uTime * 0.7), cos(q.x * 1.1 - uTime * 0.6)) * 0.45;
            float ca = pow(abs(sin(q.x * 2.2) * sin(q.y * 2.0)), 3.0);
            body += vec3(0.55, 0.85, 0.7) * ca * 0.22 * depthLook * smoothstep(45.0, 6.0, dist);
          }
          // The causeway's submerged footings: within ~3 m of its edge the water is shallow over
          // stone — warmer, lighter, the courses of the blocks and the caustics showing through, and
          // less of the sky's mirror (looking down into it).
          float shelf = 0.0;
          if (uShelf > 0.0) {
            float pd = pathDist(vWorld.xz);
            // Under the causeway itself (seen only where it has fallen away: a chasm) the water is
            // deep: dark green-blue, darkest mid-gorge, clearer toward the walls' footings.
            // Round 18: seen through, not painted. The bed falls from ~0.5 m at the wall footings to
            // ~7 m mid-gorge; light crossing that water loses red first (Beer-Lambert), so the stone
            // of the footings shows warm and clear near the walls, going green then blue-black as
            // the bed drops away. The path the eye takes through the water lengthens at a slant.
            float gorge = (1.0 - smoothstep(1.6, 2.9, pd)) * uShelf;
            if (gorge > 0.0) {
              float bedD = mix(0.45, 7.0, smoothstep(2.5, 0.7, pd));
              float run = bedD / max(dot(V, vec3(0.0, 1.0, 0.0)), 0.25);
              vec3 T = exp(-run * vec3(0.6, 0.34, 0.4));
              // The bed: the footing's courses near the walls, rubble further in; caustics on it,
              // sharper the shallower it lies, drifting with the surface.
              vec2 bp = vWorld.xz * vec2(1.1, 0.55) + g * 1.6;
              vec2 cell = floor(bp);
              float course = smoothstep(0.0, 0.07, fract(bp.x)) * smoothstep(0.0, 0.07, fract(bp.y));
              // The joints blur out as the bed drops away (the surface warps them, the water softens).
              vec3 bed = vec3(0.4, 0.38, 0.27) * (0.75 + 0.25 * wh(cell)) * mix(1.0 - 0.5 * exp(-bedD * 0.6), 1.0, course);
              vec2 cq = vWorld.xz * 0.95 + g * 3.0;
              for (int k = 0; k < 2; k++) cq += vec2(sin(cq.y * 1.3 + uTime * 0.9), cos(cq.x * 1.1 - uTime * 0.8)) * 0.45;
              float caus = pow(abs(sin(cq.x * 2.2) * sin(cq.y * 2.0)), 3.0);
              bed += vec3(1.0, 0.95, 0.75) * caus * 0.55 * exp(-bedD * 0.35);
              // In-scatter: the colour the water itself glows where the bed is lost.
              vec3 deepGlow = uDeep * 0.55 + uShallow * 0.03;
              vec3 seen = bed * T + deepGlow * (1.0 - T);
              // The surface still shapes the light: ripple slopes brighten and shade it a little.
              seen *= clamp(1.0 + (g.x * 1.7 - g.y * 1.3) * 2.0, 0.8, 1.2);
              body = mix(body, seen, gorge * (0.6 + 0.4 * depthLook));
            }
            // The footings: a band just outside the edge.
            shelf = smoothstep(1.9, 2.9, pd) * smoothstep(5.6, 3.4, pd) * uShelf * smoothstep(60.0, 8.0, dist);
            if (shelf > 0.0) {
              vec2 bp = vWorld.xz * vec2(0.55, 1.1) + g * 6.0;
              vec2 cell = floor(bp);
              float course = smoothstep(0.0, 0.08, fract(bp.x)) * smoothstep(0.0, 0.08, fract(bp.y));
              float tone = 0.8 + 0.2 * wh(cell);
              vec3 stone = vec3(0.42, 0.42, 0.3) * tone * mix(0.55, 1.0, course);
              vec3 seen = mix(uShallow, stone, 0.62) * 0.9;
              vec2 q2 = vWorld.xz * 0.9;
              for (int k = 0; k < 2; k++) q2 += vec2(sin(q2.y * 1.3 + uTime * 0.9), cos(q2.x * 1.1 - uTime * 0.8)) * 0.45;
              seen += vec3(0.6, 0.8, 0.55) * pow(abs(sin(q2.x * 2.2) * sin(q2.y * 2.0)), 3.0) * 0.28;
              body = mix(body, seen, shelf * (0.35 + 0.55 * depthLook));
            }
          }
          // Glossy: the sky and the far world mirror strongly toward grazing angles.
          // The panorama near the sun is several times brighter than paper white: mirrored at a
          // grazing angle it turned whole sheets of water pure white (a hole in the world). Roll the
          // reflection off softly above ~1 so it stays bright sky, never clipped.
          float rl = max(max(refl.r, refl.g), refl.b);
          refl *= rl > 0.9 ? (0.9 + 0.6 * (1.0 - exp(-(rl - 0.9) / 0.6))) / rl : 1.0;
          // Light through the water toward the sun: a warm green glow in the body (backlit shallows).
          float toSunV = max(dot(-V, normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
          body += vec3(0.32, 0.5, 0.24) * pow(toSunV, 4.0) * 0.35 * (1.0 - depthLook);
          vec3 col = mix(body, refl * vec3(0.9, 0.97, 0.95), clamp(fres * 1.05 * (1.0 - 0.35 * shelf), 0.0, 0.95));
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 420.0) * 22.0 + pow(max(dot(N, H), 0.0), 60.0) * 0.35;
          // The glint itself stays hot (it blooms), but only the narrow core: the broad lobe is capped.
          col += uSunColor * min(spec, 6.0);
          // Splash foam: churned white water fading as the rings spread.
          col = mix(col, vec3(0.86, 0.93, 0.9) * (0.75 + 0.25 * depthLook), clamp(splashFoam, 0.0, 0.8));
          // Alpha marks water for the screen-space reflections (the canvas itself is opaque).
          gl_FragColor = vec4(col, uMark);
          if (uDbg > 0.5) gl_FragColor = vec4(fract(pathDist(vWorld.xz)), step(2.2, pathDist(vWorld.xz)), 0.0, uMark);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(1600, 1600, 1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_Y;
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
  }

  private splashI = 0;
  /** Cinematics (round 17): a splash at (x, z) — waves ringing out through the normals, and foam. */
  splash(x: number, z: number, strength = 1): void {
    const v = (this.uniforms.uSplash!.value as THREE.Vector4[])[this.splashI++ % 4]!;
    v.set(x, z, this.uniforms.uTime!.value as number, Math.min(1.5, strength));
  }

  /** Round 17: the causeway's centre line around the lens (up to 16 points, nearest first or in order). */
  setPath(pts: { x: number; z: number }[]): void {
    const u = this.uniforms.uPath!.value as THREE.Vector2[];
    for (let i = 0; i < 16; i++) {
      const p = pts[Math.min(i, pts.length - 1)];
      if (p) u[i]!.set(p.x, p.z);
      else u[i]!.set(1e5, 1e5);
    }
  }

  update(t: number, cam: THREE.Camera): void {
    this.uniforms.uTime!.value = t;
    this.mesh.position.x = Math.round(cam.position.x / 50) * 50;
    this.mesh.position.z = Math.round(cam.position.z / 50) * 50;
  }

  /** World round 12: the per-world water colours (style.ts). */
  setTint(shallow: string, deep: string): void {
    (this.uniforms.uShallow!.value as THREE.Color).set(shallow);
    (this.uniforms.uDeep!.value as THREE.Color).set(deep);
  }

  setDetail(d: number): void {
    this.uniforms.uDetail!.value = d;
  }

  /** Mark water pixels in alpha for the screen-space reflection pass (only where it runs). */
  setReflections(on: boolean): void {
    this.uniforms.uMark!.value = on ? 0.3 : 1;
  }

  /** Where the sun is, and how far the panorama has been turned to keep it there. */
  setSun(dir: THREE.Vector3, skyYaw: number): void {
    (this.uniforms.uSunDir!.value as THREE.Vector3).copy(dir);
    this.uniforms.uSkyYaw!.value = skyYaw;
  }
}

// ------------------------------------------------------------------ foam
/**
 * Foam where stone meets water. Strips run 4 m along −Z from the origin, their inner edge
 * (uv.x = 0) against the stone at x = 0 and fading out by x = 1.3; rings have their inner
 * edge at r = 0.55 of a unit radius. One additive-free, fogged shader animates both.
 */
export function makeFoamStrip(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1.3, 4, 3, 8).rotateX(-Math.PI / 2).translate(0.65, 0, -2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.3, -pos.getZ(i) / 4);
  return g;
}

export function makeFoamRing(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(0.5, 1, 28, 2).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    uv.setXY(i, (r - 0.5) / 0.5, Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) + 0.5);
  }
  return g;
}

export const foamTime = { value: 0 };

export function makeFoamMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: 'foam',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float e = clamp(vUv.x, 0.0, 1.0);
        vec2 p = vW.xz;
        float nz = n(p * 2.3 + vec2(uTime * 0.35, -uTime * 0.2)) * 0.6 + n(p * 6.1 - uTime * 0.5) * 0.4;
        // A lapping line that swells out from the stone and back.
        float lap = 0.18 + 0.12 * sin(uTime * 1.3 + n(p * 0.7) * 6.0);
        // Broken up by the noise so it never draws a clean outline.
        float line = smoothstep(0.16, 0.0, abs(e - lap - nz * 0.2)) * smoothstep(0.35, 0.7, nz);
        float hug = exp(-e * 5.0);
        float lace = smoothstep(0.5, 0.8, nz) * exp(-e * 2.5);
        float a = clamp(hug * (0.3 + 0.7 * nz) + line * 0.4 + lace * 0.4, 0.0, 1.0) * smoothstep(1.0, 0.7, e) * smoothstep(0.0, 0.08, e + 0.02);
        gl_FragColor = vec4(vec3(0.9, 0.95, 0.92), a * 0.85);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = foamTime;
  return m;
}
