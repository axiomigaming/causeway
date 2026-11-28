import * as THREE from 'three';

/**
 * Anim round 7: a splash that reads as water, not as a heap of white clumps. Each element is a soft,
 * translucent capsule of white water stretched along its own screen-space motion (the shutter sees it
 * travel), sized to overlap its neighbours so the crown rises as one ragged sheet, tops out and falls
 * back into itself; where a piece of it drops back onto the surface it fades into a flat patch of foam
 * that spreads, lingers and thins away; a little mist hangs over it all. No element starts or ends at
 * full opacity (nothing pops in or out) and none has a hard edge.
 *
 * Three kinds of element, one instanced draw, CPU-integrated and sorted back to front:
 *   sheet  white water in the air: a velocity-stretched capsule, lit from the sun's side
 *   foam   a flat lacy patch lying on the water
 *   mist   a large, faint, round puff
 * The pools are preallocated (nothing is allocated per frame); the counts scale with `budget`.
 */

const SHEET = 0;
const FOAM = 1;
const MIST = 2;

const VERT = /* glsl */ `
  #include <fog_pars_vertex>
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec4 aD; // radius, alpha, seed, kind
  uniform float uAspect;
  uniform float uShutter;
  uniform vec3 uSunView;
  varying vec2 vQ;      // capsule coordinates in radii: x across (-1..1), y along (0 at the head's tip)
  varying float vLen;   // the capsule's straight length, in radii
  varying float vA;
  varying float vSeed;
  varying float vKind;
  varying float vLit;   // how much this vertex faces the sun across the screen
  void main() {
    vKind = aD.w;
    vSeed = aD.z;
    vA = aD.y;
    float r = aD.x;
    vec4 mvPosition;
    if (aD.w > 0.5 && aD.w < 1.5) {
      // Foam: a flat patch on the water, turned by its seed.
      float a = aD.z * 6.2831853;
      vec2 o = mat2(cos(a), sin(a), -sin(a), cos(a)) * (position.xy - vec2(0.0, 0.5)) * 2.0 * r;
      vQ = (position.xy - vec2(0.0, 0.5)) * 2.0;
      vLen = 0.0;
      vLit = 0.6;
      mvPosition = viewMatrix * vec4(aPos + vec3(o.x, 0.0, o.y), 1.0);
      vA *= smoothstep(0.5, 2.2, -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    } else {
      // In the air: a camera-facing capsule from the head (now) back to where it was a shutter ago
      // (mist: no streak). Drawn half a radius nearer the lens (never past halfway to it), so the
      // water's surface does not cut a hard line across a piece just leaving or reaching it.
      vec4 m0 = viewMatrix * vec4(aPos, 1.0);
      // Thinned out as it reaches the lens, so a close shot never sits inside a white wall.
      vA *= smoothstep(0.5, 2.2, -m0.z);
      vec3 pull = normalize(-m0.xyz) * min(r * 0.6, -m0.z * 0.5);
      m0.xyz += pull;
      vec3 back = aD.w > 1.5 ? vec3(0.0) : aVel * uShutter;
      vec4 m1 = viewMatrix * vec4(aPos - back, 1.0);
      m1.xyz += pull;
      vec4 c0 = projectionMatrix * m0;
      vec4 c1 = projectionMatrix * m1;
      if (c0.w < 0.05 || c1.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
      vec2 a0 = vec2(c0.x / c0.w * uAspect, c0.y / c0.w);
      vec2 a1 = vec2(c1.x / c1.w * uAspect, c1.y / c1.w);
      float w = r * projectionMatrix[1][1] / c0.w;
      vec2 d = a0 - a1;
      float len = length(d);
      vec2 dir = len > 1e-5 ? d / len : vec2(0.0, 1.0);
      vec2 nrm = vec2(-dir.y, dir.x);
      vec2 head = a0 + dir * w;
      vec2 tail = a1 - dir * w;
      vec2 p = mix(head, tail, position.y) + nrm * position.x * 2.0 * w;
      vLen = len / max(w, 1e-5);
      vQ = vec2(position.x * 2.0, position.y * (vLen + 2.0));
      // The sun across the screen, against this vertex's way out from the capsule's spine.
      vec2 sd = uSunView.xy;
      sd = length(sd) > 1e-3 ? normalize(sd) : vec2(0.0, 1.0);
      vec2 out2 = nrm * position.x * 2.0 + dir * (1.0 - 2.0 * position.y);
      vLit = 0.5 + 0.5 * dot(normalize(out2 + vec2(0.0, 0.35)), sd);
      mvPosition = m0;
      gl_Position = vec4(p.x / uAspect * c0.w, p.y * c0.w, c0.z, c0.w);
    }
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform sampler2D uNoise;
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform float uBack;
  varying vec2 vQ;
  varying float vLen;
  varying float vA;
  varying float vSeed;
  varying float vKind;
  varying float vLit;
  void main() {
    float a;
    vec3 col;
    if (vKind > 0.5 && vKind < 1.5) {
      // Foam: lace — a broken, cellular pattern thinning toward a soft rim, densest where it is youngest.
      float rr = length(vQ);
      float n = texture2D(uNoise, vQ * 0.42 + vec2(vSeed * 3.1, vSeed * 5.3)).r;
      float m = texture2D(uNoise, vQ * 1.1 + vec2(vSeed * 7.7, vSeed * 1.9)).r;
      float body = 1.0 - smoothstep(0.35, 1.0, rr);
      a = body * smoothstep(0.4, 0.78, n * 0.75 + m * 0.45 + body * 0.15 - 0.15);
      col = mix(uShade, uLit, 0.55 + 0.45 * m) * 0.92;
    } else {
      // Distance (in radii) from the capsule's spine; a soft, gaussian falloff with no edge.
      float y = vQ.y - 1.0;
      float s = clamp(y, 0.0, vLen);
      float d = length(vec2(vQ.x, y - s));
      a = exp(-d * d * 1.8) * (1.0 - smoothstep(0.65, 1.0, d));
      if (vKind > 1.5) {
        col = mix(uShade, uLit, 0.75);
      } else {
        // Thinning toward the tail (the water strung out behind the head), with streaks along it.
        float along = vLen > 0.01 ? s / vLen : 0.0;
        a *= 1.0 - 0.45 * along;
        // Broken up, streaked along the motion: torn water, not a puff.
        float n = texture2D(uNoise, vec2(vQ.x * 0.35 + vSeed * 4.1, (vQ.y - vSeed * 9.0) * 0.12)).r;
        float n2 = texture2D(uNoise, vec2(vQ.x * 0.9 + vSeed * 2.3, vQ.y * 0.3 + vSeed * 5.0)).r;
        a *= clamp(0.2 + 1.3 * n * n2 * 2.2 - 0.25, 0.15, 1.15);
        float lit = clamp(0.35 + vLit * 0.6 + n2 * 0.3 - 0.1, 0.0, 1.0);
        col = mix(uShade, uLit, lit);
        // Thin water against the sun glows at its edges.
        col += uLit * uBack * (1.0 - a) * 0.35;
      }
    }
    a *= vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

function noiseTexture(size = 64): THREE.DataTexture {
  // Tiling value noise, three octaves (smooth, not the dust's billowy abs()).
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const octaves = [4, 8, 16].map((n) => ({ n, g: Array.from({ length: n * n }, rnd) }));
  const data = new Uint8Array(size * size * 4);
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.5;
      let tot = 0;
      for (const o of octaves) {
        const fx = (x / size) * o.n;
        const fy = (y / size) * o.n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = sm(fx - x0);
        const ty = sm(fy - y0);
        const at = (i: number, j: number) => o.g[(j % o.n) * o.n + (i % o.n)]!;
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * amp;
        tot += amp;
        amp *= 0.5;
      }
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round((v / tot) * 255);
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Per element: life, maxLife, r0, r1, alpha, gravity, drag, seed, kind, floor, fadeIn, sink (s, -1 = none), and for a
 * piece of a crown's wall its ring's centre (x, z) and the angle between it and its neighbours (rad, 0 = none).
 */
const D = 15;
/** Seconds a piece of white water takes to sink out once it falls back onto the surface. */
const SINK = 0.16;
/** Queued puffs (see Splash.fromPuff): x y z, vx vy vz, size0 size1, life, alpha, gravity, drag, floor. */
const Q_CAP = 64;
const QD = 13;

export class Splash {
  readonly mesh: THREE.Mesh;
  /** 0.5 (Low) … 1 (High): how many pieces a splash is laid out with. */
  budget = 1;
  private n = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private d: Float32Array;
  private aPos: THREE.InstancedBufferAttribute;
  private aVel: THREE.InstancedBufferAttribute;
  private aD: THREE.InstancedBufferAttribute;
  private attrs: THREE.InstancedBufferAttribute[];
  private geo: THREE.InstancedBufferGeometry;
  private depth: Float32Array;
  private byDepth = (a: number, b: number): number => this.depth[b]! - this.depth[a]!;
  private sorted: number[] = [];
  private q = new Float32Array(Q_CAP * QD);
  private qn = 0;
  private idx = new Int32Array(Q_CAP);
  private key = new Float32Array(Q_CAP);
  private uniforms: Record<string, THREE.IUniform>;
  private camPos = new THREE.Vector3();
  private camFwd = new THREE.Vector3();
  private sunV = new THREE.Vector3();

  constructor(private cap = 200) {
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.d = new Float32Array(cap * D);
    this.depth = new Float32Array(cap);
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aD = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [this.aPos, this.aVel, this.aD];
    g.setAttribute('aPos', this.aPos);
    g.setAttribute('aVel', this.aVel);
    g.setAttribute('aD', this.aD);
    g.instanceCount = 0;
    this.geo = g;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uNoise: { value: null },
        uAspect: { value: 16 / 9 },
        uShutter: { value: 0.065 },
        uSunView: { value: new THREE.Vector3(0, 0.3, -1) },
        // White water in the sun, and its shaded, translucent side (bluish: the water seen through it).
        uLit: { value: new THREE.Color(1.8, 1.86, 1.84) },
        uShade: { value: new THREE.Color(0.98, 1.1, 1.14) },
        uBack: { value: 0 },
      },
    ]);
    this.uniforms.uNoise!.value = noiseTexture();
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'fx.splash';
    this.mesh.visible = false;
  }

  get count(): number {
    return this.n;
  }

  private add(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, r0: number, r1: number, life: number, alpha: number, gravity: number, drag: number, floor: number, fadeIn: number): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const p = i * 3;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = z;
    this.vel[p] = vx;
    this.vel[p + 1] = vy;
    this.vel[p + 2] = vz;
    const d = i * D;
    this.d[d] = life;
    this.d[d + 1] = life;
    this.d[d + 2] = r0;
    this.d[d + 3] = r1;
    this.d[d + 4] = alpha;
    this.d[d + 5] = gravity;
    this.d[d + 6] = drag;
    this.d[d + 7] = Math.random();
    this.d[d + 8] = kind;
    this.d[d + 9] = floor;
    this.d[d + 10] = fadeIn;
    this.d[d + 11] = -1;
    this.d[d + 12] = this.ringX;
    this.d[d + 13] = this.ringZ;
    this.d[d + 14] = this.ringArc;
  }

  /** The crown wall's ring the next add()s belong to (ringArc 0: none). */
  private ringX = 0;
  private ringZ = 0;
  private ringArc = 0;

  /**
   * White water handed over by the dust clouds (Billows.puff with a white-water tint): queued, and laid
   * out as water on the next update with the rest of that frame's puffs, so a ring of them can be closed
   * up into one sheet and a stack of them into one trunk (see gesture()). `rise` is the puff's vertical
   * acceleration (negative: gravity).
   */
  fromPuff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size0: number, size1: number, life: number, alpha: number, rise: number, drag: number, floor: number): void {
    if (this.qn >= Q_CAP) return;
    const q = this.qn++ * QD;
    const Q = this.q;
    Q[q] = x;
    Q[q + 1] = y;
    Q[q + 2] = z;
    Q[q + 3] = vx;
    Q[q + 4] = vy;
    Q[q + 5] = vz;
    Q[q + 6] = size0;
    Q[q + 7] = size1;
    Q[q + 8] = life;
    Q[q + 9] = alpha;
    Q[q + 10] = -rise;
    Q[q + 11] = drag;
    Q[q + 12] = floor;
  }

  /** A run of queued puffs thrown alike (same gravity and drag) is one gesture. */
  private flush(): void {
    const Q = this.q;
    let s0 = 0;
    while (s0 < this.qn) {
      let s1 = s0 + 1;
      while (s1 < this.qn && Q[s1 * QD + 10] === Q[s0 * QD + 10] && Q[s1 * QD + 11] === Q[s0 * QD + 11]) s1++;
      this.gesture(s0, s1);
      s0 = s1;
    }
    this.qn = 0;
  }

  /** Field `f` of queued puffs A and B (offsets into the queue), a share `u` of the way from A to B. */
  private lq(A: number, B: number, f: number, u: number): number {
    return this.q[A + f]! + (this.q[B + f]! - this.q[A + f]!) * u;
  }

  /**
   * Queued puffs i0..i1 as water:
   *  - a ring (the crown): sorted round its centre and closed up with in-betweens on the circle, each
   *    piece wide enough to overlap its neighbours, so it rises as one ragged wall, a thinner, faster
   *    fringe licking above it; with it, foam churned round the hole and a few large, faint puffs of mist;
   *  - a stack (the column): sorted by launch speed and joined the same way, so it stretches up as one
   *    trunk, thinning to its head;
   *  - a low throw (the skirt): wide pieces racing out over the surface and settling into it.
   * Every piece in the air lives until it is back in the water, where it sinks out into foam (update()).
   */
  private gesture(i0: number, i1: number): void {
    const Q = this.q;
    const n = i1 - i0;
    const g = Q[i0 * QD + 10]!;
    const floor = Q[i0 * QD + 12]!;
    let cx = 0;
    let cz = 0;
    for (let i = i0; i < i1; i++) {
      cx += Q[i * QD]!;
      cz += Q[i * QD + 2]!;
    }
    cx /= n;
    cz /= n;
    let spread = 0;
    for (let i = i0; i < i1; i++) spread += Math.hypot(Q[i * QD]! - cx, Q[i * QD + 2]! - cz);
    spread /= n;
    const R = Math.random;
    const idx = this.idx;
    const key = this.key;
    const ring = g >= 5 && n >= 5 && spread > 0.12;
    const stack = g >= 5 && !ring && n > 1;
    for (let i = 0; i < n; i++) {
      idx[i] = (i0 + i) * QD;
      key[i] = ring ? Math.atan2(Q[idx[i]! + 2]! - cz, Q[idx[i]!]! - cx) : Q[idx[i]! + 4]!;
    }
    if (ring || stack) {
      // Round the centre (a ring) or by launch speed (a stack); insertion sort, n is small.
      for (let i = 1; i < n; i++) {
        const v = idx[i]!;
        const kv = key[i]!;
        let j = i - 1;
        while (j >= 0 && key[j]! > kv) {
          idx[j + 1] = idx[j]!;
          key[j + 1] = key[j]!;
          j--;
        }
        idx[j + 1] = v;
        key[j + 1] = kv;
      }
    }
    // In-betweens per gap (a ring closes on itself; a stack's last piece has none after it).
    const m = ring || stack ? (this.budget >= 0.9 ? 2 : 1) : 0;
    let k = 0;
    for (let a = 0; a < n; a++) {
      const A = idx[a]!;
      const last = stack && a === n - 1;
      const B = idx[(a + 1) % n]!;
      for (let s = 0; s <= (last ? 0 : m); s++) {
        const u = s / (m + 1);
        let x = this.lq(A, B, 0, u);
        let z = this.lq(A, B, 2, u);
        if (ring && s > 0) {
          // On the circle, not across its chord.
          const ra = Math.hypot(Q[A]! - cx, Q[A + 2]! - cz);
          const rb = Math.hypot(Q[B]! - cx, Q[B + 2]! - cz);
          const l = Math.hypot(x - cx, z - cz) || 1;
          const rr = ra + (rb - ra) * u;
          x = cx + ((x - cx) / l) * rr;
          z = cz + ((z - cz) / l) * rr;
        }
        const jit = s > 0 ? 1 + 0.06 * (R() - 0.5) : 1;
        const vx = this.lq(A, B, 3, u) * jit;
        const vy = this.lq(A, B, 4, u) * (s > 0 ? 1 + 0.08 * (R() - 0.5) : 1);
        const vz = this.lq(A, B, 5, u) * jit;
        const sz0 = this.lq(A, B, 6, u);
        const sz1 = this.lq(A, B, 7, u);
        // (Translucent, each piece: they overlap into the body of the crown; at 0.6 a crown over him hid him.)
        const alpha = Math.min(0.42, 0.45 * this.lq(A, B, 9, u));
        const drag = this.lq(A, B, 11, u);
        const y = this.lq(A, B, 1, u);
        if (g >= 5) {
          // In the air until it is back in the water: up, down again, and a little more.
          const air = (2 * Math.max(0, vy)) / g + 0.5;
          const r0 = 0.65 * sz0 + 0.04;
          const thin = stack ? 1 - 0.3 * ((a + u) / Math.max(1, n - 1)) : 1;
          if (ring) {
            this.ringX = cx;
            this.ringZ = cz;
            this.ringArc = (2 * Math.PI) / (n * (m + 1));
          }
          this.add(SHEET, x, y, z, vx, vy, vz, r0, Math.max(r0 * 1.4, 0.55 * sz1), Math.max(this.lq(A, B, 8, u), air), alpha * thin, g, drag, floor, 0.06);
          this.ringArc = 0;
          // The crown's fringe: every third piece throws a thinner, faster lick above the wall.
          if (ring && k % 3 === 0) this.add(SHEET, x + (cx - x) * 0.12, y + 0.03, z + (cz - z) * 0.12, vx * 1.15, vy * 1.22, vz * 1.15, r0 * 0.5, r0 * 0.9, (2.5 * vy) / g + 0.5, alpha * 0.75, g, drag + 0.1, floor, 0.08);
        } else {
          // The skirt: wide and low, settling into the surface within a few tenths.
          const r0 = 0.45 * sz0 + 0.04;
          this.add(SHEET, x, y, z, vx, vy, vz, r0, 0.5 * sz1, Math.max(this.lq(A, B, 8, u), 0.6), alpha * 0.8, 4, drag, floor, 0.07);
        }
        k++;
      }
    }
    // How big the gesture is (a body's crown: ~18 puffs; a stone's: a handful).
    const big = Math.min(1, n / 16);
    const b = this.budget;
    if (ring) {
      // Foam churned round the hole at once (the crown's falls add to it), and mist over it.
      const churn = Math.max(1, Math.round((2 + 3 * b) * (0.3 + 0.7 * big)));
      for (let i = 0; i < churn; i++) {
        const a = ((i + R()) / churn) * Math.PI * 2;
        const rr = (0.6 + 0.6 * R()) * spread;
        this.add(FOAM, cx + Math.cos(a) * rr, floor + 0.03, cz + Math.sin(a) * rr, Math.cos(a) * 0.45 * big, 0, Math.sin(a) * 0.45 * big, 0.2 + 0.2 * big, (0.6 + 0.6 * big) * (0.9 + 0.2 * R()), 2.6 + 1.2 * R(), 0.24, 0, 0.9, floor, 0.3);
      }
      // (A body's crown only, and faint: on every stone's splash too, they hazed the whole gorge white.)
      const mist = big > 0.7 ? Math.round(1 + b) : 0;
      for (let i = 0; i < mist; i++) {
        const a = R() * 6.283;
        const rr = spread * R();
        this.add(MIST, cx + Math.cos(a) * rr, floor + 0.3 + 0.7 * R() * big, cz + Math.sin(a) * rr, Math.cos(a) * 0.3, 0.4 + 0.5 * R() * big, Math.sin(a) * 0.3, 0.3 + 0.2 * big, (0.9 + 0.6 * big) * (0.85 + 0.3 * R()), 1.8 + 0.8 * R(), 0.07, 0.4, 1.2, floor, 0.3);
      }
    } else if (stack && big > 0.4) {
      this.add(MIST, cx, floor + 0.8 + 0.6 * R(), cz, (R() - 0.5) * 0.4, 0.7, (R() - 0.5) * 0.4, 0.3, 1.0 + 0.3 * R(), 1.6 + 0.6 * R(), 0.06, 0.6, 1.2, floor, 0.3);
    }
  }

  update(dt: number, cam: THREE.Camera, sunDir: THREE.Vector3, aspect: number): void {
    if (this.qn > 0) this.flush();
    if (this.n === 0) {
      this.mesh.visible = false;
      return;
    }
    let i = 0;
    while (i < this.n) {
      const d = i * D;
      this.d[d] = this.d[d]! - dt;
      if (this.d[d]! <= 0) {
        this.kill(i);
        continue;
      }
      const p = i * 3;
      const drag = Math.exp(-this.d[d + 6]! * dt);
      this.vel[p] = this.vel[p]! * drag;
      this.vel[p + 1] = this.vel[p + 1]! * drag - this.d[d + 5]! * dt;
      this.vel[p + 2] = this.vel[p + 2]! * drag;
      this.pos[p] = this.pos[p]! + this.vel[p]! * dt;
      this.pos[p + 1] = this.pos[p + 1]! + this.vel[p + 1]! * dt;
      this.pos[p + 2] = this.pos[p + 2]! + this.vel[p + 2]! * dt;
      const kind = this.d[d + 8]!;
      const floor = this.d[d + 9]!;
      if (this.d[d + 11]! >= 0) {
        this.d[d + 11] = this.d[d + 11]! + dt;
        if (this.d[d + 11]! >= SINK) {
          this.kill(i);
          continue;
        }
      } else if (kind === SHEET && this.vel[p + 1]! < 0 && this.pos[p + 1]! < floor + 0.04) {
        // Back in the water: the piece sinks out over a few frames (its fade alone: its size and place
        // carry on, nothing jumps) and leaves a patch of foam where it fell.
        this.d[d + 11] = 0;
        const t = 1 - this.d[d]! / this.d[d + 1]!;
        const r = this.d[d + 2]! + (this.d[d + 3]! - this.d[d + 2]!) * (1 - (1 - t) * (1 - t));
        // (Not every piece, and only while the pool has room: dozens of patches on one spot read as a
        // white blanket, not foam.)
        if (this.n < this.cap - 8 && Math.random() < 0.45)
          this.add(FOAM, this.pos[p]!, floor + 0.03, this.pos[p + 2]!, this.vel[p]! * 0.35, 0, this.vel[p + 2]! * 0.35, r * 1.2, r * 3.0, 2.4 + Math.random() * 1.4, 0.22 * Math.min(1, this.d[d + 4]! * 2.2), 0, 1.1, floor, 0.25);
      }
      if (kind === SHEET && this.d[d + 11]! >= 0) {
        this.pos[p + 1] = Math.max(this.pos[p + 1]!, floor + 0.04);
        this.vel[p + 1] = Math.max(0, this.vel[p + 1]!);
      }
      i++;
    }
    // Sort back to front and upload.
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camFwd);
    const order = this.sorted;
    order.length = this.n;
    for (let k = 0; k < this.n; k++) {
      order[k] = k;
      this.depth[k] = (this.pos[k * 3]! - this.camPos.x) * this.camFwd.x + (this.pos[k * 3 + 1]! - this.camPos.y) * this.camFwd.y + (this.pos[k * 3 + 2]! - this.camPos.z) * this.camFwd.z;
    }
    order.sort(this.byDepth);
    const ap = this.aPos.array as Float32Array;
    const av = this.aVel.array as Float32Array;
    const ad = this.aD.array as Float32Array;
    for (let k = 0; k < this.n; k++) {
      const s = order[k]!;
      const d = s * D;
      const life = this.d[d + 1]!;
      const age = life - this.d[d]!;
      const t = age / life;
      const kind = this.d[d + 8]!;
      let r = this.d[d + 2]! + (this.d[d + 3]! - this.d[d + 2]!) * (1 - (1 - t) * (1 - t));
      // A piece of the crown's wall widens with the ring as it flies out, so it still meets its neighbours (the
      // wall stays one sheet, thinning as it stretches): at its own size, the ring opened into a necklace of
      // separate beads from above.
      let thin = 1;
      const arc = this.d[d + 14]!;
      if (arc > 0) {
        const reach = 0.85 * arc * Math.hypot(this.pos[s * 3]! - this.d[d + 12]!, this.pos[s * 3 + 2]! - this.d[d + 13]!);
        const rw = Math.min(0.45, Math.max(r, reach));
        thin = Math.sqrt(r / rw);
        r = rw;
      }
      // In over its fade-in, out over the last part of its life, both eased: nothing pops.
      const fin = smooth(Math.min(1, age / this.d[d + 10]!));
      const tail = kind === FOAM ? 0.65 : kind === MIST ? 0.6 : 0.15;
      let fout = smooth(Math.min(1, (1 - t) / tail));
      // White water thins as the crown spreads; a piece back in the water sinks out.
      if (kind === SHEET) fout *= (1 - 0.3 * t) * (this.d[d + 11]! >= 0 ? 1 - smooth(this.d[d + 11]! / SINK) : 1);
      ap[k * 3] = this.pos[s * 3]!;
      ap[k * 3 + 1] = this.pos[s * 3 + 1]!;
      ap[k * 3 + 2] = this.pos[s * 3 + 2]!;
      av[k * 3] = this.vel[s * 3]!;
      av[k * 3 + 1] = this.vel[s * 3 + 1]!;
      av[k * 3 + 2] = this.vel[s * 3 + 2]!;
      ad[k * 4] = r;
      ad[k * 4 + 1] = this.d[d + 4]! * fin * fout * thin;
      ad[k * 4 + 2] = this.d[d + 7]!;
      ad[k * 4 + 3] = kind;
    }
    this.geo.instanceCount = this.n;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
    this.uniforms.uAspect!.value = aspect;
    this.sunV.copy(sunDir).transformDirection(cam.matrixWorldInverse);
    this.uniforms.uSunView!.value.copy(this.sunV);
    this.uniforms.uBack!.value = Math.max(0, -this.sunV.z) ** 2;
    this.mesh.visible = this.n > 0;
  }

  private kill(i: number): void {
    const last = --this.n;
    if (i !== last) {
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.d.copyWithin(i * D, last * D, last * D + D);
    }
  }

  clear(): void {
    this.n = 0;
    this.qn = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}
