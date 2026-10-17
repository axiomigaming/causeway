// Audio sourcing, step 2 of 2: picks → trimmed, faded, loudness-normalised, encoded game audio.
//
//   node tools/fetch-audio.mjs picks      (once: the source files, into .cache/audio/picks)
//   node tools/build-audio.mjs            → public/audio/*.webm, *.m4a, manifest.json, CREDITS.txt
//
// Requires ffmpeg (with libopus and the native AAC encoder) on PATH.
//
// Every sound in tools/audio-sources.json `sounds` is one file: its variants are trimmed out of the
// sources, faded, high/low-passed, normalised and laid end to end with silence between them; the
// manifest records each variant's [start, duration, peak] so the game plays them as slices of one
// buffer (samples.ts snaps each slice onto its onset after decoding, which absorbs codec delay).
// Loops are made seamless by crossfading their tail into their head.
//
// Loudness (ITU-R BS.1770 K-weighting, computed here): one-shots are normalised on their loudest
// 400 ms (momentary max) to `lufs` (default -16 LUFS); beds and drones on gated integrated loudness.
// A ceiling of -1 dBFS sample peak always wins. The mix itself (relative levels) lives in
// src/audio/catalog.ts.
//
// Two encodings per sound: Opus in WebM (Chrome, Firefox, Edge, Safari 17+ desktop) and AAC-LC in MP4
// (.m4a) for iOS Safari, which the runtime falls back to when WebM Opus is not playable or fails to
// decode. Budgets (Opus bytes): core ≤ 1.5 MB (first load), beds + music ≤ 2.5 MB (after the first
// gesture). The build fails if a budget is exceeded.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickRecords } from './fetch-audio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio');
const SR = 48000;
const CEIL = Math.pow(10, -1 / 20);
const BUDGET = { core: 1.5e6, lazy: 2.5e6 };

const cfg = JSON.parse(readFileSync(join(ROOT, 'tools', 'audio-sources.json'), 'utf8'));
const picks = pickRecords();

function ffmpeg(args, input) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** Decode a trim of a source to interleaved float32 at 48 kHz, `ch` channels, through `af` filters. */
function decode(file, start, end, ch, af) {
  const args = ['-ss', String(start), '-to', String(end), '-i', file, '-vn', '-ac', String(ch), '-ar', String(SR)];
  if (af.length) args.push('-af', af.join(','));
  const buf = ffmpeg([...args, '-f', 'f32le', '-acodec', 'pcm_f32le', '-']);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}

// ------------------------------------------------------------------ loudness (BS.1770 at 48 kHz)
function kweight(x, ch) {
  const out = new Float32Array(x.length);
  const b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], a1 = [-1.69065929318241, 0.73248077421585];
  const b2 = [1.0, -2.0, 1.0], a2 = [-1.99004745483398, 0.99007225036621];
  for (let c = 0; c < ch; c++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
    for (let i = c; i < x.length; i += ch) {
      const v = x[i];
      const y = b1[0] * v + b1[1] * x1 + b1[2] * x2 - a1[0] * y1 - a1[1] * y2;
      x2 = x1; x1 = v; y2 = y1; y1 = y;
      const z = b2[0] * y + b2[1] * u1 + b2[2] * u2 - a2[0] * z1 - a2[1] * z2;
      u2 = u1; u1 = y; z2 = z1; z1 = z;
      out[i] = z;
    }
  }
  return out;
}

/** Mean-square power of 400 ms blocks (hop 100 ms), summed over channels. */
function blocks(x, ch) {
  const k = kweight(x, ch);
  const frames = k.length / ch;
  const w = Math.round(0.4 * SR), h = Math.round(0.1 * SR);
  const out = [];
  for (let s = 0; s + w <= Math.max(frames, w); s += h) {
    let sum = 0;
    for (let i = s; i < Math.min(frames, s + w); i++) for (let c = 0; c < ch; c++) sum += k[i * ch + c] ** 2;
    out.push(sum / w);
    if (s + w >= frames) break;
  }
  return out;
}
const lufsOf = (p) => -0.691 + 10 * Math.log10(Math.max(p, 1e-12));

function momentaryMax(x, ch) {
  return lufsOf(Math.max(...blocks(x, ch)));
}

function integrated(x, ch) {
  const b = blocks(x, ch).filter((p) => lufsOf(p) > -70);
  if (!b.length) return -70;
  const rel = lufsOf(b.reduce((a, p) => a + p, 0) / b.length) - 10;
  const g = b.filter((p) => lufsOf(p) > rel);
  return lufsOf(g.reduce((a, p) => a + p, 0) / g.length);
}

const peakOf = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// ------------------------------------------------------------------ shaping
function fade(x, ch, fin, fout) {
  const n = x.length / ch;
  const a = Math.min(n, Math.round(fin * SR)), b = Math.min(n, Math.round(fout * SR));
  for (let i = 0; i < a; i++) for (let c = 0; c < ch; c++) x[i * ch + c] *= Math.sin((i / a) * Math.PI / 2) ** 2;
  for (let i = 0; i < b; i++) for (let c = 0; c < ch; c++) x[(n - 1 - i) * ch + c] *= Math.sin((i / b) * Math.PI / 2) ** 2;
}

