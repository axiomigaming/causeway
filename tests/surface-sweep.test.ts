import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildLayout, SECTION_TYPES, PATH_HALF } from '../src/world/sections';

/**
 * World round 20: nothing loose rests on the water's surface or hangs in the air over it. A loose
 * piece (rubble, drums, moss, bushes, shrubs, bananas, ferns, grass) placed out beyond the causeway's
 * footing must either break the surface from below (seated into the shallows, its base under water)
 * or stand on something solid (a rock, an island, a foundation, a fallen column, steps).
 */
const WL = -2.2;
const LOOSE = /^(rubble_|drum_|moss_|bush_|shrub_mass_|banana_|fern_|grass_)/;
const SOLID = /^(vault|tunnel|corbel|gate|gopura|face_gate|lintel_gate|foundation_|floor|stairs|rock_|planks|steps_water|column_|tower_|facade_|temple_|guardian_|pillar|statue|plinth|jungle_bank|tree_big|palm_|cliff_wall|head_|arch_|wall_|platform|pier|block|stele|ruin|idol|lintel)/;

describe('surface sweep', () => {
  it('no loose piece sits on the water or floats over it', () => {
    const bad: string[] = [];
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (const type of SECTION_TYPES) {
      for (let v = 0; v < 6; v++) {
        for (const d of [1, 0.4]) {
          const L = buildLayout(type, `${type}#${v}`, { foliage: d, scenery: d }, undefined, v / 5);
          if (L.ground) continue; // (land: everything stands on the ground mesh)
          const solids = [...L.props.filter((pl) => SOLID.test(pl.piece)), ...L.tiles];
          for (const pl of L.props) {
            if (!LOOSE.test(pl.piece)) continue;
            p.setFromMatrixPosition(pl.m);
            if (Math.abs(p.x) < PATH_HALF + 0.95) continue; // on the causeway or its footing
            // Seated into the shallows (base well under the surface) is fine.
            if (p.y < WL - 0.2) continue;
            // Standing on something solid nearby (not itself).
            const held = solids.some((s) => {
              if (s === pl) return false;
              q.setFromMatrixPosition(s.m);
              // Reach: a corner plaza's wide slab, a cliff wall (±12 m along its face, 11 m deep), the
              // tunnel mouth (its roof carries shrubs), else ~2.6 m.
              const reach = /floor_wide/.test(s.piece) ? 8.5 : /cliff_wall/.test(s.piece) ? 13 : /tunnel/.test(s.piece) ? 30 : 2.6;
              return Math.hypot(q.x - p.x, q.z - p.z) < reach && q.y <= p.y + 0.3;
            });
            if (!held) bad.push(`${type}#${v} d=${d} ${pl.piece} at x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`);
          }
        }
      }
    }
    expect([...new Set(bad.map((b) => b.replace(/ d=[\d.]+/, '')))].slice(0, 400)).toEqual([]);
  });
});
