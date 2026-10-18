// Fetch the CC0 Poly Haven scans the kit bake samples into blender/cache/polyhaven/.
//   NODE_USE_ENV_PROXY=1 node tools/fetch-polyhaven.mjs   (the env flag only behind an HTTPS proxy)
// They are bake inputs only: the game ships the baked atlases, never these files. Credits and
// licences are in THIRD_PARTY_NOTICES.md. Files that are already there are skipped. Everything
// downloaded is treated as data (images, glTF JSON and buffers): nothing in it is ever executed.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'blender', 'cache', 'polyhaven');
/** Surface scans (2K PNG maps), box-projected in materials.py. */
export const SCANS = ['sandstone_cracks', 'rock_face', 'old_planks_02', 'bark_brown_02'];
const MAPS = ['diff', 'nor_gl', 'rough', 'ao', 'disp'];
/** Scanned plants (1K glTF + 2K colour and alpha), rendered into the leaf atlas by foliage.py. */
export const MODELS = ['shrub_04', 'fern_02', 'nettle_plant'];

async function get(url, dst) {
  if (existsSync(dst)) return;
  if (!url.startsWith('https://dl.polyhaven.org/')) throw new Error(`unexpected host: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log('fetched', dst.slice(OUT.length + 1));
}

mkdirSync(OUT, { recursive: true });
for (const a of SCANS) {
  for (const m of MAPS) {
    const file = `${a}_${m}_2k.png`;
    await get(`https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/${a}/${file}`, join(OUT, file));
  }
}
for (const a of MODELS) {
  const dir = join(OUT, 'models', a);
  const res = await fetch(`https://api.polyhaven.com/files/${a}`);
  if (!res.ok) throw new Error(`files/${a}: ${res.status}`);
  const files = await res.json();
  const gltf = files.gltf['1k'].gltf;
  await get(gltf.url, join(dir, `${a}.gltf`));
  for (const [rel, f] of Object.entries(gltf.include)) {
    if (rel.includes('..') || rel.startsWith('/')) throw new Error(`bad path ${rel}`);
    await get(f.url, join(dir, rel));
  }
  await get(files.Diffuse['2k'].png.url, join(dir, `${a}_diff_2k.png`));
  await get(files.Alpha['2k'].png.url, join(dir, `${a}_alpha_2k.png`));
}
console.log('polyhaven scans in', OUT);
