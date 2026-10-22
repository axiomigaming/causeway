import * as THREE from 'three';
import { QUALITY, type QualityLevel } from '../config/quality';
import { multiplierAtSmooth } from '../engine/curve';
import { Rng, hashString } from '../engine/rng';
import { loadKit, pickAssetSet, wind, type Kit } from '../world/assets';
import { DynamicResolution, tuneTextures, warmUp } from './perf';
import { installShadowEdgeFade } from './shadows';
import { ContactShadow } from './contact';
import { installAtmosphere, patchFogUniforms, setAtmosphereMist, setAtmosphereSun, setSkyLook } from '../world/atmosphere';
import { causticUniforms } from '../world/caustics';
import { Rain } from './rain';
import { resetMood, setWorldDrive, stepMood, worldMood, worldTierUp } from '../world/mood';
import { Debris } from '../world/debris';
import { forward } from '../world/path';
import { CRASH_CLIPS, crashStaging, escapeStaging, intensityOf, nextBeat, progression, type CrashKind, type CrashStaging, type EscapeStaging, type Progression } from '../world/choreo';
import { Runner, type RunnerAnim } from '../world/runner';
import { PATH_HALF } from '../world/sections';
import { Track, type TileSlot } from '../world/track';
import type { Look } from '../world/look';
import { WATER_Y, Water } from '../world/water';
import { Ambient } from './ambient';
import { CameraRig } from './cameraRig';
import { Motes, Particles } from './particles';
import { Fx } from './fx';
import { escapeScale, fallScale, nextDangerCue, revealHold, type DangerCue, type EscapeScale } from './fxScale';
import { Post } from './post';
import { ObstacleDirector } from './obstacles';

export type Stage = 'title' | 'setup' | 'lead' | 'run' | 'crash' | 'cashout';

/** What the audio layer hears from the world. Implemented by AudioEngine. */
export interface WorldSounds {
  footstep(strength: number, surface: 'stone' | 'wood'): void;
  impact(size: number, water: boolean): void;
  tremor(strength: number): void;
  run(intensity: number, running: boolean, speed: number): void;
  crash(kind: string): void;
  escape(): void;
  whoosh(): void;
  /** A heavy landing at its exact frame: the gate slab, the biggest rockfall block. Optional. */
  slam?(size: number): void;
  /** The section type underfoot, so footsteps and ambience can follow the ground (optional). */
  setSection?(type: string | null | undefined): void;
  /**
   * A named one-shot from the world, `strength` 0..1 (optional; the audio layer may ignore names it
   * does not know). Events: 'dust_burst' (a wall blows out dust beside the runner), 'stones_skitter'
   * (small stones across the path), 'tier_up' (a run tier arrives: 2, 5, 10, 25×). Stones dropping
   * into the water already sound through impact(size, true).
   */
  event?(name: string, strength: number): void;
  /** The world's style (world/style.ts: turquoise, jade, lagoon, dry, rainforest), once per new world. */
  setWorldStyle?(name: string): void;
  /**
   * Seconds until the score's next bar line (downbeat), or null when no score is running. The
   * progression director lands a tier-up's visual punch on it, together with the music's accent.
   */
  nextDownbeat?(): number | null;
  /**
   * The tier change the music is about to land, if any: `in` seconds until the new layer's downbeat
   * (its fill already rolling); null when none is pending or the theme is not playing.
   */
  tierLanding?(): { tier: number; in: number } | null;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Round 11 crescendo targets: a low, red dusk sun and a bruised slate haze. */
const DUSK_SUN = new THREE.Color(0xff8a52);
const OMINOUS_FOG = new THREE.Color(0x4f5866);
const SHADOW_U = new THREE.Vector3();
const SHADOW_V = new THREE.Vector3();

const nullSounds: WorldSounds = { footstep() {}, impact() {}, tremor() {}, run() {}, crash() {}, escape() {}, whoosh() {}, slam() {} };

/** Presentation intensity from the multiplier (see world/choreo: the progression model). */
export { intensityOf };

export function speedOf(intensity: number): number {
  // Round 13: 5 m/s at tier 0 read as a jog. He sprints for his life from the first second (6.5 m/s
  // since round 16's longer run stride, 2.33 strides/s, under the turnover cap so the feet never
  // skate) and climbs to ~13 m/s.
  return Math.max(6.5, 5.0 + 7.6 * Math.pow(intensity, 0.85));
}

const DUST = new THREE.Color('#d9b48a');
const DUST_DARK = new THREE.Color('#8a7058');
const SPRAY = new THREE.Color('#e9f2ee');
/** Tints for the lit dust clouds (multiplied by their sun and shade colours). */
const DUST_T = new THREE.Color(0.92, 0.76, 0.6);
const MIST_T = new THREE.Color(1.05, 1.08, 1.08);
/** Queue and cloud tag for run-time danger cues (cleared on an escape). */
const CUE = 1;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private kit!: Kit;
  private track!: Track;
  private runner!: Runner;
  private water!: Water;
  private debris!: Debris;
  /** Round 13: set pieces on the way (log jumps, slides, vaults, leaps, near misses). */
  private obstacles!: ObstacleDirector;
  private particles = new Particles(1100);
  private motes = new Motes(420);
  private rain = new Rain();
  private contact = new ContactShadow(); // grounds the runner on every tier
  private ambient = new Ambient(); // world art: birds, butterflies, leaves
  /** Cinematic effects: lit dust, water shockwaves, cracks, birds, sun shafts, escape rim. */
  private cine = new Fx();
  private lastJolt = -1;
  private dangerIn = 3;
  private fxMotion: 'full' | 'reduced' | null = null;
  private post!: Post;
  // Round 11: a stronger, warmer golden-hour key (the references: low sun, deep shade, high contrast).
  private sun = new THREE.DirectionalLight(0xffd29c, 15.5);
  private sunDir = new THREE.Vector3(0.4, 0.25, -0.8);
  /** The sun as rendered in the panorama; `sunDir` is this turned by `skyYaw`. */
  private sunBase = new THREE.Vector3(0.4, 0.25, -0.8);
  /** The sky, its light and the sun turn slowly with the route's heading, so the sun stays ahead. */
  private skyYaw = 0;
  private shadowExtent = 20;
  private fill = new THREE.DirectionalLight(0xffd8b0, 1.15);
  private hemi = new THREE.HemisphereLight(0x9fd0c8, 0x8a5a3a, 0.4);
  /** The world's time-of-day look last applied (round 11; see world/look.ts). */
  private lookApplied: Look | null = null;
  private styleApplied: unknown = null;
  private mistAmount = 1;
  private tmpHead = new THREE.Vector3(); // perf
  private tmpSize = new THREE.Vector2(); // perf
  private clock = new THREE.Clock();
  private raf = 0;
  private visible = true;
  sounds: WorldSounds = nullSounds;

  stage: Stage = 'title';
  private stageT = 0;
  /** Returns ms since the run started on the server clock, or null before it starts. */
  elapsed: () => number | null = () => null;
  private frozenMult: number | null = null;
  private s = 0;
  private speed = 0;
  private yawPrev = 0;
  private stairCool = 0;
  private timeScale = 1;
  private worldT = 0;
  private fx = { danger: 0, cold: 0, gold: 0, flash: 0, fade: 0, bloom: 0 };
  private cosmetic = new Rng(1);
  private qualityLevel: QualityLevel;
  private fading: { dir: 1 | -1; done?: () => void } | null = null;
  private frameTimes: number[] = [];
  onQualityDrop: (to: QualityLevel) => void = () => {};
  autoQuality = true;
  motion: 'full' | 'reduced' = 'full';

  /** Live readout for the HUD (read by rAF in the UI, never through React state). */
  readonly live = { mult: 1, intensity: 0, speed: 0, distance: 0, tier: 0, drive: 0, heat: 0 };
  /** The run's progression (choreo.progression of the multiplier on screen); updated every frame. */
  private prog: Progression = progression(1);

  private constructor(
    private canvas: HTMLCanvasElement,
    quality: QualityLevel,
  ) {
    this.qualityLevel = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    this.rig.constrain = (p) => this.corridor(p);
    this.rig.occlude = (a, b) => this.occluder(a, b);
  }

  static async create(canvas: HTMLCanvasElement, quality: QualityLevel, onProgress: (p: number, label: string) => void): Promise<Game> {
    const g = new Game(canvas, quality);
    await g.init(onProgress);
    return g;
  }

