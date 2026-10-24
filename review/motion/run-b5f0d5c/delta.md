# Motion audit delta — review/motion/run-b5f0d5c vs review/motion/base-df9304e/flags.json

New flags: 195. Gone: 145.

## New

| sequence | frames | check | peak |
|---|---|---|---|
| cash1.5 | 290–290 | pop: footL jumps | f290: 41 cm in one frame between 10 and 3 cm (cashout/win_salute) |
| cash1.5 | 304–304 | pop: footL jumps | f304: 18 cm in one frame between 2 and 1 cm (cashout/win_salute) |
| cash1.5 | 304–304 | pop: footR jumps | f304: 14 cm in one frame between 0 and 1 cm (cashout/win_salute) |
| cash1.5 | 353–353 | pop: head jumps | f353: 23 cm in one frame between 1 and 0 cm (cashout/win_salute) |
| cash1.5 | 353–353 | pop: chest snaps | f353: 26°/frame between 1° and 0° (cashout/win_salute) |
| cash1.5 | 353–353 | pop: handL jumps | f353: 10 cm in one frame between 0 and 0 cm (cashout/win_salute) |
| cash1.5 | 353–353 | pop: handR jumps | f353: 22 cm in one frame between 3 and 1 cm (cashout/win_salute) |
| cash1.5 | 364–364 | pop: footL jumps | f364: 5 cm in one frame between 0 and 0 cm (cashout/win_salute) |
| cash1.5 | 364–364 | pop: thighL snaps | f364: 28°/frame between 0° and 0° (cashout/win_salute) |
| cash5 | 767–767 | pop: head jumps | f767: 5 cm in one frame between 1 and 2 cm (run/run) |
| cash5 | 781–781 | judder: toeR judders in the gait | f781: J 1.06 vs 0.77 for its own curve low-passed at 4× stride (2.41 Hz): excess 0.30 (limit 0.1); worst frames f781, f782, f742, f769, f823, f741 (run/run) |
| cash5 | 814–814 | judder: toeL judders in the gait | f814: J 0.84 vs 0.71 for its own curve low-passed at 4× stride (2.41 Hz): excess 0.13 (limit 0.1); worst frames f814, f815, f801, f748, f802, f777 (run/run) |
| cash5 | 830–830 | pop: hips jump | f830: 11 cm/frame² relative to the ground (cashout/slide) |
| cash5 | 874–874 | pop: footL snaps | f874: 33°/frame between 5° and 1° (cashout/win_cheer) |
| cash5 | 874–874 | pop: footL jumps | f874: 52 cm in one frame between 12 and 2 cm (cashout/win_cheer) |
| cash5 | 883–883 | slide: footR slides | f883: 2.8 cm/frame while planted (cashout/win_cheer) |
| cash5 | 885–885 | pop: footR jumps | f885: 46 cm in one frame between 9 and 1 cm (cashout/win_cheer) |
| cash5 | 888–888 | slide: footR slides | f888: 3.8 cm/frame while planted (cashout/win_cheer) |
| cash5 | 896–896 | pop: footL jumps | f896: 41 cm in one frame between 6 and 2 cm (cashout/win_cheer) |
| cash5 | 896–896 | pop: thighL snaps | f896: 29°/frame between 9° and 2° (cashout/win_cheer) |
| cash5 | 910–929 | frozen: airborne, limbs still | f910: 0.50°/frame mean limb motion, 4 frames in the air (cashout/win_cheer) |
| cash5 | 958–958 | pop: thighL snaps | f958: 33°/frame between 0° and 1° (cashout/win_cheer) |
| cash5 | 960–960 | joint: upper_armL twist | f960: 111° (limit 110°) (cashout/win_cheer) |
| cash5 | 960–960 | joint: upper_armR twist | f960: -111° (limit 110°) (cashout/win_cheer) |
| cash5 | 969–970 | joint: upper_armL twist | f970: 113° (limit 110°) (cashout/win_cheer) |
| cash5 | 969–970 | joint: upper_armR twist | f970: -113° (limit 110°) (cashout/win_cheer) |
| cash5 | 983–983 | joint: upper_armL twist | f983: 113° (limit 110°) (cashout/win_cheer) |
| cash5 | 983–986 | joint: upper_armR twist | f984: -114° (limit 110°) (cashout/win_cheer) |
| cash20 | 1403–1403 | slide: footR slides | f1403: 3.0 cm/frame while planted (run/run) |
| cash20 | 1438–1438 | slide: footR slides | f1438: 8.1 cm/frame while planted (run/run) |
| cash20 | 1439–1439 | joint: footR swing | f1439: 61° (limit 60°) (run/run) |
| cash20 | 1488–1488 | judder: toeR judders in the gait | f1488: J 0.86 vs 0.70 for its own curve low-passed at 4× stride (2.26 Hz): excess 0.16 (limit 0.1); worst frames f1488, f1451, f1463, f1450, f1477, f1440 (run/run) |
| cash20 | 1526–1526 | slide: footL slides | f1526: 24.6 cm/frame while planted (cashout/run) |
| cash20 | 1544–1551 | joint: upper_armR twist | f1549: -162° (limit 110°) (cashout/win_leap) |
| cash20 | 1586–1586 | pop: head jumps | f1586: 18 cm in one frame between 2 and 2 cm (cashout/win_leap) |
| cash20 | 1586–1586 | pop: handL jumps | f1586: 22 cm in one frame between 2 and 2 cm (cashout/win_leap) |
| cash20 | 1586–1586 | pop: handR jumps | f1586: 20 cm in one frame between 2 and 2 cm (cashout/win_leap) |
| cash20 | 1612–1612 | pop: thighL snaps | f1612: 25°/frame between 1° and 4° (cashout/win_leap) |
| cash20 | 1659–1661 | joint: upper_armR twist | f1659: -114° (limit 110°) (cashout/win_leap) |
| cash60 | 1951–1951 | judder: toeR judders in the gait | f1951: J 0.98 vs 0.79 for its own curve low-passed at 4× stride (2.35 Hz): excess 0.19 (limit 0.1); worst frames f1951, f1974, f1987, f1950, f1964, f1973 (run/run) |
| cash60 | 1961–1961 | pop: head jumps | f1961: 6 cm in one frame between 1 and 2 cm (run/run) |
| cash60 | 1980–1980 | judder: toeL judders in the gait | f1980: J 0.96 vs 0.73 for its own curve low-passed at 4× stride (2.35 Hz): excess 0.23 (limit 0.1); worst frames f1980, f1968, f1944, f1945, f1967, f1957 (run/run) |
| cash60 | 1984–1984 | pop: head jumps | f1984: 6 cm in one frame between 1 and 2 cm (run/run) |
| cash60 | 2006–2006 | pop: footR jumps | f2006: 27 cm in one frame between 5 and 8 cm (run/leap_gap) |
| cash60 | 2018–2018 | joint: footR swing | f2018: 66° (limit 60°) (run/run) |
| cash60 | 2024–2024 | joint: footL swing | f2024: 61° (limit 60°) (run/run) |
| cash60 | 2033–2033 | pop: head jumps | f2033: 4 cm in one frame between 1 and 1 cm (cashout/run) |
| cash60 | 2063–2063 | pop: head jumps | f2063: 8 cm in one frame between 3 and 2 cm (cashout/run) |
| cash60 | 2184–2184 | pop: thighL snaps | f2184: 33°/frame between 1° and 1° (cashout/win_slide) |
| cash60 | 2195–2199 | joint: upper_armL twist | f2196: 115° (limit 110°) (cashout/win_slide) |
| cash60 | 2195–2197 | joint: upper_armR twist | f2196: -114° (limit 110°) (cashout/win_slide) |
| cash60 | 2217–2221 | frozen: airborne, limbs still | f2218: 0.51°/frame mean limb motion, 5 frames in the air (cashout/win_slide) |
| cash60 | 2236–2250 | frozen: airborne, limbs still | f2247: 0.43°/frame mean limb motion, 15 frames in the air (cashout/win_slide) |
| cash60 | 2264–2268 | frozen: airborne, limbs still | f2264: 0.36°/frame mean limb motion, 4 frames in the air (cashout/win_slide) |
| fall_start | 65–65 | framing: runner clipped | f65: footL at the frame edge (crash/fall_start) |
| chasm0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| chasm0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| chasm0 | 649–649 | joint: upper_armL twist | f649: -117° (limit 110°) (crash/fall_chasm) |
| chasm0 | 661–661 | joint: upper_armR twist | f661: 110° (limit 110°) (crash/fall_chasm) |
| chasm0 | 675–675 | joint: upper_armL twist | f675: -121° (limit 110°) (crash/fall_chasm) |
| chasm0 | 692–695 | joint: forearmL over-flexed | f695: 178° (limit 160°) (crash/fall_chasm) |
| chasm0 | 692–692 | joint: shinR over-flexed | f692: 177° (limit 160°) (crash/fall_chasm) |
| chasm0 | 693–709 | joint: shinR reverse bend | f709: -13° (limit -10°) (crash/fall_chasm) |
| chasm0 | 694–694 | joint: forearmR over-flexed | f694: 165° (limit 160°) (crash/fall_chasm) |
| chasm0 | 695–695 | joint: upper_armL twist | f695: 140° (limit 110°) (crash/fall_chasm) |
| chasm0 | 695–695 | joint: upper_armL swing | f695: 180° (limit 178°) (crash/fall_chasm) |
| chasm0 | 695–704 | joint: forearmR reverse bend | f704: -29° (limit -12°) (crash/fall_chasm) |
| chasm0 | 695–707 | joint: shinL reverse bend | f707: -20° (limit -10°) (crash/fall_chasm) |
| chasm0 | 696–704 | joint: forearmL reverse bend | f704: -18° (limit -12°) (crash/fall_chasm) |
| chasm0 | 701–703 | joint: upper_armL twist | f702: -172° (limit 110°) (crash/fall_chasm) |
| chasm0 | 707–707 | joint: upper_armL twist | f707: 150° (limit 110°) (crash/fall_chasm) |
| chasm0 | 715–716 | joint: upper_armL twist | f715: -172° (limit 110°) (crash/fall_chasm) |
| chasm0 | 715–716 | joint: forearmL over-flexed | f716: 179° (limit 160°) (crash/fall_chasm) |
| chasm0 | 715–715 | joint: forearmR over-flexed | f715: 171° (limit 160°) (crash/fall_chasm) |
| chasm0 | 716–725 | joint: forearmR reverse bend | f725: -23° (limit -12°) (crash/fall_chasm) |
| chasm0 | 717–725 | joint: forearmL reverse bend | f725: -20° (limit -12°) (crash/fall_chasm) |
| chasm0 | 721–721 | joint: upper_armL twist | f721: 155° (limit 110°) (crash/fall_chasm) |
| chasm0 | 721–722 | joint: shinL over-flexed | f722: 178° (limit 160°) (crash/fall_chasm) |
| chasm0 | 723–723 | joint: shinR over-flexed | f723: 172° (limit 160°) (crash/fall_chasm) |
| chasm0 | 723–738 | joint: shinL reverse bend | f738: -21° (limit -10°) (crash/fall_chasm) |
| chasm0 | 724–735 | joint: shinR reverse bend | f735: -31° (limit -10°) (crash/fall_chasm) |
| chasm0 | 728–728 | joint: upper_armL twist | f728: -177° (limit 110°) (crash/fall_chasm) |
| chasm0 | 732–736 | joint: upper_armL twist | f734: -174° (limit 110°) (crash/fall_chasm) |
| chasm0 | 736–736 | joint: forearmL over-flexed | f736: 164° (limit 160°) (crash/fall_chasm) |
| chasm0 | 736–736 | joint: forearmR over-flexed | f736: 177° (limit 160°) (crash/fall_chasm) |
| chasm0 | 737–746 | joint: forearmR reverse bend | f746: -17° (limit -12°) (crash/fall_chasm) |
| chasm0 | 737–746 | joint: forearmL reverse bend | f746: -22° (limit -12°) (crash/fall_chasm) |
| chasm0 | 741–741 | joint: upper_armL twist | f741: 119° (limit 110°) (crash/fall_chasm) |
| chasm0 | 749–749 | joint: shinR over-flexed | f749: 173° (limit 160°) (crash/fall_chasm) |
| chasm0 | 750–766 | joint: shinR reverse bend | f766: -10° (limit -10°) (crash/fall_chasm) |
| chasm0 | 751–755 | joint: upper_armL twist | f754: -170° (limit 110°) (crash/fall_chasm) |
| chasm0 | 752–752 | joint: shinL over-flexed | f752: 173° (limit 160°) (crash/fall_chasm) |
| chasm0 | 753–764 | joint: shinL reverse bend | f764: -30° (limit -10°) (crash/fall_chasm) |
| chasm0 | 757–757 | joint: forearmL over-flexed | f757: 164° (limit 160°) (crash/fall_chasm) |
| chasm0 | 757–766 | joint: forearmR reverse bend | f766: -44° (limit -12°) (crash/fall_chasm) |
| chasm0 | 758–767 | joint: forearmL reverse bend | f767: -23° (limit -12°) (crash/fall_chasm) |
| chasm0 | 767–774 | joint: upper_armL twist | f767: -177° (limit 110°) (crash/fall_chasm) |
| chasm0 | 778–778 | joint: forearmL over-flexed | f778: 165° (limit 160°) (crash/fall_chasm) |
| chasm0 | 778–787 | joint: forearmR reverse bend | f787: -38° (limit -12°) (crash/fall_chasm) |
| chasm0 | 778–778 | joint: shinL over-flexed | f778: 169° (limit 160°) (crash/fall_chasm) |
| chasm0 | 779–796 | joint: shinL reverse bend | f796: -10° (limit -10°) (crash/fall_chasm) |
| chasm0 | 779–788 | joint: forearmL reverse bend | f788: -23° (limit -12°) (crash/fall_chasm) |
| chasm0 | 780–780 | joint: shinR over-flexed | f780: 165° (limit 160°) (crash/fall_chasm) |
| chasm0 | 780–780 | joint: upper_armL swing | f780: 178° (limit 178°) (crash/fall_chasm) |
| chasm0 | 781–793 | joint: shinR reverse bend | f793: -16° (limit -10°) (crash/fall_chasm) |
| chasm0 | 785–794 | joint: upper_armL twist | f785: 160° (limit 110°) (crash/fall_chasm) |
| chasm0 | 787–796 | joint: neck swing | f793: 63° (limit 50°) (crash/fall_chasm) |
| chasm1 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| chasm1 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| chasm1 | 616–644 | joint: footL swing | f629: 163° (limit 60°) (crash/fall_chasm_b) |
| chasm1 | 645–645 | pop: footL flips | f645: 142°/frame (crash/fall_chasm_b) |
| chasm1 | 783–787 | joint: neck swing | f785: 51° (limit 50°) (crash/fall_chasm_b) |
| gate0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| gate0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| gate0 | 606–606 | camera: position jerk | f606: 25 cm/frame² (crash/fall_gate) |
| gate1 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| gate1 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| rock0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| rock0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| rock0 | 624–796 | joint: footR swing | f629: 69° (limit 60°) (crash/fall_rock) |
| rock2 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| rock2 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| rock2 | 588–588 | pop: runner ground jumps | f588: 14 cm/frame² (crash/fall_side_hit) |
| rock2 | 589–591 | pop: hips jump | f589: 14 cm/frame² relative to the ground (crash/fall_side_hit) |
| rock2 | 600–602 | pop: hips jump | f602: 18 cm/frame² relative to the ground (crash/fall_side_hit) |
| rock2 | 610–610 | pop: shinR snaps | f610: 33°/frame between 10° and 1° (crash/fall_side_hit) |
| rock2 | 610–620 | framing: runner clipped | f615: head, handL, handR, footL, footR at the frame edge (crash/fall_side_hit) |
| rock2 | 625–627 | frozen: airborne, limbs still | f627: 1.05°/frame mean limb motion, 6 frames in the air (crash/fall_side_hit) |
| rock2 | 681–691 | joint: shoulderR swing | f686: 44° (limit 40°) (crash/fall_side_hit) |
| rock2 | 682–691 | joint: shoulderL swing | f686: 43° (limit 40°) (crash/fall_side_hit) |
| rock2 | 690–796 | joint: head swing | f785: 90° (limit 55°) (crash/fall_side_hit) |
| rock2 | 692–692 | joint: neck swing | f692: 50° (limit 50°) (crash/fall_side_hit) |
| rock2 | 709–729 | joint: neck swing | f718: 68° (limit 50°) (crash/fall_side_hit) |
| rock2 | 710–728 | joint: shoulderR swing | f718: 49° (limit 40°) (crash/fall_side_hit) |
| rock2 | 710–727 | joint: shoulderL swing | f718: 49° (limit 40°) (crash/fall_side_hit) |
| rock2 | 738–796 | joint: neck swing | f785: 86° (limit 50°) (crash/fall_side_hit) |
| rock2 | 739–796 | joint: shoulderR swing | f784: 60° (limit 40°) (crash/fall_side_hit) |
| rock2 | 740–796 | joint: shoulderL swing | f784: 59° (limit 40°) (crash/fall_side_hit) |
| pillar0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| pillar0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| pillar0 | 611–611 | pop: runner ground jumps | f611: 12 cm/frame² (crash/run) |
| pillar0 | 613–614 | pop: hips jump | f613: 14 cm/frame² relative to the ground (crash/fall_pillar) |
| pillar0 | 639–639 | pop: hips jump | f639: 12 cm/frame² relative to the ground (crash/fall_pillar) |
| pillar0 | 643–796 | joint: thighL swing | f644: 155° (limit 135°) (crash/fall_pillar) |
| pillar0 | 643–796 | joint: thighL twist | f644: -144° (limit 55°) (crash/fall_pillar) |
| pillar0 | 645–796 | joint: thighR swing | f646: 142° (limit 135°) (crash/fall_pillar) |
| pillar0 | 654–796 | frozen: airborne, limbs still | f657: 0.28°/frame mean limb motion, 7 frames in the air (crash/fall_pillar) |
| pillar1 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| pillar1 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| pillar1 | 609–609 | pop: hips jump | f609: 11 cm/frame² relative to the ground (crash/fall_pillar_b) |
| pillar1 | 609–609 | pop: runner ground jumps | f609: 13 cm/frame² (crash/fall_pillar_b) |
| pillar1 | 613–613 | pop: hips jump | f613: 14 cm/frame² relative to the ground (crash/fall_pillar_b) |
| pillar1 | 623–623 | frozen: airborne, limbs still | f623: 0.90°/frame mean limb motion, 4 frames in the air (crash/fall_pillar_b) |
| trip0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| trip0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| trip0 | 607–607 | pop: toeL snaps | f607: 42°/frame between 9° and 0° (crash/fall_trip) |
| trip0 | 607–607 | pop: handL jumps | f607: 10 cm in one frame between 2 and 3 cm (crash/fall_trip) |
| trip0 | 610–610 | pop: hips jump | f610: 11 cm/frame² relative to the ground (crash/fall_trip) |
| trip0 | 610–610 | pop: runner ground jumps | f610: 13 cm/frame² (crash/fall_trip) |
| trip0 | 614–614 | pop: hips jump | f614: 15 cm/frame² relative to the ground (crash/fall_trip) |
| trip0 | 620–623 | pop: hips jump | f620: 12 cm/frame² relative to the ground (crash/fall_trip) |
| trip0 | 621–621 | pop: shinL snaps | f621: 27°/frame between 4° and 2° (crash/fall_trip) |
| trip0 | 642–646 | frozen: airborne, limbs still | f646: 0.42°/frame mean limb motion, 8 frames in the air (crash/fall_trip) |
| trip0 | 646–646 | pop: neck snaps | f646: 29°/frame between 7° and 4° (crash/fall_trip) |
| trip0 | 646–646 | pop: head snaps | f646: 43°/frame between 10° and 5° (crash/fall_trip) |
| trip0 | 651–656 | joint: neck+head twist | f653: 108° (limit 100°) (crash/fall_trip) |
| trip0 | 656–796 | frozen: airborne, limbs still | f697: 0.45°/frame mean limb motion, 45 frames in the air (crash/fall_trip) |
| trip0 | 676–692 | joint: neck+head twist | f684: 104° (limit 100°) (crash/fall_trip) |
| trip0 | 697–796 | joint: neck+head twist | f718: 144° (limit 100°) (crash/fall_trip) |
| trip0 | 702–724 | joint: neck twist | f718: 62° (limit 60°) (crash/fall_trip) |
| trip0 | 706–728 | joint: head twist | f719: 82° (limit 70°) (crash/fall_trip) |
| trip0 | 714–722 | joint: neck swing | f718: 54° (limit 50°) (crash/fall_trip) |
| trip0 | 730–741 | joint: neck twist | f733: 63° (limit 60°) (crash/fall_trip) |
| trip0 | 731–738 | joint: head swing | f734: 59° (limit 55°) (crash/fall_trip) |
| trip0 | 743–758 | joint: head twist | f751: 76° (limit 70°) (crash/fall_trip) |
| trip0 | 748–752 | joint: neck twist | f750: 60° (limit 60°) (crash/fall_trip) |
| trip0 | 760–796 | joint: neck twist | f795: 82° (limit 60°) (crash/fall_trip) |
| trip0 | 760–777 | joint: head swing | f770: 94° (limit 55°) (crash/fall_trip) |
| trip0 | 782–788 | joint: head twist | f785: 71° (limit 70°) (crash/fall_trip) |
| trip0 | 791–796 | joint: head swing | f796: 105° (limit 55°) (crash/fall_trip) |
| ledge0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 (run/run) |
| ledge0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 (run/run) |
| ledge0 | 588–588 | pop: runner ground jumps | f588: 14 cm/frame² (crash/fall_drop) |
| ledge0 | 589–591 | pop: hips jump | f589: 18 cm/frame² relative to the ground (crash/fall_drop) |
| ledge0 | 600–601 | joint: upper_armR twist | f601: 146° (limit 110°) (crash/fall_drop) |
| ledge0 | 607–607 | joint: upper_armR twist | f607: 114° (limit 110°) (crash/fall_drop) |
| ledge0 | 635–635 | pop: head jumps | f635: 20 cm in one frame between 1 and 1 cm (crash/fall_drop) |
| ledge0 | 635–635 | pop: handL jumps | f635: 19 cm in one frame between 2 and 6 cm (crash/fall_drop) |
| ledge0 | 635–635 | pop: handR jumps | f635: 20 cm in one frame between 2 and 3 cm (crash/fall_drop) |
| ledge0 | 760–773 | joint: shoulderL swing | f766: 45° (limit 40°) (crash/fall_drop) |
| ledge0 | 760–773 | joint: shoulderR swing | f766: 45° (limit 40°) (crash/fall_drop) |
| ledge0 | 763–770 | joint: chest swing | f766: 48° (limit 45°) (crash/fall_drop) |
| ledge0 | 792–796 | joint: shoulderL swing | f796: 47° (limit 40°) (crash/fall_drop) |
| ledge0 | 792–796 | joint: shoulderR swing | f796: 47° (limit 40°) (crash/fall_drop) |
| ledge0 | 794–796 | joint: chest swing | f796: 51° (limit 45°) (crash/fall_drop) |

