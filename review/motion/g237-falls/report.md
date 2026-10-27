# Motion audit — review/motion/g237-falls

World 7, quality high, 1280×720, 30 fps time-stepped. Frame numbers count from the sequence start (frame 0 = the world built, setup shot).
Each row is a run of consecutive flagged frames (same check); the peak frame and value are given. Sheets show the frame each new kind of flag was first seen.

| sequence | frames | judder | joint | slide | pop | frozen | framing | camera | staged |
|---|---|---|---|---|---|---|---|---|---|
| pillar0 | 526–796 | 0 | 5 | 0 | 3 | 1 | 0 | 0 | kind pillar, clip run, mult 3 |
| trip0 | 526–796 | 0 | 1 | 3 | 6 | 2 | 0 | 0 | kind trip, clip run, mult 3 |
| rock2 | 526–796 | 0 | 6 | 2 | 6 | 1 | 1 | 0 | kind rockfall, clip run, mult 3 |
| ledge0 | 526–796 | 0 | 6 | 0 | 5 | 0 | 0 | 0 | kind ledge, clip run, mult 3 |
| chasm0 | 526–796 | 0 | 52 | 0 | 5 | 0 | 0 | 0 | kind chasm, clip run, mult 3 |
| chasm1 | 526–796 | 0 | 8 | 2 | 0 | 0 | 0 | 0 | kind chasm, clip run, mult 3 |

## pillar0

Timeline: 526–585 run/run · 586–607 crash/run · 608–796 crash/fall_pillar

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.5 Hz): spine 0.15/0.15/+0.00, chest 0.15/0.15/+0.00, neck 0.17/0.15/+0.03, head 0.17/0.17/-0.00, shoulderL 0.19/0.19/+0.00, shoulderR 0.21/0.21/-0.00, upper_armL 0.20/0.20/+0.00, upper_armR 0.20/0.20/+0.00, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.01, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.04, thighL 0.30/0.29/+0.01, thighR 0.30/0.28/+0.02, shinL 0.38/0.41/-0.03, shinR 0.45/0.45/+0.01, footL 0.57/0.59/-0.02, footR 0.60/0.63/-0.03, toeL 0.51/0.50/+0.01, toeR 0.54/0.54/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 611 | pop: runner ground jumps | f611: 12 cm/frame² | crash/fall_pillar |
| 615 | pop: hips jump | f615: 18 cm/frame² relative to the ground | crash/fall_pillar |
| 635 | pop: hips jump | f635: 12 cm/frame² relative to the ground | crash/fall_pillar |
| 637–641 | joint: thighL twist | f639: -144° (limit 55°) | crash/fall_pillar |
| 638–640 | joint: thighL swing | f639: 154° (limit 135°) | crash/fall_pillar |
| 640–796 | joint: thighR swing | f648: 152° (limit 135°) | crash/fall_pillar |
| 641–642 | joint: footR swing | f642: 63° (limit 60°) | crash/fall_pillar |
| 642–796 | joint: thighR twist | f648: 62° (limit 55°) | crash/fall_pillar |
| 651–796 | frozen: airborne, limbs still | f653: 0.27°/frame mean limb motion, 6 frames in the air | crash/fall_pillar |

![pillar0](sheet-pillar0.png)

## trip0

