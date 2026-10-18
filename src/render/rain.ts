import * as THREE from 'three';

/**
 * Round 11: rain for the storm look. A box of thin streaks that travels with the camera, each falling
 * and wrapping round on the GPU (one draw call, no per-frame uploads). Slanted by the wind, brighter
 * where it crosses the light. Hidden (and free) in every other look.
 */
const N = 1400;
const BOX = new THREE.Vector3(26, 16, 30);

export class Rain {
  readonly mesh: THREE.LineSegments;
  private readonly uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uBox: { value: BOX.clone() },
    uWind: { value: new THREE.Vector2(-0.18, 0.08) },
  };

  constructor() {
    const pos = new Float32Array(N * 2 * 3);
    const seed = new Float32Array(N * 2 * 2);
    // Fixed layout (Math-free LCG): presentation only.
    let r = 1234567;
    const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      const x = rnd(), y = rnd(), z = rnd(), s = rnd();
      for (let e = 0; e < 2; e++) {
        const k = i * 2 + e;
        pos.set([x, y, z], k * 3);
        seed.set([s, e], k * 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uBox;
        uniform vec2 uWind;
        attribute vec2 aSeed;
        varying float vA;
        void main() {
          float speed = 17.0 + 7.0 * aSeed.x;
          vec3 p = position * uBox;
          p.y = mod(p.y - uTime * speed, uBox.y);
          // Wrap the box round the camera so the rain never runs out (world-anchored, so it falls true).
          vec3 base = cameraPosition - uBox * 0.5;
          vec3 w = base + mod(p - mod(base, uBox), uBox);
          vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
          w -= dir * aSeed.y * (0.55 + 0.35 * aSeed.x);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          vA = (0.35 + 0.65 * aSeed.x) * smoothstep(1.0, 4.0, -mv.z) * (1.0 - smoothstep(10.0, 15.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAmount;
        varying float vA;
        void main() { gl_FragColor = vec4(vec3(0.62, 0.7, 0.8) * vA * uAmount * 0.55, 1.0); }`,
    });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.mesh.name = 'rain';
  }

  /** amount 0..1 (0 hides it). */
  update(time: number, amount: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uAmount.value = amount;
    this.mesh.visible = amount > 0.001;
  }
}
