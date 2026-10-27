# Motion audit — review/motion/g237-obst

World 7, quality high, 1280×720, 30 fps time-stepped. Frame numbers count from the sequence start (frame 0 = the world built, setup shot).
Each row is a run of consecutive flagged frames (same check); the peak frame and value are given. Sheets show the frame each new kind of flag was first seen.

| sequence | frames | judder | joint | slide | pop | frozen | framing | camera | staged |
|---|---|---|---|---|---|---|---|---|---|
| start | 0–228 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |
| log | 78–363 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | placed true, fired {"log":1} |
| beam | 78–363 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | placed true, fired {"beam":1} |
| pillar | 78–363 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | placed true, fired {"pillar":1} |
| blocks | 78–363 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | placed true, fired {"blocks":1} |
| corner | 78–363 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |  |

## start

Timeline: 0–44 setup/idle · 45–76 lead/ready · 77–106 run/start · 107–228 run/run

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.21 Hz): spine 0.17/0.18/-0.01, chest 0.17/0.17/-0.00, neck 0.14/0.16/-0.02, head 0.12/0.15/-0.04, shoulderL 0.21/0.22/-0.01, shoulderR 0.21/0.20/+0.01, upper_armL 0.21/0.21/+0.00, upper_armR 0.21/0.21/+0.00, forearmL 0.21/0.22/-0.01, forearmR 0.21/0.22/-0.01, handL 0.21/0.20/+0.02, handR 0.22/0.22/-0.01, thighL 0.32/0.32/+0.01, thighR 0.32/0.31/+0.00, shinL 0.49/0.55/-0.06, shinR 0.44/0.53/-0.08, footL 0.57/0.57/+0.00, footR 0.53/0.57/-0.04, toeL 0.49/0.53/-0.03, toeR 0.50/0.55/-0.05

No flags.

![start](sheet-start.png)

## log

Timeline: 78–92 run/start · 93–208 run/run · 209–230 run/jump_log · 231–285 run/run · 286–309 run/slide · 310–363 run/run

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.33 Hz): spine 0.16/0.16/+0.00, chest 0.17/0.16/+0.01, neck 0.14/0.12/+0.03, head 0.11/0.16/-0.04, shoulderL 0.22/0.23/-0.02, shoulderR 0.21/0.21/+0.00, upper_armL 0.21/0.21/-0.00, upper_armR 0.21/0.22/-0.00, forearmL 0.21/0.21/+0.00, forearmR 0.21/0.21/+0.00, handL 0.21/0.19/+0.02, handR 0.21/0.23/-0.02, thighL 0.32/0.31/+0.01, thighR 0.32/0.31/+0.00, shinL 0.46/0.50/-0.04, shinR 0.46/0.48/-0.02, footL 0.55/0.57/-0.02, footR 0.52/0.54/-0.02, toeL 0.48/0.51/-0.03, toeR 0.51/0.52/-0.01

No flags.

## beam

Timeline: 78–92 run/start · 93–221 run/run · 222–245 run/slide · 246–277 run/run · 278–301 run/slide · 302–363 run/run

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.33 Hz): spine 0.16/0.15/+0.01, chest 0.17/0.15/+0.02, neck 0.14/0.17/-0.03, head 0.12/0.16/-0.04, shoulderL 0.22/0.19/+0.03, shoulderR 0.21/0.21/+0.00, upper_armL 0.21/0.21/-0.00, upper_armR 0.21/0.22/-0.00, forearmL 0.21/0.21/+0.00, forearmR 0.21/0.22/-0.00, handL 0.21/0.21/-0.00, handR 0.21/0.23/-0.01, thighL 0.32/0.31/+0.01, thighR 0.32/0.31/+0.00, shinL 0.48/0.51/-0.04, shinR 0.44/0.46/-0.01, footL 0.57/0.58/-0.01, footR 0.51/0.54/-0.03, toeL 0.49/0.51/-0.02, toeR 0.50/0.53/-0.03

| frames | check | peak | clip at peak |
|---|---|---|---|
| 237 | pop: hips jump | f237: 10 cm/frame² relative to the ground | run/slide |
| 293 | pop: hips jump | f293: 10 cm/frame² relative to the ground | run/slide |

![beam](sheet-beam.png)

## pillar

Timeline: 78–92 run/start · 93–221 run/run · 222–244 run/vault · 245–289 run/run · 290–313 run/slide · 314–363 run/run

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.33 Hz): spine 0.16/0.20/-0.04, chest 0.17/0.17/-0.01, neck 0.14/0.18/-0.03, head 0.12/0.16/-0.04, shoulderL 0.21/0.21/+0.01, shoulderR 0.21/0.21/-0.00, upper_armL 0.21/0.21/-0.00, upper_armR 0.21/0.22/-0.00, forearmL 0.21/0.21/+0.00, forearmR 0.21/0.22/-0.00, handL 0.21/0.21/-0.00, handR 0.21/0.23/-0.01, thighL 0.32/0.31/+0.01, thighR 0.32/0.31/+0.00, shinL 0.48/0.51/-0.04, shinR 0.44/0.46/-0.01, footL 0.57/0.58/-0.01, footR 0.51/0.54/-0.03, toeL 0.49/0.51/-0.02, toeR 0.50/0.53/-0.03

No flags.

## blocks

Timeline: 78–92 run/start · 93–208 run/run · 209–247 run/leap_gap · 248–279 run/run · 280–318 run/leap_gap · 319–350 run/run · 351–363 run/leap_gap

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.33 Hz): spine 0.17/0.16/+0.01, chest 0.17/0.17/+0.00, neck 0.14/0.19/-0.04, head 0.11/0.16/-0.04, shoulderL 0.21/0.23/-0.02, shoulderR 0.21/0.21/+0.00, upper_armL 0.21/0.21/-0.00, upper_armR 0.21/0.22/-0.00, forearmL 0.21/0.21/+0.00, forearmR 0.21/0.21/+0.00, handL 0.21/0.19/+0.02, handR 0.21/0.23/-0.02, thighL 0.32/0.31/+0.01, thighR 0.32/0.31/+0.00, shinL 0.46/0.50/-0.04, shinR 0.46/0.48/-0.02, footL 0.55/0.57/-0.02, footR 0.52/0.54/-0.02, toeL 0.48/0.51/-0.03, toeR 0.51/0.52/-0.01

| frames | check | peak | clip at peak |
|---|---|---|---|
| 282 | pop: shinL snaps | f282: 27°/frame between 5° and 8° | run/leap_gap |

![blocks](sheet-blocks.png)

## corner

Timeline: 78–92 run/start · 93–285 run/run · 286–307 run/jump_log · 308–363 run/run

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.33 Hz): spine 0.16/0.16/+0.00, chest 0.16/0.15/+0.01, neck 0.14/0.11/+0.03, head 0.12/0.09/+0.03, shoulderL 0.21/0.20/+0.01, shoulderR 0.21/0.22/-0.01, upper_armL 0.21/0.21/+0.00, upper_armR 0.21/0.21/+0.00, forearmL 0.21/0.21/+0.01, forearmR 0.21/0.21/+0.00, handL 0.21/0.19/+0.02, handR 0.22/0.21/+0.01, thighL 0.32/0.31/+0.01, thighR 0.32/0.31/+0.01, shinL 0.45/0.49/-0.04, shinR 0.47/0.50/-0.03, footL 0.54/0.56/-0.02, footR 0.55/0.56/-0.01, toeL 0.49/0.52/-0.04, toeR 0.51/0.53/-0.01

No flags.