Timeline: 526–585 run/run · 586–606 crash/run · 607–796 crash/fall_trip

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.5 Hz): spine 0.15/0.15/+0.00, chest 0.15/0.15/+0.00, neck 0.17/0.15/+0.02, head 0.17/0.17/-0.00, shoulderL 0.20/0.19/+0.01, shoulderR 0.22/0.21/+0.01, upper_armL 0.20/0.20/+0.00, upper_armR 0.20/0.20/+0.00, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.01, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.04, thighL 0.30/0.29/+0.01, thighR 0.30/0.28/+0.02, shinL 0.38/0.41/-0.03, shinR 0.45/0.45/+0.01, footL 0.57/0.59/-0.02, footR 0.60/0.63/-0.03, toeL 0.51/0.50/+0.01, toeR 0.54/0.54/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 541 | slide: footR slides | f541: 4.1 cm/frame while planted | run/run |
| 561 | slide: footL slides | f561: 3.0 cm/frame while planted | run/run |
| 581 | slide: footR slides | f581: 2.8 cm/frame while planted | run/run |
| 610 | pop: runner ground jumps | f610: 13 cm/frame² | crash/fall_trip |
| 612 | pop: toeL snaps | f612: 34°/frame between 8° and 6° | crash/fall_trip |
| 612–614 | pop: hips jump | f614: 18 cm/frame² relative to the ground | crash/fall_trip |
| 613 | pop: footL snaps | f613: 38°/frame between 4° and 3° | crash/fall_trip |
| 619–621 | pop: hips jump | f619: 18 cm/frame² relative to the ground | crash/fall_trip |
| 642–645 | frozen: airborne, limbs still | f645: 0.42°/frame mean limb motion, 7 frames in the air | crash/fall_trip |
| 645 | pop: head jumps | f645: 18 cm in one frame between 5 and 2 cm | crash/fall_trip |
| 655–796 | frozen: airborne, limbs still | f696: 0.45°/frame mean limb motion, 45 frames in the air | crash/fall_trip |
| 795–796 | joint: neck swing | f796: 55° (limit 50°) | crash/fall_trip |

![trip0](sheet-trip0.png)

## rock2

Timeline: 526–585 run/run · 586–586 crash/run · 587–796 crash/fall_side_hit

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.5 Hz): spine 0.15/0.15/+0.00, chest 0.16/0.15/+0.01, neck 0.18/0.15/+0.03, head 0.17/0.17/-0.00, shoulderL 0.20/0.19/+0.01, shoulderR 0.20/0.21/-0.01, upper_armL 0.20/0.20/+0.00, upper_armR 0.20/0.20/+0.00, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.01, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.04, thighL 0.30/0.29/+0.01, thighR 0.30/0.28/+0.02, shinL 0.38/0.41/-0.03, shinR 0.45/0.45/+0.01, footL 0.57/0.59/-0.02, footR 0.60/0.63/-0.03, toeL 0.51/0.50/+0.01, toeR 0.54/0.54/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 541 | slide: footR slides | f541: 4.1 cm/frame while planted | run/run |
| 581 | slide: footR slides | f581: 2.8 cm/frame while planted | run/run |
| 588 | pop: hips jump | f588: 13 cm/frame² relative to the ground | crash/fall_side_hit |
| 588 | pop: runner ground jumps | f588: 14 cm/frame² | crash/fall_side_hit |
| 591 | pop: hips jump | f591: 14 cm/frame² relative to the ground | crash/fall_side_hit |
| 597 | pop: hips jump | f597: 12 cm/frame² relative to the ground | crash/fall_side_hit |
| 600 | pop: hips jump | f600: 13 cm/frame² relative to the ground | crash/fall_side_hit |
| 610–618 | framing: runner clipped | f612: handL, handR, footL, footR at the frame edge | crash/fall_side_hit |
| 618 | pop: hips jump | f618: 10 cm/frame² relative to the ground | crash/fall_side_hit |
| 623–626 | frozen: airborne, limbs still | f626: 1.00°/frame mean limb motion, 7 frames in the air | crash/fall_side_hit |
| 681–691 | joint: shoulderL swing | f686: 44° (limit 40°) | crash/fall_side_hit |
| 681–691 | joint: shoulderR swing | f686: 44° (limit 40°) | crash/fall_side_hit |
| 710–728 | joint: shoulderL swing | f718: 49° (limit 40°) | crash/fall_side_hit |
| 710–728 | joint: shoulderR swing | f718: 49° (limit 40°) | crash/fall_side_hit |
| 739–796 | joint: shoulderL swing | f784: 60° (limit 40°) | crash/fall_side_hit |
| 739–796 | joint: shoulderR swing | f784: 60° (limit 40°) | crash/fall_side_hit |