## Gone

| sequence | frames | check | peak |
|---|---|---|---|
| cash1.5 | 279–279 | camera: position jerk | f279: 57 cm/frame² |
| cash1.5 | 287–292 | slide: footR slides | f290: 61.3 cm/frame while planted |
| cash1.5 | 290–290 | pop: footR snaps | f290: 31°/frame between 7° and 0° |
| cash1.5 | 290–290 | pop: footR jumps | f290: 50 cm in one frame between 12 and 3 cm |
| cash1.5 | 298–298 | pop: footL jumps | f298: 41 cm in one frame between 10 and 4 cm |
| cash1.5 | 311–311 | pop: head jumps | f311: 10 cm in one frame between 2 and 1 cm |
| cash1.5 | 311–311 | pop: footR jumps | f311: 7 cm in one frame between 0 and 2 cm |
| cash1.5 | 311–311 | pop: footL jumps | f311: 9 cm in one frame between 1 and 2 cm |
| cash1.5 | 332–332 | pop: head jumps | f332: 6 cm in one frame between 0 and 1 cm |
| cash1.5 | 360–360 | pop: head jumps | f360: 22 cm in one frame between 1 and 0 cm |
| cash1.5 | 360–360 | pop: chest snaps | f360: 26°/frame between 1° and 0° |
| cash1.5 | 360–360 | pop: handL jumps | f360: 10 cm in one frame between 1 and 0 cm |
| cash1.5 | 360–360 | pop: handR jumps | f360: 20 cm in one frame between 3 and 3 cm |
| cash1.5 | 371–371 | pop: footL jumps | f371: 5 cm in one frame between 0 and 0 cm |
| cash1.5 | 371–371 | pop: thighL snaps | f371: 28°/frame between 0° and 0° |
| cash5 | 761–761 | judder: toeR judders in the gait | f761: J 0.94 vs 0.73 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.20 (limit 0.1); worst frames f761, f762, f790, f775, f749, f777 |
| cash5 | 781–781 | judder: toeL judders in the gait | f781: J 0.97 vs 0.74 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.23 (limit 0.1); worst frames f781, f742, f782, f769, f768, f741 |
| cash5 | 801–801 | pop: thighR snaps | f801: 36°/frame between 9° and 11° |
| cash5 | 829–830 | camera: position jerk | f829: 88 cm/frame² |
| cash5 | 850–850 | pop: thighL snaps | f850: 27°/frame between 6° and 4° |
| cash5 | 852–856 | slide: footL slides | f854: 60.9 cm/frame while planted |
| cash5 | 854–854 | pop: footL snaps | f854: 28°/frame between 5° and 0° |
| cash5 | 854–854 | pop: footL jumps | f854: 51 cm in one frame between 10 and 3 cm |
| cash5 | 864–864 | pop: footR snaps | f864: 30°/frame between 8° and 0° |
| cash5 | 864–864 | pop: footR jumps | f864: 42 cm in one frame between 8 and 3 cm |
| cash5 | 886–905 | frozen: airborne, limbs still | f886: 0.48°/frame mean limb motion, 4 frames in the air |
| cash5 | 899–899 | camera: position jerk | f899: 81 cm/frame² |
| cash5 | 899–901 | camera: fast turn | f900: 15.7°/frame |
| cash5 | 899–899 | camera: snap | f899: angular velocity 2.3 → 15.3°/frame |
| cash5 | 920–920 | pop: head jumps | f920: 10 cm in one frame between 1 and 1 cm |
| cash5 | 924–924 | pop: thighL snaps | f924: 28°/frame between 1° and 4° |
| cash5 | 925–925 | camera: position jerk | f925: 99 cm/frame² |
| cash5 | 925–927 | camera: fast turn | f925: 20.5°/frame |
| cash5 | 925–925 | camera: snap | f925: angular velocity 1.8 → 20.5°/frame |
| cash5 | 926–926 | joint: upper_armL twist | f926: 110° (limit 110°) |
| cash5 | 926–926 | joint: upper_armR twist | f926: -110° (limit 110°) |
| cash5 | 935–936 | joint: upper_armL twist | f936: 113° (limit 110°) |
| cash5 | 935–936 | joint: upper_armR twist | f936: -113° (limit 110°) |
| cash5 | 945–946 | camera: position jerk | f946: 78 cm/frame² |
| cash5 | 945–946 | camera: snap | f945: angular velocity 0.1 → 7.1°/frame |
| cash5 | 948–949 | joint: upper_armL twist | f949: 114° (limit 110°) |
| cash5 | 948–952 | joint: upper_armR twist | f950: -114° (limit 110°) |
| cash20 | 1407–1407 | joint: footR swing | f1407: 61° (limit 60°) |
| cash20 | 1437–1437 | judder: toeL judders in the gait | f1437: J 0.90 vs 0.78 for its own curve low-passed at 4× stride (2.47 Hz): excess 0.12 (limit 0.1); worst frames f1437, f1462, f1413, f1463, f1412, f1438 |
| cash20 | 1455–1455 | pop: head jumps | f1455: 5 cm in one frame between 1 and 1 cm |
| cash20 | 1492–1492 | pop: head jumps | f1492: 5 cm in one frame between 1 and 0 cm |
| cash20 | 1503–1503 | pop: head jumps | f1503: 6 cm in one frame between 1 and 1 cm |
| cash20 | 1528–1530 | camera: position jerk | f1528: 127 cm/frame² |
| cash20 | 1536–1536 | slide: footR slides | f1536: 11.0 cm/frame while planted |
| cash20 | 1537–1537 | pop: shinR snaps | f1537: 25°/frame between 3° and 0° |
| cash20 | 1556–1556 | pop: footL jumps | f1556: 4 cm in one frame between 1 and 0 cm |
| cash20 | 1556–1557 | frozen: airborne, limbs still | f1556: 0.98°/frame mean limb motion, 4 frames in the air |
| cash20 | 1558–1564 | joint: upper_armR twist | f1564: -116° (limit 110°) |
| cash20 | 1565–1575 | joint: shoulderL swing | f1569: 42° (limit 40°) |
| cash20 | 1565–1575 | joint: shoulderR swing | f1569: 42° (limit 40°) |
| cash20 | 1565–1565 | pop: footL snaps | f1565: 33°/frame between 0° and 0° |
| cash20 | 1592–1592 | pop: head jumps | f1592: 13 cm in one frame between 1 and 3 cm |
| cash20 | 1592–1592 | pop: handL jumps | f1592: 15 cm in one frame between 1 and 2 cm |
| cash20 | 1592–1592 | pop: handR jumps | f1592: 13 cm in one frame between 1 and 3 cm |
| cash20 | 1609–1613 | joint: shoulderL swing | f1611: 41° (limit 40°) |
| cash20 | 1609–1613 | joint: shoulderR swing | f1611: 41° (limit 40°) |
| cash20 | 1616–1616 | pop: thighL snaps | f1616: 25°/frame between 1° and 4° |
| cash20 | 1647–1647 | pop: head jumps | f1647: 4 cm in one frame between 1 and 1 cm |
| cash20 | 1653–1655 | joint: upper_armR twist | f1653: -114° (limit 110°) |
| cash60 | 1938–1939 | joint: shinL reverse bend | f1939: -164° (limit -10°) |
| cash60 | 1940–1940 | joint: shinL over-flexed | f1940: 177° (limit 160°) |
| cash60 | 1951–1951 | pop: head jumps | f1951: 5 cm in one frame between 1 and 1 cm |
| cash60 | 1970–1970 | judder: toeL judders in the gait | f1970: J 0.82 vs 0.69 for its own curve low-passed at 4× stride (2.83 Hz): excess 0.14 (limit 0.1); worst frames f1970, f1957, f1969, f1971, f1949, f1972 |
| cash60 | 1974–1974 | pop: head jumps | f1974: 5 cm in one frame between 1 and 1 cm |
| cash60 | 1986–1986 | judder: toeR judders in the gait | f1986: J 0.97 vs 0.69 for its own curve low-passed at 4× stride (2.83 Hz): excess 0.27 (limit 0.1); worst frames f1986, f1963, f1964, f1941, f1987, f1942 |
| cash60 | 2006–2006 | joint: footL swing | f2006: 63° (limit 60°) |
| cash60 | 2068–2070 | camera: position jerk | f2068: 129 cm/frame² |
| cash60 | 2070–2070 | pop: handL jumps | f2070: 14 cm in one frame between 2 and 3 cm |
| cash60 | 2111–2111 | camera: position jerk | f2111: 102 cm/frame² |
| cash60 | 2111–2111 | camera: snap | f2111: angular velocity 0.7 → 9.1°/frame |
| cash60 | 2112–2116 | camera: fast turn | f2115: 21.4°/frame |
| cash60 | 2117–2118 | camera: position jerk | f2117: 27 cm/frame² |
| cash60 | 2117–2117 | camera: snap | f2117: angular velocity 17.2 → 8.4°/frame |
| cash60 | 2123–2123 | slide: footL slides | f2123: 19.6 cm/frame while planted |
| cash60 | 2123–2124 | slide: footR slides | f2124: 10.2 cm/frame while planted |
| cash60 | 2143–2143 | pop: shoulderL snaps | f2143: 26°/frame between 0° and 0° |
| cash60 | 2143–2143 | pop: shoulderR snaps | f2143: 26°/frame between 1° and 0° |
| cash60 | 2162–2166 | pop: hips jump | f2164: 12 cm/frame² relative to the ground |
| cash60 | 2166–2167 | camera: position jerk | f2166: 129 cm/frame² |
| cash60 | 2166–2167 | camera: snap | f2166: angular velocity 2.5 → 29.0°/frame |
| cash60 | 2166–2166 | camera: fast turn | f2166: 29.0°/frame |
| cash60 | 2168–2169 | framing: runner clipped | f2168: handR at the frame edge |
| cash60 | 2171–2172 | pop: hips jump | f2172: 14 cm/frame² relative to the ground |
| cash60 | 2187–2191 | joint: upper_armL twist | f2188: 115° (limit 110°) |
| cash60 | 2187–2189 | joint: upper_armR twist | f2188: -114° (limit 110°) |
| fall_start | 66–66 | camera: position jerk | f66: 28 cm/frame² |
| fall_start | 81–81 | pop: thighL snaps | f81: 26°/frame between 4° and 3° |
| chasm0 | 570–570 | pop: hips jump | f570: 13 cm/frame² relative to the ground |
| chasm0 | 586–587 | pop: hips jump | f587: 10 cm/frame² relative to the ground |
| chasm0 | 586–586 | camera: position jerk | f586: 36 cm/frame² |
| chasm0 | 649–649 | pop: footL jumps | f649: 19 cm in one frame between 5 and 5 cm |
| chasm1 | 570–570 | pop: hips jump | f570: 13 cm/frame² relative to the ground |
| chasm1 | 586–587 | pop: hips jump | f587: 10 cm/frame² relative to the ground |
| chasm1 | 586–586 | camera: position jerk | f586: 36 cm/frame² |
| chasm1 | 612–612 | pop: footL jumps | f612: 29 cm in one frame between 6 and 0 cm |
| chasm1 | 644–644 | pop: shinL snaps | f644: 47°/frame between 0° and 5° |
| gate0 | 565–565 | slide: footL slides | f565: 4.0 cm/frame while planted |
| gate0 | 570–570 | pop: hips jump | f570: 13 cm/frame² relative to the ground |
| gate0 | 586–586 | pop: hips jump | f586: 10 cm/frame² relative to the ground |
| gate0 | 586–586 | camera: position jerk | f586: 47 cm/frame² |
| gate0 | 605–605 | camera: snap | f605: angular velocity 0.4 → 6.6°/frame |
| gate0 | 618–618 | camera: position jerk | f618: 27 cm/frame² |
| gate0 | 630–630 | pop: handL jumps | f630: 13 cm in one frame between 4 and 3 cm |
| gate0 | 630–630 | pop: handR jumps | f630: 14 cm in one frame between 4 and 3 cm |
| gate0 | 640–640 | camera: position jerk | f640: 27 cm/frame² |
| gate0 | 660–660 | pop: handL jumps | f660: 7 cm in one frame between 1 and 0 cm |
| gate0 | 660–660 | pop: handR jumps | f660: 7 cm in one frame between 1 and 1 cm |
| gate0 | 660–660 | pop: head jumps | f660: 5 cm in one frame between 0 and 1 cm |
| gate1 | 565–565 | slide: footL slides | f565: 4.0 cm/frame while planted |
| gate1 | 570–570 | pop: hips jump | f570: 13 cm/frame² relative to the ground |
| gate1 | 586–586 | pop: hips jump | f586: 10 cm/frame² relative to the ground |
| gate1 | 586–586 | camera: position jerk | f586: 46 cm/frame² |
| gate1 | 605–606 | camera: snap | f605: angular velocity 0.1 → 6.7°/frame |
| gate1 | 618–618 | camera: position jerk | f618: 26 cm/frame² |
| gate1 | 629–796 | joint: footR swing | f794: 63° (limit 60°) |
| gate1 | 638–640 | camera: position jerk | f638: 36 cm/frame² |
| rock0 | 565–565 | slide: footL slides | f565: 4.0 cm/frame while planted |
| rock0 | 570–570 | pop: hips jump | f570: 13 cm/frame² relative to the ground |
| rock0 | 586–586 | pop: hips jump | f586: 10 cm/frame² relative to the ground |
| rock0 | 586–586 | camera: position jerk | f586: 40 cm/frame² |
| rock0 | 640–641 | camera: position jerk | f640: 33 cm/frame² |
| rock0 | 649–649 | camera: position jerk | f649: 34 cm/frame² |
| rock0 | 658–658 | camera: position jerk | f658: 27 cm/frame² |
| rock0 | 666–666 | camera: position jerk | f666: 31 cm/frame² |
| rock0 | 684–684 | camera: position jerk | f684: 27 cm/frame² |
| rock1 | 565–565 | slide: footL slides | f565: 4.0 cm/frame while planted |
| rock1 | 570–570 | pop: hips jump | f570: 13 cm/frame² relative to the ground |
| rock1 | 586–587 | pop: hips jump | f587: 10 cm/frame² relative to the ground |
| rock1 | 586–586 | camera: position jerk | f586: 40 cm/frame² |
| rock1 | 601–601 | camera: position jerk | f601: 27 cm/frame² |
| rock1 | 617–617 | pop: handR jumps | f617: 21 cm in one frame between 4 and 6 cm |
| rock1 | 622–688 | joint: footL swing | f635: 81° (limit 60°) |
| rock1 | 622–796 | joint: footR swing | f624: 76° (limit 60°) |
| rock1 | 641–641 | camera: position jerk | f641: 47 cm/frame² |
| rock1 | 649–649 | camera: position jerk | f649: 42 cm/frame² |
| rock1 | 666–666 | camera: position jerk | f666: 36 cm/frame² |
| rock1 | 675–675 | camera: position jerk | f675: 35 cm/frame² |
| rock1 | 685–693 | joint: shoulderL swing | f689: 43° (limit 40°) |
| rock1 | 714–731 | joint: shoulderL swing | f721: 48° (limit 40°) |
| rock1 | 744–796 | joint: shoulderL swing | f790: 59° (limit 40°) |