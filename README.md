# CAUSEWAY

<p align="center">
  <img src="docs/screenshots/run-bridge.jpg" alt="A rope-railed plank bridge over turquoise water" width="49%">
  <img src="docs/screenshots/run-arch.jpg" alt="A cliff gorge with waterfalls, the golden face gate at the vanishing point" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/title.jpg" alt="Mid-run with the carved-stone CASH OUT plate" width="49%">
  <img src="docs/screenshots/crash-gate.jpg" alt="An escape: the runner celebrates among the ruined columns" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/mobile-run.jpg" alt="Mobile: the multiplier and a thumb-reach cash-out" width="24%">
  <img src="docs/screenshots/mobile-result.jpg" alt="Mobile: result after cashing out" width="24%">
</p>

**A crash game told as an escape run.** A runner sprints down a sunken causeway
through collapsing jungle ruins. The multiplier climbs with every stride, the
ruins shake harder, the camera and the score push faster. Cash out whenever you
like for stake × multiplier. If the way falls first — a gate slams down, the
slabs drop into the water, the cliff comes down — the stake is lost.

The mechanic is a standard crash game: the fall point is fixed before the run
starts, returns 97% whatever the cash-out point, and is verifiable afterwards.
The runner, the route and the tremors are presentation. They carry no
information about where the round ends, and nothing the player does on the
path can change it.

```bash
npm install
npm run dev            # http://localhost:5180
```

Useful URL parameters: `?q=low|medium|high|ultra` forces a graphics tier;
`?seed=<text>` runs a reproducible QA session (fixed server-seed stream);
`?qa` exposes `__game`, `__ctl` and `__store` in a production build.

> **Free play prototype.** Demo credits only. The round authority in this build
> runs in a Web Worker inside the browser; it is clearly separated as a demo
> adapter and is not a production backend. See *Going to production* below.

---

## A round

| | |
| --- | --- |
| **Stake** | Choose a stake (0.10–1,000.00), optionally an auto cash-out (≥ 1.01×). |
| **Run** | The bet is debited and the runner coils for 1.1 s at 1.00×, then sets off. |
| **Rise** | `m(t) = e^(0.000063·t)` — 2× at ~11 s, 10× at ~37 s, 100× at ~73 s. Speed, camera lens, blur, score tempo and tremors all scale with `ln m`. |
| **Cash out** | Tap/click the dock button or press **Space**. Paid `floor(stake × m)` at the server's clock. |
| **Or the way falls** | At the crash point the world stages a collapse around the runner; the stake is lost. |
| **Verify** | The server seed is revealed; recompute the fall point in the *Provably fair* panel. |

## Fairness and the math

```
commitment = SHA-256(serverSeed)                 shown before the bet
h          = first 52 bits of HMAC-SHA-256(serverSeed, "clientSeed:nonce")
crash      = floor(100 · 0.97 · 2^52 / (2^52 − h)) hundredths, clamped to [1.00×, 10,000×]
```

So `P(crash ≥ m) = 0.97 / m` exactly (to 2⁻⁵²), and cashing out at any target
`m` returns 97% on average. About 3.96% of runs fall at 1.00×. A run that
reaches 10,000× pays every live stake at 10,000× (so "never cash out" also
returns 97%). All money is integer hundredths of a credit and all crash math is
`BigInt`; `tests/crash-math.test.ts` checks the closed form at the boundary
draws, not just by simulation.

Ties go to the player: cashing out at exactly the crash multiplier wins. A
cash-out that arrives after the crash time is settled as the crash, even if the
crash timer has not fired yet.

## Architecture

