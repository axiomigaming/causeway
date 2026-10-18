import * as THREE from 'three';

/**
 * Ambient life: birds wheeling high over the water, butterflies around the causeway and
 * leaves drifting down. Everything moves in the vertex shader from a time uniform and a
 * per-instance seed, in fields that wrap around the camera, so the CPU cost is one
 * uniform update per system per frame and never allocates.
 */
const common = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  attribute vec4 aSeed;
  vec3 wrapAround(vec3 p, vec3 box) { return uCenter + mod(p - uCenter + box * 0.5, box) - box * 0.5; }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  // The fields wrap round the camera, so now and then an instance lands right at the lens and fills
  // a corner of the frame as one big flat quad (round 13: the pale-yellow sliver beside the runner).
  // Shrink anything nearer than ~2.5 m to nothing.
  float nearScale(vec3 wp) { return smoothstep(1.2, 2.6, length(wp - cameraPosition)); }
`;

function seeds(n: number, rnd: () => number): THREE.InstancedBufferAttribute {
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return new THREE.InstancedBufferAttribute(a, 4);
}

/** Two wing quads hinged on the body axis (x = 0); `aWing` is 0 at the hinge, ±1 at the tip. */
function wingGeometry(span: number, chord: number, sweep: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p: number[] = [];
  const w: number[] = [];
  for (const s of [-1, 1]) {
    const tip = [s * span, 0, sweep];
    const quad = [
      [0, 0, -chord * 0.5],
      [0, 0, chord * 0.5],
      [tip[0]!, 0, tip[2]! + chord * 0.35],
      [tip[0]!, 0, tip[2]! - chord * 0.15],
    ];
    const idx = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of idx) {
      p.push(...quad[i]!);
      w.push(i < 2 ? 0 : s);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(w, 1));
  return g;
}

function makeField(geo: THREE.BufferGeometry, n: number, vertex: string, fragment: string, rnd: () => number, extra: Record<string, THREE.IUniform> = {}) {
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index;
  for (const [k, v] of Object.entries(geo.attributes)) ig.setAttribute(k, v);
  ig.setAttribute('aSeed', seeds(n, rnd));
  ig.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, ...extra }]),
    vertexShader: common + vertex,
    fragmentShader: fragment,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(ig, mat);
  mesh.frustumCulled = false;
  return { mesh, mat, max: n };
}

export class Ambient {
  readonly root = new THREE.Group();
  private birds;
  private butterflies;
  private leaves;
  private flies;

  constructor() {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.root.name = 'ambient';

    // Birds: dark gliding silhouettes circling in loose flocks, 18–45 m up.
    this.birds = makeField(
      wingGeometry(0.55, 0.22, -0.18),
      24,
      /* glsl */ `
      attribute float aWing;
      #include <fog_pars_vertex>
      void main() {
        float flock = floor(aSeed.x * 3.0);
        float r = 40.0 + 60.0 * fract(flock * 0.37 + 0.2) + aSeed.y * 10.0;
        float sp = (0.05 + 0.03 * fract(flock * 0.61)) * (mod(flock, 2.0) * 2.0 - 1.0);
        float a = uTime * sp + aSeed.z * 0.9 + flock * 2.1;
        vec3 c = vec3(uCenter.x + sin(flock * 5.0) * 70.0, 0.0, uCenter.z - 60.0 + cos(flock * 3.0) * 50.0);
        vec3 pos = c + vec3(cos(a) * r, 18.0 + 22.0 * fract(flock * 0.73) + aSeed.w * 6.0 + sin(uTime * 0.3 + aSeed.x * 9.0) * 2.0, sin(a) * r);
        // Flap, then glide.
        float ph = uTime * (7.0 + aSeed.w * 3.0) + aSeed.x * 40.0;
        float glide = smoothstep(0.2, 0.7, sin(uTime * 0.6 + aSeed.y * 20.0));
        float flap = mix(sin(ph) * 0.75, 0.08, glide);
        vec3 p = position;
        p.y += abs(aWing) * sin(flap) * 0.55 * abs(p.x) / 0.55 * 1.8;
        float heading = -a - sign(sp) * 1.5708;
        vec3 wp = pos + rotY(heading) * (p * (1.4 + aSeed.w));
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
      /* glsl */ `
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(0.09, 0.075, 0.065, 1.0);
        #include <fog_fragment>
      }`,
      rnd,
    );

    // Butterflies: bright wings fluttering across the causeway around the camera.
    this.butterflies = makeField(
      wingGeometry(0.075, 0.09, 0.0),
      18,
      /* glsl */ `
      attribute float aWing;
      varying vec3 vCol;
      varying float vShade;
      #include <fog_pars_vertex>
      void main() {
        vec3 base = vec3(aSeed.x * 40.0, 0.0, aSeed.y * 40.0);
        float t = uTime * (0.6 + aSeed.z * 0.4) + aSeed.w * 30.0;
        base += vec3(sin(t * 0.7) * 3.0 + sin(t * 2.3) * 0.4, 0.0, cos(t * 0.5) * 3.0 + cos(t * 1.9) * 0.4);
        vec3 pos = wrapAround(base, vec3(26.0, 1.0, 26.0));
        pos.y = uCenter.y - 1.4 + 0.8 * aSeed.z + sin(t * 3.1) * 0.25 + sin(t * 1.3) * 0.3;
        float flap = sin(uTime * 22.0 + aSeed.x * 50.0) * 1.1;
        vec3 p = position;
        float ang = flap * sign(aWing);
        p = vec3(p.x * cos(ang), abs(p.x) * sin(abs(ang)) , p.z);
        vec3 wp = pos + rotY(t * 0.9 + aSeed.y * 6.0) * p * nearScale(pos);
        vShade = 0.65 + 0.35 * abs(cos(flap));
        float k = floor(aSeed.w * 3.0);
        vCol = k < 1.0 ? vec3(1.0, 0.55, 0.12) : k < 2.0 ? vec3(0.25, 0.55, 1.0) : vec3(1.0, 0.92, 0.55);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
      /* glsl */ `
      varying vec3 vCol;
      varying float vShade;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vCol * vShade * 0.8, 1.0);
        #include <fog_fragment>
      }`,
      rnd,
    );

    // Leaves: tumbling down through the air, drifting with the wind.
    const leaf = new THREE.PlaneGeometry(0.12, 0.08);
    leaf.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(4), 1));
    this.leaves = makeField(
      leaf,
      180, // round 11: up to 180 as the run builds (setLeafDensity); 60 when calm
      /* glsl */ `
      varying vec3 vCol;
      varying float vShade;
      varying vec2 vLeafUv;
      #include <fog_pars_vertex>
      void main() {
        float fall = uTime * (0.55 + aSeed.z * 0.4);
        vec3 base = vec3(aSeed.x * 30.0 + fall * 0.6, aSeed.y * 9.0 - fall, aSeed.w * 30.0);
        base.x += sin(uTime * 1.3 + aSeed.w * 20.0) * 0.6;
        vec3 pos = wrapAround(base, vec3(30.0, 9.0, 30.0));
        pos.y = uCenter.y - 3.0 + mod(aSeed.y * 9.0 - fall + 9.0 * 50.0, 9.0);
        float spin = uTime * (2.0 + aSeed.x * 3.0) + aSeed.y * 10.0;
        mat3 r = rotY(aSeed.w * 6.28 + uTime * 0.5) * rotX(spin) * rotZ(sin(spin * 0.7) * 0.8);
        vec3 wp = pos + r * position * nearScale(pos);
        vLeafUv = uv;
        vShade = 0.55 + 0.45 * abs((r * vec3(0.0, 0.0, 1.0)).y);
        vCol = mix(vec3(0.34, 0.42, 0.12), vec3(0.72, 0.52, 0.16), aSeed.z);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
      /* glsl */ `
      varying vec3 vCol;
      varying float vShade;
      varying vec2 vLeafUv;
      #include <fog_pars_fragment>
      void main() {
        // A leaf, not a card: a pointed oval with a darker midrib.
        vec2 q = vLeafUv * 2.0 - 1.0;
        float w = 1.0 - q.x * q.x;
        if (abs(q.y) > w * w * 0.95 + 0.02) discard;
        float rib = 1.0 - 0.25 * smoothstep(0.08, 0.0, abs(q.y));
        gl_FragColor = vec4(vCol * vShade * rib, 1.0);
        #include <fog_fragment>
      }`,
      rnd,
    );
    // Round 11 detail: fireflies and midges over the water by the causeway: tiny glowing motes that
    // wander and blink low over the surface (the glow is faint by day, brighter as the light goes).
    const fly = new THREE.PlaneGeometry(1, 1);
    fly.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(4), 1));
    this.flies = makeField(
      fly,
      70,
      /* glsl */ `
      uniform float uGlow;
      varying vec2 vUv;
      varying float vA;
      void main() {
        // Hover in loose swarms 0.2–2 m over the water (y = -2.2), 3–18 m to the sides of the camera.
        vec3 base = vec3(aSeed.x * 36.0, 0.0, aSeed.w * 36.0);
        base.x += sin(uTime * (0.3 + aSeed.y * 0.4) + aSeed.z * 30.0) * 1.6;
        base.z += cos(uTime * (0.25 + aSeed.z * 0.4) + aSeed.y * 30.0) * 1.6;
        vec3 pos = wrapAround(base, vec3(36.0, 1.0, 36.0));
        pos.y = -2.0 + aSeed.y * 1.8 + sin(uTime * (1.1 + aSeed.x) + aSeed.w * 20.0) * 0.25;
        float side = abs(pos.x - uCenter.x);
        float blink = smoothstep(0.35, 0.9, sin(uTime * (1.3 + aSeed.z * 2.0) + aSeed.x * 50.0) * 0.5 + 0.5);
        vA = blink * uGlow * smoothstep(2.5, 4.0, length(pos.xz - uCenter.xz));
        vUv = uv;
        vec4 mv = viewMatrix * vec4(pos, 1.0);
        mv.xy += position.xy * (0.05 + 0.04 * aSeed.w);
        gl_Position = projectionMatrix * mv;
      }`,
      /* glsl */ `
      varying vec2 vUv;
      varying float vA;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float g = exp(-d * d * 5.0);
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * g * vA * 2.2, 1.0);
      }`,
      rnd,
      { uGlow: { value: 0.35 } },
    );
    const fm = this.flies.mat;
    fm.transparent = true;
    fm.depthWrite = false;
    fm.blending = THREE.AdditiveBlending;
    fm.fog = false;
    this.root.add(this.birds.mesh, this.butterflies.mesh, this.leaves.mesh, this.flies.mesh);
  }

  /** 0 hides ambient life, 1 is the full count. */
  setBudget(k: number): void {
    const set = (f: { mesh: THREE.Mesh; max: number }, min: number) => {
      (f.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.max(min, Math.round(f.max * Math.min(1, k)));
    };
    set(this.birds, 8);
    set(this.butterflies, 4);
    set(this.flies, 0);
    this.leafBudget = k >= 0.5 ? Math.min(1, k) : 0;
    this.leaves.mesh.visible = k >= 0.5;
    this.setLeafDensity(this.leafDensity);
  }

  private leafBudget = 1;
  private leafDensity = 0;
  /** Round 11 crescendo: 0 calm (a third of the leaves) .. 1 the air full of falling leaves. */
  /** Firefly glow (0..1): faint by day, brighter as the light goes. */
  setGlow(g: number): void {
    this.flies.mat.uniforms.uGlow!.value = g;
  }

  setLeafDensity(d: number): void {
    this.leafDensity = d;
    const n = Math.round(this.leaves.max * this.leafBudget * (0.33 + 0.67 * Math.min(1, Math.max(0, d))));
    (this.leaves.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
  }

  update(t: number, cam: THREE.Camera): void {
    for (const f of [this.birds, this.butterflies, this.leaves, this.flies]) {
      f.mat.uniforms.uTime!.value = t;
      f.mat.uniforms.uCenter!.value.copy(cam.position);
    }
  }
}