![rock2](sheet-rock2.png)

## ledge0

Timeline: 526–585 run/run · 586–586 crash/run · 587–796 crash/fall_drop

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.5 Hz): spine 0.15/0.15/+0.00, chest 0.16/0.15/+0.01, neck 0.16/0.15/+0.01, head 0.17/0.17/-0.00, shoulderL 0.20/0.19/+0.01, shoulderR 0.20/0.21/-0.01, upper_armL 0.20/0.20/+0.00, upper_armR 0.20/0.20/+0.00, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.01, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.04, thighL 0.30/0.29/+0.01, thighR 0.30/0.28/+0.02, shinL 0.38/0.41/-0.03, shinR 0.45/0.45/+0.01, footL 0.57/0.59/-0.02, footR 0.60/0.63/-0.03, toeL 0.51/0.50/+0.01, toeR 0.54/0.54/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 588–591 | pop: hips jump | f591: 17 cm/frame² relative to the ground | crash/fall_drop |
| 588 | pop: runner ground jumps | f588: 14 cm/frame² | crash/fall_drop |
| 634 | pop: head jumps | f634: 19 cm in one frame between 2 and 1 cm | crash/fall_drop |
| 634 | pop: handL jumps | f634: 18 cm in one frame between 2 and 6 cm | crash/fall_drop |
| 634 | pop: handR jumps | f634: 18 cm in one frame between 2 and 3 cm | crash/fall_drop |
| 761–773 | joint: shoulderL swing | f766: 45° (limit 40°) | crash/fall_drop |
| 761–773 | joint: shoulderR swing | f766: 45° (limit 40°) | crash/fall_drop |
| 763–770 | joint: chest swing | f766: 48° (limit 45°) | crash/fall_drop |
| 792–796 | joint: shoulderL swing | f796: 46° (limit 40°) | crash/fall_drop |
| 792–796 | joint: shoulderR swing | f796: 46° (limit 40°) | crash/fall_drop |
| 794–796 | joint: chest swing | f796: 51° (limit 45°) | crash/fall_drop |

![ledge0](sheet-ledge0.png)

## chasm0

