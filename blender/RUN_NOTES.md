# Run, sprint, dash: the numbers

Reference values for an adult male (~1.8 m) running flat out, from the sprint and running
biomechanics literature (Mann; Weyand et al. 2000; Hunter et al. 2004; Nummela et al. 2007;
Novacheck 1998; Schache et al. 2011). Ranges, not one athlete. The cycles in
`runner_anim.py` (RUN / SPRINT / DASH) are authored from them; where this rig or the game forces a
compromise it is said below.

## Speed, stride, contact

| speed | step rate | step length | contact | flight | duty (contact / cycle) |
| --- | --- | --- | --- | --- | --- |
| 6.5–7 m/s (fast run) | 3.2–3.5 /s | 1.9–2.1 m | 0.15–0.17 s | 0.12–0.14 s | ~0.27 |
| 9 m/s (sprint) | 4.2–4.4 /s | 2.1–2.2 m | 0.10–0.11 s | 0.12 s | ~0.23 |
| 11–12 m/s (all out) | 4.6–5.0 /s | 2.3–2.6 m | 0.085–0.095 s | 0.12–0.13 s | ~0.20 |

* Speed rises first by stride length, then (above ~8 m/s) by frequency. Flight time stays ~0.12 s;
  contact time is what shrinks.
* Contact length (the ground the body covers while a foot is down): ~0.9–1.0 m at every speed.
* Foot strike: under or just ahead of the hips, 0.30–0.40 m ahead of the centre of mass at
  touchdown (a long reach ahead = overstriding, which brakes and reads as lunging). Fast runners land
  on the midfoot; sprinters on the ball of the foot, the heel dropping close to the ground at
  mid-stance. Toe-off with the ankle plantarflexed ~50–60°.

In the game (6.5 m/s at tier 0, ~9 m/s sprint, up to 12.6 m/s): the stride per cycle S = D / ts
(D the contact length, ts the stance share of the cycle) sets the turnover (cadence = speed / S).
This rig's legs (hip joint 0.89 m, hip to ankle 0.81 m) reach ~0.8 m of contact before the toe-off
has to come off a locked leg with the hips sunk (the solver showed the hips dropping 13-16 cm at a 0.9 m
contact), so the contact is a little shorter than a real sprinter's and the stance share smaller; the
stride per cycle, and so the turnover, is the real one:

| clip | D (m) | ts | S (m/cycle) | steps/s | contact / flight | hip bob | was |
| --- | --- | --- | --- | --- | --- | --- | --- |
| run | 0.80 | 0.223 | 3.59 | 3.6 at 6.5 m/s | 121 / 151 ms | 4.3 cm | S 2.79: 4.7 steps/s at 6.5 m/s (a scurry) |
| sprint | 0.80 | 0.193 | 4.15 | 4.4 at 9 m/s | 89 / 141 ms | 3.7 cm | S 3.91 |
| dash | 0.80 | 0.165 | 4.85 | 5.2 at 12.6 m/s | 67 / 135 ms | 4.1 cm | S 4.84 (the cadence cap at 12.6 m/s) |

(Contact and flight at each clip's design speed, 6.6 / 9 / 12 m/s.) The strike lands the ball
0.37–0.43 m ahead of the hip joint (the heel 0.2 m in the run, a midfoot strike), close to under the
body.

## Legs

* Stance knee (spring-like, stiff): ~20° flexed at touchdown, 35–45° at mid-stance (less in a sprint),
  ~15–20° at toe-off. A deep knee bend through stance reads as "sitting" — the old cycles loaded
  to 52–56°.
* Front-side mechanics (the coach's cue): the swing leg recovers *in front* of the body. At the other
  foot's touchdown the swing knee is level with or ahead of the stance knee ("knees together"),
  heel tucked under the seat; at the other foot's toe-off the swing thigh is at its peak.
* Knee drive (thigh above vertical at its peak): ~45–50° in a fast run, 65–75° sprinting, near
  horizontal all out.
* Heel recovery (peak knee flexion in swing): ~105–115° running, 125–140° sprinting, the heel close
  to the buttock; it happens early, as the thigh passes vertical.
* Before touchdown the shin swings out (knee to ~25–35° flexed) and the foot paws back: it meets
  the ground moving backward, near the ground's own speed, so it does not brake or skid.

## Pelvis and trunk

* Vertical travel of the hips: 6–8 cm in a fast run, 4–6 cm sprinting; lowest at mid-stance,
  highest in mid-flight. Flight rise from the ballistic arc g·tf²/8 (tf the flight time): 2–3 cm.
* Pelvis rotation (transverse): ±6–10°, the hip of the reaching leg forward at its touchdown.
  Pelvic drop (obliquity): ±4–6°, the swing side dropping after each touchdown.
  Anterior tilt ~15–20° with a ±2–3° wobble per step (most at toe-off).
* Trunk lean: 5–10° forward at top speed (more while accelerating — the game adds that); a
  slight extra flex as each stance loads.
* Shoulders counter-rotate against the pelvis, ±8–12°, so the trunk carries no net twist.

## Arms

* In counter-phase with the legs: the right arm comes forward with the left thigh. Shoulder range
  ~+35°/−50° (fast run) to ~+60°/−70° (sprint), driven back past the hip. Hands come up to chest
  height (run) or chin/shoulder height (sprint), close to the midline but never across it; the elbows
  flare a little behind the back.
* Elbow: ~90° on average; more closed in front (~100–110° flexed), opening behind as the arm
  drives back (~60–75° flexed in a sprint, the hand passing the hip). Hands loose.

## Head

* Steady: pitch within a few degrees, gaze level ahead, no yaw with the shoulders; the neck takes out
  the trunk's rotation and the bob. From the chase camera the head should be the stillest thing on him.

## How the cycles use them (runner_anim.py)

* Stance: solved by two-bone IK against the moving floor (the foot never skates). The knee follows a
  smooth spring — 29° at the strike (run; 27° sprint, 26° dash), 53° / 48° / 46° at mid-stance, ~25° at
  toe-off on a 47–49° plantarflexed foot — and the hips sit at the height that bends it so: the give
  spreads over the first half of the contact instead of landing in one frame. (Mid-stance is a little
  deeper than the literature's 40–45°: this rig's contact is short, and a stiffer spring left almost no
  stance dip to give the bounce its weight.)
* Vertical: ballistic flight (g) from toe-off to strike; through the stance, the knee spring's height.
* Swing: front-side keys (knee level with the stance knee at the other foot's strike, thigh peak 48° /
  64° / 72° at the other foot's toe-off, heel recovery to 109° / 129° / 135° of knee, reached at 37–40% of
  the swing so the fold builds over 3–4 frames: the knee turns at most ~36°/frame at the top tier's
  2.6 strides/s, about a sprinter's 1000°/s, with no stop-start at the toe-off); the last part of
  the swing is steered as the leg's length and angle about the hip into the strike, so the foot paws
  back onto the stone at the stance's own speed, the knee giving a little before it lands.
* A lateral plant lock measures each planted ball on the posed rig and swings the thigh to hold it.
* Pelvis ±7–9° rotation and ±4° drop, shoulders counter-rotating; arms from −0.5 m behind the hip to
  chest (run) or chin (sprint, dash) height, elbows 60–105° (run) to 45–120° (dash); head pitch steady to
  ~1.5°.

