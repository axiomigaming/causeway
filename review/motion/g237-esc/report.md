# Motion audit — review/motion/g237-esc

World 7, quality high, 1280×720, 30 fps time-stepped. Frame numbers count from the sequence start (frame 0 = the world built, setup shot).
Each row is a run of consecutive flagged frames (same check); the peak frame and value are given. Sheets show the frame each new kind of flag was first seen.

| sequence | frames | judder | joint | slide | pop | frozen | framing | camera | staged |
|---|---|---|---|---|---|---|---|---|---|
| cash5 | 739–1069 | 0 | 0 | 2 | 2 | 1 | 0 | 0 | mult 4.99 |
| cash1.5 | 166–496 | 0 | 0 | 3 | 7 | 0 | 0 | 0 | mult 1.49 |
| cash20 | 1400–1730 | 0 | 6 | 3 | 6 | 1 | 0 | 0 | mult 20.01 |
| cash60 | 1938–2268 | 0 | 3 | 0 | 6 | 5 | 0 | 0 | mult 61.96 |

## cash5

Timeline: 739–826 run/run · 827–828 run/slide · 829–850 cashout/slide · 851–858 cashout/run · 859–1069 cashout/win_cheer

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.39 Hz): spine 0.16/0.16/+0.00, chest 0.16/0.17/-0.01, neck 0.20/0.16/+0.04, head 0.18/0.16/+0.02, shoulderL 0.20/0.22/-0.02, shoulderR 0.21/0.21/-0.00, upper_armL 0.20/0.20/-0.00, upper_armR 0.20/0.21/-0.01, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.00, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.03, thighL 0.29/0.30/-0.01, thighR 0.32/0.33/-0.00, shinL 0.41/0.44/-0.03, shinR 0.39/0.43/-0.04, footL 0.55/0.61/-0.07, footR 0.74/0.73/+0.01, toeL 0.53/0.50/+0.03, toeR 0.56/0.58/-0.03

| frames | check | peak | clip at peak |
|---|---|---|---|
| 768 | slide: footR slides | f768: 3.3 cm/frame while planted | run/run |
| 899 | slide: footR slides | f899: 2.7 cm/frame while planted | cashout/win_cheer |
| 910–929 | frozen: airborne, limbs still | f910: 0.38°/frame mean limb motion, 4 frames in the air | cashout/win_cheer |
| 959 | pop: thighL snaps | f959: 34°/frame between 1° and 0° | cashout/win_cheer |
| 994 | pop: footR jumps | f994: 4 cm in one frame between 0 and 0 cm | cashout/win_cheer |

![cash5](sheet-cash5.png)

## cash1.5

Timeline: 166–255 run/run · 256–283 cashout/run · 284–496 cashout/win_salute

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.33 Hz): spine 0.17/0.16/+0.00, chest 0.17/0.16/+0.01, neck 0.14/0.12/+0.02, head 0.12/0.09/+0.03, shoulderL 0.21/0.23/-0.02, shoulderR 0.21/0.20/+0.01, upper_armL 0.21/0.21/-0.00, upper_armR 0.21/0.21/-0.00, forearmL 0.21/0.21/+0.00, forearmR 0.21/0.21/+0.01, handL 0.20/0.19/+0.01, handR 0.21/0.23/-0.02, thighL 0.33/0.33/+0.01, thighR 0.33/0.31/+0.01, shinL 0.47/0.49/-0.02, shinR 0.45/0.46/-0.01, footL 0.56/0.58/-0.02, footR 0.52/0.54/-0.02, toeL 0.50/0.53/-0.04, toeR 0.50/0.50/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 184 | slide: footL slides | f184: 3.4 cm/frame while planted | run/run |
| 268 | slide: footR slides | f268: 5.5 cm/frame while planted | cashout/run |
| 292–293 | slide: footL slides | f292: 24.9 cm/frame while planted | cashout/win_salute |
| 306 | pop: head jumps | f306: 7 cm in one frame between 2 and 1 cm | cashout/win_salute |
| 355 | pop: head jumps | f355: 25 cm in one frame between 0 and 0 cm | cashout/win_salute |
| 355 | pop: chest snaps | f355: 29°/frame between 1° and 0° | cashout/win_salute |
| 355 | pop: handL jumps | f355: 11 cm in one frame between 0 and 0 cm | cashout/win_salute |
| 355 | pop: handR jumps | f355: 24 cm in one frame between 3 and 2 cm | cashout/win_salute |
| 366 | pop: thighL snaps | f366: 28°/frame between 0° and 0° | cashout/win_salute |
| 366 | pop: footL jumps | f366: 5 cm in one frame between 0 and 0 cm | cashout/win_salute |

![cash1.5](sheet-cash1.5.png)

## cash20

Timeline: 1400–1427 run/leap_gap · 1428–1446 run/run · 1447–1475 run/leap_gap · 1476–1489 run/run · 1490–1530 cashout/run · 1531–1730 cashout/win_leap