```
src/engine/     pure, dependency-free round math: curve, crash derivation, money, cosmetic RNG
src/service/    the only door to money
  protocol.ts         wire messages (the same ones a WebSocket RGS adapter would speak)
  RoundService.ts     the interface the game depends on
  demoServer.ts       DEMO authority: seeds, balance, clock, timers — clock-injected, testable
  demo.worker.ts      hosts it in a Web Worker so the UI and renderer never hold a live seed
  WorkerRoundService  client side of that transport (clock sync, request/reply, pushes)
src/state/      zustand store + Controller: service ⇄ world ⇄ UI ⇄ audio; never waits on animation
src/render/     Game (loop, staging), CameraRig, post stack (zoom blur, bloom, AgX, grade), particles
src/world/      assets, path (lines + arcs by arc length), section library, track manager,
                instanced walkable tiles (they can give way), water, waterfall, debris, runner
src/audio/      recorded SFX and beds (Freesound, see public/audio/CREDITS.txt), sequenced percussion score, procedural fallback
src/ui/         React interface: title, top bar + history, HUD, dock (stake / cash out), panels
blender/        headless Blender (bpy 4.2) generators for every 3D asset in public/assets
```

* **The crash point never reaches the main thread before settlement.** The UI
  and renderer see a `LiveRound` (id, commitment, stake, start time); the seed
  and crash point arrive only in the settled round.
* **The multiplier on screen is the server's.** The client animates
  `multiplierAt(serverNow − runStartsAt)` with a clock offset estimated from
  request round-trips, and a cash-out is priced by the authority at receipt.
* **React never renders per frame.** The multiplier and the cash-out amount are
  written to the DOM from `requestAnimationFrame`; the 3D loop is plain
  three.js outside React.
* **Crash staging** picks one of three events that suit the section the runner
  is in (a falling slab gate, the slabs ahead dropping into the water, a
  rockfall), using a cosmetic RNG seeded from the *settled* round id — after the
  outcome is public, never before.
* **Danger cues** (tremors, grit falling off walls, the score's tempo, the warm
  grade) are functions of the current multiplier only.

### The Blender pipeline

Every mesh, texture and animation in `public/assets` is generated by the scripts
in `blender/` with headless Blender (`pip install bpy==4.2.0 "numpy<2"`):

| Script | Makes |
| --- | --- |
| `build_kit.py` | The ruin kit: dry-stone walls, slab floors, stairs, pillars, arches, towers, a carved gate, rubble, rocks, plank bridges; palms, jungle trees, bushes, vines and grass as cards. Procedural materials (sandstone, terracotta, rock, wood, bark) are baked with Cycles into colour / normal / ORM atlases with AO; leaves are modelled and rendered into an alpha atlas. → `kit.glb` |
| `build_runner.py` | The runner: the owner-supplied character in `blender/sources/runner/` (see its `PROVENANCE.md`; rigged locally, never sent to an external service), kept exactly as supplied — cream henley, denim, leather harness — and fitted and weighted to our skeleton by `char_source.py`, `char_rig.py` and `char_paint.py`. All 19 clips come from `runner_anim.py`: gaits solved by stance IK against the moving floor (`qa_gait_audit.py` checks planted-foot drift, contact, flight and knee drive per clip), plus idles, falls and escapes. `--procedural` builds the earlier fully procedural character (`build_runner_procedural.py`). → `runner.glb` |
| `build_backdrop.py` | The far world as an equirectangular Cycles render: Nishita sky, terraced cliffs, karst towers, jungle, distant temples and open water, plus an HDR for image-based lighting and the measured sun direction. → `backdrop.webp`, `env.hdr`, `backdrop.json` |

`python3 blender/build_kit.py --fast` bakes at quarter resolution for look-dev.

### Asset delivery (after every re-export)

Blender's exports (`kit.glb`, `runner.glb`, `env.hdr`) are pipeline **inputs**:
the game never downloads them and `vite build` leaves them out of `dist`. After
re-exporting anything, run:

```sh
npm run assets:optimize        # ~1 min; unchanged inputs are skipped (--force rebuilds)
```

It writes, into `public/assets/`:

