// Fetch the CC0 Poly Haven scans the kit bake samples (2K PNG maps) into blender/cache/polyhaven/.
//   node tools/fetch-polyhaven.mjs
// They are bake inputs only: the game ships the baked atlases, never these files. Credits and
// licences are in THIRD_PARTY_NOTICES.md. Files that are already there are skipped.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'blender', 'cache', 'polyhaven');
export const SCANS = ['sandstone_cracks', 'rock_face', 'old_planks_02'];
const MAPS = ['diff', 'nor_gl', 'rough', 'ao', 'disp'];

mkdirSync(OUT, { recursive: true });
for (const a of SCANS) {
  for (const m of MAPS) {
    const file = `${a}_${m}_2k.png`;
    const dst = join(OUT, file);
    if (existsSync(dst)) continue;
    const url = `https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/${a}/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log('fetched', file);
  }
}
console.log('polyhaven scans in', OUT);