| frames | check | peak | clip at peak |
|---|---|---|---|
| 1421 | pop: footL snaps | f1421: 31°/frame between 8° and 8° | run/leap_gap |
| 1428–1429 | slide: footR slides | f1428: 28.8 cm/frame while planted | run/run |
| 1475 | pop: footR snaps | f1475: 32°/frame between 2° and 2° | run/leap_gap |
| 1476 | slide: footR slides | f1476: 26.1 cm/frame while planted | run/run |
| 1533 | slide: footR slides | f1533: 3.9 cm/frame while planted | cashout/win_leap |
| 1575–1585 | frozen: airborne, limbs still | f1585: 0.89°/frame mean limb motion, 14 frames in the air | cashout/win_leap |
| 1584 | pop: head jumps | f1584: 18 cm in one frame between 2 and 2 cm | cashout/win_leap |
| 1584 | pop: handL jumps | f1584: 22 cm in one frame between 2 and 2 cm | cashout/win_leap |
| 1584 | pop: handR jumps | f1584: 19 cm in one frame between 2 and 2 cm | cashout/win_leap |
| 1611 | pop: thighL snaps | f1611: 25°/frame between 1° and 4° | cashout/win_leap |
| 1665–1676 | joint: shoulderL swing | f1670: 45° (limit 40°) | cashout/win_leap |
| 1665–1676 | joint: shoulderR swing | f1670: 45° (limit 40°) | cashout/win_leap |
| 1694–1714 | joint: shoulderL swing | f1703: 50° (limit 40°) | cashout/win_leap |
| 1694–1714 | joint: shoulderR swing | f1703: 50° (limit 40°) | cashout/win_leap |
| 1724–1730 | joint: shoulderL swing | f1730: 50° (limit 40°) | cashout/win_leap |
| 1724–1730 | joint: shoulderR swing | f1730: 50° (limit 40°) | cashout/win_leap |

![cash20](sheet-cash20.png)

## cash60

Timeline: 1938–2007 run/run · 2008–2027 run/leap_gap · 2028–2034 cashout/leap_gap · 2035–2067 cashout/run · 2068–2268 cashout/win_slide

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.57 Hz): spine 0.20/0.20/+0.00, chest 0.20/0.20/+0.00, neck 0.23/0.25/-0.02, head 0.25/0.29/-0.04, shoulderL 0.25/0.24/+0.02, shoulderR 0.27/0.28/-0.01, upper_armL 0.25/0.26/-0.00, upper_armR 0.26/0.26/-0.00, forearmL 0.26/0.26/+0.00, forearmR 0.26/0.26/+0.00, handL 0.26/0.25/+0.01, handR 0.26/0.24/+0.02, thighL 0.34/0.36/-0.02, thighR 0.34/0.36/-0.01, shinL 0.39/0.47/-0.09, shinR 0.39/0.50/-0.10, footL 0.65/0.77/-0.12, footR 0.75/0.80/-0.05, toeL 0.52/0.60/-0.07, toeR 0.57/0.60/-0.03

| frames | check | peak | clip at peak |
|---|---|---|---|
| 2034 | pop: footR snaps | f2034: 35°/frame between 2° and 4° | cashout/leap_gap |
| 2038 | joint: footR swing | f2038: 61° (limit 60°) | cashout/run |
| 2067 | pop: handL jumps | f2067: 11 cm in one frame between 2 and 3 cm | cashout/run |
| 2067 | pop: handR jumps | f2067: 16 cm in one frame between 3 and 2 cm | cashout/run |
| 2077–2101 | frozen: airborne, limbs still | f2101: 0.78°/frame mean limb motion, 28 frames in the air | cashout/win_slide |
| 2105–2111 | joint: shoulderL swing | f2108: 41° (limit 40°) | cashout/win_slide |
| 2105–2111 | joint: shoulderR swing | f2108: 41° (limit 40°) | cashout/win_slide |
| 2134 | pop: handL jumps | f2134: 13 cm in one frame between 1 and 0 cm | cashout/win_slide |
| 2134 | pop: handR jumps | f2134: 14 cm in one frame between 4 and 0 cm | cashout/win_slide |
| 2137–2148 | frozen: airborne, limbs still | f2148: 0.21°/frame mean limb motion, 15 frames in the air | cashout/win_slide |
| 2179 | pop: thighL snaps | f2179: 33°/frame between 1° and 1° | cashout/win_slide |
| 2212 | frozen: airborne, limbs still | f2212: 0.52°/frame mean limb motion, 4 frames in the air | cashout/win_slide |
| 2235–2240 | frozen: airborne, limbs still | f2240: 0.35°/frame mean limb motion, 9 frames in the air | cashout/win_slide |
| 2263–2268 | frozen: airborne, limbs still | f2268: 0.34°/frame mean limb motion, 9 frames in the air | cashout/win_slide |

![cash60](sheet-cash60.png)
