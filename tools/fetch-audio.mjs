// Audio sourcing, step 1 of 2: search Openverse once per kind of sound, download candidates, fetch picks.
//
// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node >= 22.21); behind a proxy run with it set.
//
//   node tools/fetch-audio.mjs search            run every query in QUERIES that has no cached result yet
//   node tools/fetch-audio.mjs candidates [N]    download the first N usable results of each query (default 8)
//   node tools/fetch-audio.mjs picks             download every file named in tools/audio-sources.json
//   node tools/fetch-audio.mjs lock              copy each pick's Openverse record into tools/audio-sources.json
//
// Rules (from the project owner):
// - licences cc0, by or pdm only; sources freesound or jamendo only (filtered in the query AND re-checked here);
// - each query is searched ONCE: the raw API response is cached in .cache/audio/search/<key>.json and reused
//   forever (anonymous Openverse use is limited to 200 searches a day). Delete a cache file to search again;
// - downloads are untrusted data: they land in .cache/audio/{candidates,picks}/ and are only ever decoded by
//   ffmpeg (tools/build-audio.mjs), never executed;
// - attribution comes verbatim from the cached API response (`attribution`), never typed by hand.
//
// The picks (which result, which trim) live in tools/audio-sources.json, chosen by listening with earshot
// (`rank` per query, `find` for trims; see review/audio11/REPORT.md). Step 2 is tools/build-audio.mjs.
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = join(ROOT, '.cache', 'audio');
const SEARCH = join(CACHE, 'search');
const CAND = join(CACHE, 'candidates');
const PICKS = join(CACHE, 'picks');
const API = 'https://api.openverse.org/v1/audio/';
export const LICENSES = new Set(['cc0', 'by', 'pdm']);
export const SOURCES = new Set(['freesound', 'jamendo']);

/**
 * One search per kind of sound. `dur` (seconds) drops results that cannot be what we need before download
 * (a 40-minute field recording for a footstep, a 0.2 s blip for an ambience bed).
 */