Timeline: 526–585 run/run · 586–586 crash/run · 587–796 crash/fall_chasm

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.5 Hz): spine 0.15/0.15/+0.00, chest 0.15/0.15/+0.00, neck 0.17/0.15/+0.02, head 0.17/0.17/-0.00, shoulderL 0.20/0.19/+0.01, shoulderR 0.20/0.21/-0.01, upper_armL 0.20/0.20/+0.00, upper_armR 0.20/0.20/+0.00, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.01, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.04, thighL 0.30/0.29/+0.01, thighR 0.30/0.28/+0.02, shinL 0.38/0.41/-0.03, shinR 0.45/0.45/+0.01, footL 0.57/0.59/-0.02, footR 0.60/0.63/-0.03, toeL 0.51/0.50/+0.01, toeR 0.54/0.54/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 641–646 | pop: hips jump | f641: 18 cm/frame² relative to the ground | crash/fall_chasm |
| 651–659 | pop: hips jump | f655: 30 cm/frame² relative to the ground | crash/fall_chasm |
| 662 | pop: hips jump | f662: 11 cm/frame² relative to the ground | crash/fall_chasm |
| 665–673 | pop: hips jump | f669: 31 cm/frame² relative to the ground | crash/fall_chasm |
| 679–685 | pop: hips jump | f683: 32 cm/frame² relative to the ground | crash/fall_chasm |
| 682–691 | joint: shoulderL swing | f686: 44° (limit 40°) | crash/fall_chasm |
| 682–691 | joint: shoulderR swing | f686: 44° (limit 40°) | crash/fall_chasm |
| 687–688 | joint: upper_armR twist | f687: 116° (limit 110°) | crash/fall_chasm |
| 690–693 | joint: forearmL over-flexed | f693: 177° (limit 160°) | crash/fall_chasm |
| 691–692 | joint: shinR over-flexed | f692: 179° (limit 160°) | crash/fall_chasm |
| 693 | joint: forearmR over-flexed | f693: 165° (limit 160°) | crash/fall_chasm |
| 693–709 | joint: shinR reverse bend | f709: -12° (limit -10°) | crash/fall_chasm |
| 694 | joint: upper_armL twist | f694: -119° (limit 110°) | crash/fall_chasm |
| 694–701 | joint: forearmL reverse bend | f701: -13° (limit -12°) | crash/fall_chasm |
| 694–703 | joint: forearmR reverse bend | f703: -27° (limit -12°) | crash/fall_chasm |
| 694–706 | joint: shinL reverse bend | f706: -21° (limit -10°) | crash/fall_chasm |
| 702–703 | joint: upper_armL twist | f702: -140° (limit 110°) | crash/fall_chasm |
| 707 | joint: upper_armL twist | f707: 154° (limit 110°) | crash/fall_chasm |
| 710–728 | joint: shoulderL swing | f718: 49° (limit 40°) | crash/fall_chasm |
| 710–728 | joint: shoulderR swing | f718: 49° (limit 40°) | crash/fall_chasm |
| 711–715 | joint: forearmL over-flexed | f715: 179° (limit 160°) | crash/fall_chasm |
| 714 | joint: forearmR over-flexed | f714: 170° (limit 160°) | crash/fall_chasm |
| 715–716 | joint: upper_armL twist | f715: -134° (limit 110°) | crash/fall_chasm |
| 715–724 | joint: forearmR reverse bend | f724: -22° (limit -12°) | crash/fall_chasm |
| 716–722 | joint: forearmL reverse bend | f722: -15° (limit -12°) | crash/fall_chasm |
| 719 | joint: shinL over-flexed | f719: 161° (limit 160°) | crash/fall_chasm |
| 720–734 | joint: shinL reverse bend | f734: -10° (limit -10°) | crash/fall_chasm |
| 721 | joint: upper_armL twist | f721: -180° (limit 110°) | crash/fall_chasm |
| 723 | joint: shinR over-flexed | f723: 174° (limit 160°) | crash/fall_chasm |
| 724–735 | joint: shinR reverse bend | f735: -30° (limit -10°) | crash/fall_chasm |
| 728–729 | joint: upper_armL twist | f728: 177° (limit 110°) | crash/fall_chasm |
| 732–735 | joint: upper_armL twist | f733: -176° (limit 110°) | crash/fall_chasm |
| 733–736 | joint: forearmL over-flexed | f736: 178° (limit 160°) | crash/fall_chasm |
| 735 | joint: forearmR over-flexed | f735: 176° (limit 160°) | crash/fall_chasm |
| 736–745 | joint: forearmR reverse bend | f745: -17° (limit -12°) | crash/fall_chasm |
| 737–745 | joint: forearmL reverse bend | f745: -13° (limit -12°) | crash/fall_chasm |
| 739–796 | joint: shoulderL swing | f784: 60° (limit 40°) | crash/fall_chasm |
| 739–796 | joint: shoulderR swing | f784: 60° (limit 40°) | crash/fall_chasm |
| 740 | joint: upper_armR twist | f740: 113° (limit 110°) | crash/fall_chasm |
| 749 | joint: shinR over-flexed | f749: 174° (limit 160°) | crash/fall_chasm |
| 750–765 | joint: shinR reverse bend | f765: -11° (limit -10°) | crash/fall_chasm |
| 751 | joint: shinL over-flexed | f751: 173° (limit 160°) | crash/fall_chasm |
| 752–763 | joint: shinL reverse bend | f763: -31° (limit -10°) | crash/fall_chasm |
| 753–756 | joint: upper_armL twist | f755: -179° (limit 110°) | crash/fall_chasm |
| 754–757 | joint: forearmL over-flexed | f757: 178° (limit 160°) | crash/fall_chasm |
| 756–766 | joint: forearmR reverse bend | f766: -12° (limit -12°) | crash/fall_chasm |
| 758–766 | joint: forearmL reverse bend | f766: -16° (limit -12°) | crash/fall_chasm |
| 767–774 | joint: upper_armL twist | f773: 174° (limit 110°) | crash/fall_chasm |
| 776–778 | joint: forearmL over-flexed | f778: 179° (limit 160°) | crash/fall_chasm |
| 777–786 | joint: forearmR reverse bend | f786: -37° (limit -12°) | crash/fall_chasm |
| 777 | joint: shinL over-flexed | f777: 175° (limit 160°) | crash/fall_chasm |
| 778–790 | joint: shinL reverse bend | f790: -15° (limit -10°) | crash/fall_chasm |
| 779–787 | joint: forearmL reverse bend | f787: -19° (limit -12°) | crash/fall_chasm |
| 780 | joint: shinR over-flexed | f780: 166° (limit 160°) | crash/fall_chasm |
| 781–793 | joint: shinR reverse bend | f793: -15° (limit -10°) | crash/fall_chasm |
| 785–787 | joint: upper_armL twist | f785: -170° (limit 110°) | crash/fall_chasm |
| 793–794 | joint: upper_armL twist | f794: 158° (limit 110°) | crash/fall_chasm |

