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
        vec2 splashGrad(vec2 p, float t, out float foam, out float rim, out float gap) {
          vec2 g = vec2(0.0);
          foam = 0.0;
          rim = 0.0;
          gap = 0.0;
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
            // Round 19b: foam as foam. Its density, not a flat fill: a dense bright rim just inside
            // each patch's edge, fading into a see-through bubbly interior where the water shows.
            // Lacy edges (the threshold itself wanders with a finer noise). Where it lies: a ring
            // around the entry, thin streaks running out from it, a small core for the first beat;
            // little else, so most of the water stays water. (Lit by the normals in main().)
            float fine = wnoise(adv * 9.0 + age * 0.7).x;
            float bub = wnoise(adv * 28.0 - age * 1.1).x;
            // The edge frays at two scales (no smooth outline): the threshold wanders with the fine
            // noise and, finer still, with the bubbles.
            float th = 0.56 + age * 0.05 + (fine - 0.5) * 0.16 + (bub - 0.5) * 0.09;
            float inside = smoothstep(th, th + 0.07, churn);
            float rimB = inside * (1.0 - smoothstep(th + 0.03, th + 0.12 + 0.08 * fine, churn));
            float interior = inside * (0.22 + 0.32 * smoothstep(0.42, 0.78, bub));
            float dens = max(rimB * 0.9, interior);
            float ringR = 0.55 + age * 1.1;
            float ring = exp(-pow((r - ringR) / (0.28 + age * 0.16), 2.0));
            float ang = atan(d.y, d.x);
            float streak = smoothstep(0.64, 0.8, wnoise(vec2(ang * 4.0 + s.z * 7.0, r * 0.7 - age * 0.5)).x) * smoothstep(ringR + 1.5, ringR, r) * smoothstep(ringR * 0.5, ringR * 0.8, r);
            float coreF = smoothstep(0.45 + age * 0.3, 0.0, r) * exp(-age * 2.6);
            float where = max(max(ring, streak * 0.75), coreF) * exp(-age * 0.75) * s.w;
            foam += where * mix(dens, 0.85 * inside, coreF);
            gap += where * (1.0 - inside) * 0.3;
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
          float splashFoam, splashRim, splashGap;
          g += splashGrad(vWorld.xz, uTime, splashFoam, splashRim, splashGap);
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
          // Round 18-19: the water is seen through, not painted. A bed lies under every pixel near
          // the lens, at a depth set by the distance to the causeway's centre line:
          //   - under a fallen causeway (a chasm) ~7 m mid-gorge, ~0.5 m at the wall footings;
          //   - the footings themselves, a band of big submerged blocks ~0.6 m down;
          //   - beyond, a sand and weed bed shelving away to ~5.5 m, with a little relief.
          // Light crossing the water loses red first (Beer-Lambert along the eye's path): the bed
          // shows warm and clear in the shallows, turquoise over sand, blue-green to black where
          // it drops away. Caustics play on it, sharper the shallower it lies. No depth pass.
          float shelf = 0.0;
          if (uShelf > 0.0) {
            float pd = pathDist(vWorld.xz);
            float gorge = 1.0 - smoothstep(1.6, 2.9, pd);
            shelf = smoothstep(2.0, 2.9, pd) * smoothstep(4.9, 3.9, pd);
            float relief = wnoise(vWorld.xz * 0.21 + 3.7).x;
            float openD = mix(1.0, 5.5, smoothstep(3.6, 13.0, pd)) + (relief - 0.5) * 1.2 * smoothstep(5.0, 9.0, pd);
            float bedD = mix(mix(0.45, 7.0, smoothstep(2.5, 0.7, pd)), openD, smoothstep(1.6, 2.9, pd));
            float vy = max(dot(V, vec3(0.0, 1.0, 0.0)), 0.2);
            float run = bedD / vy;
            // Refraction: the bed is seen displaced by the surface's slope, more the deeper it is.
            vec2 bw = vWorld.xz + g * (0.6 + bedD * 0.5);
            // Sand with soft mottling, and dark weed beds in patches.
            float m1 = wnoise(bw * 0.7).x, m2 = wnoise(bw * 2.3 + 11.0).x;
            vec3 bed = vec3(0.5, 0.45, 0.33) * (0.72 + 0.34 * m1 + 0.12 * m2);
            float weed = smoothstep(0.6, 0.78, wnoise(bw * 0.33 + 7.0).x + 0.15 * m2) * smoothstep(3.5, 6.0, pd);
            bed = mix(bed, vec3(0.16, 0.2, 0.1) * (0.8 + 0.4 * m2), weed * 0.85);
            // Stone: the footing's big blocks (soft joints, softer the deeper), rubble in the gorge.
            float stoneW = max(shelf, gorge);
            if (stoneW > 0.0) {
              // Courses laid in running bond, each course its own block length (no tile grid).
              vec2 sp = bw * vec2(0.8, 1.35);
              float row = floor(sp.y);
              sp.x = sp.x * (0.75 + 0.5 * wh(vec2(row, 3.1))) + 0.5 * mod(row, 2.0) + wh(vec2(row, 9.7));
              vec2 cell = floor(sp);
              vec2 f = fract(sp);
              float jw = 0.06 + 0.1 * (1.0 - exp(-bedD * 0.5));
              float joint = smoothstep(0.0, jw, f.x) * smoothstep(1.0, 1.0 - jw, f.x) * smoothstep(0.0, jw, f.y) * smoothstep(1.0, 1.0 - jw, f.y);
              vec3 stone = vec3(0.36, 0.33, 0.25) * (0.75 + 0.3 * wh(cell) + 0.1 * m2) * mix(0.6, 1.0, joint);
              // Algae on the drowned stone, in patches.
              stone = mix(stone, vec3(0.17, 0.22, 0.1), smoothstep(0.45, 0.8, m1) * 0.7);
              bed = mix(bed, stone, stoneW);
            }
            if (uDetail > 0) {
              vec2 cq = bw * 0.95;
              for (int k = 0; k < 2; k++) cq += vec2(sin(cq.y * 1.3 + uTime * 0.9), cos(cq.x * 1.1 - uTime * 0.8)) * 0.45;
              float caus = pow(abs(sin(cq.x * 2.2) * sin(cq.y * 2.0)), 3.0);
              bed += vec3(1.0, 0.95, 0.75) * caus * 0.6 * exp(-bedD * 0.35);
            }
            // Clear lagoon water (red goes first); the shaded gorge is murkier.
            vec3 kAbs = mix(vec3(0.42, 0.075, 0.11), vec3(0.6, 0.34, 0.4), gorge);
            vec3 T = exp(-run * kAbs);
            vec3 glow = mix(uDeep * 0.9 + uShallow * 0.08, uDeep * 0.55 + uShallow * 0.03, gorge);
            vec3 seen = bed * 0.6 * T + glow * (1.0 - T);
            seen *= clamp(1.0 + (g.x * 1.7 - g.y * 1.3) * 1.2, 0.9, 1.1);
            body = mix(body, seen, uShelf * smoothstep(90.0, 20.0, dist) * (0.55 + 0.45 * depthLook));
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
          // Splash: darker churned water between the patches, then the foam, with a bright rim.
          col *= 1.0 - 0.35 * clamp(splashGap, 0.0, 1.0);
          // Foam lit by the surface it rides: brighter facing the sun, shaded in the troughs.
          float foamLit = 0.7 + 0.42 * clamp(dot(N, normalize(uSunDir)), 0.0, 1.0) + 0.25 * (N.y - 0.98) * 20.0;
          vec3 foamCol = vec3(0.88, 0.94, 0.91) * clamp(foamLit, 0.55, 1.15) * (0.8 + 0.2 * depthLook);
          col = mix(col, foamCol, clamp(splashFoam, 0.0, 0.92));
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
    // (v = 0.5 all round: the shader fades a strip's two ends by v, and a ring has none.)
    uv.setXY(i, (r - 0.5) / 0.5, 0.5);
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
        // Round 19: broken up, and faded at a strip's two ends and soft against the stone: a strip
        // left beside open water (its stone gone, or a short course) read as a hard pale slab.
        float ends = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
        float a = clamp(hug * smoothstep(0.25, 0.75, nz) * 0.8 + line * 0.4 + lace * 0.35, 0.0, 1.0) * smoothstep(1.0, 0.7, e) * smoothstep(0.0, 0.2, e + 0.04) * ends;
        gl_FragColor = vec4(vec3(0.9, 0.95, 0.92), a * 0.85);
        #include <fog_fragment>
      }`,
  });
  m.uniforms.uTime = foamTime;
  return m;
}