| File | What |
| --- | --- |
| `kit.high.glb`, `runner.high.glb` | meshopt geometry (`EXT_meshopt_compression` + `KHR_mesh_quantization`), WebP textures ≤ 2048 px (roughness atlases 1024 px, stored grey) |
| `kit.mobile.glb`, `runner.mobile.glb` | the same, textures ≤ 1024 px (roughness and the small wood/bark/flora atlases 512 px), solid pieces simplified by ≤ 0.2 % of their size |
| `env.half.hdr` | the IBL map at 512×256 (it only lights rough surfaces through PMREM) |
| `manifest.json` | per file: bytes and content hash; bundled into the JS, so every asset URL carries `?v=<hash>` and `/assets/*` is served immutable (`public/_headers`) |

Commit the outputs with the inputs. The loader picks **mobile** for phones, the
Low tier, Save-Data and ≤ 4 GB devices, **high** otherwise; `?assets=high|mobile`
overrides. Runner animation channels that hold a bone at rest in every clip are
dropped; if a new clip moves such a bone, it is kept automatically.

| First load (assets) | Before | high | mobile |
| --- | --- | --- | --- |
| bytes | 26.2 MB | 9.0 MiB | 4.6 MiB |

`npm run bench -- --q low --net 4g` (with a server on `URL`, default
`http://localhost:5195`) measures load bytes/time, the loading bar, ms/frame, draw
calls, triangles, JS allocation per frame and memory over 10 rounds in headless
Chromium; compare builds by relative numbers (SwiftShader is slow).

### Section library

`start`, `corridor`, `bridge` (plank, rope-railed and waterfall-gorge styles),
`arcade`, `gate`, `tall`, `plaza` (turning), `stairsDown`, `stairsUp`, `cliff`
(with waterfall), `ruins`, `avenue` (colossal guardians standing in the water) and
`gorge` (cliff walls with waterfalls, ending at a golden face gate or an idol), `boardwalk`
(weathered planks over water, boulders and a mossy bank), `tunnel` (a vine-hung
vaulted passage with light at the exit; rockfall and chasm only) and `statues`
(guardians on plinths, a lintel gate and ruined facades at the vanishing point).
Each has several seeded variants merged per material at load (a few draw calls
each), mirrored at random, dressed with ferns, moss, roots, relief walls, fallen
colossi and lily pads, with islands, palms, towers and cliffs out over the water.
Pacing rules keep elevation within one flight of stairs and avoid repeats.

### Presentation by multiplier

Everything below depends only on the **current** multiplier while running, or on
the **settled** multiplier and round id afterwards — never on the hidden fall point.

One model drives it all: `progression(mult)` in `src/world/choreo.ts` gives the
**tier** (0–4), a continuous **drive** (0–4, log-linear through each tier), how
far **within** the tier the run is, the log **intensity** (30× = 1) and a
**heat** (0–1, continuous with a step at each tier). Camera, grade, effects and
danger cues, runner, world biome and score all read it; the HUD heat and the
score's tier are the same functions (`audio/feedback.ts` delegates to it).

| Tier | Multiplier | Camera | Light and grade | Effects and cues | Runner | World | Score |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 running for his life | < 2× | 2.25 m back, a hand under shoulder height, 64° lens, a breath of shake | serene gold, open edges | footstep dust only | composed run | causeway over open water | pulse |
| 1 driven | 2–5× | closer, lower, wider (≈66°) | warmer, a touch more contrast | wall dust, birds, a few stones; rush dust off the floor | run → sprint, leaning in | the gates and guardians | + hands (shaker, djembe) |
| 2 sprint | 5–10× | ≈2.1 m, ≈70°, footfalls jar the frame | warm and harder, vignette closes | + rumbles, stones you hop, debris you stumble on | sprint, glances back | the sanctum: tunnels, tall walls, gorges | + taiko |
| 3 all-out | 10–25× | ≈2 m, ≈76°, more shake | hot, dusty air, darker edges | + far collapses (ruins falling into the water), bursts beside him from both walls | sprint → dash | chasm country; the jungle thrashes | + drive layer |
| 4 desperate | 25×+ | ≈1.9 m, ≈81°, low | hottest, heaviest vignette | densest: bursts, collapses, stones every second or two | desperate dash | cliffs, gorges, rope bridges | everything doubled up |