  private async init(onProgress: (p: number, label: string) => void) {
    onProgress(0.02, 'Unearthing the ruins');
    this.kit = await loadKit((a, b) => onProgress(0.05 + 0.65 * (a / b), 'Unearthing the ruins'), pickAssetSet(this.qualityLevel)); // perf: asset set by tier/device
    const q = QUALITY[this.qualityLevel];
    const { scene, kit } = this;

    scene.background = kit.backdrop;
    kit.backdrop.mapping = THREE.EquirectangularReflectionMapping;
    scene.backgroundIntensity = 0.92; // round 8: a deeper sky, less of a pale veil over the top of the frame
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromEquirectangular(kit.env).texture;
    // The sky fills the shade; sunlit sandstone bounces warm light back into it, so shade reads
    // warm umber (as in the references), never grey.
    scene.environmentIntensity = 0.2; // round 11: deeper shade
    // Round 5: the sky fill leans teal-green (the jungle canopy and the water) against the warm key, so
    // shade reads cool and deep instead of the whole frame going one terracotta tone.
    scene.add(this.hemi); // round 11: deeper, cooler shade against the warm key (the look sets it per world)
    // Bounce from the sunlit causeway behind the lens: the sun is ahead, so without it every face
    // the camera sees (the runner's back, the wall faces) would sit in flat shade.
    this.fill.position.set(0, 0.35, 1);
    scene.add(this.fill, this.fill.target);
    pmrem.dispose();
    // World art: height fog with sun in-scattering (replaces three's fog chunks before compile).
    installAtmosphere(scene, kit.sunDir);

    this.sunBase.copy(kit.sunDir);
    this.sunDir.copy(kit.sunDir);
    this.sun.castShadow = true;
    // A low sun: long, crisp shadows. The box is tight around the runner (it follows, snapped to
    // texels so edges do not crawl); depth bias small for the long range, normal bias kills acne.
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    // Filter radius in texels (PCF: 5 rotated taps): a touch wider than 1 so edges are not stair-stepped.
    this.sun.shadow.radius = 1.4;
    installShadowEdgeFade();
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 130; // casters within ~55 m sunward only: far scenery must not blanket the causeway in a low sun
    scene.add(this.sun, this.sun.target);
    // The sun disc itself, hot enough to bloom.
    const sunDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0;
          float core = smoothstep(0.14, 0.1, d) * 14.0;
          float halo = exp(-d * 5.0) * 0.45 + exp(-d * 14.0) * 2.0;
          gl_FragColor = vec4(vec3(1.0, 0.88, 0.7) * (core + halo) * smoothstep(1.0, 0.8, d), 1.0); }`,
      }),
    );
    sunDisc.name = 'sunDisc';
    this.sunDisc = sunDisc;
    scene.add(sunDisc);

    this.water = new Water(kit.backdrop, this.sunDir);
    scene.add(this.water.mesh);
    this.track = new Track(kit);
    scene.add(this.track.root);
    this.debris = new Debris(kit);
    this.debris.onImpact = (e) => this.onDebrisImpact(e);
    scene.add(this.debris.root);
    this.runner = new Runner(kit);
    this.runner.onFootstep = (foot, k) => this.footstep(foot, k);
    this.obstacles = new ObstacleDirector({
      s: () => this.s,
      speed: () => this.speed,
      running: () => this.stage === 'run',
      rng: () => this.cosmetic,
      frameAt: (s) => {
        const f = this.track.path.sample(s);
        return { pos: f.pos.clone(), yaw: f.yaw, fwd: forward(f.yaw), right: new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw)) };
      },
      clearRun: (s0, s1) => this.clearRun(s0, s1),
      tiles: (s0, s1) =>
        // The world's separable causeway slabs (Track.slabsIn; the stepping sections are built of them).
        this.track
          .slabsIn(s0 - 4, s1 + 4)
          .filter((t) => t.alive && t.sNear >= s0 && t.sNear <= s1)
          .map((t) => ({ piece: t.piece, world: t.world, near: t.sNear, far: t.sFar, slot: t }))
          .sort((a, b) => a.near - b.near),
      hideTile: (t) => this.track.hideTile((t as unknown as { slot: TileSlot }).slot),
      add: (o) => this.scene.add(o),
      remove: (o) => {
        this.scene.remove(o);
        o.traverse((m) => {
          // Only the director's own geometries (kit geometries are shared and stay).
          const g = (m as THREE.Mesh).geometry;
          if (g && ![...this.kit.geo.values()].includes(g)) g.dispose();
        });
      },
      material: (key) => this.kit.mat.get(key),
      geometry: (piece) => this.kit.geo.get(piece),
      gait: () => this.runner.gait(),
      obstacle: (name, distance) => this.runner.obstacle(name, { distance }),
      debris: (piece, m, vel, spin, opts) => void this.debris.spawn(piece, m, vel, spin, () => null, opts),
      dust: (at, k, vel) =>
        this.cine.billows.puff(at.clone().setY(at.y + 0.2), { count: 2 + Math.round(3 * k), spread: 0.8 + k, jitter: 0.5, vel: (vel ?? new THREE.Vector3()).clone().setY(0.5 + k), size: [0.4, 1.4 + 1.6 * k], life: 1.2 + k, alpha: 0.3, tint: DUST_T, rise: 0.2, drag: 1.2, floor: at.y, group: CUE }),
      shake: (k) => this.rig.addTrauma(k),
      sound: (name, k) => this.sounds.event?.(name, k),
      cue: (name, k) => this.dangerCue(name, k, this.prog.intensity),
      lensBack: () => this.lensAlong(),
      spawnWorld: (kind, at, seed) => this.track.spawnObstacle(kind, at, seed),
      removeWorld: (o) => this.track.obstacles.remove(o as Parameters<Track['obstacles']['remove']>[0]),
      corners: (s0, s1) =>
        this.track.sections
          .filter((sec) => (sec.type === 'turnL' || sec.type === 'turnR') && sec.s0 >= s0 && sec.s0 <= s1)
          .map((sec) => ({ s0: sec.s0, s1: sec.s0 + sec.len, dir: (sec.type === 'turnL' ? 1 : -1) as 1 | -1 })),
      stepping: (s0, s1) => {
        for (let x = s0; x <= s1; x += 2) if (this.track.sectionAt(x)?.type === 'stepping') return true;
        return false;
      },
    });
    scene.add(this.runner.root);
    this.contact.attach(this.runner.root);
    scene.add(this.contact.mesh);
    scene.add(this.particles.points, this.motes.points, this.ambient.root, this.rain.mesh);
    // Cinematic fx (before the fog patch and the program warm-up below).
    this.cine.attachRunner(this.runner.root);
    scene.add(this.cine.root);
    // Materials made before the atmosphere was installed get its live uniforms too.
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) patchFogUniforms(x);
    });

    onProgress(0.72, 'Laying the causeway');
    await this.track.prepare({ foliage: q.foliageDensity, scenery: q.sceneryDensity }, (i, n) => onProgress(0.72 + 0.23 * (i / n), 'Laying the causeway'));
    this.post = new Post(this.renderer, scene, this.rig.camera, q);
    this.applyQuality(this.qualityLevel, false);
    this.newWorld('title');
    this.resize();
    onProgress(0.97, 'Lighting the way');
    // Compile every program now so the first collapse does not hitch.
    const probe = this.debris.spawn('gate_0', new THREE.Matrix4().makeTranslation(0, -50, 0), new THREE.Vector3(), new THREE.Vector3(), () => null);
    this.debris.spawn('rock_mid_0', new THREE.Matrix4().makeTranslation(0, -50, 0), new THREE.Vector3(), new THREE.Vector3(), () => null);
    this.debris.spawn('shard_0', new THREE.Matrix4().makeTranslation(0, -50, 0), new THREE.Vector3(), new THREE.Vector3(), () => null, { mat: 'floor' });
    // Full anisotropy, trilinear mips and the right colour space on every world texture.
    this.textureReport = tuneTextures(this.renderer, [scene, ...this.track.variantGroups()], this.kit.mat.values());
    await this.renderer.compileAsync(scene, this.rig.camera);
    // perf: upload every section variant's geometry and every kit texture now, not mid-run.
    warmUp(this.renderer, [scene, ...this.track.variantGroups()], this.kit.mat.values());
    this.debris.clear();
    void probe;
    onProgress(1, 'Ready');
    document.addEventListener('visibilitychange', this.onVisibility);
    this.clock.start();
    this.loop();
  }

  private sunDisc!: THREE.Mesh;
  /** QA: what tuneTextures changed, and any colour-space mismatches it saw. */
  textureReport: { changed: number; mismatches: string[] } = { changed: 0, mismatches: [] };

  /** Round 11: light and air for the current world's time-of-day look (a few uniforms, once per world). */
  private applyLook(): void {
    const L = this.track.look;
    if (L === this.lookApplied && this.track.style === this.styleApplied) return;
    this.styleApplied = this.track.style;
    this.lookApplied = L;
    this.sun.color.setHex(L.sun);
    this.sun.intensity = L.sunI;
    this.fill.intensity = L.fillI;
    this.hemi.color.setHex(L.hemiSky);
    this.hemi.groundColor.setHex(L.hemiGround);
    this.hemi.intensity = L.hemiI;
    this.scene.environmentIntensity = L.envI;
    this.scene.backgroundIntensity = L.skyI;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.setHex(L.fog);
      fog.density = L.fogDensity;
    }
    for (const key of ['stoneA', 'stoneB', 'floor', 'statue', 'glyph', 'temple']) {
      const m = this.kit.mat.get(key) as THREE.MeshStandardMaterial | undefined;
      m?.color.setRGB(...L.stoneTint);
    }
    // World round 12: the world's style — water colours and the season of the leaves.
    const st = this.track.style;
    this.water.setTint(st.waterShallow, st.waterDeep);
    for (const key of ['leaf', 'leaf_jungle']) {
      const m = this.kit.mat.get(key) as THREE.MeshStandardMaterial | undefined;
      m?.color.setRGB(0.84 * st.foliage[0], 0.9 * st.foliage[1], 0.76 * st.foliage[2]);
    }
    // Round 11: what makes a storm a storm (overcast sky, no sun, soft shadows, rain-wet stone).
    setSkyLook(L.skyTint ?? [1, 1, 1], L.skyDesat ?? 0, L.sunDisc === 0 ? 1 : 0);
    this.sunDisc.visible = (L.sunDisc ?? 1) > 0;
    this.sun.shadow.intensity = L.shadow ?? 1;
    causticUniforms.uRainWet.value = L.wet ?? 0;
    this.post.lookExposure = L.name === 'storm' ? 1.14 : 1;
  }

  private moodSun = new THREE.Color();
  private moodFog = new THREE.Color();
  private moodLeaves = -1;
  /**
   * Round 11 crescendo, every frame: the look's light and air pushed toward a gathering storm (storm
   * look) or a deepening, ominous dusk (the others) by the run's drive (0..1), punctuated by gusts.
   */
  /** Hero landmarks already announced to the audio (once each, as they come into clear view). */
  private revealed = new Set<object>();

  private applyMood(d: number, g: number): void {
    // World round 16: a hero landmark comes into clear view ~55 m before its corner (presentation only).
    if (this.stage === 'run') {
      for (const l of this.track.landmarks.list) {
        const ahead = l.s - this.s;
        if (!this.revealed.has(l) && ahead < 58 && ahead > 10) {
          this.revealed.add(l);
          this.sounds.event?.('landmark_reveal', 0.6);
        }
      }
    }
    const L = this.lookApplied;
    if (!L) return;
    const storm = (L.rain ?? 0) > 0;
    // Light: the sun sinks and reddens (or dims behind the cloud), the shade cools and deepens.
    this.moodSun.setHex(L.sun);
    if (!storm) this.moodSun.lerp(DUSK_SUN, 0.55 * d);
    this.sun.color.copy(this.moodSun);
    this.sun.intensity = L.sunI * (1 - (storm ? 0.3 : 0.38) * d);
    this.fill.intensity = L.fillI * (1 - 0.3 * d);
    // Sky and haze: darker, bruised slate; thicker air.
    const t = L.skyTint ?? [1, 1, 1];
    setSkyLook(
      [t[0] * (1 - 0.3 * d), t[1] * (1 - 0.3 * d), t[2] * (1 - 0.16 * d)],
      Math.min(1, (L.skyDesat ?? 0) + 0.35 * d),
      L.sunDisc === 0 ? 1 : 0.6 * d,
    );
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(this.moodFog.setHex(L.fog).lerp(OMINOUS_FOG, 0.5 * d));
      fog.density = L.fogDensity * (1 + 0.7 * d) * this.track.style.fog;
    }
    // Weather is part of the drive: every run starts calm (no rain, light wind), so every look has
    // headroom. The storm look opens as a still, overcast sky and breaks into wind, rain and lightning
    // as the run climbs; the clear looks gather wind and, at the very top, a first rain.
    const ss = (a: number, b: number) => {
      const x = Math.min(1, Math.max(0, (d - a) / (b - a)));
      return x * x * (3 - 2 * x);
    };
    const windBase = storm ? 1 + ((L.wind ?? 1) - 1) * ss(0.15, 0.7) : L.wind ?? 1;
    wind.uStrength.value = windBase * (1 + 1.6 * d + 2.2 * g);
    const rain = storm ? (L.rain ?? 0) * ss(0.3, 0.85) : ss(0.75, 1) * 0.6;
    this.rain.update(this.worldT, rain);
    causticUniforms.uRainWet.value = Math.min(1, (L.wet ?? 0) * (storm ? 0.15 + 0.85 * ss(0.3, 0.9) : d) + rain * 0.5);
    const bolts = (L.lightning ?? 0) * ss(0.55, 1) + (d > 0.8 ? (3 * (d - 0.8)) / 0.2 : 0);
    const f = Math.max(this.lightning(this.worldT, bolts), storm ? g * 0.8 * ss(0.3, 0.8) : 0);
    this.hemi.intensity = L.hemiI * (1 - 0.25 * d) * (1 + f * 3.5);
    this.scene.backgroundIntensity = L.skyI * (1 - 0.35 * d) * (1 + f * 2.5 + 0.25 * g);
    // Life in the air: more falling leaves as the run builds and on every gust.
    const leaves = Math.min(1, d + g * 0.8);
    if (Math.abs(leaves - this.moodLeaves) > 0.02) {
      this.moodLeaves = leaves;
      this.ambient.setLeafDensity(leaves);
      this.ambient.setGlow(0.3 + 0.7 * Math.max(d, storm ? 0.4 : 0));
    }
  }

  /** Lightning: a brief double flash now and then (cosmetic; a function of world time only). */
  private lightning(t: number, perMinute: number): number {
    if (perMinute <= 0) return 0;
    const period = 60 / perMinute;
    const k = Math.floor(t / period);
    const h = Math.sin(k * 12.9898) * 43758.5453;
    const at = k * period + (h - Math.floor(h)) * period * 0.8;
    const d = t - at;
    if (d < 0 || d > 0.45) return 0;
    return Math.max(Math.exp(-d * 18), d > 0.16 ? Math.exp(-(d - 0.16) * 14) * 0.8 : 0);
  }

  private onVisibility = () => {
    this.visible = document.visibilityState === 'visible';
    if (this.visible) this.clock.getDelta();
  };

  // ------------------------------------------------------------------ quality
  applyQuality(level: QualityLevel, rebuildTrack = true): void {
    this.qualityLevel = level;
    const q = QUALITY[level];
    this.dynRes.reset(q.minRenderScale); // perf
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    this.track.viewDistance = q.viewDistance;
    this.particles.budget = q.dust;
    this.applyFxBudget();
    this.ambient.setBudget(q.ambientLife);
    this.water.setDetail(q.waterDetail);
    this.water.setReflections(q.waterReflections > 0);
    this.motes.setBudget(q.motes);
    this.mistAmount = q.mist;
    this.shadowExtent = q.shadowExtent;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -q.shadowExtent;
    sc.right = sc.top = q.shadowExtent;
    sc.updateProjectionMatrix();
    this.post.build(q);
    this.resize();
    if (rebuildTrack) {
      void this.track.prepare({ foliage: q.foliageDensity, scenery: q.sceneryDensity }).then(() => {
        if (this.stage === 'title' || this.stage === 'setup') this.newWorld(this.stage);
      });
    }
    this.frameTimes.length = 0;
  }

  /** Effect and debris budgets from the tier and the motion setting. */
  private applyFxBudget(): void {
    this.fxMotion = this.motion;
    this.cine.setBudget(this.qualityLevel, this.motion);
    this.debris.budget = this.cine.budget.bodies;
    this.debris.shardBudget = this.cine.budget.shards;
  }

  get quality(): QualityLevel {
    return this.qualityLevel;
  }

  resize = (): void => {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    // perf: the tier caps the pixel ratio; dynamic resolution scales below that cap.
    const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, QUALITY[this.qualityLevel].pixelRatioCap) * this.dynRes.scale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.rig.setAspect(w / h);
    this.particles.setViewport(h * pr, this.rig.camera.fov);
  };

  // ------------------------------------------------------------------ stages
  /** A fresh stretch of causeway with the runner at its start. */
  private newWorld(stage: 'title' | 'setup'): void {
    const seed = `${Date.now()}-${Math.random()}`;
    this.worldSeed = seed;
    this.cosmetic = new Rng(seed);
    this.track.reset(seed);
    this.sounds.setWorldStyle?.(this.track.style.name);
    this.revealed.clear();
    this.obstacles.reset();
    this.runOn = false;
    this.escapeGateAt = 0;
    resetMood();
    this.debris.clear();
    this.particles.clear();
    this.cine.clear();
    this.releaseReveal();
    this.gapAt = null;
    this.clearEscapeGate();
    this.runner.root.visible = true;
    this.rig.gap = 0;
    this.queue.length = 0;
    this.escape = null;
    this.dangerIn = 3;
    this.lastJolt = -1;
    this.s = 0;
    this.speed = 0;
    this.frozenMult = null;
    this.fx.cold = 0;
    this.fx.gold = 0;
    this.fx.danger = 0;
    this.runner.play('idle', 0);
    this.runner.resetSecondary();
    this.slowmo = null;
    this.timeScale = 1;
    this.gateLand = null;
    this.stopAt = 0;
    this.stopDecel = 0;
    this.beatIn = 4;
    this.fx.flash = 0;
    this.fx.bloom = 0;
    this.epic = 0;
    this.setStage(stage);
    this.placeRunner(0);
    const f = this.track.path.sample(0);
    this.rig.snap(f.pos, f.yaw);
  }

  private setStage(s: Stage) {
    this.stage = s;
    this.stageT = 0;
    this.rig.setMode(s);
  }

  toTitle(): void {
    if (this.stage === 'crash' || this.stage === 'cashout') this.fadeThrough(() => this.newWorld('title'));
    else this.setStage('title');
  }

  /** Bet setup. After a finished run the world resets behind a short fade; returns when ready. */
  toSetup(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stage === 'crash' || this.stage === 'cashout') {
        this.fadeThrough(() => {
          this.newWorld('setup');
          resolve();
        });
      } else {
        this.setStage('setup');
        this.runner.play('idle', 0.4);
        resolve();
      }
    });
  }

  private fadeThrough(mid: () => void): void {
    const prev = this.fading?.dir === 1 ? this.fading.done : undefined;
    this.fading = { dir: 1, done: prev ? () => (prev(), mid()) : mid };
  }

  /** The bet is accepted: coil, then go when the server clock says so. */
  lead(): void {
    if (this.stage === 'crash' || this.stage === 'cashout' || this.fading) {
      // A new round before the last one's cinematic (or its fade) finished: reset now, no fade.
      const pending = this.fading?.dir === 1 ? this.fading.done : undefined;
      this.fading = null;
      this.fx.fade = 0;
      if (pending) pending();
      else if (this.stage === 'crash' || this.stage === 'cashout') this.newWorld('setup');
    }
    this.releaseReveal();
    this.frozenMult = null;
    this.live.mult = 1;
    this.setStage('lead');
    this.runner.play('ready', 0.3);
    this.beatIn = 4;
    this.sounds.whoosh();
  }

  /**
   * The way falls. `mult` is the crash point (hundredths), public now that the round has settled.
   * Staging is chosen from the round id and that multiplier only (see world/choreo). Game logic never
   * waits on any of this: it returns at once and the presentation follows.
   */
  crash(mult: number, roundId: string, forceKind?: CrashKind, forceVariant?: number): void {
    if (this.stage === 'crash' || this.stage === 'cashout') {
      queueMicrotask(() => this.onReveal());
      return;
    }
    this.frozenMult = mult;
    this.live.mult = mult / 100;
    const sec = this.track.sectionAt(this.s);
    const hazards = sec?.layout.hazards ?? ['rockfall'];
    const standing = this.stage === 'lead' || this.speed < 2;
    const st = crashStaging(roundId, mult / 100, hazards, standing);
    if (forceKind && !standing) st.kind = forceKind;
    if (forceVariant !== undefined && !standing) st.variant = forceVariant % CRASH_CLIPS[st.kind].length;
    // A chasm needs collapsible floor ahead (not stairs or a plaza): otherwise the rocks come down.
    if (st.kind === 'chasm' && this.tileEdge(this.s + 1.4, this.s + (this.speed * 0.45) / 2 + 5) === null) st.kind = 'rockfall';
    if (!standing) st.clip = CRASH_CLIPS[st.kind][st.variant % CRASH_CLIPS[st.kind].length]!;
    this.setStage('crash');
    this.obstacles.settle();
    this.runner.play(st.clip as RunnerAnim, standing ? 0.08 : 0.12);
    this.crashKind = st.kind;
    this.staging = st;
    this.epic = st.epic;
    this.cine.bars.target = 0.06;
    // Nothing of an escape may linger into a fall (shafts, sunburst, glints, the light pool).
    this.cine.beams.clear();
    this.cine.glory.clear();
    this.cine.sparkles.clear();
    this.cine.pool.clear();
    this.stageCrash(st, new Rng(`${roundId}/staging`), mult / 100);
    if (!this.rev) this.holdReveal(0.3);
    this.sounds.crash(st.kind);
  }

  private crashKind = 'gate';
  /** Presentation time at which the camera starts tilting down into a chasm after the runner. */
  private gapAt: number | null = null;

  // ------------------------------------------------------------------ result reveal (presentation)
  /**
   * Fires once the fall or the escape has played its beat, so the interface can hold the result card
   * until then. Money, balance and phase never wait on it: crash() and cashout() return at once, and
   * a new round, a reset, or a hidden tab (real-time fallback) always releases it.
   */
  onReveal: () => void = () => {};
  private rev: { impactAt: number; after: number; t: number; cap: number; timer: number } | null = null;

  /** Hold the reveal until `after` real seconds past the impact `impactIn` presentation-seconds away. */
  private holdReveal(impactIn: number, outcome: 'fall' | 'escape' = 'fall'): void {
    const H = revealHold(outcome, this.live.mult, this.motion);
    if (this.rev) clearTimeout(this.rev.timer);
    this.rev = { impactAt: this.worldT + impactIn, after: H.after, t: 0, cap: H.cap, timer: this.revealFallback(H.cap + 0.6) };
  }

  /**
   * Real-time fallback for the reveal, for a hidden or stalled tab only: while frames keep coming the
   * hold follows the presentation clock (a slow device must not show the card before the impact).
   */
  private revealFallback(sec: number): number {
    return window.setTimeout(() => {
      if (!this.rev) return;
      // Hidden, or no frame at all for a while: release. (Slow frames still step the beat on real
      // time, see loop(), so they never need the fallback.)
      if (document.visibilityState !== 'visible' || performance.now() - this.lastFrameAt > 4000) this.reveal();
      else this.rev.timer = this.revealFallback(0.5);
    }, sec * 1000);
  }
  private lastFrameAt = 0;

  private reveal(): void {
    if (this.rev) clearTimeout(this.rev.timer);
    this.rev = null;
    this.rig.revealed = this.stage === 'crash' || this.stage === 'cashout';
    this.cine.bars.target = 0;
    this.onReveal();
  }

  /** Release a pending reveal now (or tell the interface there is nothing to wait for). */
  private releaseReveal(): void {
    if (this.rev) this.reveal();
  }

  /** The carved gate an escape runs toward (presentation only; removed with the round). */
  private escapeGate: THREE.Mesh | null = null;
  private placeEscapeGate(pos: THREE.Vector3, yaw: number): void {
    this.clearEscapeGate();
    const geo = this.kit.geo.get('lintel_gate_0');
    const mat = this.kit.mat.get(this.kit.matOf.get('lintel_gate_0') ?? '');
    if (!geo || !mat) return;
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.y = yaw;
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    this.escapeGate = m;
  }
  private clearEscapeGate(): void {
    if (this.escapeGate) this.scene.remove(this.escapeGate);
    this.escapeGate = null;
  }

  /** The collapsible floor tile under route distance `s`, if any. */
  private tileUnder(s: number): TileSlot | null {
    for (const sec of this.track.sections) {
      for (const t of sec.tiles) {
        if (!this.collapsible(t)) continue;
        const [a, b] = this.tileSpan(t);
        if (s >= a && s < b) return t;
      }
    }
    return null;
  }

  /**
   * Dress the falling slab as a massive carved door: a gold mask set in its medallion and a carved
   * relief band across its foot (kit pieces, children of the debris body so they fall with it).
   */
  private dressDoor(door: THREE.Mesh): void {
    const add = (piece: string, pos: [number, number, number], scale: [number, number, number], rotY = 0) => {
      const geo = this.kit.geo.get(piece);
      const mat = this.kit.mat.get(this.kit.matOf.get(piece) ?? '');
      if (!geo || !mat) return;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos);
      m.scale.set(...scale);
      m.rotation.y = rotY;
      m.castShadow = true;
      m.receiveShadow = true;
      door.add(m);
    };
    // Limestone, not the glyph atlas (which stretches across a slab this size like wood grain).
    const stone = this.kit.mat.get('statue') ?? this.kit.mat.get('stoneB');
    if (stone) door.material = stone;
    // The medallion faces the runner (+z, centre 3.3 m up, r 1.35 m): the gold mask fills it.
    add('face_gate_0_gold', [0, 3.3 - 12.33 * 0.36, 0.5], [0.36, 0.36, 0.2]);
    // A carved relief band across the lower door, both faces, in the same limestone.
    for (const side of [1, -1]) add(`relief_wall_${side > 0 ? 0 : 1}`, [side > 0 ? 2.65 : -2.73, 0.55, side * 0.5], [0.22, 0.5, 1.25], (side * Math.PI) / 2);
    for (const c of door.children) if (stone && (c as THREE.Mesh).material !== this.kit.mat.get('gold')) (c as THREE.Mesh).material = stone;
    // A raised, stepped border: a heavy lintel band, a plinth, two jambs, and step-fret blocks.
    if (!stone) return;
    const box = (w: number, hgt: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), stone);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      door.add(m);
    };
    box(6.5, 0.6, 1.3, 0, 5.75, 0);
    box(6.5, 0.45, 1.3, 0, 0.22, 0);
    for (const x of [-2.95, 2.95]) box(0.55, 5.2, 1.25, x, 3.0, 0);
    for (let k = -4; k <= 4; k++) box(0.42, k % 2 ? 0.3 : 0.5, 0.25, k * 0.66, 5.2 + (k % 2 ? 0.15 : 0.25), 0.62);
  }

  private staging: CrashStaging | EscapeStaging | null = null;
  private epic = 0;
  private worldSeed = '';
  private beatIn = 4;

  /**
   * The runner escapes. The variant comes from the round (or world) seed and the cash-out multiplier
   * only: it never knows where the round would have fallen, and the way ahead stays intact and calm.
   */
  cashout(roundId?: string): void {
    if (this.stage === 'crash' || this.stage === 'cashout') {
      queueMicrotask(() => this.onReveal());
      return;
    }
    const v = this.speed;
    const st = escapeStaging(roundId ?? this.worldSeed, this.live.mult, v < 2.5);
    const E = escapeScale(this.live.mult, this.motion);
    this.staging = st;
    this.epic = st.epic;
    this.escape = E;
    // The stage changes now; the lens keeps its chase (no mode change, no reset) until he pulls up —
    // land() below switches it to the celebration.
    this.stage = 'cashout';
    this.stageT = 0;
    // Round 13 — "made it": no set piece or near miss from here on (honesty: nothing staged after a
    // cash-out); pieces still ahead crumble away, the way ahead is clear.
    this.obstacles.settle();
    const clip = st.variant === 'lookback' ? 'win_cheer' : st.clip;
    // Stop distance v·T/2 matches each clip's braking: cheer/lookback decelerate over four steps
    // (~1 s, runner round 16), so the root stops with the feet and they never slide.
    const T = { lookback: 1.0, cheer: 1.0, salute: 1.0, leap: 1.15 }[st.variant];
    // He is still running: he carries on through the last strides to safe ground before the gate of
    // light (longer, more triumphant, for a bigger multiplier), then pulls up and celebrates. The
    // money is settled already; only the picture runs on.
    let runOn = v > 3 && this.motion === 'full' ? 0.75 + 0.55 * E.g : 0;
    // Safe ground is on the straight: with a corner coming up, he pulls up (and the gate stands)
    // before it — the celebration orbit inside a corner plaza ran the lens into its walls.
    const gateGap = 3.4 + 1.6 * E.g;
    const corner = this.track.sections.find((sec) => (sec.type === 'turnL' || sec.type === 'turnR') && sec.s0 + sec.len > this.s - 2 && sec.s0 < this.s + v * runOn + (v * T) / 2 + gateGap + 4);
    if (corner) {
      const room = corner.s0 - 3 - gateGap - (v * T) / 2 - this.s;
      runOn = room > v * 0.3 ? Math.min(runOn, room / v) : 0;
    }
    const stop = this.s + v * runOn + (v * T) / 2;
    const gateAt = stop + gateGap;
    const fg = this.track.path.sample(gateAt);
    this.placeEscapeGate(fg.pos, fg.yaw);
    this.escapeGateAt = gateAt;
    this.sounds.escape();
    this.fx.flash = 0.08 + 0.06 * E.g;
    const land = () => {
      if (this.stage !== 'cashout' || this.escape !== E) return;
      this.runOn = false;
      this.runner.play(clip as RunnerAnim, 0.2, st.offset);
      this.setStop(stop);
      this.fx.flash = 0.16 + 0.12 * E.g;
      this.rig.setMode('cashout', { side: this.cosmetic.chance(0.5) ? 1 : -1, escape: st.variant, epic: st.epic, reveal: 1 });
      // A held breath on the moment of escape, longer and deeper for a big one (the leap holds at its apex).
      if (this.speed > 3) this.slowmo = { t: st.variant === 'leap' ? -0.3 : 0, dur: E.slowDur, min: E.slowMin };
      this.stageEscape(E);
    };
    if (runOn > 0) {
      this.runOn = true;
      // The chase lens stays on him (calming as the tier falls away) until he pulls up.
      this.sounds.event?.('made_it', E.g);
      // Relief: half a stride before he pulls up, a stumble of exhausted relief.
      this.later(Math.max(0, runOn - 0.45), () => this.stage === 'cashout' && this.runOn && this.runner.stumble());
      this.later(runOn, land);
    } else land();
  }

  /** The cash-out run-on is in progress (he keeps his speed to the gate). */
  private runOn = false;
  private escapeGateAt = 0;

  private escape: EscapeScale | null = null;

  /**
   * The reward: sun shafts brighten onto the way ahead, birds lift out of the trees, and a warm rim
   * of light catches the runner. Nothing here looks back: the route behind stays whole and quiet,
   * and run-time danger cues still in the air are faded out.
   */
  private stageEscape(E: EscapeScale): void {
    const c = this.cosmetic;
    this.queue = this.queue.filter((q) => q.tag !== CUE);
    this.cine.billows.fadeGroup(CUE, 0.45);
    const s0 = this.stopAt;
    for (let k = 0; k < E.beams; k++) {
      const f = this.track.path.sample(s0 + 2 + k * c.range(2.5, 4.5));
      const rv = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
      const g = f.pos.clone().addScaledVector(rv, c.range(-2.4, 2.4));
      this.cine.beams.add(g, this.sunDir, c.range(1.0, 2.4), c.range(0.55, 1));
    }
    this.cine.beams.level = E.shafts;
    this.cine.rimLevelTarget = E.rim;
    // The burst into light: a glory of sun on the way ahead, behind the runner's silhouette, at every
    // multiplier (bigger and longer for a big one).
    const g = E.g;
    const f0 = this.track.path.sample(s0);
    const fw = forward(f0.yaw);
    // A place to escape to: a carved gate stands on the way ahead with daylight pouring through it.
    // (Placed by cashout() as he starts his run-on, so he runs toward it.)
    const gateAt = this.escapeGateAt > s0 ? this.escapeGateAt : s0 + 10 + 3 * g;
    const fg = this.track.path.sample(gateAt);
    if (!this.escapeGate) this.placeEscapeGate(fg.pos, fg.yaw);
    this.rig.gateAhead = gateAt - s0;
    const glory = fg.pos.clone().addScaledVector(forward(fg.yaw), 0.9).setY(fg.pos.y + 3.0);
    // Capped so the scene keeps its contrast (no bloom whiteout), a touch more for a big escape.
    this.cine.glory.flare(glory, 7 + 3 * g, 0.5 + 0.2 * g, 1.0 + 1.2 * g);
    // Gold and jade glints burst up from the runner's feet, then keep rising around them.
    const feet = () => this.runner.root.position;
    this.later(0.1, () => this.cine.sparkles.burst(feet(), Math.round(36 + 110 * g), 4 + 2.5 * g, 0.5));
    for (let k = 1; k <= 11; k++) this.later(0.1 + k * 0.3, () => this.cine.sparkles.burst(feet(), Math.round(5 + 12 * g), 2.4 + g, 0.9, 0.4, 0.06, 2.0));
    // Safe ground: a warm pool of light at their feet, and the frame closes in like a film.
    this.cine.pool.target = 0.32 + 0.2 * g;
    this.cine.bars.target = 0.045;
    this.holdReveal(0, 'escape');
    this.later(0.35, () => {
      const f = this.track.path.sample(s0 + c.range(14, 22));
      const rv = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
      const side = c.chance(0.5) ? 1 : -1;
      const from = f.pos.clone().addScaledVector(rv, side * c.range(5, 9)).setY(f.pos.y + c.range(4, 6.5));
      // They rise and wheel off toward the light ahead.
      const toward = forward(f.yaw).addScaledVector(this.sunDir, 0.6).addScaledVector(rv, side * 0.3);
      this.cine.flock.launch(from, toward, Math.ceil(E.birds * 0.6), 4, 0.8);
    });
    if (E.birds > 10)
      this.later(1.1, () => {
        const f = this.track.path.sample(s0 + c.range(24, 34));
        const rv = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
        const from = f.pos.clone().addScaledVector(rv, c.range(-10, 10)).setY(f.pos.y + c.range(5, 8));
        this.cine.flock.launch(from, forward(f.yaw).addScaledVector(this.sunDir, 0.5), Math.floor(E.birds * 0.4), 6, 1.2);
      });
  }

  /** Decelerate uniformly to stand at `sStop` (presentation only). */
  private setStop(sStop: number): void {
    this.stopAt = Math.max(this.s, sStop);
    const d = Math.max(0.01, this.stopAt - this.s);
    this.stopDecel = (this.speed * this.speed) / (2 * d);
  }
  private stopAt = 0;
  private stopDecel = 0;

  /** Keep a camera position inside the open corridor: between the walls (below their tops) and above the floor. */
  private cframe = { pos: new THREE.Vector3(), yaw: 0 };
  // ------------------------------------------------------------------ camera occlusion
  private occl = {
    rc: new THREE.Raycaster(),
    mesh: new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
    hits: [] as THREE.Intersection[],
    ray: new THREE.Ray(),
    local: new THREE.Ray(),
    hit: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    cache: new WeakMap<object, { geo: THREE.BufferGeometry; world: THREE.Matrix4; inv: THREE.Matrix4 }[]>(),
  };

  /** Solid near-path props of a section (walls, pillars, arches, stelae — not leaves, not far scenery). */
  private solids(sec: { type?: string; root: THREE.Object3D; layout: { props: { piece: string; m: THREE.Matrix4 }[] } }, all = false) {
    const cache = all ? this.occlAll : this.occl.cache;
    let list = cache.get(sec);
    if (list) return list;
    list = [];
    const p = new THREE.Vector3();
    // A corner's exit leg runs off along the section's local x: there "near the way" is not |x|
    // small (its walls and piers stood at |x| > 7.5 and the lens could sit inside them unseen).
    const corner = sec.type === 'turnL' || sec.type === 'turnR';
    for (const pl of sec.layout.props) {
      const geo = this.kit.geo.get(pl.piece);
      const mat = this.kit.matOf.get(pl.piece);
      if (!geo || !mat || mat === 'leaf') continue;
      if (!all && !corner && Math.abs(p.setFromMatrixPosition(pl.m).x) > 7.5) continue;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const world = sec.root.matrix.clone().multiply(pl.m);
      list.push({ geo, world, inv: world.clone().invert() });
    }
    cache.set(sec, list);
    return list;
  }

  /**
   * Distance from `from` to the first solid prop on the segment to `to`, or null when clear. Broad
   * phase: each prop's local bounding box; narrow phase: an exact raycast of that one piece.
   */
  private occluder(from: THREE.Vector3, to: THREE.Vector3): number | null {
    if (!this.track) return null;
    const o = this.occl;
    const len = o.dir.copy(to).sub(from).length();
    if (len < 1e-3) return null;
    o.dir.divideScalar(len);
    o.ray.set(from, o.dir);
    let best: number | null = null;
    for (const sec of this.track.sections) {
      if (sec.s0 > this.s + 25 || sec.s0 + sec.len < this.s - 25) continue;
      for (const e of this.solids(sec)) {
        o.local.copy(o.ray).applyMatrix4(e.inv);
        if (!o.local.intersectBox(e.geo.boundingBox!, o.hit)) continue;
        o.hit.applyMatrix4(e.world);
        if (o.hit.distanceTo(from) > len) continue;
        o.mesh.geometry = e.geo;
        o.mesh.matrixWorld.copy(e.world);
        o.rc.set(from, o.dir);
        o.rc.far = len;
        o.hits.length = 0;
        o.mesh.raycast(o.rc, o.hits);
        for (const h of o.hits) if (best === null || h.distance < best) best = h.distance;
      }
    }
    return best;
  }

  /** QA: pin the camera in the runner's frame (along, lat, up, look height, fov) after the rig. */
  debugPin: { along: number; lat: number; up: number; lookUp: number; fov: number } | null = null;

  private corridor(p: THREE.Vector3): void {
    if (!this.track || !this.runner) return;
    const rp = this.runner.root.position;
    const ry = this.runner.root.rotation.y;
    const along = (p.x - rp.x) * -Math.sin(ry) + (p.z - rp.z) * -Math.cos(ry);
    const s = this.s + THREE.MathUtils.clamp(along, -30, 30);
    const f = this.track.path.sample(s, this.cframe);
    const rx = Math.cos(f.yaw);
    const rz = -Math.sin(f.yaw);
    const lat = (p.x - f.pos.x) * rx + (p.z - f.pos.z) * rz;
    const h = p.y - f.pos.y;
    const walls = this.track.sectionAt(s)?.layout.walls ?? 'low';
    const top = walls === 'tall' || walls === 'cliff' ? 6.4 : walls === 'low' ? 2.2 : 0;
    let lim = h < top ? PATH_HALF - 0.3 : walls === 'none' ? PATH_HALF + 0.4 : Infinity;
    // Round 17: the result shot stays over the way (its orbit swung out over the parapet, into
    // whatever stands beyond it, and the band under the card filled with masonry).
    if ((this.stage === 'cashout' || this.stage === 'crash') && this.rig.revealK > 0.05) lim = Math.min(lim, PATH_HALF + 0.3 + 8 * (1 - this.rig.revealK) ** 2); // eased in with the card
    if (Math.abs(lat) > lim) {
      const d = Math.sign(lat) * lim - lat;
      p.x += rx * d;
      p.z += rz * d;
      // Give back the lost distance along the route (away from the runner), so a wide orbit in a
      // narrow corridor still frames the whole figure instead of pressing against the wall.
      if (this.stage !== 'run' && this.stage !== 'lead') {
        const k = Math.sign(along || -1) * Math.min(3, Math.abs(d)) * 0.8;
        p.x += -Math.sin(ry) * k;
        p.z += -Math.cos(ry) * k;
      }
    }
    p.y = Math.max(p.y, f.pos.y + 0.45);
  }

  // ------------------------------------------------------------------ crash staging
  /** A tile's span along the route, measured from its world matrix (independent of Track's bookkeeping). */
  private tileSpan(t: { world: THREE.Matrix4; sNear: number; sFar: number }): [number, number] {
    const e = t.world.elements;
    const o = new THREE.Vector3(e[12], e[13], e[14]);
    const d = new THREE.Vector3(-e[8], -e[9], -e[10]).normalize();
    const c = o.addScaledVector(d, 2);
    const mid = (t.sNear + t.sFar) / 2;
    const f = this.track.path.sample(mid);
    const sc = mid + (c.x - f.pos.x) * -Math.sin(f.yaw) + (c.z - f.pos.z) * -Math.cos(f.yaw);
    return [sc - 2, sc + 2];
  }

  /**
   * A stretch a set piece can stand on: level, straight floor (no stairs, no bend), no crash
   * staging, no reveal gate, and inside the built route.
   */
  private clearRun(s0: number, s1: number): boolean {
    const a = this.track.path.sample(s0);
    const y0 = a.pos.y;
    const yaw0 = a.yaw;
    for (let s = s0; s <= s1 + 1e-3; s += 1) {
      const sec = this.track.sectionAt(s);
      if (!sec) return false;
      const f = this.track.path.sample(s);
      if (Math.abs(f.pos.y - y0) > 0.12) return false;
      const d = f.yaw - yaw0;
      if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > 0.2) return false;
      for (const t of sec.tiles) if (t.piece.startsWith('stairs') && Math.abs(this.tileSpan(t)[0] + 2 - s) < 2.5) return false;
    }
    return true;
  }

  private collapsible(t: { piece: string; alive: boolean }): boolean {
    return t.alive && t.piece !== 'floor_wide_0' && !t.piece.startsWith('stairs');
  }

  /** The start of the first collapsible tile starting within [sMin, sMax] (tile seams make clean edges). */
  private tileEdge(sMin: number, sMax: number): number | null {
    let best: number | null = null;
    for (const sec of this.track.sections) {
      for (const t of sec.tiles) {
        if (!this.collapsible(t)) continue;
        const n = this.tileSpan(t)[0];
        if (n >= sMin && n <= sMax && (best === null || n < best)) best = n;
      }
    }
    return best;
  }

  /** Drop every collapsible tile that starts at or beyond `edge` (up to `to`); returns them for debris. */
  private collapseFrom(edge: number, to: number): { piece: string; world: THREE.Matrix4 }[] {
    const out: { piece: string; world: THREE.Matrix4 }[] = [];
    for (const sec of this.track.sections) {
      for (const t of sec.tiles) {
        if (!this.collapsible(t)) continue;
        const n = this.tileSpan(t)[0];
        if (n < edge - 0.3 || n > to) continue;
        this.track.hideTile(t);
        out.push({ piece: t.piece, world: t.world });
      }
    }
    return out;
  }

  /**
   * Stage the fall. Everything here is presentation chosen after the outcome is
   * known (kind and details come from an RNG seeded by the round id): the runner
   * brakes to a mark, the hazard is timed to meet them there, and the camera,
   * slow motion, dust and debris are choreographed around that beat.
   */
  private stageCrash(st: CrashStaging, r: Rng, mult: number): void {
    const kind = st.kind;
    const F = fallScale(mult, this.motion);
    const e = F.g;
    // Small falls are quick and contained; big ones slow, wide and long. `t` is a real-time delay.
    const slow = (t: number, durK = 1, minK = 0) => {
      this.slowmo = { t, dur: F.slowDur * durK, min: Math.min(1, F.slowMin + minK) };
    };
    const v = this.speed;
    const sec = this.track.sectionAt(this.s);
    const openSide = sec?.layout.walls === 'cliff' ? (sec.mirror ? 1 : -1) : r.chance(0.5) ? 1 : -1;
    this.timeScale = 1;
    const shot = kind === 'chasm' ? 'chasm' : kind === 'rockfall' ? 'rockfall' : 'gate';
    this.rig.setMode('crash', { side: st.variant ? -openSide : openSide, shot, variant: st.variant, epic: e });
    const wallsOf = (s: number) => this.track.sectionAt(s)?.layout.walls ?? 'low';
    const frameAt = (s: number) => {
      const f = this.track.path.sample(s);
      return { pos: f.pos.clone(), yaw: f.yaw, fwd: forward(f.yaw), right: new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw)) };
    };
    const onPath = (at: { pos: THREE.Vector3; right: THREE.Vector3 }) => (x: number, z: number) => {
      const lateral = Math.abs((x - at.pos.x) * at.right.x + (z - at.pos.z) * at.right.z);
      return lateral < PATH_HALF + 0.2 ? at.pos.y : null;
    };
    const n = (k: number) => Math.max(1, Math.round(k * F.debris));
    const B = this.cine.billows;
    // The main impact: camera kick (trauma, a jolt of the operator, a lens punch) and a flash.
    const kick = (k = 1) => {
      this.rig.addTrauma(F.shake * k);
      this.rig.jolt(0.6 * k + 0.6 * e * k, F.kick * k);
      this.lastJolt = this.worldT;
    };

    if (kind === 'chasm') {
      // Skid to the lip of a tile seam. Cracks race across the floor first; then the floor beyond
      // drops away from the edge outwards, breaking up as it goes.
      const want = this.s + (v * 0.45) / 2 + 0.55;
      const edge = this.tileEdge(Math.max(this.s + 1.4, want - 2.2), want + 4) ?? want;
      this.setStop(edge - 0.5);
      const h = frameAt(edge);
      this.rig.focus.copy(h.pos).addScaledVector(h.fwd, 2).setY(h.pos.y + 0.2);
      // Pre-impact: the fissure spreads across the seam, grit jumps from it, the ground groans.
      this.cine.cracks.spawn(h.pos.clone().setY(h.pos.y + 0.05).addScaledVector(h.fwd, 0.3), h.yaw, PATH_HALF * 2 + 0.2, 2.2 + 2 * e, F.pre * 0.9, F.pre * 0.1 + 0.12);
      this.sounds.tremor(0.5 + 0.5 * e);
      this.rig.addTrauma(0.12 + 0.1 * e);
      for (let k = 0; k < 4 + Math.round(4 * e); k++) {
        this.later((k / (4 + 4 * e)) * F.pre, () => {
          const p = h.pos.clone().addScaledVector(h.right, r.range(-PATH_HALF, PATH_HALF)).setY(h.pos.y + 0.05);
          this.particles.burst(p, 5, { spread: 0.3, up: 1.8, speed: 0.6, size: 0.05, life: 0.6, color: DUST_DARK, alpha: 0.7, gravity: 9, drag: 0.4, grow: 0 });
          B.puff(p, { count: 1, spread: 0.4, jitter: 0.3, vel: new THREE.Vector3(0, 0.6, 0), size: [0.3, 1.1], life: 1.4, alpha: 0.35, tint: DUST_T, rise: 0.1, floor: h.pos.y });
        });
      }
      this.later(F.pre, () => {
        const tiles = this.collapseFrom(edge, edge + F.span);
        const dist = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m).distanceTo(h.pos);
        tiles.sort((a, b) => dist(a.world) - dist(b.world));
        const gap = 0.07 * (1 + 0.8 * e);
        tiles.forEach((t, i) => {
          this.later(0.02 + i * gap, () => {
            // A slab in his fall line (the first metres beyond the lip, where he goes over at ~1.1 s)
            // drops fast and tips out sideways, so he never lands on, rides or clips a falling slab.
            const tp = new THREE.Vector3().setFromMatrixPosition(t.world).sub(h.pos);
            const along = tp.dot(h.fwd);
            const inLine = along > -0.5 && along < 3.5;
            const out = Math.sign(tp.dot(h.right) || (r.chance(0.5) ? 1 : -1));
            this.debris.spawn(
              t.piece,
              t.world,
              inLine
                ? h.right.clone().multiplyScalar(out * r.range(2.2, 3.2)).setY(-r.range(3.5, 4.5))
                : new THREE.Vector3(r.range(-0.6, 0.6), r.range(-1.5, 0), r.range(-0.6, 0.6)),
              new THREE.Vector3(r.range(-1.2, 1.2), r.range(-0.3, 0.3), r.range(-1.2, 1.2)),
              () => null,
              // Slabs crack up as they drop: the nearer ones a moment after they go.
              { breakInto: 4, breakAfter: r.range(0.3, 0.6) },
            );
            const p = new THREE.Vector3().setFromMatrixPosition(t.world);
            p.y += 0.1;
            this.particles.burst(p, 10, { spread: 3, up: 1.4, speed: 2.6, size: 0.6, life: 1.6, color: DUST, alpha: 0.25 });
            // A cloud boils up out of the gap and rolls back over the lip.
            B.puff(p, { count: 2 + Math.round(2 * F.dust), spread: 3, jitter: 1.2, vel: new THREE.Vector3(0, 1.6 + 1.2 * e, 0).addScaledVector(h.fwd, -0.4), size: [1.2, 3.6 + 2.5 * e], life: 2.6 + 1.6 * e, alpha: 0.36, tint: DUST_T, rise: 0.35, drag: 1.1 });
            if (i === 0) kick();
            else if (i < 3) this.rig.addTrauma(0.15);
          });
        });
        this.fx.flash = 0.18 + 0.1 * e;
        this.sounds.impact(0.7 + 0.3 * e, false);
      });
      // Grit pours off the broken lip for a while.
      for (let k = 0; k < 10 + 8 * e; k++) {
        this.later(F.pre + 0.2 + k * 0.18, () => {
          const p = h.pos.clone().addScaledVector(h.right, r.range(-PATH_HALF, PATH_HALF)).setY(h.pos.y - 0.05);
          this.particles.burst(p, 4, { spread: 0.4, up: 0.1, speed: 0.4, size: 0.18, life: 1.4, color: DUST_DARK, alpha: 0.45, gravity: 6 });
        });
      }
      // Loose blocks from the walls go with it.
      const walls = wallsOf(edge + 3);
      const blocks = (count: number, at0: number, spanK: number, t0: number, big: boolean) => {
        for (let k = 0; k < count; k++) {
          const side = walls === 'cliff' ? -openSide : k % 2 ? 1 : -1;
          const p = h.pos.clone().addScaledVector(h.fwd, at0 + r.range(0, spanK)).addScaledVector(h.right, side * r.range(2.5, 3.2)).setY(h.pos.y + r.range(0.8, big ? 3.2 : 1.6));
          this.later(t0 + k * 0.12, () => {
            this.debris.spawn(big ? r.pick(['rubble_2', 'rubble_3', 'rock_mid_0']) : `rubble_${r.int(0, 1)}`, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), h.fwd.clone().multiplyScalar(r.range(-1, 1)).addScaledVector(h.right, -side * r.range(0.5, 2.5)), new THREE.Vector3(r.range(-3, 3), r.range(-3, 3), r.range(-3, 3)), () => null, { scale: big ? r.range(0.7, 1.1) : r.range(0.5, 0.9), breakInto: big ? 3 : 0, breakAfter: big ? r.range(0.5, 0.9) : Infinity });
            if (walls !== 'none') B.puff(p, { count: 2, spread: 0.8, jitter: 0.5, vel: h.right.clone().multiplyScalar(-side * 2.2), size: [0.8, 2.4], life: 2, alpha: 0.45, tint: DUST_T, rise: 0.05 });
          });
        }
      };
      // (From 2.5 m beyond the lip: blocks off the walls never cross his fall line.)
      if (walls !== 'none') blocks(n(4), 2.5, 8, F.pre + 0.3, false);
      // Big falls: the walls beside the gap come down too, in waves, the gap still widening.
      if (F.waves >= 1) {
        this.later(F.pre + 1.0, () => kick(0.5));
        if (walls !== 'none') blocks(n(3), 2, 10, F.pre + 0.9, true);
        const far = this.collapseFrom(edge + F.span, edge + F.span + 8);
        far.forEach((t, i) => this.later(F.pre + 1.2 + i * 0.09, () => this.debris.spawn(t.piece, t.world, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(r.range(-1, 1), 0, r.range(-1, 1)), () => null, { breakInto: 3, breakAfter: r.range(0.3, 0.5) })));
      }
      if (F.waves >= 2) {
        this.later(F.pre + 2.0, () => {
          kick(0.6);
          this.sounds.impact(1, false);
          const p = h.pos.clone().addScaledVector(h.fwd, 7).setY(h.pos.y - 1);
          B.puff(p, { count: 6, spread: 7, jitter: 1.5, vel: new THREE.Vector3(0, 3, 0), size: [2.5, 7], life: 4, alpha: 0.4, tint: DUST_T, rise: 0.5, drag: 0.9 });
        });
        if (walls !== 'none') blocks(n(3), 4, 10, F.pre + 1.9, true);
      }
      // He goes with it (fall_chasm): after the teeter the slab under him gives and the clip tips him
      // over the lip and down (its root leaves the floor at ~1.1 s), to the water below — a splash,
      // never anything worse. The camera stays at the lip and tilts down after him. Where there is
      // no slab to give, or for the other variant, he kneels at the edge instead (fall_chasm_b).
      // The slab under him goes just as fall_chasm's root leaves the floor (1.1 s; runner round 17).
      const dropT = 1.1;
      const under = st.variant % 2 === 0 ? this.tileUnder(this.stopAt) : null;
      if (st.variant % 2 === 0 && !under) this.runner.play('fall_chasm_b', 0.12);
      if (under) {
        this.later(dropT - 0.06, () => {
          this.track.hideTile(under);
          // It drops out from under him (fast, back under the lip, tipping), never riding down with him.
          this.debris.spawn(under.piece, under.world, h.fwd.clone().multiplyScalar(-1.5).setY(-3), h.right.clone().multiplyScalar(r.chance(0.5) ? 2.5 : -2.5), () => null, { breakInto: 3, breakAfter: 0.3 });
          const p = this.runner.root.position.clone();
          this.particles.burst(p, 10, { spread: 2.2, up: 1.2, speed: 2, size: 0.5, life: 1.4, color: DUST, alpha: 0.3 });
          B.puff(p, { count: 2 + Math.round(2 * F.dust), spread: 2.4, jitter: 0.8, vel: new THREE.Vector3(0, 1.4, 0), size: [0.9, 2.8 + 1.5 * e], life: 2.4, alpha: 0.36, tint: DUST_T, rise: 0.3 });
          kick(0.7);
          this.sounds.impact(0.6 + 0.3 * e, false);
        });
        this.gapAt = this.worldT + dropT + 0.1;
        // The root leaves the lip (fall_chasm, ~1.1 s): the body dropping away (audio event).
        this.later(1.1, () => this.sounds.event?.('fall_drop', 1));
        this.later(1.75, () => {
          const p = this.runner.root.position.clone().addScaledVector(h.fwd, 0.4).setY(WATER_Y);
          this.particles.burst(p, 40, { spread: 1.2, up: 7, speed: 3, size: 0.32, life: 1.2, color: SPRAY, alpha: 0.8, gravity: 9.5, drag: 0.5, grow: 0.6 });
          B.puff(p, { count: 3, spread: 1.4, jitter: 0.8, vel: new THREE.Vector3(0, 2.4, 0), size: [0.8, 3], life: 1.8, alpha: 0.4, tint: MIST_T, rise: 0.2, floor: WATER_Y });
          this.cine.rings.spawn(p, 4.5, 1);
          this.sounds.impact(0.9, true);
        });
        // Gone under: the clip ends deep below the floor.
        this.later(2.6, () => (this.runner.root.visible = false));
        this.holdReveal(dropT + 0.2);
      } else this.holdReveal(F.pre);
      // Slow motion lands as the floor gives.
      slow(-Math.max(0, F.pre - 0.1));
    } else if (kind === 'gate') {
      // Brake hard; the slab slams down a few metres ahead and the runner skids short of it, then
      // recoils back (the clip). At the push-off it drops right in front of the crouch.
      const T = 0.5;
      // He brakes to the very edge of his own slab: the door lands just beyond the next one, whose
      // fall then opens the gap at his feet (the way falls). With no seam in braking reach the door
      // lands close and cracks the floor.
      const seam = st.atStart ? null : this.tileEdge(this.s + v * 0.15 + 0.6, this.s + v * 0.45 + 1.4);
      const stop = seam !== null ? seam - 0.6 : this.s + (v * T) / 2;
      const gateS = st.atStart ? this.s + 3.2 : seam !== null ? seam + 4.4 : stop + 3.4;
      this.setStop(stop);
      this.rig.subjectAhead = gateS - stop;
      const h = frameAt(gateS);
      this.rig.focus.copy(h.pos).setY(h.pos.y + 1.6);
      // Long enough in the air to read as a door coming down, not a flicker across the lens.
      const land = st.atStart ? 0.42 : 0.38;
      const h0 = 7.5;
      const v0 = (h0 - 9.5 * land * land) / land;
      const m = new THREE.Matrix4().compose(h.pos.clone().setY(h.pos.y + h0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw), new THREE.Vector3(1, 1, 1));
      const door = this.debris.spawn('gate_0', m, new THREE.Vector3(0, -v0, 0), new THREE.Vector3(), (x, z) => onPath(h)(x, z) ?? h.pos.y, { settle: true, heavy: true });
      if (door) this.dressDoor(door);
      // Dust streams off the door's foot as it drops (a trail that reads at a glance).
      for (let k = 0; k < 4; k++) {
        this.later(k * (land / 4), () => {
          const y = h.pos.y + h0 - 9.5 * ((k * land) / 4) ** 2 - v0 * ((k * land) / 4) + 0.2;
          B.puff(h.pos.clone().setY(Math.max(h.pos.y + 0.5, y)).addScaledVector(h.fwd, 0.6), { count: 2, spread: 4.5, jitter: 0.3, vel: new THREE.Vector3(0, 1.5, 0), size: [0.5, 1.8], life: 1.4, alpha: 0.32, tint: DUST_T, rise: 0.1 });
        });
      }
      this.holdReveal(land);
      this.gateLand = { at: h.pos.clone(), done: false };
      this.fx.flash = 0.06;
      // Pre-impact: dust and grit shaken from the lintel as it starts to move.
      this.particles.burst(h.pos.clone().setY(h.pos.y + 5.5), 10, { spread: 3.5, up: 0.2, speed: 0.6, size: 0.5, life: 1.8, color: DUST, alpha: 0.35, gravity: 2 });
      B.puff(h.pos.clone().setY(h.pos.y + 5.8), { count: 3, spread: 3, jitter: 0.3, vel: new THREE.Vector3(0, -1.2, 0), size: [0.6, 2.2], life: 2.2, alpha: 0.4, tint: DUST_T, rise: -0.2 });
      this.later(land, () => {
        // The slam: a sheet of dust rolls out along the floor both ways, grit rains from above.
        for (let k = -3; k <= 3; k++) {
          const p = h.pos.clone().addScaledVector(h.right, k * 0.7).addScaledVector(h.fwd, -0.4).setY(h.pos.y + 0.05);
          this.particles.burst(p, 5, { spread: 0.8, up: 0.8, speed: 4.5, size: 0.6, life: 1.6, color: DUST, alpha: 0.3, drag: 1.4 });
          for (const dir of [-1, 1]) {
            B.puff(p, { count: Math.round(0.5 + F.dust), spread: 0.6, jitter: 0.8, vel: h.fwd.clone().multiplyScalar(dir * (4 + 3 * e)).addScaledVector(h.right, k * 0.5), size: [0.5, 2.2 + 1.6 * e], life: 2.4 + 1.2 * e, alpha: 0.45, tint: DUST_T, rise: 0.12, drag: 1.5, floor: h.pos.y });
          }
        }
        for (let k = 0; k < n(5); k++) {
          const p = h.pos.clone().addScaledVector(h.right, r.range(-1.8, 1.8)).addScaledVector(h.fwd, -0.6).setY(h.pos.y + r.range(3.5, 5));
          const sc = r.range(0.12, 0.22);
          this.debris.spawn(`shard_${k}`, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), h.fwd.clone().multiplyScalar(-r.range(0.3, 1.2)), new THREE.Vector3(3, 2, 1), onPath(h));
        }
        // Chips spat out from under the slab's edge, skittering toward the runner's side.
        for (let k = 0; k < n(3); k++) {
          const p = h.pos.clone().addScaledVector(h.right, r.range(-1.6, 1.6)).addScaledVector(h.fwd, -0.5).setY(h.pos.y + 0.2);
          const sc = r.range(0.08, 0.16);
          this.debris.spawn(`shard_${k + 2}`, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), h.fwd.clone().multiplyScalar(-r.range(1.5, 3)).addScaledVector(h.right, r.range(-1, 1)).setY(2), new THREE.Vector3(), onPath(h));
        }
        // The floor at its foot splits toward the runner.
        this.cine.cracks.spawn(h.pos.clone().setY(h.pos.y + 0.05).addScaledVector(h.fwd, -0.55), h.yaw + Math.PI, PATH_HALF * 2 + 0.2, 1.6 + 1.6 * e, 0.3, seam !== null ? 0.5 : 30);
        // The way falls: the door's weight snaps the slabs in front of it, and they sag and drop
        // into the water, leaving a gap between the runner and the door.
        if (seam !== null) {
          const broken = this.collapseFrom(seam, seam + 0.2);
          broken.forEach((t, i) =>
            this.later(0.12 + i * 0.08, () => {
              this.debris.spawn(t.piece, t.world, new THREE.Vector3(0, -0.4, 0), h.right.clone().multiplyScalar(r.range(-0.6, 0.6)).addScaledVector(h.fwd, 0).setY(0).add(new THREE.Vector3(r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5))), () => null, { breakInto: 4, breakAfter: r.range(0.35, 0.6) });
              const p = new THREE.Vector3().setFromMatrixPosition(t.world);
              B.puff(p, { count: 1 + Math.round(F.dust), spread: 3, jitter: 1, vel: new THREE.Vector3(0, 1.5, 0).addScaledVector(h.fwd, 0.6), size: [0.8, 2.4 + 1.5 * e], life: 2, alpha: 0.28, tint: DUST_T, rise: 0.3 });
              this.particles.burst(p, 10, { spread: 3, up: 1.2, speed: 2.4, size: 0.5, life: 1.4, color: DUST, alpha: 0.3 });
            }),
          );
          this.later(0.2, () => kick(0.5));
          // The lip at his feet crumbles away and the gap widens; his own slab cracks.
          const lip = frameAt(seam);
          this.cine.cracks.spawn(lip.pos.clone().setY(lip.pos.y + 0.05).addScaledVector(lip.fwd, -0.05), lip.yaw + Math.PI, PATH_HALF * 2 + 0.2, 1.0 + 0.6 * e, 0.4, 30);
          for (let k = 0; k < n(6); k++) {
            this.later(0.35 + k * 0.09, () => {
              const p = lip.pos.clone().addScaledVector(lip.right, r.range(-PATH_HALF, PATH_HALF)).addScaledVector(lip.fwd, -0.1).setY(lip.pos.y - 0.05);
              const sc = r.range(0.18, 0.4);
              this.debris.spawn(`shard_${k % 6}`, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 6), r.range(0, 6), 0)), new THREE.Vector3(sc, sc, sc)), lip.fwd.clone().multiplyScalar(r.range(0.2, 0.8)), new THREE.Vector3(r.range(-4, 4), 0, r.range(-4, 4)), () => null, { mat: 'floor' });
              this.particles.burst(p, 4, { spread: 0.4, up: 0.3, speed: 0.5, size: 0.15, life: 1.2, color: DUST_DARK, alpha: 0.5, gravity: 6 });
            });
          }
          // A big fall: the edge drops out from under him and he goes down on his knees at the lip.
          if (e >= 0.55) this.later(0.3, () => this.runner.play('fall_chasm_b', 0.3, 0.45));
        }
        kick();
        this.fx.flash = 0.12 + 0.08 * e;
        this.sounds.slam?.(0.7 + 0.3 * e);
      });
      // Big falls: the frame around the gate gives too, blocks crumbling off its top and sides.
      if (F.waves >= 1) {
        for (let k = 0; k < n(3); k++) {
          const side = k % 2 ? 1 : -1;
          this.later(land + 0.45 + k * 0.22, () => {
            const p = h.pos.clone().addScaledVector(h.right, side * r.range(1.4, 2.6)).addScaledVector(h.fwd, r.range(-0.2, 0.6)).setY(h.pos.y + r.range(4.5, 6));
            this.debris.spawn(r.pick(['rubble_2', 'rubble_3', 'rock_mid_2']), new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 6), r.range(0, 6), r.range(0, 6))), new THREE.Vector3(0.6, 0.6, 0.6)), new THREE.Vector3(0, -2, 0).addScaledVector(h.right, -side * 0.6), new THREE.Vector3(r.range(-2, 2), r.range(-2, 2), r.range(-2, 2)), onPath(h), { breakInto: 3 });
            B.puff(p, { count: 2, spread: 1, jitter: 0.4, vel: new THREE.Vector3(0, -0.6, 0), size: [0.8, 2.4], life: 2.2, alpha: 0.4, tint: DUST_T, rise: -0.1 });
          });
        }
      }
      if (F.waves >= 2) {
        this.later(land + 1.4, () => {
          kick(0.5);
          this.sounds.tremor(1);
          for (const side of [-1, 1]) {
            const p = h.pos.clone().addScaledVector(h.right, side * 2.8).addScaledVector(h.fwd, -2).setY(h.pos.y + 3);
            B.puff(p, { count: 4, spread: 3, jitter: 0.8, vel: h.right.clone().multiplyScalar(-side * 2), size: [1.2, 4], life: 3.2, alpha: 0.4, tint: DUST_T, rise: -0.05, floor: h.pos.y });
          }
        });
      }
      slow(-0.1);
    } else {
      // Rockfall. Pre-impact: grit and pebbles trickle from the wall tops; then the first block
      // drops square in the way as the runner flinches, and the rest follow.
      const T = 0.4;
      const stop = this.s + (v * T) / 2;
      this.setStop(stop);
      const h = frameAt(stop + 2.9);
      this.rig.focus.copy(h.pos).setY(h.pos.y + 0.8);
      const pieces = ['rock_mid_0', 'rock_mid_1', 'rock_mid_2', 'rubble_3', 'rubble_2', 'drum_0'];
      const drop = (delay: number, along: number, lat: number, piece: string, sc: number, hStart: number, land: number, breakInto = 0) => {
        const at = frameAt(stop + along);
        const p = at.pos.clone().addScaledVector(at.right, lat).setY(at.pos.y + hStart);
        const v0 = Math.max(2, (hStart - 9.5 * land * land) / land);
        const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 6), r.range(0, 6), r.range(0, 6))), new THREE.Vector3(sc, sc, sc));
        this.later(delay, () => {
          this.debris.spawn(piece, m, new THREE.Vector3(-at.right.x * lat * 0.25, -v0, -at.right.z * lat * 0.25).addScaledVector(at.fwd, r.range(-0.5, 0.5)), new THREE.Vector3(r.range(-2.5, 2.5), r.range(-2, 2), r.range(-2.5, 2.5)), onPath(at), { breakInto });
          this.particles.burst(p, 4, { spread: 1, up: 0.2, speed: 0.6, size: 0.45, life: 1.5, color: DUST, alpha: 0.3, gravity: 3 });
          B.puff(p, { count: 1, spread: 0.6, jitter: 0.3, vel: new THREE.Vector3(0, -2, 0), size: [0.5, 1.6], life: 1.2, alpha: 0.35, tint: DUST_T, rise: 0 });
        });
      };
      // Pebbles bounce down first.
      for (let k = 0; k < n(4); k++) {
        this.later(k * 0.05, () => {
          const at = frameAt(stop + r.range(0, 6));
          const side = r.chance(0.5) ? 1 : -1;
          const p = at.pos.clone().addScaledVector(at.right, side * r.range(1.2, 2.2)).setY(at.pos.y + r.range(3, 4.5));
          const sc = r.range(0.07, 0.14);
          this.debris.spawn(`shard_${k}`, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), at.right.clone().multiplyScalar(-side * r.range(0.5, 1.5)), new THREE.Vector3(4, 3, 2), onPath(at));
        });
      }
      drop(0, 2.9, r.range(-0.4, 0.4), 'rock_mid_1', 0.75, 8, 0.32);
      this.later(0.32, () => {
        this.sounds.slam?.(0.5 + 0.3 * e);
        kick();
      });
      this.holdReveal(0.32);
      for (let k = 0; k < n(8); k++) {
        const along = r.range(-1.5, 9 + 6 * e);
        // Never on the runner: anything near their mark lands well to the side.
        const lat = Math.abs(along) < 1.6 ? (r.chance(0.5) ? 1 : -1) * r.range(1.4, 3.6) : r.range(-3.6, 3.6);
        const piece = r.pick(pieces);
        const sc = piece.startsWith('rock') ? r.range(0.4, 0.75) : r.range(0.8, 1.2);
        drop(0.12 + k * r.range(0.08, 0.16) * (1 + 0.5 * e), along, lat, piece, sc, r.range(9, 15), r.range(0.8, 1.2), r.chance(0.5) ? 3 : 0);
      }
      // Dust curtains pour off the wall tops.
      for (let k = 0; k < 8 + 6 * e; k++) {
        this.later(k * 0.12, () => {
          const at = frameAt(stop + r.range(-2, 8));
          const side = r.chance(0.5) ? 1 : -1;
          const p = at.pos.clone().addScaledVector(at.right, side * r.range(2.4, 3.2)).setY(at.pos.y + r.range(3, 5.5));
          this.particles.burst(p, 5, { spread: 0.8, up: 0.1, speed: 0.4, size: 0.4, life: 2.2, color: DUST, alpha: 0.38, gravity: 2.2 });
          B.puff(p, { count: 1, spread: 0.6, jitter: 0.25, vel: new THREE.Vector3(0, -1.4, 0).addScaledVector(at.right, -side * 0.6), size: [0.7, 2.6], life: 2.6, alpha: 0.42, tint: DUST_T, rise: -0.15, floor: at.pos.y });
        });
      }
      // Big falls: a boulder comes down beyond and rolls away down the causeway; then a whole wall
      // face lets go in a cascade.
      if (F.waves >= 1) {
        this.later(0.9, () => {
          const at = frameAt(stop + 7.5);
          const p = at.pos.clone().addScaledVector(at.right, r.range(-0.6, 0.6)).setY(at.pos.y + 12);
          this.debris.spawn('rock_mid_0', new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1.4, 1.4, 1.4)), new THREE.Vector3(0, -9, 0).addScaledVector(at.fwd, 3.5), new THREE.Vector3(r.range(-1, 1), 0, r.range(-1, 1)), onPath(at));
        });
      }
      if (F.waves >= 2) {
        const side = r.chance(0.5) ? 1 : -1;
        for (let k = 0; k < n(4); k++) drop(1.5 + k * 0.1, r.range(3, 10), side * r.range(1.8, 3.2), r.pick(['rubble_2', 'rubble_3']), r.range(0.9, 1.2), r.range(6, 9), r.range(0.7, 0.9), 3);
        this.later(1.5, () => {
          kick(0.6);
          this.sounds.tremor(1);
          const at = frameAt(stop + 6);
          const p = at.pos.clone().addScaledVector(at.right, side * 2.8).setY(at.pos.y + 3);
          B.puff(p, { count: 6, spread: 5, jitter: 1, vel: at.right.clone().multiplyScalar(-side * 2.5), size: [1.5, 5.5], life: 3.6, alpha: 0.42, tint: DUST_T, rise: 0, floor: at.pos.y });
        });
      }
      this.rig.addTrauma(0.15 + 0.1 * e);
      slow(-0.08);
    }
  }

  private gateLand: { at: THREE.Vector3; done: boolean } | null = null;
  private queue: { at: number; fn: () => void; tag?: number }[] = [];
  /** Run `fn` after `delay` seconds of presentation time (slow motion slows it too). */
  private later(delay: number, fn: () => void, tag?: number) {
    this.queue.push({ at: this.worldT + delay, fn, tag });
  }
  /** Presentation slow motion: `t` counts real seconds (negative = not started yet). */
  private slowmo: { t: number; dur: number; min: number } | null = null;

  private onDebrisImpact(e: { pos: THREE.Vector3; speed: number; water: boolean; mass: number; broke?: boolean }) {
    const big = Math.min(1.5, e.mass * (e.speed / 12));
    const B = this.cine.billows;
    if (e.broke) {
      // A chunk breaking up: a puff of its own dust and a spit of grit.
      this.particles.burst(e.pos, 6 + 6 * e.mass, { spread: 0.6, up: 2.5, speed: 2.5, size: 0.05, life: 0.8, color: DUST_DARK, alpha: 0.7, gravity: 9, drag: 0.5, grow: 0 });
      B.puff(e.pos, { count: 1 + Math.round(e.mass), spread: 0.8, jitter: 1, size: [0.6, 1.8 + e.mass], life: 1.8, alpha: 0.4, tint: DUST_T, rise: 0.2 });
      if (e.speed > 0) this.sounds.impact(Math.min(1, 0.3 + e.mass * 0.4), false);
      return;
    }
    if (e.water) {
      // Spray thrown up, a mist that hangs, and a shockwave spreading over the water.
      const heavy = Math.min(1.5, e.mass * Math.max(0.5, e.speed / 8));
      this.particles.burst(e.pos, 14 + heavy * 22, { spread: 0.8 + heavy, up: 4.5 + heavy * 4, speed: 2.5 + heavy, size: 0.3, life: 1.1, color: SPRAY, alpha: 0.75, gravity: 9.5, drag: 0.5, grow: 0.6 });
      if (heavy > 0.25) {
        B.puff(e.pos, { count: 1 + Math.round(heavy * 2), spread: 1 + heavy, jitter: 0.8, vel: new THREE.Vector3(0, 1.5 + heavy * 1.5, 0), size: [0.6, 2 + 2.5 * heavy], life: 1.6, alpha: 0.38, tint: MIST_T, rise: 0.2, floor: WATER_Y });
        this.cine.rings.spawn(e.pos, 1.5 + heavy * 3.5, 0.55 + 0.45 * Math.min(1, heavy));
      }
      this.sounds.impact(heavy * 0.6, true);
    } else {
      this.particles.burst(e.pos, 4 + big * 8, { spread: 1 + big, up: 1.4, speed: 3 + big * 3, size: 0.5 + big * 0.5, life: 1.6, color: DUST, alpha: 0.28 });
      if (big > 0.15) B.puff(e.pos, { count: 1 + Math.round(big * 3), spread: 0.8 + big, jitter: 1.2 + big * 2, size: [0.6, 1.6 + 2.2 * big], life: 2 + big, alpha: 0.42, tint: DUST_T, rise: 0.15, drag: 1.6, floor: e.pos.y });
      this.rig.addTrauma(Math.min(0.6, big * 0.4));
      // A camera kick on the heavy landings (not every pebble, and not twice in a breath).
      if (this.stage === 'crash' && big > 0.5 && this.worldT - this.lastJolt > 0.3) {
        this.rig.jolt(0.4 * big, 1.5 * big);
        this.lastJolt = this.worldT;
      }
      this.sounds.impact(big, false);
    }
  }

  // ------------------------------------------------------------------ run-time danger cues
  /**
   * A cosmetic danger cue during the run, from the current multiplier and the cosmetic RNG only
   * (see fxScale.nextDangerCue): it never knows where, or whether, the round will end.
   */
  private dangerCue(cue: DangerCue, k: number, I: number): void {
    const c = this.cosmetic;
    // From the sprint tiers the walls blow out right beside him as he passes (ref 18).
    const near = cue === 'burst' && k > 0.6 && c.chance(0.6);
    const ahead = this.s + (near ? c.range(3.5, 6) : c.range(7, 15));
    const f = this.track.path.sample(ahead);
    const pos = f.pos.clone();
    const rightV = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    const fwd = forward(f.yaw);
    const sec = this.track.sectionAt(ahead);
    const walls = sec?.layout.walls ?? 'low';
    const wallSide = walls === 'cliff' ? (sec!.mirror ? -1 : 1) : c.chance(0.5) ? 1 : -1;
    const onPathHere = (x: number, z: number) => (Math.abs((x - pos.x) * rightV.x + (z - pos.z) * rightV.z) < PATH_HALF + 0.15 ? pos.y : null);
    const B = this.cine.billows;
    if (cue === 'burst' && walls === 'none') cue = 'stones';
    switch (cue) {
      case 'burst': {
        // Ref 9: a wall face blows out a jet of dust across the way as the runner nears it.
        const side = wallSide;
        const p = pos.clone().addScaledVector(rightV, side * (PATH_HALF + 0.35)).setY(pos.y + c.range(0.5, walls === 'low' ? 1.6 : 2.6));
        const jet = rightV.clone().multiplyScalar(-side * (3.5 + 3 * k)).setY(0.6);
        B.puff(p, { count: 3 + Math.round(5 * k), spread: 0.5, jitter: 0.9, vel: jet, size: [0.45, 1.6 + 1.2 * k], life: 1.1 + 0.5 * k, alpha: 0.6, tint: DUST_T, rise: 0.15, drag: 2.0, floor: pos.y, group: CUE });
        this.particles.burst(p, 6 + 8 * k, { spread: 0.3, up: 1.5, speed: 3.5, size: 0.05, life: 0.8, color: DUST_DARK, alpha: 0.8, gravity: 9, drag: 0.6, grow: 0 });
        for (let i = 0; i < 1 + Math.round(2 * k); i++) {
          const sc = c.range(0.08, 0.18);
          this.debris.spawn(`shard_${i}`, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), jet.clone().multiplyScalar(c.range(0.5, 0.9)).setY(c.range(1, 2.5)), new THREE.Vector3(5, 3, 2), onPathHere);
        }
        // At the top tier the opposite wall answers a beat later.
        if (k > 0.8 && walls !== 'cliff') {
          const q = p.clone().addScaledVector(rightV, -2 * side * (PATH_HALF + 0.35)).addScaledVector(fwd, c.range(1, 3));
          this.later(0.18, () => B.puff(q, { count: 3 + Math.round(3 * k), spread: 0.5, jitter: 0.9, vel: jet.clone().multiplyScalar(-1).setY(0.6), size: [0.45, 1.4 + k], life: 1 + 0.4 * k, alpha: 0.55, tint: DUST_T, rise: 0.15, drag: 2.0, floor: pos.y, group: CUE }), CUE);
        }
        this.sounds.impact(0.25 + 0.3 * k, false);
        this.rig.addTrauma(0.04 + 0.06 * k);
        this.sounds.event?.('dust_burst', k);
        // Debris landing beside him: now and then a stumble-and-recover, else a glance at the wall.
        if (near) this.later(0.35, () => (this.obstacles.busy ? false : c.chance(0.4) ? this.runner.stumble() : this.runner.glance(side)), CUE);
        break;
      }
      case 'stones': {
        // Small stones skitter across the path ahead and drop off the edge.
        const side = c.chance(0.5) ? 1 : -1;
        const count = 2 + Math.round(3 * k);
        for (let i = 0; i < count; i++) {
          const p = pos.clone().addScaledVector(fwd, c.range(-2, 3)).addScaledVector(rightV, side * (PATH_HALF - 0.1)).setY(pos.y + 0.6);
          const sc = c.range(0.08, 0.2);
          this.later(i * c.range(0.05, 0.18), () => {
            this.debris.spawn(`shard_${i % 6}`, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), rightV.clone().multiplyScalar(-side * c.range(2.5, 4.5)).addScaledVector(fwd, c.range(-0.8, 0.8)).setY(1), new THREE.Vector3(), onPathHere);
          }, CUE);
        }
        B.puff(pos.clone().addScaledVector(rightV, side * (PATH_HALF + 0.3)).setY(pos.y + 0.8), { count: 2, spread: 0.6, jitter: 0.4, vel: rightV.clone().multiplyScalar(-side * 1.2), size: [0.4, 1.4], life: 1.4, alpha: 0.4, tint: DUST_T, floor: pos.y, group: CUE });
        // A bigger stone or two tips off the far edge into the water: a splash and a ring.
        if (k > 0.45) {
          for (let i = 0; i < 1 + Math.round(k); i++) {
            const q = pos.clone().addScaledVector(fwd, c.range(0, 4)).addScaledVector(rightV, -side * (PATH_HALF + 0.2)).setY(pos.y + 0.4);
            const sc = c.range(0.35, 0.6);
            this.later(0.3 + i * 0.25, () => this.debris.spawn(`shard_${(i + 3) % 6}`, new THREE.Matrix4().compose(q, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), rightV.clone().multiplyScalar(-side * 1.5).setY(0.5), new THREE.Vector3(3, 1, 2), () => null), CUE);
          }
        }
        this.sounds.event?.('stones_skitter', k);
        // Some come to rest across the way (presentation-only rubble): he hops them, timed to leave
        // the floor ~0.2 s before he reaches them (the clip lands on both feet with footsteps).
        if (k > 0.45) {
          const rs = ahead + c.range(-0.5, 1.5);
          const rf = this.track.path.sample(rs);
          const rr = new THREE.Vector3(Math.cos(rf.yaw), 0, -Math.sin(rf.yaw));
          for (let i = 0; i < 2 + Math.round(2 * k); i++) {
            const q = rf.pos.clone().addScaledVector(rr, c.range(-0.8, 0.8)).addScaledVector(forward(rf.yaw), c.range(-0.3, 0.3));
            const sc = c.range(0.12, 0.24);
            const at = rf.pos.y;
            this.debris.spawn(`shard_${i % 6}`, new THREE.Matrix4().compose(q.setY(at + 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(c.range(0, 6), c.range(0, 6), 0)), new THREE.Vector3(sc, sc, sc)), new THREE.Vector3(0, -1, 0), new THREE.Vector3(2, 1, 1), () => at, { mat: 'floor' });
          }
          this.hopAt(rs);
        }
        break;
      }
      case 'rumble':
        this.tremor(I, k);
        if (k > 0.55) this.runner.glance(c.chance(0.5) ? 1 : -1);
        break;
      case 'collapse': {
        // Far off, a stretch of parapet or a ruin gives way into the water: a column of dust, blocks
        // tumbling, a dull roar. The world itself is coming apart as the run goes on.
        const g = this.track.path.sample(this.s + c.range(28, 48));
        const gr = new THREE.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
        const side = c.chance(0.5) ? 1 : -1;
        const at = g.pos.clone().addScaledVector(gr, side * c.range(PATH_HALF + 1.5, PATH_HALF + 6)).setY(g.pos.y + c.range(2, 4));
        for (let i = 0; i < 2 + Math.round(3 * k); i++) {
          const p = at.clone().add(new THREE.Vector3(c.range(-1.5, 1.5), c.range(0, 2), c.range(-1.5, 1.5)));
          this.later(i * 0.12, () => this.debris.spawn(c.chance(0.5) ? 'rubble_2' : 'rubble_3', new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(c.range(0, 6), c.range(0, 6), 0)), new THREE.Vector3(0.7, 0.7, 0.7)), gr.clone().multiplyScalar(side * c.range(0.5, 2)), new THREE.Vector3(c.range(-2, 2), c.range(-2, 2), c.range(-2, 2)), () => null, { breakInto: 3, breakAfter: c.range(0.4, 0.8) }), CUE);
        }
        B.puff(at, { count: 4 + Math.round(4 * k), spread: 4, jitter: 0.8, vel: new THREE.Vector3(0, 2, 0), size: [2, 7 + 4 * k], life: 4, alpha: 0.38, tint: DUST_T, rise: 0.3, drag: 0.7, group: CUE });
        this.sounds.tremor(0.3 + 0.4 * k);
        this.rig.addTrauma(0.05 + 0.08 * k);
        break;
      }
      case 'birds': {
        // Birds burst out of the trees off to one side and wheel away from the noise.
        const side = c.chance(0.5) ? 1 : -1;
        const g = this.track.path.sample(this.s + c.range(16, 28));
        const gr = new THREE.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
        const from = g.pos.clone().addScaledVector(gr, side * c.range(6, 11)).setY(g.pos.y + c.range(4, 7));
        this.cine.flock.launch(from, gr.clone().multiplyScalar(side).addScaledVector(forward(g.yaw), 0.6), 4 + Math.round(8 * k), 3, 0.6);
        break;
      }
    }
  }

  /** Hop ~0.2 s before the runner reaches route distance `sAt` (re-aimed as his speed changes). */
  private hopAt(sAt: number): void {
    const v = Math.max(1, this.speed);
    const lead = (sAt - this.s) / v - 0.2;
    if (lead <= 0.05) return;
    this.later(lead * 0.6, () => {
      const t2 = (sAt - this.s) / Math.max(1, this.speed) - 0.2;
      if (t2 > 0) this.later(t2, () => this.stage === 'run' && !this.obstacles.busy && this.runner.hop(), CUE);
    }, CUE);
  }

  /**
   * The HUD's tier pulse: called ON the tier-up's downbeat (with the camera punch and the music's
   * accent), from the multiplier on screen only. The UI sets it; `game.live.tier` changes at once.
   */
  onTierPulse: (tier: number) => void = () => {};

  /** 0..1, decays over ~1.4 s after a tier-up: a warm lift in the grade and a gust in the leaves. */
  private tierGlow = 0;

  /**
   * A tier arrives (the multiplier on screen crossed 2, 5, 10 or 25×). At once (within the frame):
   * the grade steps warmer and harder (progression.heat steps, tierGlow lifts), game.live.tier
   * changes and the score is told (it lands an accent on its next bar line). ON that bar line (the
   * HUD pulse via onTierPulse / 'causeway:tier', and (sounds.nextDownbeat, if the score runs and it is within a
   * bar; else at once): the lens punch and jolt, a gust through the leaves, a burst of world events
   * (dust from both walls, birds, a rumble), and from the sprint tier a glance back. A cash-out or a
   * fall before the downbeat cancels the punch. Reduced motion keeps it, gentler.
   */
  private tierUp(tier: number): void {
    this.tierGlow = 1;
    this.sounds.event?.('tier_up', tier / 4);
    const round = this.worldSeed;
    const land = () => {
      if (this.stage !== 'run' || round !== this.worldSeed) return;
      const k = this.motion === 'full' ? 1 : 0.4;
      // The HUD's pulse lands with it: `game.onTierPulse` (for the UI) and a 'causeway:tier' window event.
      this.onTierPulse(tier);
      try {
        window.dispatchEvent(new CustomEvent('causeway:tier', { detail: { tier, mult: this.live.mult } }));
        // The UI's HUD pulse (src/ui/pulse.ts: TIER_PULSE_EVENT), as an event so the HUD can change freely.
        window.dispatchEvent(new CustomEvent('causeway:tier-pulse', { detail: { tier, strength: 0.6 + 0.1 * tier } }));
      } catch {
        /* no DOM (tests) */
      }
      // The world's own tier-up: a gust, leaves and dust, a flicker in the sky (world/mood.ts).
      worldTierUp(Math.min(1, 0.4 + 0.15 * tier));
      this.rig.kick((3 + 1.5 * tier) * k);
      this.rig.addTrauma((0.08 + 0.04 * tier) * k);
      this.rig.jolt(0.25 + 0.1 * tier, 0);
      // A burst of world events: the walls breathe out dust, birds lift, the ground answers.
      const strength = Math.min(1, 0.45 + 0.13 * tier);
      this.dangerCue('burst', strength, this.prog.intensity);
      if (tier >= 2) this.later(0.12, () => this.stage === 'run' && this.dangerCue('birds', strength, this.prog.intensity), CUE);
      if (tier >= 3) this.later(0.3, () => this.stage === 'run' && this.dangerCue('rumble', strength, this.prog.intensity), CUE);
      if (tier >= 2) this.runner.glance(this.cosmetic.chance(0.5) ? 1 : -1);
    };
    this.pendingPunch = { tier, land, waited: 0 };
    this.syncPunch(0);
  }

  /**
   * Land a pending tier-up punch on the music: the theme's pending tier landing (`tierLanding`, the
   * new layer's downbeat) once the score has heard the tier (it hears it from the HUD's climb, so it
   * may be a frame behind); else its next bar line; else (no theme: muted, still loading) at once.
   * Never later than ~2.4 s (≈1.35 bars) after the tier change.
   */
  private pendingPunch: { tier: number; land: () => void; waited: number } | null = null;
  private syncPunch(dt: number): void {
    const p = this.pendingPunch;
    if (!p) return;
    p.waited += dt;
    const go = (inSec: number) => {
      this.pendingPunch = null;
      const d = Math.min(Math.max(0, inSec), Math.max(0, 2.4 - p.waited));
      if (d < 0.03) p.land();
      else this.later(d, p.land, CUE);
    };
    const tl = this.sounds.tierLanding?.() ?? null;
    if (tl && tl.tier >= p.tier) return go(tl.in);
    // Give the score up to ~0.15 s to hear the new tier; then the next bar line, or now.
    if (p.waited < 0.15 && this.sounds.nextDownbeat?.() != null) return;
    const nd = this.sounds.nextDownbeat?.() ?? null;
    go(nd ?? 0);
  }

  private duckScanIn = 0;
  private duckCool = 0;
  private duckFrom = new THREE.Vector3();
  private duckTo = new THREE.Vector3();
  /**
   * Low beams, lintels and hanging vines: look a stride ahead for something solid at head height over
   * the path, and duck ~0.25 s before it passes overhead. From world geometry and the current tier
   * (the driven tiers and up) only.
   */
  private scanOverhead(dt: number, tier: number): void {
    this.duckCool -= dt;
    this.duckScanIn -= dt;
    if (this.stage !== 'run' || tier < 1 || this.duckScanIn > 0 || this.duckCool > 0) return;
    this.duckScanIn = 0.08;
    const v = Math.max(2, this.speed);
    const sAt = this.s + v * 0.25 + 0.4;
    const f = this.track.path.sample(sAt, this.cframe);
    // A ray across the path at head height: anything solid there passes over (or into) his head.
    const rv = this.tmpRush.set(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    this.duckFrom.copy(f.pos).addScaledVector(rv, -0.6).setY(f.pos.y + 1.75);
    this.duckTo.copy(f.pos).addScaledVector(rv, 0.6).setY(f.pos.y + 1.75);
    const hit = this.occluder(this.duckFrom, this.duckTo) ?? this.occluder(this.duckTo, this.duckFrom);
    if (hit !== null && !this.obstacles.busy && this.runner.duck()) this.duckCool = 1.2;
  }

  /** A distant rumble: camera tremor, grit off the walls, and a plume of dust far off over the jungle. */
  /**
   * Last line of defence for the lens: if the camera went non-finite, or sits inside a solid prop or
   * a heavy falling body (the door), cut to a safe shot behind and above the runner.
   */
  /**
   * Low ceilings (round 13): under an arcade, a tunnel or a fallen lintel the low chase lens rose into
   * the soffit — the stone filled the top of the frame and cut the runner's head. An upward probe from
   * the lens (a few times a second): with less than 0.75 m above it, the lens comes down (never below
   * knee height) and leans a little toward the runner, eased in and out so it never pops.
   */
  private ceilT = 0;
  private ceilWant = 0;
  private ceilDrop = 0;
  private ceilP = new THREE.Vector3();
  private ceiling(dt: number): void {
    const cam = this.rig.camera;
    this.ceilT -= dt;
    if (this.ceilT <= 0) {
      this.ceilT = 0.12;
      const p = cam.position;
      // The rig places the lens afresh each frame (the drop below is applied after it), so this is
      // where the lens would be without any drop.
      this.ceilP.copy(p);
      const top = this.ceilP.clone().setY(this.ceilP.y + 1.6);
      const d = this.occluder(this.ceilP.clone().setY(this.ceilP.y - 0.4), top);
      this.ceilWant = d === null ? 0 : Math.max(0, 0.75 - (d - 0.4));
    }
    // A set piece overhead (a lintel he slides under): looked for every frame, up to 0.6 s ahead,
    // since at speed it passes the lens in a blink. The duck is an S-curve ramp (no surge): down
    // under the lintel and in toward the path's centre line, clear of the bushes and vines at its
    // edges, then back out the same way.
    const sCam = this.s - this.lensAlong();
    let near = false;
    let depth = 0;
    for (const ahead of [0, 0.15, 0.3, 0.45, 0.6]) {
      const y = this.obstacles.ceilingAt(sCam + this.speed * ahead);
      if (y !== null) {
        near = true;
        depth = Math.max(depth, cam.position.y - (y - 0.4));
      }
    }
    if (near) this.duckDepth = depth;
    this.duckT = near ? Math.min(1, this.duckT + dt * 2.8) : Math.max(0, this.duckT - dt * 1.6);
    const k = this.duckT * this.duckT * (3 - 2 * this.duckT);
    this.ceilDrop += (this.ceilWant - this.ceilDrop) * (1 - Math.exp(-dt * (this.ceilWant > this.ceilDrop ? 10 : 2.5)));
    const total = Math.max(this.ceilDrop, k * this.duckDepth);
    if (total < 1e-3 && k < 1e-3) return;
    const p = cam.position;
    const floor = this.track.path.sample(this.s).pos.y + 0.5;
    const drop = Math.min(total, Math.max(0, p.y - floor));
    p.y -= drop;
    if (k > 0) {
      const f = this.track.path.sample(sCam, this.cframe);
      const rx = Math.cos(f.yaw);
      const rz = -Math.sin(f.yaw);
      const lat = (p.x - f.pos.x) * rx + (p.z - f.pos.z) * rz;
      const d = (THREE.MathUtils.clamp(lat, -0.15, 0.15) - lat) * k;
      p.x += rx * d;
      p.z += rz * d;
    }
    // Lean the view down by the same amount so the runner keeps his place in frame.
    cam.updateMatrixWorld();
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(6).add(p);
    look.y -= drop * 0.35;
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }
  private duckT = 0;
  private duckDepth = 0;

  /** How far behind the runner, along his heading, the lens is (m; negative when it is ahead). */
  private lensAlong(): number {
    const p = this.rig.camera.position;
    const r = this.runner.root.position;
    const ry = this.runner.root.rotation.y;
    return -((p.x - r.x) * -Math.sin(ry) + (p.z - r.z) * -Math.cos(ry));
  }

  private guardCamera(dt = 1 / 60): void {
    const cam = this.rig.camera;
    const p = cam.position;
    const q = cam.quaternion;
    if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, cam.fov].every(Number.isFinite)) {
      this.rig.safeShot(this.runner.root.position, this.runner.root.rotation.y);
      this.guardK = this.guardV = 0;
      return;
    }
    // Round 16: a settled shot whose lens slips into a wall or a pillar no longer cuts to the safe
    // shot (an 8 m jump in one frame). The lens is drawn out, fast but continuously, toward a
    // chase position above and behind him, looking at his chest; it hands back as the rig clears.
    const inside = (this.stage === 'crash' || this.stage === 'cashout') && this.insideSolid(p);
    // Critically damped (from rest: the draw-out starts gently, no lurch on its first frame).
    const w = inside ? 9 : 4;
    this.guardV += (w * w * ((inside ? 1 : 0) - this.guardK) - 2 * w * this.guardV) * dt;
    this.guardK = THREE.MathUtils.clamp(this.guardK + this.guardV * dt, 0, 1);
    if (this.guardK === 0 || this.guardK === 1) this.guardV = 0;
    if (this.guardK < 0.002) return;
    const r = this.runner.root.position;
    const ry = this.runner.root.rotation.y;
    const safe = this.guardP.set(r.x + Math.sin(ry) * 3.6 + Math.cos(ry) * 0.8, r.y + 2.2, r.z + Math.cos(ry) * 3.6 - Math.sin(ry) * 0.8);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(q).multiplyScalar(5).add(p);
    p.lerp(safe, this.guardK);
    look.lerp(new THREE.Vector3(r.x, r.y + 1.1, r.z), this.guardK);
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }
  private guardK = 0;
  private guardV = 0;

  private guardBox = new THREE.Box3();
  private guardP = new THREE.Vector3();
  private insideSolid(p: THREE.Vector3): boolean {
    if (!this.track) return false;
    if (p.y < WATER_Y + 0.15) return true;
    for (const sec of this.track.sections) {
      if (sec.s0 > this.s + 25 || sec.s0 + sec.len < this.s - 45) continue; // a settled lens can stand well back
      // Every solid prop, the far scenery too: after a corner the way can pass a section's vista.
      for (const e of this.solids(sec, true)) {
        this.guardP.copy(p).applyMatrix4(e.inv);
        this.guardBox.copy(e.geo.boundingBox!).expandByScalar(-0.15);
        if (!this.guardBox.containsPoint(this.guardP)) continue;
        // In the box (an arch spans the path, so that alone means nothing): a ray straight up that
        // crosses the surface an odd number of times starts inside it.
        const o = this.occl;
        o.mesh.geometry = e.geo;
        o.mesh.matrixWorld.copy(e.world);
        o.rc.set(p, UP);
        o.rc.far = 60;
        o.hits.length = 0;
        o.mesh.raycast(o.rc, o.hits);
        if (o.hits.length % 2 === 1) return true;
      }
    }
    // World round 12's landmarks (a drowned pyramid, a colossus, a giant head) stand well clear of
    // the way, but a corner can swing a settled lens round into one.
    for (const lm of this.track.landmarks.list) {
      if (Math.abs(lm.s - this.s) > 60) continue;
      lm.root.updateMatrixWorld();
      for (const c of lm.root.children) {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        this.guardP.copy(p).applyMatrix4(this.tmpInvL.copy(mesh.matrixWorld).invert());
        if (!g.boundingBox!.containsPoint(this.guardP)) continue;
        const o = this.occl;
        o.mesh.geometry = g;
        o.mesh.matrixWorld.copy(mesh.matrixWorld);
        o.rc.set(p, UP);
        o.rc.far = 200;
        o.hits.length = 0;
        o.mesh.raycast(o.rc, o.hits);
        if (o.hits.length % 2 === 1) return true;
      }
    }
    return this.debris.containsHeavy(p);
  }
  private tmpInvL = new THREE.Matrix4();
  private occlAll = new WeakMap<object, { geo: THREE.BufferGeometry; world: THREE.Matrix4; inv: THREE.Matrix4 }[]>();

  private tremor(I: number, k = I) {
    this.rig.addTrauma(0.1 + I * 0.25);
    this.sounds.tremor(I);
    const c = this.cosmetic;
    const f = this.track.path.sample(this.s + c.range(6, 14));
    const rightV = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    const onPathHere = (x: number, z: number) => (Math.abs((x - f.pos.x) * rightV.x + (z - f.pos.z) * rightV.z) < PATH_HALF + 0.15 ? f.pos.y : null);
    for (let i = 0; i < 2 + Math.round(k * 3); i++) {
      const side = c.chance(0.5) ? 1 : -1;
      const p = f.pos.clone().addScaledVector(rightV, side * c.range(2.3, 3.2)).setY(f.pos.y + c.range(2.5, 4.5));
      this.particles.burst(p, 5, { spread: 0.6, up: 0.2, speed: 0.5, size: 0.3, life: 1.6, color: DUST, alpha: 0.4, gravity: 3 });
      this.cine.billows.puff(p, { count: 1, spread: 0.4, jitter: 0.2, vel: new THREE.Vector3(0, -1.2, 0), size: [0.4, 1.5], life: 1.8, alpha: 0.4, tint: DUST_T, rise: -0.1, floor: f.pos.y, group: CUE });
      const sc = c.range(0.1, 0.22);
      this.debris.spawn(`shard_${i % 6}`, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)), rightV.clone().multiplyScalar(-side * c.range(0.2, 1.2)), new THREE.Vector3(3, 2, 1), onPathHere);
    }
    // Far off, something big came down: a plume of dust rises over the trees.
    if (k > 0.45) {
      const g = this.track.path.sample(this.s + c.range(45, 75));
      const gr = new THREE.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
      const p = g.pos.clone().addScaledVector(gr, (c.chance(0.5) ? 1 : -1) * c.range(14, 28)).setY(g.pos.y + 1);
      this.cine.billows.puff(p, { count: 4 + Math.round(3 * k), spread: 6, jitter: 0.6, vel: new THREE.Vector3(0, 2.2, 0), size: [4, 12 + 6 * k], life: 6, alpha: 0.32, tint: DUST_T, rise: 0.15, drag: 0.5, group: CUE });
    }
  }

  // ------------------------------------------------------------------ frame
  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible || this.paused) return;
    const real = Math.min(this.clock.getDelta(), 1);
    // A fall or an escape plays on real time even on a device (or a capture) drawing a frame or two
    // a second: the beat is stepped in ≤ 50 ms slices (physics stays stable) and drawn once. Elsewhere
    // a frame stays clamped to 50 ms, as before (the run is bound to the round clock anyway).
    if ((this.stage === 'crash' || this.stage === 'cashout') && real > 0.05) {
      const n = Math.min(20, Math.ceil(real / 0.05));
      for (let i = 0; i < n; i++) this.frame(real / n, i === n - 1);
    } else this.frame(Math.min(real, 0.05));
  };

  private footstep(foot: 'L' | 'R', k: number) {
    const f = this.track.path.sample(this.s);
    // The foot lands just inside its hip line and a stride-length ahead of the pelvis at speed.
    const side = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw)).multiplyScalar(foot === 'L' ? -0.08 : 0.08);
    const ahead = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)).multiplyScalar(this.stage === 'run' ? 0.2 : 0.1);
    const p = this.runner.root.position.clone().add(side).add(ahead);
    const secType = this.track.sectionAt(this.s)?.type;
    const wood = secType === 'bridge' || secType === 'boardwalk';
    // The boards give under each footfall (runner overlays); stone stays stone.
    this.runner.surface = wood ? 'wood' : 'stone';
    this.sounds.setSection?.(secType);
    const skid = this.stage === 'crash';
    // Dust at each plant, a bigger, lower puff the harder they run; at the top tiers the push-off
    // kicks up grit too.
    const drive = this.stage === 'run' ? this.runner.drive / 4 : 0;
    const puff = (1 + k * 2 + drive * 3) * (skid ? 3 : 1);
    this.particles.burst(p, puff, { spread: skid ? 0.5 : 0.2 + 0.15 * drive, up: 0.3 + k * 0.35, speed: (0.6 + k * 0.6 + drive * 0.8) * (skid ? 2 : 1), size: (0.1 + k * 0.08 + drive * 0.1) * (skid ? 2 : 1), life: skid ? 1.2 : 0.7 + 0.4 * drive, color: wood ? DUST_DARK : DUST, alpha: skid ? 0.24 : 0.15 + 0.07 * drive, grow: 1.4 + drive });
    if (drive > 0.4 && !wood) this.particles.burst(p, 2 + 4 * drive, { spread: 0.15, up: 1.2 + drive, speed: 1.2, size: 0.035, life: 0.5, color: DUST_DARK, alpha: 0.6, gravity: 9, drag: 0.4, grow: 0 });
    this.sounds.footstep(k, wood ? 'wood' : 'stone');
    this.rig.footfall(k * (0.8 + 0.3 * drive), foot);
  }

  private placeRunner(dt: number) {
    const f = this.track.path.sample(this.s);
    this.runner.root.position.copy(f.pos);
    this.runner.root.rotation.y = f.yaw;
    if (dt > 0) {
      const yawRate = (f.yaw - this.yawPrev) / dt;
      this.runner.roll = THREE.MathUtils.clamp(-yawRate * this.speed * 0.05, -0.3, 0.3);
    }
    this.yawPrev = f.yaw;
  }

  private tmpChest = new THREE.Vector3(); // perf
  private tmpScreen = new THREE.Vector2(); // perf
  private frame(rawDt: number, render = true): void {
    this.lastFrameAt = performance.now();
    const t0 = performance.now();
    // Presentation time can slow down; the round clock never does.
    if (this.slowmo) {
      this.slowmo.t += rawDt;
      const x = Math.max(0, this.slowmo.t) / this.slowmo.dur;
      // Reduced motion gets a short, shallow breath (set by fxScale), never a long hold.
      this.timeScale = x < 0.15 ? THREE.MathUtils.lerp(1, this.slowmo.min, x / 0.15) : THREE.MathUtils.lerp(this.slowmo.min, 1, Math.min(1, (x - 0.15) / 0.85) ** 2);
      if (x >= 1) {
        this.slowmo = null;
        this.timeScale = 1;
      }
    }
    const dt = rawDt * this.timeScale;
    this.stageT += rawDt;
    this.worldT += dt;

    // Multiplier → intensity → speed.
    let mult = 1;
    const el = this.elapsed();
    if (this.frozenMult !== null) mult = this.frozenMult / 100;
    else if ((this.stage === 'run' || this.stage === 'lead') && el !== null && el >= 0) {
      mult = multiplierAtSmooth(el);
      if (this.stage === 'lead') {
        // Go: the runner bursts out of the crouch, the lens punches in.
        this.setStage('run');
        this.runner.play('run', 0.12);
        this.rig.kick(6);
        this.rig.addTrauma(0.08);
      }
    }
    if (this.stage === 'cashout' || this.stage === 'crash') mult = this.live.mult;
    // THE PROGRESSION: one model for every system (camera, grade, effects, runner, world, score).
    const P = (this.prog = progression(mult));
    const I = P.intensity;
    if (this.stage === 'run' || this.stage === 'lead') {
      this.live.mult = mult;
      this.live.intensity = I;
      this.live.tier = this.stage === 'run' ? P.tier : 0;
      this.live.drive = this.stage === 'run' ? P.drive : 0;
      this.live.heat = this.stage === 'run' ? P.heat : 0;
    }

    // Kinematics. Crash and cash-out brake uniformly to a staged mark.
    if (this.stage === 'cashout' && this.runOn) {
      // The "made it" run-on: full stride to safe ground (see cashout()).
      this.s += this.speed * dt;
    } else if (this.stage === 'crash' || this.stage === 'cashout') {
      const rem = Math.max(0, this.stopAt - this.s);
      this.speed = Math.min(this.speed, Math.sqrt(2 * this.stopDecel * rem));
      this.s = Math.min(this.stopAt, this.s + this.speed * dt);
    } else {
      const target = this.stage === 'run' ? speedOf(I) : 0;
      const dv = target - this.speed;
      this.speed += Math.sign(dv) * Math.min(Math.abs(dv), 6 * dt * (this.stage === 'run' && this.stageT < 1 ? 1.4 : 1));
      // sRate: the few percent the obstacle director borrows so a move's takeoff meets its set piece.
      this.s += (this.speed + (this.stage === 'run' ? this.obstacles.sRate : 0)) * dt;
    }
    this.live.speed = this.speed;
    this.live.distance = this.s;
    this.track.update(this.s, I);
    if (this.stage === 'run') this.obstacles.update(dt, P.tier, this.stageT);
    this.placeRunner(dt);
    this.runner.lean = this.stage === 'run' ? 0.04 * I : 0;
    // Run tier from the current multiplier only: gait and camera escalate, with cosmetic beats.
    const drive = this.stage === 'run' ? P.drive : 0;
    // Tier-ups (2, 5, 10, 25×): every system changes together (see tierUp).
    const tierNow = this.stage === 'run' ? P.tier : 0;
    if (this.stage === 'run' && tierNow > this.lastRunTier) this.tierUp(tierNow);
    this.lastRunTier = tierNow;
    if (this.stage === 'run') this.syncPunch(rawDt);
    else this.pendingPunch = null;
    this.tierGlow = Math.max(0, this.tierGlow - rawDt / 1.4);
    this.scanOverhead(dt, tierNow);
    // Speed without blur: from the driven tier, grit and low dust lift off the floor and the wall
    // feet just ahead and either side of him; the lens rushes through them (parallax), denser with
    // the tier. Cosmetic, from the current multiplier only; trimmed by the particle budget.
    if (this.stage === 'run' && drive > 1 && this.motion === 'full') {
      this.rushAcc += dt * (drive - 1) * 9;
      while (this.rushAcc >= 1) {
        this.rushAcc -= 1;
        const c = this.cosmetic;
        const f = this.track.path.sample(this.s + c.range(1.5, 7), this.cframe);
        const side = c.chance(0.5) ? 1 : -1;
        const p = this.tmpRush.set(Math.cos(f.yaw), 0, -Math.sin(f.yaw)).multiplyScalar(side * c.range(0.9, PATH_HALF + 0.2)).add(f.pos);
        p.y = f.pos.y + c.range(0.02, 0.5);
        this.particles.burst(p, 1, { spread: 0.3, up: 0.6, speed: 1.2, size: c.chance(0.3) ? 0.35 : 0.05, life: 0.7, color: c.chance(0.3) ? DUST : DUST_DARK, alpha: 0.35, gravity: 3, drag: 1, grow: 1 });
      }
    }
    this.runner.drive = drive;
    this.rig.drive = drive;
    if (this.stage === 'run' && this.stageT > 1.5) {
      this.beatIn -= dt;
      if (this.beatIn <= 0 && !this.obstacles.busy) {
        const nb = nextBeat(this.cosmetic, P.tier);
        this.beatIn = nb ? nb.wait : 2;
        if (nb?.beat === 'glance') this.runner.glance(this.cosmetic.chance(0.5) ? 1 : -1);
        else if (nb?.beat === 'stumble' && this.runner.stumble()) {
          this.rig.addTrauma(0.12);
          this.speed *= 0.94;
          this.sounds.footstep(1, this.track.sectionAt(this.s)?.type === 'bridge' ? 'wood' : 'stone');
        }
      }
    }
    // Stairs: the path grade under the runner (they lean into a climb, sit back on a descent).
    if (this.stage === 'run') {
      const ya = this.track.path.sample(this.s + 0.7, this.cframe).pos.y;
      const yb = this.track.path.sample(this.s - 0.7, this.cframe).pos.y;
      this.runner.slope = (ya - yb) / 1.4;
      // Reaching a flight of steps: a quick check of the stride, eyes to the treads.
      const grade = (this.track.path.sample(this.s + 1.6, this.cframe).pos.y - ya) / 0.9;
      this.stairCool -= dt;
      if (Math.abs(grade) > 0.22 && Math.abs(this.runner.slope) < 0.12 && this.stairCool <= 0) {
        this.runner.catchStep(grade);
        this.stairCool = 2.5;
      }
    } else this.runner.slope = 0;
    // Where the head turns: to the hazard once the fall has landed; now and then to the lens at rest.
    if (this.stage === 'crash') this.runner.lookAt(this.stageT > 0.7 ? this.rig.focus : null, 0.55);
    else if (this.stage === 'setup' || this.stage === 'title') {
      const k = this.worldT % 13;
      this.runner.lookAt(k > 7 && k < 9.5 ? this.rig.camera.position : null, 0.6);
    } else this.runner.lookAt(null);
    this.runner.update(dt, this.speed);
    // Contact shadow: on the floor under him (it fades by itself as a fall takes him off it).
    this.contact.update(this.runner.root);
    // Braking: the soles scour the floor.
    if (this.stage === 'crash' && this.speed > 1.5) {
      const rp0 = this.runner.root.position;
      this.particles.burst(rp0.clone().setY(rp0.y + 0.03), 1.5 * Math.min(1, this.speed / 8), { spread: 0.35, up: 0.5, speed: 1.2, size: 0.28, life: 0.9, color: DUST, alpha: 0.22, grow: 1.6 });
    }

    // Danger cues follow the multiplier only; they never know where the round ends.
    if (this.stage === 'run' && this.stageT > 1.2) {
      this.dangerIn -= dt;
      if (this.dangerIn <= 0) {
        const cue = nextDangerCue(this.cosmetic, mult);
        this.dangerIn = cue ? cue.wait : 1.5;
        if (cue) this.dangerCue(cue.cue, cue.strength, I);
      }
    }
    if (this.fxMotion !== this.motion) this.applyFxBudget();
    const dangerTarget = this.stage === 'run' ? Math.max(0, (P.heat - 0.35) / 0.65) * 0.55 : 0;
    this.fx.danger += (dangerTarget - this.fx.danger) * (1 - Math.exp(-dt * 2));
    // The fall's grade: cold, but capped so the runner and the hazard stay readable.
    const coldTarget = this.stage === 'crash' ? Math.min(0.55, this.stageT * 0.6) : 0;
    this.fx.cold += (coldTarget - this.fx.cold) * (1 - Math.exp(-rawDt * 3));
    if (this.rev) {
      if (this.worldT >= this.rev.impactAt) this.rev.t += rawDt;
      if (this.rev.t >= this.rev.after || this.stageT >= this.rev.cap) this.reveal();
    }
    const goldTarget = this.stage === 'cashout' ? (this.stageT < 1 + this.epic ? 0.5 + 0.2 * this.epic : 0.3) : 0;
    this.fx.gold += (goldTarget - this.fx.gold) * (1 - Math.exp(-rawDt * 3));
    this.fx.flash *= Math.exp(-rawDt * 6);
    // Cash-out: a sun-flare bloom, bigger and longer for a big escape.
    this.fx.bloom = this.stage === 'cashout' ? (0.3 + 0.5 * this.epic) * Math.exp(-this.stageT * (1.2 - 0.6 * this.epic)) + (this.escape?.bloom ?? 0) * 0.25 * Math.min(1, this.stageT / 0.8) : this.fx.danger * 0.25;

    if (this.gateLand && !this.gateLand.done && this.stageT > 0.9) this.gateLand.done = true;

    // Fade transitions.
    if (this.fading) {
      this.fx.fade += this.fading.dir * rawDt * 3.2;
      if (this.fading.dir === 1 && this.fx.fade >= 1) {
        this.fx.fade = 1;
        this.fading.done?.();
        this.fading = { dir: -1 };
      } else if (this.fading.dir === -1 && this.fx.fade <= 0) {
        this.fx.fade = 0;
        this.fading = null;
      }
    }

    // Camera.
    const rp = this.runner.root.position;
    this.rig.shakeEnabled = this.motion === 'full';
    this.rig.motionScale = this.motion === 'full' ? 1 : 0.25;
    // Settled camera moves follow real time on a slow device; QA time-stepping stays deterministic.
    this.rig.wallClock = !this.paused;
    if (this.gapAt !== null && this.worldT >= this.gapAt) {
      this.rig.gap = Math.min(1, this.rig.gap + rawDt * 1.4);
      this.rig.focus.copy(rp);
    }
    // Corners: the lens leads into the bend ahead (Temple Run style), half the turn over the next 6 m.
    if (this.stage === 'run' || this.stage === 'lead' || (this.stage === 'cashout' && this.runOn)) {
      const y0 = this.runner.root.rotation.y;
      const d = this.track.path.sample(this.s + 6).yaw - y0;
      const want = 0.45 * Math.atan2(Math.sin(d), Math.cos(d));
      this.rig.yawLead += (want - this.rig.yawLead) * (1 - Math.exp(-rawDt * 5));
    } else this.rig.yawLead = 0;
    this.rig.update(rawDt * (this.stage === 'crash' || this.stage === 'cashout' ? Math.max(this.timeScale, 0.55) : 1), rp, this.runner.root.rotation.y, this.stage === 'run' || (this.stage === 'cashout' && this.runOn) ? I : 0);
    const cam = this.rig.camera;
    this.ceiling(rawDt);
    this.guardCamera(rawDt);
    if (this.debugPin) {
      const d = this.debugPin;
      const ry = this.runner.root.rotation.y;
      const fx = -Math.sin(ry);
      const fz = -Math.cos(ry);
      cam.position.set(rp.x + fx * d.along + Math.cos(ry) * d.lat, rp.y + d.up, rp.z + fz * d.along - Math.sin(ry) * d.lat);
      cam.lookAt(rp.x, rp.y + d.lookUp, rp.z);
      cam.fov = d.fov;
      cam.updateProjectionMatrix();
    }

    // The sky and its sun turn slowly with the route (a few degrees a second at most), so the sun
    // stays ahead in the chase frame through the bends; outside the run they snap.
    const ry = this.runner.root.rotation.y;
    // Hold the sun ~30° off the route's axis on a wide screen (walls on its side throw their
    // shadows diagonally across the causeway, as in the references), nearer the axis on a tall one.
    let dy = ry + (cam.aspect < 1 ? -0.1 : -0.3) - this.skyYaw;
    dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    const follow = this.stage === 'title' || this.stage === 'setup' ? 1 : 1 - Math.exp(-rawDt * 0.14);
    this.skyYaw += dy * follow;
    this.sunDir.copy(this.sunBase).applyAxisAngle(UP, this.skyYaw);
    this.scene.backgroundRotation.y = this.skyYaw;
    this.scene.environmentRotation.y = this.skyYaw;
    this.water.setSun(this.sunDir, this.skyYaw);
    setAtmosphereSun(this.sunDir);
    this.applyLook();
    setAtmosphereMist(this.worldT, this.mistAmount * (this.lookApplied?.mist ?? 1));
    // Sun follows the runner so its shadow box stays tight: centred ahead (where the long shadows
    // fall toward the lens), snapped to whole shadow texels across the light.
    const ext = this.shadowExtent;
    const sh = this.tmpHead.set(-Math.sin(ry), 0, -Math.cos(ry)).multiplyScalar(ext * 0.45).add(rp);
    const texel = (2 * ext) / this.sun.shadow.mapSize.x;
    const su = SHADOW_U.crossVectors(this.sunDir, UP).normalize();
    const sv = SHADOW_V.crossVectors(su, this.sunDir);
    const cu = su.dot(sh);
    const cv = sv.dot(sh);
    sh.addScaledVector(su, Math.round(cu / texel) * texel - cu).addScaledVector(sv, Math.round(cv / texel) * texel - cv);
    this.fill.target.position.copy(rp);
    this.fill.position.set(rp.x - this.sunDir.x * 10, rp.y + 7, rp.z - this.sunDir.z * 10);
    this.sun.target.position.copy(sh);
    this.sun.position.copy(sh).addScaledVector(this.sunDir, 55);
    // Overcast (storm): no disc, and post's shafts and flare (which follow the disc) see it behind the lens.
    this.sunDisc.position.copy(cam.position).addScaledVector(this.sunDir, this.sunDisc.visible ? 900 : -900);
    this.sunDisc.lookAt(cam.position);

    wind.uTime.value = this.worldT;
    // Round 11 crescendo: the world's mood follows the run (src/world/mood.ts; presentation only),
    // driven by the progression's heat (the same model as the grade, camera, cues and score).
    setWorldDrive(this.stage === 'run' || this.stage === 'crash' || this.stage === 'cashout' ? this.prog.heat : 0);
    const mood = stepMood(dt, I);
    this.applyMood(mood.drive, mood.gust);
    // Round 13: in a low, warm sun the runner wears a faint gold rim (the escape's rim, at a sliver of
    // its strength), so his silhouette lifts off the stone; none in the flat light of morning or storm.
    // The escape sets its own, stronger rim.
    if (this.stage !== 'cashout') {
      const ln = this.lookApplied?.name;
      this.cine.rimLevelTarget = ln === 'golden' ? 0.16 : ln === 'afternoon' ? 0.1 : 0;
    }
    this.water.update(this.worldT, cam);
    this.track.tick(this.worldT, this.s);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.at <= this.worldT) {
        const q = this.queue.splice(i, 1)[0]!;
        q.fn();
      }
    }
    this.debris.update(dt);
    this.particles.update(dt);
    if (this.stage === 'cashout') this.cine.pool.place(rp, 1.5 + (this.escape?.g ?? 0));
    this.cine.update(dt, rawDt, cam, this.sunDir, this.worldT, this.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360)));
    // Tension ramp (grade, vignette, dust in the air): from the live multiplier only, while running;
    // it eases back once the round settles (the fall's cold and the escape's gold take over).
    // The grade follows the progression's heat; a tier's step arrives within a frame or two.
    const tensionTarget = this.stage === 'run' ? this.prog.heat : 0;
    this.tension += (tensionTarget - this.tension) * (1 - Math.exp(-rawDt * (this.stage === 'run' ? (tensionTarget > this.tension ? 8 : 1.5) : 0.8)));
    this.motes.update(this.worldT, cam, this.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360)), (1 + 1.3 * this.tension) * (1 + 1.2 * worldMood.drive + 1.5 * worldMood.gust), this.sunDir);
    this.ambient.update(this.worldT, cam);

    // Keep the runner sharp in the blur: the protected ellipse spans boots to crown. (It used to sit
    // on the chest, so the legs were blurred and their dark taps smeared across the bright floor
    // beside them: a hard-edged grey patch right of the legs.)
    const feet = this.tmpChest.copy(rp).project(cam); // perf: no per-frame alloc
    const head = this.tmpHead.copy(rp).setY(rp.y + 1.85).project(cam);
    const halfY = Math.min(0.9, Math.max(0.06, (Math.abs(head.y - feet.y) * 0.25 * 1.12) / 0.75));
    const speedBlur = this.motion === 'reduced' ? 0 : Math.min(1, Math.max(0, (this.speed - 4) / 10));
    this.post.apply({
      speed: speedBlur,
      runnerScreen: this.tmpScreen.set((feet.x + head.x) * 0.25 + 0.5, (feet.y + head.y) * 0.25 + 0.5),
      runnerSize: this.tmpSize.set((halfY * 0.45) / cam.aspect, halfY),
      motion: this.motion === 'reduced' ? 0 : 1,
      dt: rawDt,
      time: this.worldT,
      danger: this.fx.danger,
      cold: this.fx.cold,
      gold: this.fx.gold,
      flash: this.fx.flash + 0.05 * this.tierGlow * this.tierGlow,
      fade: this.fx.fade,
      bloomBoost: this.fx.bloom,
      tension: this.tension,
    });
    this.sounds.run(I, this.stage === 'run', this.speed);
    if (!render) return;
    this.renderer.info.reset();
    this.post.render(rawDt);
    this.govern(performance.now() - t0, rawDt);
  }

  // perf: dynamic resolution first; the tier steps down only when the scale is at its floor.
  private dynRes = new DynamicResolution();
  private tension = 0;
  private lastRunTier = 0;
  private rushAcc = 0;
  private tmpRush = new THREE.Vector3();
  private govern(ms: number, dt: number) {
    if (!this.autoQuality || this.paused) return;
    if (this.dynRes.sample(dt * 1000)) this.resize();
    if (!this.dynRes.atFloor) {
      this.frameTimes.length = 0;
      return;
    }
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length < 180) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const order: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
    const i = order.indexOf(this.qualityLevel);
    if (avg > 26 && i > 0) {
      const to = order[i - 1]!;
      this.applyQuality(to, false);
      this.onQualityDrop(to);
    }
    void ms;
  }

  /**
   * For QA and screenshots on slow (software) GPUs: advance presentation time in
   * fixed steps without drawing, on a virtual round clock, then draw once.
   */
  debugStep(seconds: number, fps = 30): void {
    this.paused = true;
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) {
      this.virtualNow += 1000 / fps;
      this.frame(1 / fps, i === n - 1);
    }
  }
  virtualNow = 0;
  paused = false;

  /** For QA: jump the runner along the route to exercise generation. */
  debugAdvance(metres: number): void {
    this.s += metres;
    this.track.update(this.s, 0.5);
  }

  /** QA: the nearest mesh under each screen point ([x, y] in 0..1 from the top left), with its material. */
  /** QA: place a set piece ahead now (log, beam, pillar, blocks, boulder, tile, rocks); and the counts so far. */
  debugObstacle(kind?: string): { placed: boolean; fired: Record<string, number> } {
    const placed = kind ? this.obstacles.force(kind as Parameters<ObstacleDirector['force']>[0]) : false;
    return { placed, fired: { ...this.obstacles.fired } };
  }

  debugPick(pts: [number, number][]): { name: string; mat: string; dist: number }[] {
    const rc = new THREE.Raycaster();
    const out: { name: string; mat: string; dist: number }[] = [];
    this.scene.updateMatrixWorld(true);
    for (const [x, y] of pts) {
      rc.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), this.rig.camera);
      const hit = rc.intersectObject(this.scene, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);
      const m = hit?.object as THREE.Mesh | undefined;
      const mat = m ? (Array.isArray(m.material) ? m.material[0] : m.material) : null;
      out.push({ name: m ? `${m.parent?.name ?? ''}/${m.name}` : '(sky)', mat: mat ? `${mat.type}:${mat.name}` : '', dist: hit ? +hit.distance.toFixed(1) : -1 });
    }
    return out;
  }

  /** Triangles by mesh name, split into what the camera sees and what it does not. */
  debugTriangles() {
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const out: Record<string, { visible: number; hidden: number; shadow: number }> = {};
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry.index) return;
      let tris = m.geometry.index.count / 3;
      if ((m as THREE.InstancedMesh).isInstancedMesh) tris *= (m as THREE.InstancedMesh).count;
      const key = m.name.split(':')[0]!.split('|').join('.') || 'anon';
      out[key] ??= { visible: 0, hidden: 0, shadow: 0 };
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const sph = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
      const vis = !m.frustumCulled || fr.intersectsSphere(sph);
      out[key]![vis ? 'visible' : 'hidden'] += tris;
      if (m.castShadow) out[key]!.shadow += tris;
    });
    return out;
  }

  /**
   * QA (tools/framing-check.mjs): where the runner sits in the current frame and what stands between
   * the lens and him. Boots, knees, hips, chest and head are projected (view offset included) and
   * each sight line from the lens is raycast against the whole scene; leaf cards are counted apart
   * (their cut-out alpha lets most of the view through).
   */
  debugFraming() {
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    const rp = this.runner.root.position;
    const skip = new Set<THREE.Object3D>([this.runner.root, this.cine.root, this.particles.points, this.motes.points, this.ambient.root, this.water.mesh, this.sunDisc, this.contact.mesh]);
    const targets: THREE.Object3D[] = [];
    const walk = (o: THREE.Object3D) => {
      if (skip.has(o) || !o.visible) return;
      if ((o as THREE.Mesh).isMesh) targets.push(o);
      for (const c of o.children) walk(c);
    };
    walk(this.scene);
    const rc = new THREE.Raycaster();
    const ndc: number[][] = [];
    let solid = 0;
    let leaf = 0;
    const hits: string[] = [];
    for (const h of [0.05, 0.5, 1.0, 1.35, 1.75]) {
      const p = new THREE.Vector3(rp.x, rp.y + h, rp.z);
      const q = p.clone().project(cam);
      ndc.push([+q.x.toFixed(3), +q.y.toFixed(3)]);
      const dir = p.clone().sub(cam.position);
      const len = dir.length();
      rc.set(cam.position, dir.normalize());
      rc.near = cam.near;
      rc.far = len - 0.25;
      const hit = rc.intersectObjects(targets, false)[0];
      if (!hit) continue;
      const m = hit.object as THREE.Mesh;
      const name = (Array.isArray(m.material) ? m.material[0]?.name : m.material?.name) ?? '';
      if (/leaf|flora/.test(name) || /leaf|flora/.test(m.name)) leaf++;
      else {
        solid++;
        hits.push(`${m.name || m.parent?.name}@${hit.distance.toFixed(1)}`);
      }
    }
    const r = this.rig as unknown as { insetTop: number; insetBottom: number; shift: number };
    return { mode: this.rig.mode, ndc, solid, leaf, hits, near: +cam.near.toFixed(2), band: [+(-1 + 2 * r.insetBottom).toFixed(3), +(1 - 2 * r.insetTop).toFixed(3)] };
  }

  get debugState() {
    return { s: this.s, sections: this.track.sections.length, debris: this.debris.count, calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, stage: this.stage, crashKind: this.crashKind };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.dispose();
  }
}
