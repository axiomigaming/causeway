# Motion audit delta — review/motion/g237-esc vs review/motion/run-b5f0d5c/flags.json

New flags: 20. Gone: 50.

## New

| sequence | frames | check | peak |
|---|---|---|---|
| cash5 | 768–768 | slide: footR slides | f768: 3.3 cm/frame while planted (run/run) |
| cash5 | 899–899 | slide: footR slides | f899: 2.7 cm/frame while planted (cashout/win_cheer) |
| cash5 | 994–994 | pop: footR jumps | f994: 4 cm in one frame between 0 and 0 cm (cashout/win_cheer) |
| cash1.5 | 184–184 | slide: footL slides | f184: 3.4 cm/frame while planted (run/run) |
| cash1.5 | 268–268 | slide: footR slides | f268: 5.5 cm/frame while planted (cashout/run) |
| cash1.5 | 292–293 | slide: footL slides | f292: 24.9 cm/frame while planted (cashout/win_salute) |
| cash1.5 | 306–306 | pop: head jumps | f306: 7 cm in one frame between 2 and 1 cm (cashout/win_salute) |
| cash20 | 1421–1421 | pop: footL snaps | f1421: 31°/frame between 8° and 8° (run/leap_gap) |
| cash20 | 1428–1429 | slide: footR slides | f1428: 28.8 cm/frame while planted (run/run) |
| cash20 | 1475–1475 | pop: footR snaps | f1475: 32°/frame between 2° and 2° (run/leap_gap) |
| cash20 | 1476–1476 | slide: footR slides | f1476: 26.1 cm/frame while planted (run/run) |
| cash20 | 1533–1533 | slide: footR slides | f1533: 3.9 cm/frame while planted (cashout/win_leap) |
| cash60 | 2034–2034 | pop: footR snaps | f2034: 35°/frame between 2° and 4° (cashout/leap_gap) |
| cash60 | 2038–2038 | joint: footR swing | f2038: 61° (limit 60°) (cashout/run) |
| cash60 | 2067–2067 | pop: handL jumps | f2067: 11 cm in one frame between 2 and 3 cm (cashout/run) |
| cash60 | 2067–2067 | pop: handR jumps | f2067: 16 cm in one frame between 3 and 2 cm (cashout/run) |
| cash60 | 2134–2134 | pop: handL jumps | f2134: 13 cm in one frame between 1 and 0 cm (cashout/win_slide) |
| cash60 | 2134–2134 | pop: handR jumps | f2134: 14 cm in one frame between 4 and 0 cm (cashout/win_slide) |
| cash60 | 2179–2179 | pop: thighL snaps | f2179: 33°/frame between 1° and 1° (cashout/win_slide) |
| cash60 | 2212–2212 | frozen: airborne, limbs still | f2212: 0.52°/frame mean limb motion, 4 frames in the air (cashout/win_slide) |

## Gone