/** Seamless loop: the last `xf` seconds crossfade (equal power) into the first; length shrinks by xf. */
function loopify(x, ch, xf) {
  const n = x.length / ch;
  const m = Math.round(xf * SR);
  const out = new Float32Array((n - m) * ch);
  out.set(x.subarray(0, (n - m) * ch));
  for (let i = 0; i < m; i++) {
    const t = i / m;
    const gi = Math.sin((t * Math.PI) / 2), go = Math.cos((t * Math.PI) / 2);
    for (let c = 0; c < ch; c++) out[i * ch + c] = x[i * ch + c] * gi + x[(n - m + i) * ch + c] * go;
  }
  return out;
}

function wav(x, ch) {
  const n = x.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * ch * 2, 28); b.writeUInt16LE(ch * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
}

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

// ------------------------------------------------------------------ build
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), `causeway-audio-${process.pid}`);
mkdirSync(tmp, { recursive: true });
const manifest = { version: 1, generated: 'tools/build-audio.mjs', sounds: {} };
const report = [];
const GAP = 0.25;

for (const [name, s] of Object.entries(cfg.sounds)) {
  const ch = s.channels ?? 1;
  const af = [];
  if (s.hp) af.push(`highpass=f=${s.hp}`);
  if (s.lp) af.push(`lowpass=f=${s.lp}`);
  // Phone speakers and small earbuds turn 6-10 kHz fizz into harshness: a gentle shelf tames it.
  af.push(`treble=g=${s.treble ?? -2}:f=7000:t=s:w=0.7`);
  if (s.pitch) af.push(`asetrate=${Math.round(SR * Math.pow(2, s.pitch / 12))},aresample=${SR}`);
  const parts = [];
  for (const v of s.variants) {
    const p = picks.get(v.src);
    if (!p) throw new Error(`${name}: source ${v.src} is not in sources`);
    if (!existsSync(p.file)) throw new Error(`${name}: ${p.file} missing (run: node tools/fetch-audio.mjs picks)`);
    let x = decode(p.file, v.start, v.end, ch, af);
    if (v.gain) for (let i = 0; i < x.length; i++) x[i] *= Math.pow(10, v.gain / 20);
    if (s.loop) x = loopify(x, ch, s.xfade ?? 1.5);
    else fade(x, ch, v.fadeIn ?? 0.002, v.fadeOut ?? s.fadeOut ?? 0.04);
    if (v.reverse) {
      const n = x.length / ch;
      const r = new Float32Array(x.length);
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) r[i * ch + c] = x[(n - 1 - i) * ch + c];
      x = r;
    }
    // Normalise each variant on its own, so a variant chosen at random is never a surprise in level.
    const target = s.lufs ?? (s.loop ? -24 : -16);
    const now = s.loop || s.integrated ? integrated(x, ch) : momentaryMax(x, ch);
    let g = Math.pow(10, (target - now) / 20);
    const pk = peakOf(x) * g;
    if (pk > CEIL) g *= CEIL / pk;
    for (let i = 0; i < x.length; i++) x[i] *= g;
    parts.push({ x, lufs: s.loop || s.integrated ? integrated(x, ch) : momentaryMax(x, ch), peak: peakOf(x) });
  }
  // Lay variants end to end with silence between (a loop is one variant with no padding).
  const pad = s.loop ? 0 : Math.round(GAP * SR);
  const total = parts.reduce((a, p) => a + p.x.length / ch + pad, pad);
  const all = new Float32Array(total * ch);
  const slices = [];
  let at = pad;
  for (const p of parts) {
    all.set(p.x, at * ch);
    slices.push([+(at / SR).toFixed(4), +(p.x.length / ch / SR).toFixed(4), +p.peak.toFixed(4)]);
    at += p.x.length / ch + pad;
  }
  const src = join(tmp, `${name}.wav`);
  writeFileSync(src, wav(all, ch));
  const kb = s.kbps ?? (ch === 2 ? 64 : 48);
  const files = {};
  for (const [fmt, args] of [
    ['webm', ['-c:a', 'libopus', '-b:a', `${kb}k`, '-vbr', 'on', '-application', 'audio', '-frame_duration', '20']],
    ['m4a', ['-c:a', 'aac', '-b:a', `${Math.round(kb * 1.5)}k`, '-movflags', '+faststart']],
  ]) {
    const file = `${name}.${fmt}`;
    ffmpeg(['-y', '-i', src, ...args, '-map_metadata', '-1', join(OUT, file)]);
    const buf = readFileSync(join(OUT, file));
    files[fmt] = { file, bytes: buf.length, hash: hash(buf) };
  }
  manifest.sounds[name] = { group: s.group, channels: ch, slices, ...(s.loop ? { loop: true } : {}), webm: files.webm, m4a: files.m4a };
  report.push({ name, group: s.group, n: parts.length, dur: total / SR, lufs: Math.max(...parts.map((p) => p.lufs)), peak: Math.max(...parts.map((p) => p.peak)), webm: files.webm.bytes, m4a: files.m4a.bytes });
}
rmSync(tmp, { recursive: true, force: true });

