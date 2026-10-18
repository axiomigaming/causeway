/**
 * Recorded sounds: the bank (fetch once, decode once, variants as slices of one file) and the player
 * (a capped voice pool; every trigger picks a fresh variant, pitch, level and pan).
 *
 * Files and slices come from public/audio/manifest.json (tools/build-audio.mjs). Core sounds are
 * fetched at boot and decoded on the first gesture; beds and the score wait for that gesture. Until a
 * sound is decoded `has()` is false and the engine plays its procedural stand-in instead.
 */
import manifestJson from '../../public/audio/manifest.json';
import { SOUNDS, type Bus } from './catalog';
import { centsToRate, dbToGain, findOnset, pickVariant, spread, strengthCutoff, strengthGain, voiceSlot, type Rng, type VoiceInfo } from './select';

export interface ManifestFile {
  file: string;
  bytes: number;
  hash: string;
}
export interface ManifestSound {
  group: string;
  channels: number;
  /** [start s, duration s, peak 0..1] per variant, in the source PCM before encoding. */
  slices: [number, number, number][];
  loop?: boolean;
  /** Theme stems: tempo and length in bars (tools/score/compose.py). */
  bpm?: number;
  bars?: number;
  webm: ManifestFile;
  m4a: ManifestFile;
}
export interface AudioManifest {
  version: number;
  sounds: Record<string, ManifestSound>;
}

export const MANIFEST = manifestJson as unknown as AudioManifest;

export type Format = 'webm' | 'm4a';

/**
 * Opus in WebM where the browser says it can play it (Chrome, Firefox, Edge, Safari 17+ on macOS);
 * AAC in MP4 otherwise (older iOS Safari). A WebM that then fails to decode retries as M4A.
 */
export function pickFormat(canPlay: (type: string) => string): Format {
  try {
    return canPlay('audio/webm; codecs="opus"') ? 'webm' : 'm4a';
  } catch {
    return 'm4a';
  }
}

interface Slice {
  start: number;
  dur: number;
}
export interface Loaded {
  buffer: AudioBuffer;
  slices: Slice[];
  loop: boolean;
}

/**
 * Snap each slice onto its real onset in the decoded buffer (codec priming can shift a file by a few
 * tens of ms), keeping 3 ms of pre-roll. Loops and textures are used as written.
 */
export function snapSlices(data: Float32Array, rate: number, slices: [number, number, number][], loop: boolean): Slice[] {
  if (loop) return slices.map(([s, d]) => ({ start: s, dur: d }));
  return slices.map(([s, d, peak]) => {
    const from = Math.max(0, (s - 0.06) * rate);
    const on = findOnset(data, from, (s + 0.08) * rate, Math.max(0.002, peak * 0.05));
    const start = Math.max(0, on / rate - 0.003);
    return { start, dur: Math.max(0.01, d - Math.max(0, start - s)) };
  });
}

export class SampleBank {
  private bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private loaded = new Map<string, Loaded>();
  private decoding = new Map<string, Promise<void>>();
  readonly format: Format;

  constructor(
    private readonly manifest: AudioManifest = MANIFEST,
    private readonly base = 'audio/',
    format?: Format,
  ) {
    this.format = format ?? (typeof document !== 'undefined' ? pickFormat((t) => document.createElement('audio').canPlayType(t)) : 'webm');
  }

  names(group?: string): string[] {
    return Object.entries(this.manifest.sounds)
      .filter(([, s]) => !group || s.group === group)
      .map(([n]) => n);
  }

  /** Bytes of a group in the chosen format (for the budget readout and tests). */
  groupBytes(group: string, format: Format = this.format): number {
    return this.names(group).reduce((a, n) => a + this.manifest.sounds[n]![format].bytes, 0);
  }

  private url(f: ManifestFile): string {
    return `${this.base}${f.file}?v=${f.hash}`;
  }

  private fetchBytes(name: string, format: Format): Promise<ArrayBuffer | null> {
    const key = `${name}.${format}`;
    let p = this.bytes.get(key);
    if (!p) {
      const s = this.manifest.sounds[name]!;
      p = fetch(this.url(s[format]), { priority: 'low' } as RequestInit)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(key, p);
    }
    return p;
  }

  /** Start downloading a group without decoding (no AudioContext needed). */
  prefetch(group: string): void {
    if (typeof fetch === 'undefined') return;
    for (const n of this.names(group)) void this.fetchBytes(n, this.format);
  }

  /** Download (if needed) and decode every sound of a group. Failures leave the procedural fallback. */
  load(ctx: BaseAudioContext, group: string): Promise<void> {
    let p = this.decoding.get(group);
    if (!p) {
      p = Promise.all(this.names(group).map((n) => this.decodeOne(ctx, n))).then(() => undefined);
      this.decoding.set(group, p);
    }
    return p;
  }

  private async decodeOne(ctx: BaseAudioContext, name: string): Promise<void> {
    const s = this.manifest.sounds[name]!;
    const formats: Format[] = this.format === 'webm' ? ['webm', 'm4a'] : ['m4a'];
    for (const f of formats) {
      const bytes = await this.fetchBytes(name, f);
      if (!bytes) continue;
      try {
        // decodeAudioData detaches its argument: give it a copy so a retry can reuse the bytes.
        const buffer = await ctx.decodeAudioData(bytes.slice(0));
        const slices = snapSlices(buffer.getChannelData(0), buffer.sampleRate, s.slices, !!s.loop);
        this.loaded.set(name, { buffer, slices, loop: !!s.loop });
        return;
      } catch {
        /* try the next format */
      }
    }
  }

  get(name: string): Loaded | undefined {
    return this.loaded.get(name);
  }

  has(name: string): boolean {
    return this.loaded.has(name);
  }