| sequence | frames | check | peak |
|---|---|---|---|
| cash1.5 | 200–200 | judder: thighL judders in the gait | f200: J 0.50 vs 0.35 for its own curve low-passed at 4× stride (2.33 Hz): excess 0.15 (limit 0.1); worst frames f200, f213, f187, f226, f199, f186 |
| cash1.5 | 221–221 | judder: toeR judders in the gait | f221: J 0.88 vs 0.76 for its own curve low-passed at 4× stride (2.33 Hz): excess 0.12 (limit 0.1); worst frames f221, f220, f233, f234, f207, f246 |
| cash1.5 | 225–225 | pop: head jumps | f225: 6 cm in one frame between 2 and 2 cm |
| cash1.5 | 225–225 | judder: toeL judders in the gait | f225: J 0.87 vs 0.77 for its own curve low-passed at 4× stride (2.33 Hz): excess 0.10 (limit 0.1); worst frames f225, f238, f212, f214, f189, f252 |
| cash1.5 | 232–232 | judder: thighR judders in the gait | f232: J 0.48 vs 0.35 for its own curve low-passed at 4× stride (2.33 Hz): excess 0.13 (limit 0.1); worst frames f232, f245, f219, f168, f231, f218 |
| cash1.5 | 270–270 | pop: head jumps | f270: 7 cm in one frame between 2 and 2 cm |
| cash1.5 | 290–290 | pop: footL jumps | f290: 41 cm in one frame between 10 and 3 cm |
| cash1.5 | 304–304 | pop: footL jumps | f304: 18 cm in one frame between 2 and 1 cm |
| cash1.5 | 304–304 | pop: footR jumps | f304: 14 cm in one frame between 0 and 1 cm |
| cash5 | 767–767 | pop: head jumps | f767: 5 cm in one frame between 1 and 2 cm |
| cash5 | 781–781 | judder: toeR judders in the gait | f781: J 1.06 vs 0.77 for its own curve low-passed at 4× stride (2.41 Hz): excess 0.30 (limit 0.1); worst frames f781, f782, f742, f769, f823, f741 |
| cash5 | 814–814 | judder: toeL judders in the gait | f814: J 0.84 vs 0.71 for its own curve low-passed at 4× stride (2.41 Hz): excess 0.13 (limit 0.1); worst frames f814, f815, f801, f748, f802, f777 |
| cash5 | 830–830 | pop: hips jump | f830: 11 cm/frame² relative to the ground |
| cash5 | 874–874 | pop: footL snaps | f874: 33°/frame between 5° and 1° |
| cash5 | 874–874 | pop: footL jumps | f874: 52 cm in one frame between 12 and 2 cm |
| cash5 | 883–883 | slide: footR slides | f883: 2.8 cm/frame while planted |
| cash5 | 885–885 | pop: footR jumps | f885: 46 cm in one frame between 9 and 1 cm |
| cash5 | 888–888 | slide: footR slides | f888: 3.8 cm/frame while planted |
| cash5 | 896–896 | pop: footL jumps | f896: 41 cm in one frame between 6 and 2 cm |
| cash5 | 896–896 | pop: thighL snaps | f896: 29°/frame between 9° and 2° |
| cash5 | 960–960 | joint: upper_armL twist | f960: 111° (limit 110°) |
| cash5 | 960–960 | joint: upper_armR twist | f960: -111° (limit 110°) |
| cash5 | 969–970 | joint: upper_armL twist | f970: 113° (limit 110°) |
| cash5 | 969–970 | joint: upper_armR twist | f970: -113° (limit 110°) |
| cash5 | 983–983 | joint: upper_armL twist | f983: 113° (limit 110°) |
| cash5 | 983–986 | joint: upper_armR twist | f984: -114° (limit 110°) |
| cash20 | 1403–1403 | slide: footR slides | f1403: 3.0 cm/frame while planted |
| cash20 | 1438–1438 | slide: footR slides | f1438: 8.1 cm/frame while planted |
| cash20 | 1439–1439 | joint: footR swing | f1439: 61° (limit 60°) |
| cash20 | 1488–1488 | judder: toeR judders in the gait | f1488: J 0.86 vs 0.70 for its own curve low-passed at 4× stride (2.26 Hz): excess 0.16 (limit 0.1); worst frames f1488, f1451, f1463, f1450, f1477, f1440 |
| cash20 | 1526–1526 | slide: footL slides | f1526: 24.6 cm/frame while planted |
| cash20 | 1544–1551 | joint: upper_armR twist | f1549: -162° (limit 110°) |
| cash20 | 1637–1641 | joint: shoulderL swing | f1639: 41° (limit 40°) |
| cash20 | 1637–1641 | joint: shoulderR swing | f1639: 41° (limit 40°) |
| cash20 | 1659–1661 | joint: upper_armR twist | f1659: -114° (limit 110°) |
| cash60 | 1951–1951 | judder: toeR judders in the gait | f1951: J 0.98 vs 0.79 for its own curve low-passed at 4× stride (2.35 Hz): excess 0.19 (limit 0.1); worst frames f1951, f1974, f1987, f1950, f1964, f1973 |
| cash60 | 1961–1961 | pop: head jumps | f1961: 6 cm in one frame between 1 and 2 cm |
| cash60 | 1980–1980 | judder: toeL judders in the gait | f1980: J 0.96 vs 0.73 for its own curve low-passed at 4× stride (2.35 Hz): excess 0.23 (limit 0.1); worst frames f1980, f1968, f1944, f1945, f1967, f1957 |
| cash60 | 1984–1984 | pop: head jumps | f1984: 6 cm in one frame between 1 and 2 cm |
| cash60 | 2006–2006 | pop: footR jumps | f2006: 27 cm in one frame between 5 and 8 cm |
| cash60 | 2018–2018 | joint: footR swing | f2018: 66° (limit 60°) |
| cash60 | 2024–2024 | joint: footL swing | f2024: 61° (limit 60°) |
| cash60 | 2033–2033 | pop: head jumps | f2033: 4 cm in one frame between 1 and 1 cm |
| cash60 | 2063–2063 | pop: head jumps | f2063: 8 cm in one frame between 3 and 2 cm |
| cash60 | 2141–2141 | pop: handL jumps | f2141: 15 cm in one frame between 2 and 0 cm |
| cash60 | 2141–2141 | pop: handR jumps | f2141: 16 cm in one frame between 4 and 0 cm |
| cash60 | 2184–2184 | pop: thighL snaps | f2184: 33°/frame between 1° and 1° |
| cash60 | 2195–2199 | joint: upper_armL twist | f2196: 115° (limit 110°) |
| cash60 | 2195–2197 | joint: upper_armR twist | f2196: -114° (limit 110°) |
| cash60 | 2217–2221 | frozen: airborne, limbs still | f2218: 0.51°/frame mean limb motion, 5 frames in the air |