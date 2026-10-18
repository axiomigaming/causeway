import * as THREE from 'three';

/**
 * Dynamic resolution: trims the render scale (a multiplier on the tier's pixel-ratio cap) to hold a
 * 60 fps frame interval, and gives it back when there is headroom. The quality tier only steps down
 * once the scale is already at its floor (see Game.govern).
 */
export class DynamicResolution {
  /** Multiplier on the tier's pixel ratio, in [min, 1]. */
  scale = 1;
  private sum = 0;
  private n = 0;
  private good = 0;

  constructor(
    public min = 0.7,
    /** Frame interval to hold (ms). */
    public targetMs = 1000 / 60,
    /** Frames per decision (~0.75 s at 60 fps): long enough to ignore a single hitch. */
    private window = 45,
  ) {}

  get atFloor(): boolean {
    return this.scale <= this.min + 1e-3;
  }

  reset(min = this.min): void {
    this.min = min;
    this.scale = 1;
    this.sum = 0;
    this.n = 0;
    this.good = 0;
  }

  /** Feed one frame interval (ms). Returns true when the scale changed (the caller resizes). */
  sample(dtMs: number): boolean {
    this.sum += Math.min(dtMs, 100);
    if (++this.n < this.window) return false;
    const avg = this.sum / this.n;
    this.sum = 0;
    this.n = 0;
    const prev = this.scale;
    if (avg > this.targetMs * 1.25) {
      // Pixel cost is ~quadratic in scale: step by the square root of the overshoot, at most 15 %.
      this.scale = Math.max(this.min, this.scale * Math.max(0.85, Math.sqrt((this.targetMs * 1.1) / avg)));
      this.good = 0;
    } else if (avg < this.targetMs * 1.06 && this.scale < 1) {
      // Climb back slowly (after ~2 s of headroom) so it does not oscillate.
      if (++this.good >= 3) {
        this.scale = Math.min(1, this.scale * 1.08);
        this.good = 0;
      }
    } else this.good = 0;
    // Quantise so small changes do not reallocate render targets.
    this.scale = Math.round(this.scale * 20) / 20;
    return this.scale !== prev;
  }
}

/**
 * Upload everything the run can show before it starts: every texture of the given materials and
 * every geometry under `roots` (section variants are only instanced as the route grows, so without
 * this their first appearance uploads megabytes mid-run). Draws once into a 1×1 target with a plain
 * material; programs are compiled separately (compileAsync).
 */
export function warmUp(renderer: THREE.WebGLRenderer, roots: THREE.Object3D[], materials: Iterable<THREE.Material> = []): { geometries: number; textures: number } {
  const textures = new Set<THREE.Texture>();
  const addTextures = (m: THREE.Material) => {
    for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) textures.add(v as THREE.Texture);
  };
  for (const m of materials) addTextures(m);
  const scene = new THREE.Scene();
  const plain = new THREE.MeshBasicMaterial();
  const geos = new Set<THREE.BufferGeometry>();
  for (const root of roots)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || geos.has(mesh.geometry)) return;
      geos.add(mesh.geometry);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) addTextures(m);
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
      const proxy = new THREE.Mesh(mesh.geometry, plain);
      proxy.frustumCulled = false;
      scene.add(proxy);
    });
  for (const t of textures) renderer.initTexture(t);
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  const cam = new THREE.PerspectiveCamera();
  const prev = renderer.getRenderTarget();
  const shadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  renderer.shadowMap.autoUpdate = shadows;
  rt.dispose();
  plain.dispose();
  return { geometries: geos.size, textures: textures.size };
}

/**
 * Texture sampling for every world material (clarity, round 12): the GPU's full anisotropy (up to
 * 16×) so floor planks and wall courses seen at a grazing angle keep their detail instead of
 * shimmering into a dotted moiré, and trilinear mips. Colour spaces are only checked, never
 * changed: the loader already marks base colour / emissive sRGB and data maps linear, and one image
 * can sit in two slots (a leaf atlas used as `map` and as `alphaMap`). Forcing the data slot linear
 * there undid the colour slot's sRGB decode and washed the jungle out to a pale grey (round 12 fix).
 * Returns the textures changed and any colour-space mismatches (for QA).
 */
export function tuneTextures(renderer: THREE.WebGLRenderer, roots: THREE.Object3D[], materials: Iterable<THREE.Material> = []): { changed: number; mismatches: string[] } {
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const SLOTS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'alphaMap'];
  const COLOR = new Set(['map', 'emissiveMap']);
  const seenM = new Set<THREE.Material>();
  const seenT = new Set<THREE.Texture>();
  const mismatches: string[] = [];
  let changed = 0;
  const tune = (m: THREE.Material) => {
    if (seenM.has(m)) return;
    seenM.add(m);
    const rec = m as unknown as Record<string, THREE.Texture | null | undefined>;
    for (const k of SLOTS) {
      const t = rec[k];
      if (!t?.isTexture || (t as THREE.DataTexture).isDataTexture) continue;
      if (COLOR.has(k) !== (t.colorSpace === THREE.SRGBColorSpace)) mismatches.push(`${m.name || m.type}.${k}: ${t.colorSpace || 'none'}`);
      if (seenT.has(t)) continue;
      seenT.add(t);
      let dirty = false;
      if (t.anisotropy < maxAniso) ((t.anisotropy = maxAniso), (dirty = true));
      if (t.minFilter === THREE.LinearFilter || t.minFilter === THREE.NearestFilter || t.minFilter === THREE.LinearMipmapNearestFilter) {
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        dirty = true;
      }
      if (dirty) ((t.needsUpdate = true), changed++);
    }
  };
  for (const m of materials) tune(m);
  for (const root of roots)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) tune(m);
    });
  return { changed, mismatches };
}