export const QUERIES = [
  // Footsteps and the body
  { key: 'step_stone', q: 'footsteps stone', dur: [0.2, 60] },
  { key: 'step_wood', q: 'footsteps wood', dur: [0.2, 60] },
  { key: 'step_gravel', q: 'footsteps gravel', dur: [0.2, 60] },
  { key: 'step_wet', q: 'footsteps wet', dur: [0.2, 60] },
  { key: 'breath', q: 'heavy breathing running', dur: [2, 120] },
  // World beds
  { key: 'jungle', q: 'jungle ambience', dur: [20, 900] },
  { key: 'insects', q: 'cicadas', dur: [8, 600] },
  { key: 'waterfall', q: 'waterfall', dur: [15, 900] },
  { key: 'river', q: 'river stream', dur: [15, 900] },
  { key: 'wind', q: 'wind gust', dur: [2, 300] },
  { key: 'whoosh', q: 'whoosh', dur: [0.3, 6] },
  // Danger and the fall
  { key: 'grind', q: 'stone grinding', dur: [0.5, 60] },
  { key: 'rumble', q: 'earthquake rumble', dur: [2, 120] },
  { key: 'rockfall', q: 'rockfall', dur: [1, 90] },
  { key: 'slam', q: 'heavy stone impact', dur: [0.3, 30] },
  { key: 'crumble', q: 'crumbling rubble', dur: [0.5, 60] },
  { key: 'splash', q: 'splash', dur: [0.3, 20] },
  { key: 'debris', q: 'debris falling', dur: [0.5, 60] },
  { key: 'dust', q: 'sand pour', dur: [0.5, 60] },
  // Escape and cash-out
  { key: 'coins', q: 'coins', dur: [0.2, 30] },
  { key: 'sparkle', q: 'chime sparkle', dur: [0.3, 15] },
  { key: 'swell', q: 'cinematic swell', dur: [1, 30] },
  // Interface
  { key: 'ui_stone', q: 'stone tap', dur: [0.05, 20] },
  { key: 'ui_click', q: 'wood click', dur: [0.05, 20] },
  { key: 'ui_slide', q: 'stone slide', dur: [0.2, 20] },
  { key: 'ui_switch', q: 'switch click', dur: [0.05, 20] },
  // Music: stems first (Jamendo), then recorded percussion one-shots for the sequenced score
  { key: 'mus_tribal', q: 'tribal drums', dur: [4, 900] },
  { key: 'taiko', q: 'taiko', dur: [0.2, 60] },
  { key: 'frame_drum', q: 'frame drum', dur: [0.2, 60] },
  { key: 'shaker', q: 'shaker', dur: [0.1, 30] },
  { key: 'djembe', q: 'djembe', dur: [0.1, 60] },
  { key: 'bass_drum', q: 'bass drum boom', dur: [0.3, 20] },
  { key: 'gong', q: 'gong', dur: [1, 40] },
  { key: 'drone', q: 'cello drone', dur: [4, 300] },
  { key: 'ir', q: 'impulse response', dur: [0.3, 15] },
  // Round 13: the storm, and obstacles the runner meets (FX events)
  { key: 'thunder', q: 'thunder', dur: [2, 60] },
  { key: 'wood_crack', q: 'wood crack', dur: [0.2, 20] },
  { key: 'tree_fall', q: 'tree falling', dur: [1, 40] },
  { key: 'stone_split', q: 'rock crack', dur: [0.2, 20] },
  { key: 'slide_scrape', q: 'sliding on gravel', dur: [0.5, 30] },
  { key: 'land_heavy', q: 'body fall', dur: [0.2, 15] },
  // Round 14: a stone slab sliding off and going into the water
  { key: 'slab_sink', q: 'rock splash water', dur: [0.5, 30] },
  // Round 15: world styles get their own beds (the rainforest's rain, a second bird chorus)
  { key: 'rain', q: 'rain on leaves', dur: [15, 600] },
  { key: 'birds', q: 'tropical birds', dur: [15, 600] },
  // Round 16: crash tails and the land sections (jungle floor, forest, dry ravine)
  { key: 'pebbles', q: 'pebbles falling', dur: [0.5, 30] },
  { key: 'bubbles', q: 'underwater bubbles', dur: [1, 60] },
  { key: 'step_dirt', q: 'footsteps dirt', dur: [0.5, 60] },
  { key: 'step_leaves', q: 'footsteps leaves', dur: [0.5, 60] },
  { key: 'twig', q: 'twig snap', dur: [0.1, 15] },
  { key: 'forest', q: 'forest ambience', dur: [20, 900] },
  { key: 'ravine_wind', q: 'canyon wind', dur: [10, 600] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The cached response for a query, or null. */
export function cached(key) {
  const f = join(SEARCH, `${key}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

/** Results that pass the licence/source rules and the duration window. */
export function usable(q, res) {
  return (res?.results ?? []).filter((r) => {
    if (!LICENSES.has(r.license) || !SOURCES.has(r.source)) return false;
    const d = (r.duration ?? 0) / 1000;
    return !q.dur || (d >= q.dur[0] && d <= q.dur[1]);
  });
}

async function search() {
  mkdirSync(SEARCH, { recursive: true });
  let n = 0;
  for (const q of QUERIES) {
    if (cached(q.key)) continue;
    const u = `${API}?q=${encodeURIComponent(q.q)}&license=cc0,by,pdm&source=freesound,jamendo&page_size=20`;
    const r = await fetch(u, { headers: { 'User-Agent': 'causeway-audio-pipeline/1.0' } });
    if (!r.ok) {
      // Nothing is cached for a failed search, so it does not count as this kind's one search; go on.
      console.warn(`${q.key}: HTTP ${r.status} (not cached; retry later)`);
      await sleep(1500);
      continue;
    }
    const j = await r.json();
    writeFileSync(join(SEARCH, `${q.key}.json`), JSON.stringify({ query: q.q, at: new Date().toISOString(), ...j }, null, 1));
    console.log(`${q.key.padEnd(12)} "${q.q}": ${j.result_count} results, ${usable(q, j).length} usable on page 1`);
    n++;
    await sleep(1500);
  }
  console.log(`${n} new searches (the rest were cached)`);
}

async function download(url, to) {
  if (existsSync(to)) return false;
  mkdirSync(dirname(to), { recursive: true });
  const r = await fetch(url, { headers: { 'User-Agent': 'causeway-audio-pipeline/1.0' } });
  if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
  // Written to .part and renamed, so an interrupted run never leaves a truncated file behind.
  await pipeline(Readable.fromWeb(r.body), createWriteStream(`${to}.part`));
  renameSync(`${to}.part`, to);
  return true;
}

const ext = (r) => (r.url.match(/\.(mp3|ogg|wav|flac|m4a)(?:$|\?)/)?.[1] ?? r.filetype ?? 'bin');

/**
 * The first `n` usable results of every query, skipping previews over `maxMb` (a ten-minute field
 * recording is not needed to cut a 20 s bed, and the CDN is slow). Four downloads at a time.
 */
async function candidates(n, maxMb = 2.5) {
  const jobs = [];
  for (const q of QUERIES) {
    const res = cached(q.key);
    if (!res) continue;
    for (const r of usable(q, res).slice(0, n)) {
      if ((r.filesize ?? 0) > maxMb * 1e6) continue;
      jobs.push([r.url, join(CAND, q.key, `${r.id}.${ext(r)}`)]);
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [url, to] = jobs[next++];
      try {
        if (await download(url, to)) await sleep(200);
      } catch (e) {
        console.warn(String(e));
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`${jobs.length} candidates in ${CAND}`);
}

/** The fields of an Openverse record that the credits and notices need (copied, never edited). */
const LOCKED = ['title', 'creator', 'creator_url', 'license', 'license_version', 'license_url', 'source', 'foreign_landing_url', 'url', 'attribution', 'duration', 'filesize'];

const SOURCES_FILE = join(ROOT, 'tools', 'audio-sources.json');

/**
 * Every pick's Openverse record: from the cached search it came from when present, else the copy
 * locked into tools/audio-sources.json (so a fresh clone can rebuild without searching again).
 */
export function pickRecords() {
  const sel = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'));
  const out = new Map();
  for (const s of sel.sources) {
    const q = QUERIES.find((x) => x.key === s.query);
    const r = cached(s.query)?.results?.find((x) => x.id === s.id) ?? s.record;
    if (!q || !r) throw new Error(`source ${s.id} (${s.query}) is not in the cached search or locked`);
    if (!LICENSES.has(r.license) || !SOURCES.has(r.source)) throw new Error(`source ${s.id}: licence ${r.license} / ${r.source} not allowed`);
    out.set(s.id, { ...s, record: r, file: join(PICKS, `${s.id}.${ext(r)}`) });
  }
  return out;
}

/** Copy each pick's record (verbatim fields) from the cached search into tools/audio-sources.json. */
function lock() {
  const sel = JSON.parse(readFileSync(SOURCES_FILE, 'utf8'));
  for (const s of sel.sources) {
    const r = cached(s.query)?.results?.find((x) => x.id === s.id);
    if (!r) throw new Error(`source ${s.id} (${s.query}) is not in the cached search`);
    s.record = Object.fromEntries(LOCKED.map((k) => [k, r[k]]));
  }
  writeFileSync(SOURCES_FILE, JSON.stringify(sel, null, 1) + '\n');
  console.log(`locked ${sel.sources.length} records`);
}

async function picks() {
  for (const p of pickRecords().values()) {
    const cand = join(CAND, p.query, `${p.id}.${ext(p.record)}`);
    if (existsSync(cand) && !existsSync(p.file)) {
      mkdirSync(PICKS, { recursive: true });
      writeFileSync(p.file, readFileSync(cand));
    } else if (await download(p.record.url, p.file)) await sleep(400);
  }
  console.log('picks ready in', PICKS);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  if (cmd === 'search') await search();
  else if (cmd === 'candidates') await candidates(Number(process.argv[3] ?? 8));
  else if (cmd === 'picks') await picks();
  else if (cmd === 'lock') lock();
  else console.log('usage: node tools/fetch-audio.mjs search | candidates [N] | picks | lock');
}