**Tier-up moment.** When the multiplier crosses 2, 5, 10 or 25×, within the frame
the grade steps warmer and harder (heat steps, plus a short warm lift), the
leaves gust, `game.live.tier` changes and the score is told (`tier_up`; it rolls
its fill). On the music's landing (`sounds.tierLanding()`, the new layer's
downbeat, at most ~1.35 bars away; else its next bar line; with no theme
playing, at once) the lens punches and jolts, the HUD pulses
(`game.onTierPulse`, `causeway:tier` and `causeway:tier-pulse` window events), the world gusts and
flickers (`worldTierUp`), both walls breathe out dust, birds lift (from 5×),
the ground rumbles (from 10×) and he glances back (from 5×). A cash-out or a
fall before the landing cancels the punch; reduced motion keeps it, gentler;
Low keeps it with smaller particle budgets.

**Set pieces** (`src/render/obstacles.ts`, presentation only — he always clears them;
which, when and how many come from the current tier and the cosmetic RNG). Calm
straight stretches alternate with bursts of 1–3 pieces; the calm shortens
(≈6.5 s → 2.4 s) and the bursts grow with the tier. Tier 0: logs to jump
(`jump_log`) and low lintels to slide under (`slide`). From 2×: toppling
pillars to vault (`vault`), rocks raining beside the way, the slab he just left
dropping into the water, and the lintel slamming down right after he slides
through. From 5×: the slabs ahead crack loose and drift apart over the water
(2–3 `leap_gap`s sized to the gap) and boulders rolling across just behind him.
Hard bends get a corner cut (`turn_cut_L/R`). Each piece stands ~2.5 s ahead;
the move is called on its start foot and the route speed borrows a few percent
so the takeoff meets the piece. A cash-out or a fall ends it at once: pieces
still ahead crumble away, nothing moves or slams after the round settles.

**Made it.** On a cash-out he keeps his stride for 0.75–1.3 s (longer for a
bigger multiplier) toward a gate of light, stumbles with relief, pulls up and
celebrates just short of the threshold; the chase lens calms, then swings
round for the celebration.

Milestones flare at 2, 5, 10, 25, 50 and 100×. A fall stages one of two variants
per hazard (chasm, gate, rockfall), a cash-out one of four escapes (look back,
cheer, salute, leap); both scale their slow motion, camera and effects with the
settled multiplier. An escape never shows or sounds how close the fall was.

## Quality and performance

Four tiers (pixel-ratio cap, shadow map size, bloom, SMAA, foliage and scenery
density, view distance, particle budget, water detail). The first guess comes
from the device; a frame-time governor steps down automatically (switchable in
Settings). Walkable tiles are instanced; props are merged per material per
section variant; all programs are pre-compiled during loading.

## Tests

```bash
npm test          # vitest: math, fairness, demo authority, controller, route soak
npm run build     # typecheck + production bundle
npm run e2e       # (requires Chromium) headless screenshots, see tools/shoot.mjs
```

## Going to production

What exists: the protocol, a demo authority that implements it, and a client
that depends only on `RoundService`. What a real deployment needs and this
repository does not have:

* the authority behind a network boundary (WebSocket), with durable storage,
  a server-seed hash chain published in advance, and operator wallet/RGS
  integration (debit on bet, credit on settlement, idempotency, reconciliation);
* recorded audio and final art where the procedural placeholders stand in;
* responsible-gambling features required by the target jurisdiction, and
  certification. No certification is claimed.
