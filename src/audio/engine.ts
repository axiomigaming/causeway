/**
 * CAUSEWAY sound. Recorded sounds (public/audio, see catalog.ts and samples.ts) played through a
 * capped voice pool with per-trigger variation, a score sequenced from recorded percussion
 * (score.ts), and real room reverb from a recorded impulse response. Every public method keeps a
 * procedural WebAudio voice as its fallback: until a sample is decoded (or if it fails to load), the
 * synthesised version plays, so the game is never silent and never waits on audio.
 *
 * Signal flow
 *   score (sequencer layers) → score ─→ duck ─┐
 *   stingers → sting ─────────────────────────┼→ music ─┐
 *   beds, gusts → amb ─┐                      │         ├→ master → shelf → comp → limiter → out
 *   footsteps → foley ─┼→ sfx ────────────────┼─────────┘
 *   ui, coins → ui ────┘                      │
 *   music/sfx sends ──────────────────────────┴→ room (recorded IR) → master
 *
 * Everything the score, the riser, the beds and the breathing do follows the multiplier ON SCREEN
 * while running, and the settled result afterwards. None of it depends on the hidden fall point.
 */
import type { WorldSounds } from '../render/game';
import type { Bus } from './catalog';
import { milestoneApproach, tierOf, type Tier } from './feedback';
import { SampleBank, SamplePlayer, type PlayOpts, type Voice } from './samples';
import { ScorePlayer } from './score';
import { ThemePlayer } from './theme';
import { worldMood } from '../world/mood';
import { bedMix, mulberry32, resolveSfx, surfaceFor, voiceCap, type Bed } from './select';

type Scene = 'title' | 'setup' | 'lead' | 'run' | 'escaped' | 'fallen';
export type UiSound = 'hover' | 'tick' | 'press' | 'confirm' | 'bet' | 'cashout' | 'deny' | 'open' | 'close' | 'stamp' | 'toggle';

const BEDS: Bed[] = ['jungle', 'insects', 'river', 'waterfall'];

const ROOT = 146.83; // D3
const hz = (semi: number, base = ROOT) => base * Math.pow(2, semi / 12);

/** Chords as semitones from D3. Calm progression i–VI–III–VII; driven one i–VI–iv–V. */
const CALM = [
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
];
const DRIVEN = [
  [0, 3, 7],
  [-4, 0, 3],
  [-7, -4, 0],
  [-5, -1, 2],
];
/** Arpeggio order over chord tones (index into [r, 3rd, 5th, r+12, 3rd+12]). */
const ARP = [0, 2, 3, 2, 1, 2, 4, 2];
/** Bell pitch per milestone (semitones above D5), rising. */
const MILESTONE_BELL = [0, 3, 7, 10, 12, 15];

export class AudioEngine implements WorldSounds {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** The end of the master chain (what the speakers get). */
  private out!: AudioNode;
  private music!: GainNode;
  private score!: GainNode;
  private sfxBus!: GainNode;
  private amb!: GainNode;
  private ambDuck!: GainNode;
  private ambTone!: BiquadFilterNode;
  /** The cicada bed has its own high shelf: it is the brightest, most masking bed. */
  private insectEq: BiquadFilterNode | null = null;
  private ambTier: Tier = 0;
  private room!: ConvolverNode;
  private musicSend!: GainNode;
  private sfxSend!: GainNode;
  private noise!: AudioBuffer;
  private scene: Scene = 'title';
  private intensity = 0;
  private running = false;
  private speed = 0;
  private nextBeat = 0;
  private beat = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Pad (the drone that follows the harmony).
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padOsc: OscillatorNode[] = [];
  private chord = CALM[0]!;
  // Beds.
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private whistleGain!: GainNode;
  private whistleFilter!: BiquadFilterNode;
  private waterGain!: GainNode;
  private insectGain!: GainNode;
  private rumbleGain!: GainNode;
  private rumbleFilter!: BiquadFilterNode;
  // Tension riser (follows the approach to the next milestone).
  private riserGain!: GainNode;
  private riserFilter!: BiquadFilterNode;
  private riserToneGain!: GainNode;
  private riserOsc!: OscillatorNode;
  /** Milestone cues ring through here so a settle can silence them at once. */
  private cue!: GainNode;
  /** The multiplier on screen (hundredths), fed per frame while running. */
  private mult = 100;
  /** Tier of the settled result, set just before crash()/escape() stage it. */
  private grade: Tier = 0;
  private levels = { master: 0.8, music: 0.6, sfx: 0.85, muted: false };
  private lastHover = 0;
  private stepSide = 1;
  private stepPan: StereoPannerNode[] = [];
  private recentImpacts: number[] = [];
  private crashAt = -10;
  private crashKind = '';
  private slamDone = true;
  private birdTimer: ReturnType<typeof setTimeout> | null = null;
  // Recorded sound.
  private readonly bank = new SampleBank();
  private sp: SamplePlayer | null = null;
  private scorePlayer: ScorePlayer | null = null;
  /** The composed theme (theme.ts). When it is loaded it is the score; the percussion score is its fallback. */
  private theme: ThemePlayer | null = null;
  private themeOn = false;
  private bus!: Record<Bus, GainNode>;
  /** Between the score and the music bus: dips under stingers and milestone hits. */
  private duck!: GainNode;
  private sting!: GainNode;
  private bedVoice = new Map<string, Voice>();
  private bedsOn = false;
  private section: string | null = null;
  private breath: Voice | null = null;
  private drone: Voice | null = null;
  private strings: Voice | null = null;
  private windBed: Voice | null = null;
  private nextGust = 0;
  private lastGust = 0;
  /** Cosmetic randomness for variation only (never game state). */
  private rnd = mulberry32((Date.now() ^ 0x5eed) >>> 0);

  constructor() {
    // Core sounds download with the page (small; decoded on the first gesture).
    this.bank.prefetch('core');
  }

  /** Browsers only allow audio after a gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // Master chain: a gentle top shelf (synth noise gets bright), then a soft-knee
    // compressor that glues rather than pumps, and a fast catch for the big hits.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.1;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 7000;
    shelf.gain.value = -3;
    // The WebAudio compressor has no look-ahead, so fast transients overshoot its threshold a little:
    // a fixed trim after it keeps true peaks under -1 dBTP (measured with earshot on captured play).
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    this.master = ctx.createGain();
    this.master.connect(shelf).connect(comp).connect(limit).connect(trim).connect(ctx.destination);
    this.out = trim;
    this.music = ctx.createGain();
    this.score = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.amb = ctx.createGain();
    this.duck = ctx.createGain();
    this.sting = ctx.createGain();
    this.score.connect(this.duck).connect(this.music);
    this.sting.connect(this.music);
    this.music.connect(this.master);
    this.sfxBus.connect(this.master);
    // Ambience → a duck and a tone control before the sfx bus. While running the beds drop 10-14 dB
    // under the score and lose their top (cicadas and spray live at 3-8 kHz, where phone speakers are
    // harshest and where they masked the shaker); between runs they open up again.
    this.ambDuck = ctx.createGain();
    this.ambTone = ctx.createBiquadFilter();
    this.ambTone.type = 'lowpass';
    this.ambTone.frequency.value = 16000;
    this.ambTone.Q.value = 0.5;
    this.amb.connect(this.ambTone).connect(this.ambDuck).connect(this.sfxBus);
    const foley = ctx.createGain();
    const ui = ctx.createGain();
    foley.connect(this.sfxBus);
    ui.connect(this.sfxBus);
    this.bus = { sfx: this.sfxBus, foley, ui, amb: this.amb, music: this.score, sting: this.sting };
    this.cue = ctx.createGain();
    this.cue.connect(this.sfxBus);
    // Two seconds of white noise, reused by every noisy voice.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // A stone room: a short, dark, generated impulse. Everything sends a little.
    this.room = ctx.createConvolver();
    this.room.buffer = this.impulse(2.2, 2.6);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.9;
    this.room.connect(roomOut).connect(this.master);
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = 0.28;
    this.sfxSend = ctx.createGain();
    this.sfxSend.gain.value = 0.14;
    // Keep the sub out of the room: reverberant lows are mud.
    const roomHp = ctx.createBiquadFilter();
    roomHp.type = 'highpass';
    roomHp.frequency.value = 220;
    roomHp.connect(this.room);
    this.music.connect(this.musicSend).connect(roomHp);
    this.sfxBus.connect(this.sfxSend).connect(roomHp);
    for (const p of [-0.12, 0.12]) {
      const sp = ctx.createStereoPanner();
      sp.pan.value = p;
      sp.connect(this.sfxBus);
      this.stepPan.push(sp);
    }
    this.buildBeds();
    this.buildPad();
    this.buildRiser();
    this.applyLevels();
    this.nextBeat = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
    // Recorded sound: a voice budget for this device, then core now, beds and score right after.
    const nav = navigator as Navigator & { deviceMemory?: number };
    const mobile = /Android|iPhone|iPad|iPod/i.test(nav.userAgent) || (nav.maxTouchPoints ?? 0) > 1;
    this.sp = new SamplePlayer(ctx, this.bank, this.bus, voiceCap({ cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory, mobile }));
    this.sp.rnd = this.rnd;
    this.scorePlayer = new ScorePlayer(ctx, this.sp, this.score, this.rnd);
    this.theme = new ThemePlayer(ctx, this.bank, this.duck, this.sting, this.rnd);
    void this.bank.load(ctx, 'core').then(() => {
      this.bank.prefetch('beds');
      this.bank.prefetch('music');
      void this.bank.load(ctx, 'beds').then(() => this.startBeds());
      void this.bank.load(ctx, 'music').then(() => {
        this.startScore();
        // The composed theme last (the largest group): until it is in, the percussion score plays.
        this.bank.prefetch('theme');
        void this.bank.load(ctx, 'theme').then(() => this.startTheme());
      });
    });
    // Background tabs: stop the clock rather than pile up (and save the battery).
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    this.setScene(this.scene);
  }

  /** True when the recorded sound `name` is decoded and will play (else its procedural stand-in does). */
  hasSample(name: string): boolean {
    return !!this.sp?.has(name);
  }

