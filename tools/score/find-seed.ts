// QA helper for audio captures: find a `?seed=` whose first rounds make a good listening session.
// Wanted: round 1 reaches at least 3× (a cash-out at 2.5× gives the fanfare), round 2 reaches at least
// 35× (a run through every music tier, then a fall), round 3 falls early.
//   node --import tsx tools/score/find-seed.ts [prefix]
import { crashPoint, derivedSeed } from '../../src/engine/fairness';

const prefix = process.argv[2] ?? 'music';
for (let i = 0; i < 200000; i++) {
  const seed = `${prefix}-${i}`;
  const client = `qa-${seed}`;
  const c = [0, 1, 2].map((n) => crashPoint(derivedSeed(seed, n), client, n));
  if (c[0]! >= 300 && c[1]! >= 3500 && c[1]! <= 6000 && c[2]! <= 180) {
    console.log(seed, c.map((x) => (x / 100).toFixed(2)).join(' '));
    break;
  }
}
