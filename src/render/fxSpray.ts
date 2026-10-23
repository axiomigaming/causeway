import * as THREE from 'three';

/**
 * Round 19: water spray as streaks. A droplet thrown out of a splash is drawn as a short bright
 * streak stretched along its screen-space motion (the shutter sees it travel), with a round head
 * and a fading tail, instead of a soft round sprite: the crown and the column read as water
 * thrown hard, not as a puff of white dots. Instanced quads, one draw call, CPU-integrated.
 */
export interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Radius of the head (metres). */
  size: number;
  life: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec2 aD; // radius, alpha
  uniform float uAspect;
  uniform float uShutter;
  varying vec2 vUv;
  varying float vA;
  void main() {
    vec4 c0 = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
    vec4 c1 = projectionMatrix * viewMatrix * vec4(aPos - aVel * uShutter, 1.0);
    if (c0.w < 0.05 || c1.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    vec2 s0 = c0.xy / c0.w;
    vec2 s1 = c1.xy / c1.w;
    // Work in a square space (x scaled by the aspect) so the streak keeps its width at any angle.
    vec2 a0 = vec2(s0.x * uAspect, s0.y);
    vec2 a1 = vec2(s1.x * uAspect, s1.y);
    float w = max(aD.x * projectionMatrix[1][1] / c0.w, 0.0015);
    vec2 d = a0 - a1;
    float len = length(d);
    vec2 dir = len > 1e-5 ? d / len : vec2(0.0, 1.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    // position.y: 0 at the head (plus a round cap), 1 at the tail; position.x across (-0.5..0.5).
    vec2 head = a0 + dir * w;
    vec2 tail = a1 - dir * w;
    vec2 p = mix(head, tail, position.y) + nrm * position.x * 2.0 * w;
    vUv = vec2(position.x * 2.0, position.y);
    vA = aD.y * smoothstep(0.0, 0.004, len + w);
    gl_Position = vec4(p.x / uAspect * c0.w, p.y * c0.w, c0.z, c0.w);
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vA;
  void main() {
    float across = 1.0 - abs(vUv.x);
    float body = smoothstep(0.0, 0.8, across);
    body *= body;
    // A bright rounded head, the streak thinning and fading out toward its tail.
    float along = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.6);
    float a = body * along * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.85 + 0.35 * (1.0 - vUv.y)), a);
  }`;

export class Spray {
  readonly mesh: THREE.Mesh;
  budget = 1;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private d: Float32Array; // radius, alpha, life, maxLife, gravity, drag
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aD: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private uniforms = { uAspect: { value: 16 / 9 }, uShutter: { value: 0.055 }, uColor: { value: new THREE.Color('#eef6f2') } };

  constructor(private cap = 320) {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.d = new Float32Array(cap * 6);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aD = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos);
    g.setAttribute('aVel', this.aVel);
    g.setAttribute('aD', this.aD);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'fx.spray';
  }

  emit(e: Drop): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([e.pos.x, e.pos.y, e.pos.z], i * 3);
    this.vel.set([e.vel.x, e.vel.y, e.vel.z], i * 3);
    this.d.set([e.size, e.alpha ?? 0.9, e.life, e.life, e.gravity ?? 9.8, e.drag ?? 0.25], i * 6);
  }

  /** Below this height a drop is gone (it fell back into the water). */
  floor = -1e4;

  update(dt: number, aspect: number): void {
    this.uniforms.uAspect.value = aspect;
    let i = 0;
    while (i < this.n) {
      const d = i * 6;
      this.d[d + 2] = this.d[d + 2]! - dt;
      const p = i * 3;
      if (this.d[d + 2]! <= 0 || this.pos[p + 1]! < this.floor) {
        this.kill(i);
        continue;
      }
      const drag = Math.exp(-this.d[d + 5]! * dt);
      this.vel[p] = this.vel[p]! * drag;
      this.vel[p + 1] = this.vel[p + 1]! * drag - this.d[d + 4]! * dt;
      this.vel[p + 2] = this.vel[p + 2]! * drag;
      this.pos[p] = this.pos[p]! + this.vel[p]! * dt;
      this.pos[p + 1] = this.pos[p + 1]! + this.vel[p + 1]! * dt;
      this.pos[p + 2] = this.pos[p + 2]! + this.vel[p + 2]! * dt;
      i++;
    }
    const ap = this.aPos.array as Float32Array;
    const av = this.aVel.array as Float32Array;
    const ad = this.aD.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      ap[k * 3] = this.pos[k * 3]!;
      ap[k * 3 + 1] = this.pos[k * 3 + 1]!;
      ap[k * 3 + 2] = this.pos[k * 3 + 2]!;
      av[k * 3] = this.vel[k * 3]!;
      av[k * 3 + 1] = this.vel[k * 3 + 1]!;
      av[k * 3 + 2] = this.vel[k * 3 + 2]!;
      const d = k * 6;
      const t = this.d[d + 2]! / this.d[d + 3]!;
      ad[k * 2] = this.d[d]!;
      ad[k * 2 + 1] = this.d[d + 1]! * Math.min(1, t * 4);
    }
    this.geo.instanceCount = this.n;
    if (this.n) {
      this.aPos.needsUpdate = true;
      this.aVel.needsUpdate = true;
      this.aD.needsUpdate = true;
    }
  }

  private kill(i: number): void {
    const last = --this.n;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.d.copyWithin(i * 6, last * 6, last * 6 + 6);
  }

  clear(): void {
    this.n = 0;
    this.geo.instanceCount = 0;
  }
}