  /** The output, for QA capture (MediaRecorder) in ?qa builds. */
  tap(): MediaStreamAudioDestinationNode | null {
    if (!this.ctx || !('createMediaStreamDestination' in this.ctx)) return null;
    const d = this.ctx.createMediaStreamDestination();
    this.out.connect(d);
    return d;
  }

  /**
   * Seconds until the next bar line of the music playing now (the run, the lifted loop, or the calm and
   * tense loops), or null when the composed theme is not playing (still loading, muted context, no
   * AudioContext yet). Audio time runs with the game clock; use it to land visual punches on the downbeat.
   */
  nextDownbeat(): number | null {
    if (!this.ctx || this.ctx.state !== 'running' || !this.themeOn) return null;
    return this.theme?.nextDownbeat() ?? null;
  }

  /**
   * Subscribe to the theme's bar lines: `cb(bar, inSeconds)` fires once per bar, up to ~60 ms ahead of it
   * (`inSeconds` = time left). Returns an unsubscribe function. Safe to call before the theme loads.
   */
  onBar(cb: (bar: number, inSeconds: number) => void): () => void {
    const pending = new Set<() => void>();
    let off: (() => void) | null = null;
    const attach = () => {
      if (off || !this.theme) return;
      off = this.theme.onBar(cb);
    };
    attach();
    if (!off) {
      const id = setInterval(() => {
        attach();
        if (off) clearInterval(id);
      }, 250);
      pending.add(() => clearInterval(id));
    }
    return () => {
      for (const p of pending) p();
      off?.();
    };
  }

  /**
   * The tier change the music is about to land, if any: `{ tier, in }` with `in` seconds until the new
   * layer's downbeat (the fill is already rolling). Tiers 1-3 land on the next bar line, or the one after if
   * the next is less than a third of a bar away (at most ~1.35 bars after the tier change). Tier 4 is a key
   * lift: it lands on the next 4-bar section line that leaves room for the two pivot bars (at most ~6 bars,
   * about 13 s at 112 BPM) - the big visual moment belongs on that downbeat.
   */
  tierLanding(): { tier: Tier; in: number } | null {
    return this.themeOn ? (this.theme?.pendingLanding() ?? null) : null;
  }

  /** Voices playing in the pool (QA). */
  voices(): number {
    return this.sp?.active() ?? 0;
  }

  setLevels(l: { master: number; music: number; sfx: number; muted: boolean }): void {
    this.levels = l;
    this.applyLevels();
  }