// Stale outputs of sounds no longer listed.
const keep = new Set(Object.values(manifest.sounds).flatMap((s) => [s.webm.file, s.m4a.file]));
for (const f of readdirSync(OUT)) if (/\.(webm|m4a)$/.test(f) && !keep.has(f)) rmSync(join(OUT, f));

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');

// Credits: the `attribution` line of every source actually used, verbatim from the Openverse record.
const used = new Set(Object.values(cfg.sounds).flatMap((s) => s.variants.map((v) => v.src)));
const lines = [
  'CAUSEWAY: recorded sound credits',
  '',
  'Every recorded sound in this folder is cut from the recordings below (found through Openverse,',
  'https://openverse.org; hosted on Freesound or Jamendo). Each line is the attribution Openverse gives',
  'for the recording, copied verbatim, followed by its page. Files were trimmed, faded, filtered,',
  'loudness-normalised, looped and re-encoded; several sounds combine takes from more than one recording.',
  'See tools/audio-sources.json for which file each sound comes from.',
  '',
];
for (const p of [...picks.values()].filter((x) => used.has(x.id)).sort((a, b) => a.record.title.localeCompare(b.record.title))) {
  lines.push(p.record.attribution, `  ${p.record.foreign_landing_url}`, '');
}
writeFileSync(join(OUT, 'CREDITS.txt'), lines.join('\n'));

// THIRD_PARTY_NOTICES.md: a generated section listing every shipped file and the recordings in it.
const LICENCE = { cc0: 'CC0 1.0 (public domain dedication)', pdm: 'Public Domain Mark', by: 'CC BY' };
const byId = new Map([...picks.values()].map((p) => [p.id, p]));
const rows = [];
for (const [name, s] of Object.entries(cfg.sounds)) {
  const srcs = [...new Set(s.variants.map((v) => v.src))].map((id) => byId.get(id).record);
  const files = `\`${manifest.sounds[name].webm.file}\`, \`${manifest.sounds[name].m4a.file}\``;
  const cell = (f) => srcs.map(f).join('<br>');
  rows.push(`| ${files} | ${cell((r) => r.title.replace(/\|/g, '/'))} | ${cell((r) => r.creator)} | ${cell((r) => `${LICENCE[r.license] ?? r.license}${r.license === 'by' ? ` ${r.license_version}` : ''}`)} | ${cell((r) => r.foreign_landing_url)} |`);
}
const section = [
  '<!-- audio:start (generated by tools/build-audio.mjs; edit tools/audio-sources.json instead) -->',
  '## Recorded audio',
  '',
  'Every file in `public/audio` is cut from the recordings below, found through Openverse and hosted on',
  'Freesound or Jamendo, licensed CC0, Public Domain Mark or CC BY. The files were trimmed, faded,',
  'filtered, loudness-normalised, looped and re-encoded. The verbatim attribution for each recording is',
  'in `public/audio/CREDITS.txt`, which ships with the game.',
  '',
  '| File | Title | Creator | Licence | Source |',
  '| --- | --- | --- | --- | --- |',
  ...rows,
  '<!-- audio:end -->',
].join('\n');
const noticesPath = join(ROOT, 'THIRD_PARTY_NOTICES.md');
let notices = readFileSync(noticesPath, 'utf8');
notices = /<!-- audio:start[\s\S]*?<!-- audio:end -->/.test(notices) ? notices.replace(/<!-- audio:start[\s\S]*?<!-- audio:end -->/, section) : `${notices.trimEnd()}\n\n${section}\n`;
writeFileSync(noticesPath, notices);

// Budget.
const sum = (g, f) => report.filter((r) => g(r.group)).reduce((a, r) => a + r[f], 0);
const core = sum((g) => g === 'core', 'webm'), lazy = sum((g) => g !== 'core', 'webm');
for (const r of report) console.log(`${r.name.padEnd(14)} ${r.group.padEnd(6)} ${String(r.n).padStart(2)}× ${r.dur.toFixed(1).padStart(6)} s  ${r.lufs.toFixed(1).padStart(6)} LUFS  pk ${(20 * Math.log10(r.peak)).toFixed(1).padStart(5)} dBFS  ${(r.webm / 1024).toFixed(0).padStart(5)} KB opus  ${(r.m4a / 1024).toFixed(0).padStart(5)} KB aac`);
console.log(`core ${(core / 1024).toFixed(0)} KB (budget ${BUDGET.core / 1e3} KB), beds+music ${(lazy / 1024).toFixed(0)} KB (budget ${BUDGET.lazy / 1e3} KB); aac core ${(sum((g) => g === 'core', 'm4a') / 1024).toFixed(0)} KB, lazy ${(sum((g) => g !== 'core', 'm4a') / 1024).toFixed(0)} KB`);
if (core > BUDGET.core || lazy > BUDGET.lazy) {
  console.error('audio budget exceeded');
  process.exit(1);
}
void statSync;