![chasm0](sheet-chasm0.png)

## chasm1

Timeline: 526–585 run/run · 586–586 crash/run · 587–796 crash/fall_chasm_b

Gait judder (J / J of the joint's curve low-passed at 4× stride / excess; stride 2.5 Hz): spine 0.15/0.15/+0.00, chest 0.16/0.15/+0.01, neck 0.18/0.15/+0.03, head 0.17/0.17/-0.00, shoulderL 0.20/0.19/+0.01, shoulderR 0.20/0.21/-0.02, upper_armL 0.20/0.20/+0.00, upper_armR 0.20/0.20/+0.00, forearmL 0.20/0.20/+0.00, forearmR 0.20/0.20/-0.01, handL 0.21/0.22/-0.01, handR 0.20/0.24/-0.04, thighL 0.30/0.29/+0.01, thighR 0.30/0.28/+0.02, shinL 0.38/0.41/-0.03, shinR 0.45/0.45/+0.01, footL 0.57/0.59/-0.02, footR 0.60/0.63/-0.03, toeL 0.51/0.50/+0.01, toeR 0.54/0.54/+0.00

| frames | check | peak | clip at peak |
|---|---|---|---|
| 541 | slide: footR slides | f541: 4.1 cm/frame while planted | run/run |
| 581 | slide: footR slides | f581: 2.8 cm/frame while planted | run/run |
| 655–796 | joint: footL swing | f698: 80° (limit 60°) | crash/fall_chasm_b |
| 655–796 | joint: footR swing | f699: 80° (limit 60°) | crash/fall_chasm_b |
| 682–691 | joint: shoulderL swing | f686: 44° (limit 40°) | crash/fall_chasm_b |
| 682–691 | joint: shoulderR swing | f686: 44° (limit 40°) | crash/fall_chasm_b |
| 710–728 | joint: shoulderL swing | f718: 49° (limit 40°) | crash/fall_chasm_b |
| 710–728 | joint: shoulderR swing | f718: 49° (limit 40°) | crash/fall_chasm_b |
| 739–796 | joint: shoulderL swing | f784: 60° (limit 40°) | crash/fall_chasm_b |
| 739–796 | joint: shoulderR swing | f784: 60° (limit 40°) | crash/fall_chasm_b |

![chasm1](sheet-chasm1.png)