  private applyLevels() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.levels.muted ? 0 : this.levels.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.music.gain.setTargetAtTime(this.levels.music * 0.95, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.levels.sfx, t, 0.05);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        // Darker as it decays: a one-pole lowpass whose cutoff falls over the tail.
        const a = 0.55 - 0.45 * k;
        lp += a * ((Math.random() * 2 - 1) - lp);
        const pre = i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1;
        d[i] = lp * Math.pow(1 - k, decay) * pre * 0.9;
      }
    }
    return buf;
  }

  // ------------------------------------------------------------------ beds
  private loopNoise(rate = 1): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, Math.random() * 1.9);
    return s;
  }

  private lfo(freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }

  private buildBeds() {
    const ctx = this.ctx!;
    // Water: low lapping against the causeway, two slow swells out of phase.
    const w = this.loopNoise(0.8);
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 480;
    wf.Q.value = 0.4;
    this.lfo(0.11, 160, wf.frequency);
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.05;
    const lap = ctx.createGain();
    lap.gain.value = 0.7;
    this.lfo(0.23, 0.3, lap.gain);
    w.connect(wf).connect(lap).connect(this.waterGain).connect(this.amb);
    // Wind: a broad body plus a thin whistle, both gusting, both rising with speed.
    const n = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.02;
    const gust = ctx.createGain();
    gust.gain.value = 0.75;
    this.lfo(0.07, 0.25, gust.gain);
    n.connect(this.windFilter).connect(gust).connect(this.windGain).connect(this.amb);
    const wh = this.loopNoise(1.3);
    this.whistleFilter = ctx.createBiquadFilter();
    this.whistleFilter.type = 'bandpass';
    this.whistleFilter.frequency.value = 1100;
    this.whistleFilter.Q.value = 5;
    this.lfo(0.17, 160, this.whistleFilter.frequency);
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0.004;
    const whPan = ctx.createStereoPanner();
    this.lfo(0.05, 0.6, whPan.pan);
    wh.connect(this.whistleFilter).connect(this.whistleGain).connect(whPan).connect(this.amb);
    // Insects: a high shimmer, amplitude-modulated, out in the trees.
    const ins = this.loopNoise();
    const inf = ctx.createBiquadFilter();
    inf.type = 'bandpass';
    inf.frequency.value = 6200;
    inf.Q.value = 7;
    const ing = ctx.createGain();
    ing.gain.value = 0.0;
    this.lfo(31, 0.01, ing.gain);
    this.insectGain = ctx.createGain();
    this.insectGain.gain.value = 1;
    ins.connect(inf).connect(ing).connect(this.insectGain).connect(this.amb);
    // Rumble: the ruins under strain; follows intensity.
    const r = this.loopNoise(0.5);
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.frequency.value = 90;
    this.rumbleFilter.Q.value = 0.9;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    r.connect(this.rumbleFilter).connect(this.rumbleGain).connect(this.sfxBus);
    // Birds, now and then, when nothing is chasing us.
    const bird = () => {
      if (this.ctx && this.ctx.state === 'running' && !this.bedsOn && (this.scene === 'title' || this.scene === 'setup' || this.scene === 'escaped')) this.birdCall();
      this.birdTimer = setTimeout(bird, 2500 + Math.random() * 6000);
    };
    this.birdTimer = setTimeout(bird, 1800);
  }

  /** The harmonic drone: five persistent voices that glide to each new chord. */
  private buildPad() {
    const ctx = this.ctx!;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 380;
    this.padFilter.Q.value = 0.7;
    this.lfo(0.09, 60, this.padFilter.frequency);
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padFilter.connect(this.padGain).connect(this.music);
    const voices: [OscillatorType, number, number][] = [
      ['sawtooth', -8, 0.16], // root, an octave down
      ['sawtooth', 7, 0.16], // root, an octave down, detuned
      ['triangle', 0, 0.2], // third
      ['sawtooth', 4, 0.1], // fifth
      ['sine', 0, 0.28], // sub root
    ];
    for (const [type, det, g] of voices) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      const gn = ctx.createGain();
      gn.gain.value = g;
      o.connect(gn).connect(this.padFilter);
      o.start();
      this.padOsc.push(o);
    }
    this.voiceChord(this.chord, ctx.currentTime, 0.01);
  }

  private voiceChord(c: number[], at: number, glide: number) {
    const [r, third, fifth] = c as [number, number, number];
    const f = [hz(r - 12), hz(r - 12), hz(third), hz(fifth), hz(r - 24)];
    this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(f[i]!, at, glide));
  }

  private buildRiser() {
    const ctx = this.ctx!;
    const n = this.loopNoise();
    this.riserFilter = ctx.createBiquadFilter();
    this.riserFilter.type = 'bandpass';
    this.riserFilter.frequency.value = 500;
    this.riserFilter.Q.value = 2.2;
    this.riserGain = ctx.createGain();
    this.riserGain.gain.value = 0;
    n.connect(this.riserFilter).connect(this.riserGain).connect(this.score);
    // A bowed tone under the noise, rising a fifth across the approach.
    this.riserOsc = ctx.createOscillator();
    this.riserOsc.type = 'sawtooth';
    this.riserOsc.frequency.value = hz(12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.riserToneGain = ctx.createGain();
    this.riserToneGain.gain.value = 0;
    this.riserOsc.connect(lp).connect(this.riserToneGain).connect(this.score);
    this.riserOsc.start();
  }

  private birdCall() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.amb);
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const st = t + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), st);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), st + 0.07);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.014, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.08);
      o.connect(g).connect(pan);
      o.start(st);
      o.stop(st + 0.1);
    }
  }

  // ------------------------------------------------------------------ voices
  private noiseHit(at: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, dest: AudioNode = this.sfxBus, sweepTo?: number, attack = 0) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + attack);
    } else g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur, attack + 0.01));
    s.connect(f).connect(g).connect(dest);
    s.start(at, Math.random() * 1.5);
    s.stop(at + Math.max(dur, attack + 0.01) + 0.02);
  }

  private tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', dest: AudioNode = this.sfxBus, toFreq?: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** A filtered sawtooth note (bass, strings, brass). */
  private synth(at: number, freq: number, dur: number, gain: number, cutoff: number, dest: AudioNode, opts: { attack?: number; release?: number; toCutoff?: number; detune?: number; type?: OscillatorType } = {}) {
    const ctx = this.ctx!;
    const attack = opts.attack ?? 0.01;
    const release = opts.release ?? dur * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, at);
    if (opts.toCutoff) f.frequency.exponentialRampToValueAtTime(opts.toCutoff, at + dur);
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.setTargetAtTime(0.0001, at + Math.max(attack, dur - release), release / 4);
    f.connect(g).connect(dest);
    const dets = opts.detune ? [-opts.detune, opts.detune] : [0];
    for (const det of dets) {
      const o = ctx.createOscillator();
      o.type = opts.type ?? 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  /** Inharmonic bell: three sine partials with staggered decays. */
  private bell(at: number, freq: number, gain: number, dur = 1.8, dest: AudioNode = this.music) {
    this.tone(at, freq, dur, gain, 'sine', dest, undefined, 0.003);
    this.tone(at, freq * 2.76, dur * 0.45, gain * 0.35, 'sine', dest, undefined, 0.002);
    this.tone(at, freq * 5.4, dur * 0.2, gain * 0.14, 'sine', dest, undefined, 0.002);
  }

  // ------------------------------------------------------------------ recorded beds and score
  /** Beds loaded: start every loop silent, then fade to the section's mix; the synth beds bow out. */
  private startBeds() {
    const ctx = this.ctx;
    const sp = this.sp;
    if (!ctx || !sp || this.bedsOn) return;
    this.insectEq = ctx.createBiquadFilter();
    this.insectEq.type = 'highshelf';
    this.insectEq.frequency.value = 3200;
    this.insectEq.gain.value = -9;
    this.insectEq.connect(this.amb);
    for (const b of BEDS) {
      const v = sp.play(`bed_${b}`, { loop: true, gain: 0, dest: b === 'insects' ? this.insectEq : undefined });
      if (v) this.bedVoice.set(b, v);
    }
    this.windBed = sp.play('bed_wind', { loop: true, gain: 0 });
    if (!this.bedVoice.size) return;
    this.bedsOn = true;
    const t = ctx.currentTime;
    // The recorded water, insects and birds replace the synthesised ones; the synth wind body stays
    // as a quiet speed layer under the recorded wind.
    this.waterGain.gain.setTargetAtTime(0, t, 0.8);
    this.insectGain.gain.setTargetAtTime(0, t, 0.8);
    this.whistleGain.gain.setTargetAtTime(0, t, 0.8);
    this.mixBeds(2);
  }

  /** Crossfade the beds to the current section (and scene); `tc` is the time constant in seconds. */
  private mixBeds(tc: number) {
    if (!this.ctx) return;
    if (!this.bedsOn) return this.duckAmbience(tc);
    const t = this.ctx.currentTime;
    const live = this.scene === 'run' || this.scene === 'lead' || this.scene === 'fallen';
    const mix = bedMix(live ? this.section : null);
    for (const b of BEDS) this.bedVoice.get(b)?.gain.gain.setTargetAtTime(mix[b], t, tc);
    this.duckAmbience(tc);
  }

  /**
   * While running the score and the footsteps carry the scene: the whole ambience bus ducks 10 dB at
   * 1× and 14 dB from 10×, and its top closes from 16 kHz to 6-4.5 kHz. Menus and results get the full
   * jungle back. Follows the scene and the tier on screen only.
   */
  private duckAmbience(tc: number) {
    if (!this.ctx || !this.ambDuck) return;
    const t = this.ctx.currentTime;
    const live = this.scene === 'run' || this.scene === 'lead';
    const tier = live ? tierOf(this.mult) : 0;
    // Between runs the jungle opens up, a little under the calm theme when it plays.
    const db = !live ? (this.themeOn ? -5 : 0) : -10 - Math.min(4, tier * 1.4);
    this.ambDuck.gain.setTargetAtTime(Math.pow(10, db / 20), t, tc);
    this.ambTone.frequency.setTargetAtTime(live ? 6000 - tier * 380 : 16000, t, tc);
  }

  /** Score loaded: the drone, the riser strings and the recorded room come in; the synth pad bows out. */
  private startScore() {
    const ctx = this.ctx;
    const sp = this.sp;
    if (!ctx || !sp) return;
    const ir = this.bank.get('ir_room');
    if (ir) {
      // The recorded room replaces the generated impulse (its one slice, copied out of the file).
      const sl = ir.slices[0]!;
      const o = Math.floor(sl.start * ir.buffer.sampleRate);
      const n = Math.max(1, Math.min(ir.buffer.length - o, Math.floor(sl.dur * ir.buffer.sampleRate)));
      const b = ctx.createBuffer(2, n, ir.buffer.sampleRate);
      for (let c = 0; c < 2; c++) b.getChannelData(c).set(ir.buffer.getChannelData(Math.min(c, ir.buffer.numberOfChannels - 1)).subarray(o, o + n));
      this.room.buffer = b;
    }
    this.drone = sp.play('m_drone', { loop: true, gain: 0, dest: this.duck });
    this.strings = sp.play('m_strings', { loop: true, gain: 0, dest: this.score });
    if (!this.scorePlayer?.ready()) return;
    const t = ctx.currentTime;
    this.padGain.gain.cancelScheduledValues(t);
    this.padGain.gain.setTargetAtTime(0, t, 0.8);
    this.riserToneGain.gain.setTargetAtTime(0, t, 0.2);
    this.scorePlayer.restart(t + 0.05);
    this.setScene(this.scene);
  }

  /** The composed theme is decoded: it takes over from the percussion score, the drone and the riser. */
  private startTheme() {
    const ctx = this.ctx;
    const th = this.theme;
    if (!ctx || !th || !th.ready()) return;
    const t = ctx.currentTime;
    this.themeOn = true;
    this.scorePlayer?.silence(t, 0.4);
    if (this.scorePlayer) this.scorePlayer.mode = 'off';
    this.drone?.gain.gain.setTargetAtTime(0, t, 0.6);
    this.strings?.gain.gain.setTargetAtTime(0, t, 0.3);
    if (this.scene === 'run') {
      th.startRun(t + 0.05);
      th.setTier(tierOf(this.mult));
    } else if (this.scene === 'fallen') th.setIdle('th_tense', t + 0.05);
    else if (this.scene === 'escaped') th.setIdle('th_safe', t + 0.05);
    else if (this.scene !== 'lead') th.rest();
    this.duckAmbience(1.5);
  }

  private get sampledScore(): boolean {
    return !!this.scorePlayer?.ready();
  }

  /** Dip the score under a stinger or a milestone hit, then bring it back. */
  private duckFor(depth: number, hold: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(depth, t, 0.04);
    g.setTargetAtTime(1, t + hold, 0.5);
  }

  /** Play a recorded sound if it is decoded; false means "use the procedural voice". */
  private sample(name: string, o: PlayOpts = {}): boolean {
    return !!this.sp?.play(name, o);
  }

  /**
   * A world event by name, for effects added elsewhere (`audio.sfx('dust', 0.6)`). Names map to
   * recorded sounds in select.ts (SFX_NAMES); unknown names, or sounds not loaded yet, do nothing.
   */
  sfx(name: string, strength = 0.7): void {
    if (!this.ctx) return;
    if (name === 'tier_up') {
      // A run tier arrives (strength = tier / 4, from the multiplier on screen). Not a separate
      // ding: the score lands an accent on its next downbeat, the bar where the new layer enters.
      // With the theme loaded, climb() already sent the tier: the fill and the new layer are the accent.
      if (!this.themeOn) this.scorePlayer?.accent(Math.min(1, Math.max(0, strength)));
      return;
    }
    const r = resolveSfx(name, strength);
    if (!r) return;
    if (this.sample(r.sound, { strength: r.strength }) && name === 'dust_burst') {
      // A wall blowing out: grit and a few stones come with the dust.
      this.sample('debris', { strength: 0.3 + 0.4 * strength, when: this.ctx.currentTime + 0.05 });
    }
  }

  /** WorldSounds.event: named world events from the game (dust_burst, stones_skitter, tier_up, …). */
  event(name: string, strength: number): void {
    this.sfx(name, strength);
  }

  /**
   * The section the runner is in (track section type: 'bridge', 'gorge', 'tunnel', …). Optional:
   * refines the footstep surface (gravel in ruins, wet stone by the falls) and crossfades the beds.
   */
  setSection(type: string | null | undefined): void {
    const t = type ?? null;
    if (t === this.section) return;
    this.section = t;
    this.mixBeds(1.5);
  }

  // ------------------------------------------------------------------ world hooks
  footstep(strength: number, surface: 'stone' | 'wood'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = 0.45 + strength * 0.55;
    this.stepSide = -this.stepSide;
    // Recorded steps: the surface refined by the section, left/right a touch apart; a sprint lands
    // harder (level and brightness follow the strength the animation reports).
    const under = surfaceFor(this.section, surface, this.rnd);
    const step = { strength: 0.35 + 0.65 * Math.min(1, strength), pan: this.stepSide * 0.08 };
    if (this.sample(`step_${under}`, step) || this.sample(`step_${surface}`, step)) {
      // At a hard sprint on loose ground the push-off kicks grit too.
      if (strength > 0.85 && this.intensity > 0.5 && under !== 'wood' && this.rnd() < 0.3) this.sample('debris', { strength: 0.15, pan: this.stepSide * 0.1 });
      return;
    }
    const out = this.stepPan[this.stepSide > 0 ? 1 : 0]!;
    const v = 0.9 + Math.random() * 0.2;
    if (surface === 'wood') {
      // A hollow plank: a resonant knock with a short ring, and now and then a creak.
      this.tone(t, 170 * v, 0.12, 0.13 * k, 'triangle', out, 120);
      this.noiseHit(t, 0.12, 'bandpass', 420 * v, 7, 0.16 * k, out);
      this.noiseHit(t, 0.025, 'bandpass', 2400, 1.2, 0.06 * k, out);
      if (Math.random() < 0.14) {
        const c = t + 0.04;
        this.synth(c, 260 + Math.random() * 90, 0.22, 0.012, 900, out, { attack: 0.04, type: 'sawtooth', toCutoff: 600 });
      }
    } else {
      // Leather on stone: a soft body thump, a dry scuff and a little grit.
      this.tone(t, 110 * v, 0.07, 0.11 * k, 'sine', out, 55);
      this.noiseHit(t, 0.035 + 0.02 * Math.random(), 'bandpass', 1500 * v + Math.random() * 700, 1.1, 0.08 * k, out);
      this.noiseHit(t + 0.01, 0.05, 'highpass', 5200, 0.7, 0.022 * k, out);
    }
  }

  impact(size: number, water: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Voice limiting: in a collapse dozens of bodies land at once.
    this.recentImpacts = this.recentImpacts.filter((x) => t - x < 0.25);
    if (this.recentImpacts.length >= 6) return;
    this.recentImpacts.push(t);
    const crowd = 1 / Math.sqrt(this.recentImpacts.length);
    const k = Math.min(1.3, 0.3 + size) * crowd;
    const sz = Math.min(1, Math.max(0, size));
    if (water) {
      // A body into the water: the big splash from about half size, else a small one; a few drops after.
      if (this.sample(sz >= 0.55 ? 'splash_big' : 'splash_small', { strength: Math.min(1, 0.4 + sz * 0.6) * crowd })) {
        if (sz >= 0.55) this.sample('splash_small', { strength: 0.35, when: t + 0.18 + this.rnd() * 0.15 });
        return;
      }
    } else if (!(!this.slamDone && this.crashKind === 'gate' && t - this.crashAt < 3)) {
      // Stone: the hit, then the debris it throws, and dust for the big ones.
      if (this.sample('impact', { strength: Math.min(1, 0.3 + sz * 0.7) * crowd })) {
        if (sz > 0.45) this.sample('debris', { strength: sz * 0.7 * crowd, when: t + 0.04 + this.rnd() * 0.05 });
        if (sz > 0.75) this.sample('dust', { strength: sz * 0.6, when: t + 0.08 });
        return;
      }
    }
    if (water) {
      // Splash body falling in pitch, a low whump, then a few plops.
      this.noiseHit(t, 0.5 + k * 0.5, 'lowpass', 4200, 0.6, 0.16 * k, this.sfxBus, 420);
      this.noiseHit(t, 0.1, 'bandpass', 1300, 1.4, 0.1 * k);
      this.tone(t, 90, 0.3, 0.2 * k, 'sine', this.sfxBus, 48);
      for (let i = 0; i < 3; i++) this.tone(t + 0.08 + i * 0.05 + Math.random() * 0.08, 380 + Math.random() * 300, 0.05, 0.025 * k, 'sine', this.sfxBus, 1100);
      return;
    }
    // Fallback for worlds without the slam() hook: the first stone impact after a gate is the slam.
    if (!this.slamDone && this.crashKind === 'gate' && t - this.crashAt < 3) {
      this.slam(1);
      return;
    }
    // Stone: a sub thump, a crack, a gritty body and a crumbling tail.
    this.tone(t, 72, 0.45 + k * 0.4, 0.45 * k, 'sine', this.sfxBus, 32);
    this.noiseHit(t, 0.03, 'bandpass', 1100 + Math.random() * 600, 1, 0.22 * k);
    this.noiseHit(t, 0.3 + k * 0.3, 'lowpass', 1500, 0.6, 0.3 * k, this.sfxBus, 160);
    for (let i = 0; i < Math.round(5 * k); i++) this.noiseHit(t + 0.05 + Math.random() * 0.6, 0.045, 'bandpass', 900 + Math.random() * 2500, 2, 0.04 * k);
  }

  /** The landing that ends the run (gate slab, the first boulder): the heaviest sound in the game. */
  slam(size: number): void {
    if (!this.ctx) return;
    this.slamDone = true;
    const t = this.ctx.currentTime;
    const k = Math.max(0.4, Math.min(1.2, size));
    if (this.sample('slam', { strength: Math.min(1, 0.55 + 0.45 * k) })) {
      // The slab lands: the slam, its sub (the boom, through the stinger bus so it is never stolen),
      // the stones it breaks loose and a cloud of grit.
      this.sample('m_boom', { strength: 0.5 + 0.3 * Math.min(1, k), gain: 0.7 });
      this.sample('debris', { strength: 0.8, when: t + 0.06 });
      this.sample('debris', { strength: 0.55, when: t + 0.35 + this.rnd() * 0.2 });
      this.sample('dust', { strength: 0.7, when: t + 0.1 });
      return;
    }
    this.tone(t, 64, 1.4 + 0.6 * k, 0.75 * k, 'sine', this.sfxBus, 28, 0.002);
    this.tone(t, 128, 0.5, 0.25 * k, 'triangle', this.sfxBus, 60, 0.002);
    this.noiseHit(t, 0.9, 'lowpass', 2600, 0.7, 0.55 * k, this.sfxBus, 120);
    this.noiseHit(t, 0.05, 'bandpass', 900, 0.8, 0.4 * k);
    for (let i = 0; i < Math.round(10 * k); i++) this.noiseHit(t + 0.08 + Math.random() * 0.9, 0.05, 'bandpass', 1000 + Math.random() * 3000, 2, 0.05);
  }

  tremor(strength: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.sample('rumble', { strength: Math.min(1, 0.35 + strength * 0.6), fadeIn: 0.25, maxDur: 2.6 + strength * 1.5 })) {
      if (strength > 0.4) this.sample('debris', { strength: strength * 0.5, when: t + 0.3 + this.rnd() * 0.6 });
      if (strength > 0.7) this.sample('grind', { strength: 0.3 + 0.3 * strength, when: t + 0.15 });
      return;
    }
    this.noiseHit(t, 1.8, 'lowpass', 150, 0.9, 0.22 + strength * 0.22, this.sfxBus, 55, 0.25);
    this.tone(t, 41, 1.5, 0.1 + strength * 0.12, 'sine', this.sfxBus, 33, 0.3);
    for (let i = 0; i < 4 + strength * 5; i++) this.noiseHit(t + 0.2 + Math.random() * 1.1, 0.04, 'bandpass', 2000 + Math.random() * 2500, 3, 0.022);
  }

  whoosh(): void {
    if (!this.ctx) return;
    if (this.sample('whoosh', { strength: 0.8 })) return;
    this.noiseHit(this.ctx.currentTime, 0.7, 'bandpass', 280, 1.2, 0.1, this.sfxBus, 2200, 0.25);
  }

  run(intensity: number, running: boolean, speed: number): void {
    if (!this.ctx) return;
    this.intensity = intensity;
    this.running = running;
    this.speed = speed;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.016 + speed * 0.0045, t, 0.35);
    this.windFilter.frequency.setTargetAtTime(360 + speed * 70, t, 0.35);
    this.whistleGain.gain.setTargetAtTime(0.003 + speed * speed * 0.00009, t, 0.4);
    this.rumbleGain.gain.setTargetAtTime(running ? Math.max(0, intensity - 0.3) * 0.26 : 0, t, 0.5);
    this.rumbleFilter.frequency.setTargetAtTime(80 + intensity * 50, t, 0.5);
    this.padFilter.frequency.setTargetAtTime(running ? 320 + intensity * 1400 : 260, t, 0.4);
    if (!this.bedsOn) this.insectGain.gain.setTargetAtTime(running ? Math.max(0, 1 - intensity * 1.6) : 1, t, 0.8);
    else {
      // Recorded wind follows the speed; the synth body under it stays a whisper.
      this.windBed?.gain.gain.setTargetAtTime(0.25 + Math.min(1, speed / 9) * 0.75, t, 0.5);
      this.windGain.gain.setTargetAtTime(0.004 + speed * 0.0012, t, 0.35);
      // A gust now and then, more often at speed.
      if (t > this.nextGust) {
        if (this.nextGust > 0) this.sample('gust', { strength: 0.35 + Math.min(0.5, speed / 18) + this.rnd() * 0.15 });
        this.nextGust = t + (running ? 5 : 9) + this.rnd() * (running ? 7 : 12);
      }
    }
    // The world's tier-up gust (world/mood.ts: the foliage thrashes, leaves fly): a recorded gust with it.
    if (worldMood.gust > 0.5 && this.lastGust <= 0.5) this.sample('gust', { strength: 0.5 + 0.5 * worldMood.gust, pan: this.rnd() * 0.6 - 0.3 });
    this.lastGust = worldMood.gust;
    // Breathing: heavy once the run turns into a sprint (2× and up, the same tier the runner sprints at),
    // closer and louder with the multiplier on screen. Silent otherwise.
    const sprint = running && this.scene === 'run' && tierOf(this.mult) >= 1;
    if (sprint && !this.breath && this.sp?.has('breath')) this.breath = this.sp.play('breath', { loop: true, gain: 0, priority: 1 });
    if (this.breath) this.breath.gain.gain.setTargetAtTime(sprint ? 0.55 + 0.45 * intensity : 0, t, sprint ? 1.2 : 0.3);
    if (!running) this.climb(100);
  }

  /**
   * The tension riser, from the multiplier on screen (hundredths). Swells across
   * the last stretch before each milestone and resets on arrival. Call per frame.
   */
  climb(m: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const live = this.running && this.scene === 'run';
    this.mult = live ? m : 100;
    const a = live ? milestoneApproach(m) : 0;
    const p = Math.max(0, (a - 0.55) / 0.45); // only the last stretch
    const shaped = p * p;
    this.riserGain.gain.setTargetAtTime(shaped * 0.05, t, live ? 0.12 : 0.05);
    this.riserFilter.frequency.setTargetAtTime(500 + shaped * 3800, t, 0.12);
    this.riserToneGain.gain.setTargetAtTime(shaped * 0.018, t, live ? 0.15 : 0.05);
    this.riserOsc.frequency.setTargetAtTime(hz(12 + 7 * p), t, 0.12);
    const tier = tierOf(this.mult);
    this.scorePlayer?.setTier(tier);
    if (this.themeOn && live) this.theme!.setTier(tier);
    if (tier !== this.ambTier) {
      this.ambTier = tier;
      this.duckAmbience(1.2);
    }
    if (this.strings && !this.themeOn) {
      // Recorded strings carry the riser: they swell over the last stretch and climb a whole tone.
      this.strings.gain.gain.setTargetAtTime(shaped * 0.9, t, live ? 0.15 : 0.06);
      this.strings.src.playbackRate.setTargetAtTime(1 + 0.12 * p, t, 0.2);
      this.riserToneGain.gain.setTargetAtTime(0, t, 0.05);
      this.riserGain.gain.setTargetAtTime(shaped * 0.02, t, 0.12);
    }
  }

  /** A milestone reached (index into MILESTONES): a low bloom, a bell, air. */
  milestone(i: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const semi = MILESTONE_BELL[Math.min(i, MILESTONE_BELL.length - 1)]!;
    const k = 0.8 + Math.min(i, 5) * 0.08; // later marks ring a little fuller
    if (this.themeOn && this.sp?.has('sparkle')) {
      // The theme marks the tiers itself (fills and new layers on the bar line): a milestone only glints.
      this.sample('sparkle', { strength: 0.5, rate: Math.pow(2, semi / 24), dest: this.cue });
      return;
    }
    if (this.sp?.has('m_taiko') && this.sp.has('sparkle')) {
      // A struck taiko and a gem sparkle that climbs with each mark; the score dips to let it through.
      this.duckFor(0.55, 0.6);
      this.sample('m_taiko', { strength: 0.85 + 0.03 * i, dest: this.cue, priority: 3 });
      if (i >= 2) this.sample('m_boom', { strength: 0.35 + 0.08 * i, dest: this.cue, gain: 0.7 });
      this.sample('sparkle', { strength: 0.75, rate: Math.pow(2, semi / 24), dest: this.cue, when: t + 0.03 });
      return;
    }
    this.tone(t, 96, 0.9, 0.26 * k, 'sine', this.cue, 46, 0.004);
    this.noiseHit(t, 0.9, 'highpass', 6500, 0.6, 0.026 * k, this.cue, undefined, 0.01);
    this.bell(t, hz(semi + 24), 0.045 * k, 2.2, this.cue);
    this.bell(t + 0.07, hz(semi + 31), 0.028 * k, 1.8, this.cue);
    if (i >= 2) this.synth(t, hz(this.chord[0]! - 12), 1.6, 0.045 * k, 700, this.cue, { attack: 0.01, release: 1.2, toCutoff: 200, detune: 8 });
  }

  /**
   * The settled multiplier, just before the world stages the outcome: sets how big
   * the stinger is. For an escape this is the cash-out multiplier (never the fall point).
   */
  outcome(mult: number): void {
    this.grade = tierOf(mult);
  }

  /** Silence anything the live round left ringing (milestone bells, the riser). */
  private settleCues(t: number, tc: number) {
    this.cue.gain.cancelScheduledValues(t);
    this.cue.gain.setValueAtTime(this.cue.gain.value, t);
    this.cue.gain.setTargetAtTime(0, t, tc);
    this.riserGain.gain.setTargetAtTime(0, t, tc);
    this.riserToneGain.gain.setTargetAtTime(0, t, tc);
    this.mult = 100;
  }

  crash(kind: string): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.grade;
    this.crashAt = t;
    this.crashKind = kind;
    this.slamDone = false;
    // The score drops out; the riser and any milestone bell are cut dead.
    this.score.gain.cancelScheduledValues(t);
    this.score.gain.setValueAtTime(this.score.gain.value, t);
    this.score.gain.setTargetAtTime(0, t, 0.03);
    this.settleCues(t, 0.02);
    this.breath?.gain.gain.setTargetAtTime(0, t, 0.08);
    if (this.themeOn && this.sample(kind === 'gate' ? 'grind' : kind === 'chasm' ? 'crumble' : 'rockfall', { strength: 1 })) {
      // The theme cuts dead into its loss sting (low brass falling, timpani); the world adds the collapse.
      this.theme!.fall();
      if (kind === 'chasm') {
        this.sample('debris', { strength: 0.9, when: t + 0.12 });
        this.sample('rockfall', { strength: 0.6, when: t + 0.5 });
      } else if (kind !== 'gate') {
        this.sample('rumble', { strength: 0.8, fadeIn: 0.3, maxDur: 3 });
        this.sample('debris', { strength: 0.7, when: t + 0.35 });
      }
      return;
    }
    if (this.sampledScore && this.sp?.has('m_gong') && this.sp.has('m_boom')) {
      // The score stops dead. A boom and a low gong: brief at 1×, a long dark toll when a lot was
      // riding on it (sized by the settled fall point, which is public by now). The drone sags.
      this.scorePlayer!.silence(t, 0.03);
      this.scorePlayer!.mode = 'off';
      this.sample('m_boom', { strength: 0.7 + 0.075 * g });
      this.sample('m_gong', { strength: 0.45 + 0.13 * g, rate: 0.84 - 0.02 * g, when: t + 0.05, maxDur: 2.2 + g * 1.2 });
      if (g >= 3) this.sample('m_taiko', { strength: 1, when: t + 0.42, dest: this.sting, rate: 0.85 });
      if (this.drone) {
        this.drone.src.playbackRate.setTargetAtTime(0.8, t, 0.6);
        this.drone.gain.gain.setTargetAtTime(0, t + 0.4, 0.9);
      }
      const k = this.sample(kind === 'gate' ? 'grind' : kind === 'chasm' ? 'crumble' : 'rockfall', { strength: 1 });
      if (k) {
        if (kind === 'chasm') {
          this.sample('debris', { strength: 0.9, when: t + 0.12 });
          this.sample('rockfall', { strength: 0.6, when: t + 0.5 });
        } else if (kind !== 'gate') {
          this.sample('rumble', { strength: 0.8, fadeIn: 0.3, maxDur: 3 });
          this.sample('debris', { strength: 0.7, when: t + 0.35 });
        }
        return;
      }
    }
    // A sub drop and a low, dark minor-second sting; brief at 1×, a long toll from 10× up.
    const len = 1.6 + g * 0.55;
    this.tone(t, 58, 1.4 + g * 0.4, 0.4 + g * 0.05, 'sine', this.sfxBus, 26, 0.004);
    this.synth(t + 0.05, hz(-24), len, 0.06 + g * 0.012, 1200, this.music, { attack: 0.02, release: len * 0.7, toCutoff: 140, detune: 9 });
    if (g >= 1) this.synth(t + 0.05, hz(-23), len, 0.04 + g * 0.008, 1000, this.music, { attack: 0.02, release: len * 0.7, toCutoff: 140, detune: 6 });
    if (g >= 2) this.synth(t + 0.05, hz(-17), len, 0.035 + g * 0.008, 900, this.music, { attack: 0.03, release: len * 0.65, toCutoff: 160 });
    if (g >= 3) {
      // A great deal was riding on it: a second, deeper toll and a long dark room.
      this.drum(t + 0.32, 0.34, 40, this.music);
      this.synth(t + 0.3, hz(-31), len + 1, 0.05, 600, this.music, { attack: 0.3, release: len, toCutoff: 90, detune: 5 });
      this.noiseHit(t + 0.3, 2.8, 'lowpass', 400, 0.6, 0.08, this.music, 90, 0.4);
    }
    if (kind === 'gate') {
      // The slab lets go above: a stone-on-stone grind falling in pitch (the slam is its impact).
      this.noiseHit(t, 0.8, 'bandpass', 900, 2.5, 0.16, this.sfxBus, 280, 0.15);
      this.synth(t, 70, 0.8, 0.05, 500, this.sfxBus, { attack: 0.1, type: 'square', toCutoff: 180 });
      this.noiseHit(t, 0.04, 'bandpass', 2400, 1, 0.12);
    } else if (kind === 'chasm') {
      // The causeway cracks under the feet, then the slabs go: a long collapsing roar.
      this.noiseHit(t, 0.05, 'highpass', 1800, 0.7, 0.35);
      this.noiseHit(t + 0.02, 0.25, 'bandpass', 700, 1.5, 0.25, this.sfxBus, 300);
      this.noiseHit(t + 0.05, 2.6, 'lowpass', 1400, 0.6, 0.4, this.sfxBus, 80, 0.2);
      for (let i = 0; i < 14; i++) this.noiseHit(t + 0.1 + Math.random() * 1.6, 0.06, 'bandpass', 600 + Math.random() * 2600, 2, 0.05);
    } else {
      // Rockfall: the cliff lets go overhead — a rising roar from above before the hits land.
      this.noiseHit(t, 1.2, 'lowpass', 300, 0.8, 0.35, this.sfxBus, 1600, 0.6);
      this.noiseHit(t + 0.02, 0.05, 'bandpass', 1600, 1, 0.18);
      for (let i = 0; i < 10; i++) this.noiseHit(t + 0.2 + Math.random() * 1.2, 0.05, 'bandpass', 1400 + Math.random() * 2600, 2.5, 0.045);
    }
  }

  escape(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.grade;
    // The riser resolves instead of cutting; the score gives way to a warm major lift.
    this.settleCues(t, 0.25);
    this.score.gain.cancelScheduledValues(t);
    this.score.gain.setValueAtTime(this.score.gain.value, t);
    this.score.gain.setTargetAtTime(0, t, 0.25);
    this.breath?.gain.gain.setTargetAtTime(0, t, 0.2);
    if (this.themeOn && this.sp?.has('coins')) {
      // The theme's fanfare (sized by the cash-out tier) over gold, a sparkle and the runner's breath.
      this.theme!.escape(g);
      this.sample('coins', { strength: 0.75 + 0.05 * g, when: t + 0.02 });
      this.sample('sparkle', { strength: 0.6 + 0.07 * g, when: t + 0.12 });
      this.sample('pant', { strength: 0.8, when: t + 0.9 });
      return;
    }
    if (this.sp?.has('coins') && this.sp.has('swell')) {
      // The way out, sized by the cash-out multiplier only (never by where the fall would have been).
      // Every escape: a warm swell, gold, a sparkle, and the runner catching their breath. From 2× a
      // taiko answers; from 5× the boom; from 10× a taiko call and a second sparkle; from 25× a bright
      // gong over it all.
      this.scorePlayer?.silence(t, 0.3);
      if (this.scorePlayer) this.scorePlayer.mode = 'off';
      this.drone?.gain.gain.setTargetAtTime(0.25, t, 0.8);
      this.sample('swell', { strength: 0.75 + 0.06 * g });
      this.sample('coins', { strength: 0.8 + 0.05 * g, when: t + 0.02 });
      this.sample('sparkle', { strength: 0.7 + 0.07 * g, when: t + 0.12 });
      this.sample('pant', { strength: 0.8, when: t + 0.9 });
      // Every escape lands on a struck taiko with the gold (louder from 2×), so the moment reads over the beds.
      this.sample('m_taiko', { strength: g >= 1 ? 0.9 : 0.7, dest: this.sting, when: t + 0.02, priority: 3 });
      if (g >= 2) this.sample('m_boom', { strength: 0.5 + 0.08 * g, when: t });
      if (g >= 3) {
        for (const [i, dt] of [0.24, 0.36, 0.48].entries()) this.sample('m_taiko_hi', { strength: 0.6 + i * 0.15, dest: this.sting, when: t + dt });
        this.sample('m_taiko', { strength: 1, dest: this.sting, when: t + 0.62 });
        this.sample('sparkle', { strength: 0.7, rate: 1.26, when: t + 0.66 });
        this.sample('coins', { strength: 0.6, when: t + 0.7 });
      }
      if (g >= 4) this.sample('m_gong', { strength: 0.6, rate: 1.5, when: t + 0.62, maxDur: 3.5 });
      return;
    }
    // D major (the Picardy third after all that minor). A small escape is a warm
    // chord and two bells; from 5× it blooms; from 10× drums; from 25× a full cascade.
    const len = 2.2 + g * 0.5;
    const chord = g === 0 ? [0, 4, 7] : g === 1 ? [-12, 0, 4, 7] : [-12, 0, 4, 7, 12];
    for (const s of chord) this.synth(t + 0.02, hz(s), len, 0.028 + g * 0.004, 1400 + g * 250, this.music, { attack: 0.3, release: len * 0.7, toCutoff: 900, detune: 7, type: 'triangle' });
    if (g >= 1) this.tone(t, hz(-24), len, 0.14 + g * 0.03, 'sine', this.music, undefined, 0.04);
    const bells = [12, 19, 24, 28, 31, 36, 40, 43].slice(0, 2 + g + (g >= 3 ? 1 : 0) + (g >= 4 ? 1 : 0));
    for (const [i, s] of bells.entries()) this.bell(t + 0.06 + i * 0.085, hz(s + 12), Math.max(0.014, 0.032 - i * 0.0025), 1.8 + g * 0.3);
    this.noiseHit(t, 1.2 + g * 0.2, 'highpass', 6000, 0.5, 0.018 + g * 0.004, this.sfxBus, undefined, 0.2);
    this.noiseHit(t, 0.5, 'bandpass', 800, 0.9, 0.04 + g * 0.006, this.sfxBus, 3000, 0.08);
    if (g >= 3) {
      this.drum(t, 0.3, 48, this.music);
      this.drum(t + 0.22, 0.22, 64, this.music);
    }
    if (g >= 4) {
      // A long way out: a second, higher chord blooms under the bells.
      for (const s of [16, 19, 24]) this.synth(t + 0.5, hz(s), len, 0.016, 2200, this.music, { attack: 0.6, release: len * 0.6, detune: 6 });
      this.drum(t + 0.44, 0.26, 56, this.music);
    }
  }

  /** The recorded interface: small stone and wood sounds, close and dry. False = not loaded yet. */
  private uiSample(s: UiSound, t: number): boolean {
    if (!this.sp?.has('ui_tap') || !this.sp.has('ui_tick')) return false;
    switch (s) {
      case 'hover':
        if (t - this.lastHover < 0.09) return true;
        this.lastHover = t;
        return this.sample('ui_tick', { strength: 0.25, rate: 1.25 });
      case 'tick':
        return this.sample('ui_tick', { strength: 0.8 });
      case 'press':
        return this.sample('ui_tap', { strength: 0.8 });
      case 'toggle':
        return this.sample('ui_toggle', { strength: 0.85 }) || this.sample('ui_tick', { strength: 1 });
      case 'open':
        return this.sample('ui_slide', { strength: 0.8, rate: 1.06 }) || this.sample('ui_tap', { strength: 0.6 });
      case 'close':
        return this.sample('ui_slide', { strength: 0.65, rate: 0.9, maxDur: 0.35 }) || this.sample('ui_tap', { strength: 0.5 });
      case 'confirm':
        this.sample('ui_tap', { strength: 1, rate: 0.9 });
        this.sample('sparkle', { strength: 0.35, when: t + 0.03 });
        return true;
      case 'bet':
        // A token set on stone: a low knock and a couple of coins settling.
        this.sample('ui_tap', { strength: 1, rate: 0.75 });
        this.sample('coins', { strength: 0.3, when: t + 0.02, maxDur: 0.5 });
        return true;
      case 'cashout':
        // Immediate and bright: the press is answered before the server replies.
        this.sample('coins', { strength: 1 });
        this.sample('sparkle', { strength: 0.55, when: t + 0.025 });
        return true;
      case 'stamp':
        this.sample('impact', { strength: 0.45, rate: 1.1, priority: 2 });
        return true;
      case 'deny':
        this.sample('ui_tap', { strength: 0.7, rate: 0.7 });
        this.sample('ui_tap', { strength: 0.55, rate: 0.66, when: t + 0.11 });
        return true;
    }
    return false;
  }

  ui(s: UiSound): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.uiSample(s, t)) return;
    switch (s) {
      case 'toggle':
      case 'hover':
        if (t - this.lastHover < 0.07) return;
        this.lastHover = t;
        this.noiseHit(t, 0.018, 'bandpass', 3400, 3, 0.02);
        break;
      case 'tick':
        this.tone(t, 1800, 0.035, 0.028, 'triangle');
        this.noiseHit(t, 0.012, 'bandpass', 5000, 2, 0.02);
        break;
      case 'press':
        this.tone(t, 420, 0.06, 0.05, 'sine', this.sfxBus, 260);
        this.noiseHit(t, 0.02, 'bandpass', 2500, 1.5, 0.03);
        break;
      case 'open':
        this.tone(t, 587, 0.14, 0.028, 'sine', this.sfxBus, 880, 0.01);
        this.noiseHit(t, 0.18, 'bandpass', 1400, 1, 0.012, this.sfxBus, 3200, 0.05);
        break;
      case 'close':
        this.tone(t, 880, 0.12, 0.022, 'sine', this.sfxBus, 520, 0.008);
        break;
      case 'confirm':
        this.bell(t, hz(19), 0.035, 0.9, this.sfxBus);
        this.bell(t + 0.07, hz(26), 0.028, 1.0, this.sfxBus);
        break;
      case 'bet':
        // A token set on stone: a low knock, a dry click, and a quiet low bell.
        this.tone(t, 190, 0.2, 0.14, 'sine', this.sfxBus, 85, 0.002);
        this.noiseHit(t, 0.05, 'bandpass', 1700, 1.3, 0.08);
        this.bell(t + 0.02, hz(12), 0.03, 1.2, this.sfxBus);
        break;
      case 'cashout':
        // Bright and immediate: the press itself must feel answered before the server replies.
        this.bell(t, hz(31), 0.045, 1.0, this.sfxBus);
        this.bell(t + 0.045, hz(36), 0.035, 1.1, this.sfxBus);
        this.noiseHit(t, 0.35, 'bandpass', 900, 1, 0.05, this.sfxBus, 4200, 0.03);
        break;
      case 'stamp':
        this.tone(t, 140, 0.25, 0.14, 'sine', this.sfxBus, 70, 0.002);
        this.noiseHit(t, 0.06, 'lowpass', 1600, 0.8, 0.1);
        break;
      case 'deny':
        this.tone(t, 196, 0.16, 0.05, 'triangle', this.sfxBus, 165);
        this.tone(t + 0.09, 185, 0.16, 0.04, 'triangle', this.sfxBus, 155);
        break;
    }
  }

  setScene(s: Scene): void {
    const prev = this.scene;
    this.scene = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const pad = s === 'run' ? 0.42 : s === 'lead' ? 0.3 : s === 'fallen' ? 0 : s === 'escaped' ? 0.12 : 0.16;
    this.padGain.gain.setTargetAtTime(pad, t, s === 'fallen' ? 0.06 : 0.6);
    this.waterGain.gain.setTargetAtTime(s === 'run' ? 0.03 : 0.06, t, 1);
    if (s === 'lead' || s === 'run' || s === 'setup' || s === 'title') {
      // Bring the score back (it is cut at the fall / cash-out).
      this.score.gain.cancelScheduledValues(t);
      this.score.gain.setValueAtTime(Math.max(0.0001, this.score.gain.value), t);
      this.score.gain.setTargetAtTime(1, t, 0.15);
    }
    if (s === 'lead' && prev !== 'lead') {
      this.cue.gain.cancelScheduledValues(t);
      this.cue.gain.setTargetAtTime(1, t, 0.05);
      this.mult = 100;
      this.beat = 0;
      this.nextBeat = t + 0.02;
      this.setChord(CALM[0]!, t, 0.3);
    }
    if (s === 'run' && prev !== 'run') {
      // Go: a big low drum and a lift of air on the downbeat; the groove starts from bar one.
      this.beat = 0;
      this.nextBeat = t + 0.01;
      if (!this.sampledScore) this.drum(t, 0.4, 52, this.score);
      if (!this.sampledScore) this.noiseHit(t, 0.6, 'bandpass', 500, 0.9, 0.06, this.score, 3500, 0.02);
    }
    if (s === 'escaped') this.score.gain.setTargetAtTime(0.8, t + 2.8, 1.2);
    if (s === 'setup' || s === 'title') this.setChord(CALM[0]!, t, 1.5);
    this.sampledScene(s, prev, t);
  }

  /** The recorded side of a scene change: score mode, drone level, beds, a clean slate for a new run. */
  private sampledScene(s: Scene, prev: Scene, t: number) {
    this.mixBeds(s === 'run' ? 1.2 : 2.5);
    if (s !== 'run') this.breath?.gain.gain.setTargetAtTime(0, t, 0.3);
    if (s === 'lead' && prev !== 'lead') {
      // A new run (maybe straight after a result): the last stinger gets out of the way.
      this.sting.gain.cancelScheduledValues(t);
      this.sting.gain.setValueAtTime(this.sting.gain.value, t);
      this.sting.gain.setTargetAtTime(0, t, 0.08);
      this.sting.gain.setTargetAtTime(1, t + 0.5, 0.05);
      this.duck.gain.cancelScheduledValues(t);
      this.duck.gain.setTargetAtTime(1, t, 0.05);
    }
    if (this.themeOn && this.theme) {
      const th = this.theme;
      if (s === 'lead' && prev !== 'lead') th.lead();
      else if (s === 'run' && prev !== 'run') {
        th.startRun(t + 0.01);
        this.sample('m_taiko', { strength: 0.9, dest: this.sting });
      } else if (s === 'title' || s === 'setup') th.rest();
      else if (s === 'escaped') th.escape(this.grade);
      else if (s === 'fallen') th.fall();
      return;
    }
    const sc = this.scorePlayer;
    if (!sc || !this.sampledScore) return;
    if (s === 'lead' && prev !== 'lead') {
      sc.mode = 'lead';
      sc.setTier(0);
      sc.restart(t + 0.02);
    } else if (s === 'run' && prev !== 'run') {
      // Go: the groove starts from bar one, on a struck taiko.
      sc.mode = 'run';
      sc.setTier(0);
      sc.restart(t + 0.01);
      this.sample('m_taiko', { strength: 1, dest: this.sting });
    } else if (s === 'title' || s === 'setup') {
      if (sc.mode !== 'idle') sc.restart(t + 0.3);
      sc.mode = 'idle';
    } else if (s === 'escaped') {
      // The stinger has the floor; the idle groove returns under the jungle a few seconds later.
      setTimeout(() => {
        if (this.scene === 'escaped' && this.scorePlayer && this.scorePlayer.mode === 'off') {
          this.scorePlayer.mode = 'idle';
          this.scorePlayer.restart(this.ctx!.currentTime + 0.05);
        }
      }, 4000);
    }
    if (this.drone) {
      const d = s === 'run' ? 0.8 : s === 'lead' ? 0.6 : s === 'fallen' ? 0 : s === 'escaped' ? 0.2 : 0.3;
      if (s !== 'fallen') {
        this.drone.src.playbackRate.setTargetAtTime(1, t, 0.4);
        this.drone.gain.gain.setTargetAtTime(d, t, s === 'run' ? 0.5 : 1.5);
      }
    }
  }

  private setChord(c: number[], at: number, glide: number) {
    this.chord = c;
    this.voiceChord(c, at, glide);
  }

  // ------------------------------------------------------------------ score
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // After a stall (tab throttled), skip ahead instead of firing a burst of old notes.
    if (this.nextBeat < ctx.currentTime - 0.05) this.nextBeat = ctx.currentTime + 0.02;
    const ahead = ctx.currentTime + 0.12;
    if (this.themeOn) {
      this.theme!.update();
      return;
    }
    if (this.sampledScore) {
      this.scorePlayer!.schedule(ahead);
      return;
    }
    const I = this.intensity;
    const bpm = 96 + 40 * I;
    const step = 60 / bpm / 4; // sixteenths
    while (this.nextBeat < ahead) {
      const at = this.nextBeat;
      const b = this.beat % 16;
      const bar = Math.floor(this.beat / 16);
      if (this.scene === 'run' || this.scene === 'lead') this.musicStep(at, b, bar, I, step);
      else if (this.scene === 'setup' || this.scene === 'title' || this.scene === 'escaped') this.ambientStep(at, b, bar);
      this.nextBeat += step;
      this.beat++;
    }
  }

  /** Between runs: patient, spacious — a low drum now and then, a held chord that drifts. */
  private ambientStep(at: number, b: number, bar: number) {
    if (b !== 0) return;
    if (bar % 4 === 0) {
      this.drum(at, 0.09, 64, this.score);
      const c = CALM[(bar / 4) % CALM.length]!;
      this.setChord(c, at, 1.8);
      if (this.scene !== 'escaped') for (const s of c) this.synth(at, hz(s + 12), 5.5, 0.012, 1100, this.score, { attack: 1.6, release: 3, type: 'triangle', detune: 5 });
    }
    if (bar % 4 === 2 && Math.random() < 0.6) this.bell(at, hz(this.chord[Math.floor(Math.random() * 3)]! + 24), 0.012, 2.4, this.score);
  }

  /** A frame drum / taiko: pitch-dropping body plus a soft skin slap. */
  private drum(at: number, gain: number, freq: number, dest: AudioNode = this.score) {
    this.tone(at, freq * 2.2, 0.4, gain, 'sine', dest, freq, 0.002);
    this.noiseHit(at, 0.05, 'lowpass', 1200, 0.5, gain * 0.3, dest);
  }

  private musicStep(at: number, b: number, bar: number, I: number, step: number) {
    const out = this.score;
    if (this.scene === 'lead') {
      // Coiled: a heartbeat, nothing else.
      if (b === 0) this.drum(at, 0.26, 54, out);
      if (b === 3) this.drum(at, 0.16, 54, out);
      return;
    }
    // Layers enter by the tier of the multiplier on screen (the same boundaries the
    // world uses): <2x pulse and pluck; 2-5x bass and shaker; 5-10x strings, taiko,
    // darker harmony; 10-25x octave bass, second string line; 25x+ everything, faster changes.
    const T = tierOf(this.mult);
    const hr = T >= 4 ? 1 : 2;
    if (b === 0 && bar % hr === 0) {
      const prog = T >= 2 ? DRIVEN : CALM;
      this.setChord(prog[Math.floor(bar / hr) % prog.length]!, at, 0.12);
      if (T >= 2) {
        // Strings: a held line on the chord's fifth (and third), two octaves up, swelling.
        const len = step * 16 * hr;
        const g = 0.012 + 0.02 * I;
        this.synth(at, hz(this.chord[2]! + 24), len, g, 2200, out, { attack: len * 0.5, release: len * 0.4, detune: 6 });
        if (T >= 3) this.synth(at, hz(this.chord[1]! + 24), len, g * 0.7, 2000, out, { attack: len * 0.6, release: len * 0.35, detune: 5 });
      }
    }
    const phraseEnd = bar % 4 === 3;
    // Drums: heartbeat kick, busier with each tier.
    const kick = b === 0 || b === 8 || (T >= 1 && b === 10) || (T >= 3 && (b === 3 || b === 14)) || (T >= 4 && b === 6);
    if (kick) this.drum(at, 0.24 + I * 0.1, 50, out);
    // Backbeat: a rim/clap, with a taiko under it from 5x.
    if (b === 4 || b === 12) {
      this.noiseHit(at, 0.08, 'bandpass', 1900, 1.2, 0.07 + I * 0.05, out);
      this.tone(at, 210, 0.08, 0.05 + I * 0.03, 'triangle', out, 150, 0.002);
      if (T >= 2) this.drum(at, 0.12 + I * 0.08, 92, out);
    }
    // Shaker: sixteenths with accents.
    if (T >= 1) {
      const acc = b % 4 === 2 ? 1 : b % 2 === 0 ? 0.6 : 0.35;
      this.noiseHit(at, 0.035, 'highpass', 6500, 0.7, (0.012 + I * 0.022) * acc, out);
    }
    // Taiko fill closing each phrase.
    if (T >= 2 && phraseEnd && b >= 12) this.drum(at, 0.14 + I * 0.1, 110 - (b - 12) * 12, out);
    // Bass: eighths on the root, octave jumps on the offbeat from 10x.
    if (T >= 1 && b % 2 === 0) {
      const r = this.chord[0]! - 24 + (T >= 3 && b % 4 === 2 ? 12 : 0);
      this.synth(at, hz(r), step * 1.8, 0.07 + I * 0.03, 260 + I * 500, out, { attack: 0.005, release: step, toCutoff: 140 });
    }
    // Ostinato: a marimba-like arpeggio over the chord, doubling in rate and climbing in register.
    const every = T >= 2 ? 1 : 2;
    if (b % every === 0) {
      const c = this.chord;
      const tones = [c[0]!, c[1]!, c[2]!, c[0]! + 12, c[1]! + 12];
      const n = tones[ARP[(this.beat / every) % ARP.length | 0]!]! + (T >= 3 ? 24 : 12);
      const g = (0.035 + I * 0.02) * (b % 4 === 0 ? 1 : 0.7);
      this.tone(at, hz(n), 0.28, g, 'sine', out, undefined, 0.002);
      this.tone(at, hz(n) * 4, 0.06, g * 0.3, 'sine', out, undefined, 0.001);
    }
  }
}