  /** Extra manifest fields of a sound (the theme's bpm and bars). */
  meta(name: string): { bpm?: number; bars?: number } | undefined {
    return this.manifest.sounds[name];
  }

  /** For tests and offline renders: put an already-decoded sound in the bank. */
  put(name: string, l: Loaded): void {
    this.loaded.set(name, l);
  }
}

export interface PlayOpts {
  /** 0..1: level (and, for `dull` sounds, brightness). Default 1. */
  strength?: number;
  /** Extra linear gain. */
  gain?: number;
  /** Extra playback-rate factor. */
  rate?: number;
  /** Pan offset, -1..1. */
  pan?: number;
  /** Start time (AudioContext seconds); default now. */
  when?: number;
  /** A specific variant instead of a random one. */
  variant?: number;
  /** Loop the slice (beds, breath): such voices live outside the pool until stopped. */
  loop?: boolean;
  /** Fade in over this many seconds (loops, scattered textures). */
  fadeIn?: number;
  /** Override the catalog's bus with this node. */
  dest?: AudioNode;
  /** Override the catalog's priority. */
  priority?: number;
  /** Stop after this many seconds (with a short fade). */
  maxDur?: number;
}

export interface Voice extends VoiceInfo {
  src: AudioBufferSourceNode;
  gain: GainNode;
  stop(fade?: number): void;
}

export class SamplePlayer {
  private pool: Voice[] = [];
  private lastVariant = new Map<string, number>();
  rnd: Rng = Math.random;

  constructor(
    private readonly ctx: BaseAudioContext,
    readonly bank: SampleBank,
    private readonly buses: Record<Bus, AudioNode>,
    readonly cap: number,
  ) {}

  has(name: string): boolean {
    return this.bank.has(name);
  }

  /** Voices playing now (pool only; loops are not counted). */
  active(): number {
    this.prune();
    return this.pool.length;
  }

  private prune() {
    const now = this.ctx.currentTime;
    this.pool = this.pool.filter((v) => v.ends > now);
  }

  play(name: string, o: PlayOpts = {}): Voice | null {
    const l = this.bank.get(name);
    const spec = SOUNDS[name];
    if (!l || !spec || !l.slices.length) return null;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const when = Math.max(now, o.when ?? now);
    const priority = o.priority ?? spec.priority;
    const strength = Math.min(1, Math.max(0, o.strength ?? 1));
    if (!o.loop) {
      this.prune();
      const slot = voiceSlot(this.pool, this.cap, name, spec.max, priority);
      if (slot === 'drop') return null;
      if (slot !== 'free') {
        const v = this.pool[slot]!;
        v.stop(0.012);
        this.pool.splice(slot, 1);
      }
    }
    const vi = o.variant !== undefined ? Math.min(l.slices.length - 1, Math.max(0, o.variant)) : pickVariant(l.slices.length, this.lastVariant.get(name) ?? -1, this.rnd);
    this.lastVariant.set(name, vi);
    const sl = l.slices[vi]!;
    const src = ctx.createBufferSource();
    src.buffer = l.buffer;
    const rate = centsToRate(spread(spec.cents, this.rnd)) * (o.rate ?? 1);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const level = dbToGain(spec.db + spread(spec.vary, this.rnd)) * strengthGain(strength, spec.floor ?? -14) * (o.gain ?? 1);
    let head: AudioNode = g;
    if (spec.dull && strength < 0.95) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = strengthCutoff(strength);
      f.Q.value = 0.5;
      src.connect(f).connect(g);
    } else src.connect(g);
    const panAmt = Math.max(-1, Math.min(1, spread(spec.pan ?? 0, this.rnd) + (o.pan ?? 0)));
    if (panAmt !== 0 && typeof (ctx as AudioContext).createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = panAmt;
      g.connect(p);
      head = p;
    }
    head.connect(o.dest ?? this.buses[spec.bus]);
    const offset = spec.scatter && !o.loop ? this.rnd() * Math.max(0, Math.min(spec.scatter, sl.dur - 0.6)) : 0;
    const fadeIn = o.fadeIn ?? (offset > 0 ? 0.015 : 0);
    if (fadeIn > 0) {
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(level, when + fadeIn);
    } else g.gain.setValueAtTime(level, when);
    let ends: number;
    if (o.loop) {
      src.loop = true;
      src.loopStart = sl.start;
      src.loopEnd = Math.min(l.buffer.duration, sl.start + sl.dur);
      src.start(when, sl.start + this.rnd() * sl.dur * 0.9);
      ends = Infinity;
    } else {
      const len = sl.dur - offset;
      src.start(when, sl.start + offset, len);
      ends = when + len / rate;
      if (o.maxDur && o.maxDur < len / rate) {
        const end = when + o.maxDur;
        g.gain.setTargetAtTime(0, end - 0.08, 0.03);
        src.stop(end + 0.1);
        ends = end + 0.1;
      }
    }
    const v: Voice = {
      sound: name,
      priority,
      started: when,
      ends,
      src,
      gain: g,
      stop: (fade = 0.05) => {
        const t = ctx.currentTime;
        try {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.setTargetAtTime(0, t, fade / 3);
          src.stop(t + fade + 0.02);
        } catch {
          /* already stopped */
        }
        v.ends = Math.min(v.ends, t + fade);
      },
    };
    src.onended = () => {
      src.disconnect();
      head.disconnect();
      const i = this.pool.indexOf(v);
      if (i >= 0) this.pool.splice(i, 1);
    };
    if (!o.loop) this.pool.push(v);
    return v;
  }

  /** Fade every pooled voice on a bus (or all of them). */
  stopAll(fade = 0.1): void {
    for (const v of this.pool) v.stop(fade);
    this.pool = [];
  }
}
