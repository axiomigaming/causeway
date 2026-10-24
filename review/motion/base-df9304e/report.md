# Motion audit — review/motion/base-df9304e

World 7, quality high, 1280×720, 30 fps time-stepped. Frame numbers count from the sequence start (frame 0 = the world built, setup shot).
Each row is a run of consecutive flagged frames (same check); the peak frame and value are given. Sheets show the frame each new kind of flag was first seen.

| sequence | frames | judder | joint | slide | pop | frozen | framing | camera | staged |
|---|---|---|---|---|---|---|---|---|---|
| start | 0–228 | 8 | 0 | 2 | 3 | 0 | 0 | 0 |  |
| log | 78–363 | 8 | 1 | 0 | 9 | 0 | 0 | 0 | placed true, fired {"log":1} |
| beam | 78–363 | 8 | 0 | 2 | 8 | 0 | 0 | 0 | placed true, fired {"beam":1} |
| pillar | 78–363 | 8 | 4 | 0 | 7 | 0 | 0 | 0 | placed true, fired {"pillar":1} |
| blocks | 78–363 | 8 | 0 | 4 | 6 | 0 | 0 | 0 | placed true, fired {"blocks":1} |
| corner | 78–363 | 8 | 0 | 2 | 6 | 0 | 0 | 0 |  |
| cash1.5 | 166–496 | 8 | 0 | 1 | 15 | 0 | 0 | 1 | mult 1.49 |
| cash5 | 739–1069 | 8 | 6 | 1 | 8 | 1 | 0 | 9 | mult 4.99 |
| cash20 | 1400–1730 | 8 | 13 | 1 | 11 | 2 | 0 | 1 | mult 20.01 |
| cash60 | 1938–2268 | 8 | 7 | 2 | 9 | 2 | 1 | 9 | mult 61.96 |
| fall_start | 20–270 | 0 | 2 | 0 | 1 | 0 | 0 | 1 | kind gate |
| chasm0 | 526–796 | 7 | 10 | 0 | 10 | 0 | 0 | 1 | kind chasm, clip fall_chasm, mult 3 |
| chasm1 | 526–796 | 7 | 8 | 0 | 5 | 0 | 0 | 1 | kind chasm, clip fall_chasm_b, mult 3 |
| gate0 | 526–796 | 7 | 1 | 1 | 7 | 1 | 0 | 4 | kind gate, clip fall_gate, mult 3 |
| gate1 | 526–796 | 7 | 5 | 1 | 2 | 0 | 0 | 4 | kind gate, clip fall_gate_b, mult 3 |
| rock0 | 526–796 | 7 | 0 | 1 | 2 | 1 | 0 | 6 | kind rockfall, clip fall_rock, mult 3 |
| rock1 | 526–796 | 7 | 5 | 1 | 3 | 0 | 0 | 6 | kind rockfall, clip fall_rock_b, mult 3 |

## start

Timeline: 0–44 setup/idle · 45–76 lead/ready · 77–107 run/start · 108–228 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 104 | pop: shinR snaps | f104: 27°/frame between 8° and 0° | run/start |
| 109 | slide: footL slides | f109: 6.2 cm/frame while planted | run/run |
| 111 | judder: thighL judders in the gait | f111: J 0.51 (limit 0.35); worst frames f111 (22°), f124 (19°), f214 (19°), f227 (19°), f137 (19°), f150 (17°) | run/run |
| 121 | slide: footL slides | f121: 3.6 cm/frame while planted | run/run |
| 125 | judder: toeL judders in the gait | f125: J 0.93 (limit 0.35); worst frames f125 (42°), f215 (41°), f124 (40°), f214 (39°), f138 (39°), f227 (38°) | run/run |
| 133 | judder: shinL judders in the gait | f133: J 0.52 (limit 0.35); worst frames f133 (26°), f223 (26°), f134 (25°), f224 (25°), f120 (22°), f210 (21°) | run/run |
| 149 | pop: head jumps | f149: 6 cm in one frame between 2 and 2 cm | run/run |
| 149 | judder: footL judders in the gait | f149: J 0.65 (limit 0.35); worst frames f149 (32°), f162 (32°), f148 (30°), f175 (29°), f111 (26°), f161 (25°) | run/run |
| 156 | judder: thighR judders in the gait | f156: J 0.46 (limit 0.35); worst frames f156 (19°), f169 (19°), f182 (18°), f143 (17°), f183 (15°), f196 (14°) | run/run |
| 157 | judder: toeR judders in the gait | f157: J 0.79 (limit 0.35); worst frames f157 (41°), f170 (40°), f169 (39°), f156 (39°), f155 (37°), f168 (35°) | run/run |
| 178 | judder: shinR judders in the gait | f178: J 0.46 (limit 0.35); worst frames f178 (24°), f179 (22°), f166 (22°), f165 (19°), f153 (18°), f117 (18°) | run/run |
| 181 | pop: head jumps | f181: 6 cm in one frame between 2 and 2 cm | run/run |
| 194 | judder: footR judders in the gait | f194: J 0.65 (limit 0.35); worst frames f194 (32°), f117 (32°), f181 (31°), f207 (30°), f180 (29°), f193 (25°) | run/run |

![start](sheet-start.png)

## log

Timeline: 78–93 run/start · 94–208 run/run · 209–230 run/jump_log · 231–285 run/run · 286–309 run/slide · 310–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 90 | pop: shinR snaps | f90: 27°/frame between 8° and 0° | run/start |
| 97 | judder: thighL judders in the gait | f97: J 0.51 (limit 0.35); worst frames f97 (22°), f238 (19°), f110 (19°), f200 (19°), f123 (19°), f251 (19°) | run/run |
| 135 | pop: head jumps | f135: 6 cm in one frame between 2 and 2 cm | run/run |
| 135 | judder: footL judders in the gait | f135: J 0.62 (limit 0.35); worst frames f135 (32°), f276 (32°), f148 (32°), f263 (32°), f134 (30°), f262 (30°) | run/run |
| 142 | judder: thighR judders in the gait | f142: J 0.46 (limit 0.35); worst frames f142 (19°), f155 (19°), f283 (19°), f270 (19°), f168 (18°), f129 (17°) | run/run |
| 164 | judder: shinR judders in the gait | f164: J 0.46 (limit 0.35); worst frames f164 (24°), f165 (22°), f152 (22°), f280 (20°), f151 (19°), f340 (19°) | run/run |
| 167 | pop: head jumps | f167: 6 cm in one frame between 2 and 2 cm | run/run |
| 214 | pop: hips jump | f214: 16 cm/frame² relative to the ground | run/jump_log |
| 215 | joint: footL swing | f215: 61° (limit 60°) | run/jump_log |
| 229 | pop: shinR snaps | f229: 28°/frame between 4° and 1° | run/jump_log |
| 231 | pop: handL jumps | f231: 18 cm in one frame between 5 and 2 cm | run/run |
| 234 | judder: shinL judders in the gait | f234: J 0.49 (limit 0.35); worst frames f234 (28°), f119 (26°), f247 (26°), f233 (25°), f120 (25°), f248 (25°) | run/run |
| 239 | judder: toeL judders in the gait | f239: J 0.93 (limit 0.35); worst frames f239 (42°), f111 (42°), f201 (41°), f238 (40°), f110 (40°), f200 (39°) | run/run |
| 263 | pop: head jumps | f263: 6 cm in one frame between 2 and 2 cm | run/run |
| 283 | judder: toeR judders in the gait | f283: J 0.80 (limit 0.35); worst frames f283 (44°), f284 (43°), f143 (41°), f271 (40°), f156 (40°), f155 (39°) | run/run |
| 290 | pop: hips jump | f290: 11 cm/frame² relative to the ground | run/slide |
| 313 | pop: head jumps | f313: 6 cm in one frame between 2 and 2 cm | run/run |
| 326 | judder: footR judders in the gait | f326: J 0.68 (limit 0.35); worst frames f326 (33°), f339 (33°), f352 (32°), f180 (32°), f103 (32°), f167 (31°) | run/run |

![log](sheet-log.png)

## beam

Timeline: 78–93 run/start · 94–221 run/run · 222–245 run/slide · 246–277 run/run · 278–301 run/slide · 302–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 90 | pop: shinR snaps | f90: 27°/frame between 8° and 0° | run/start |
| 97 | judder: thighL judders in the gait | f97: J 0.50 (limit 0.35); worst frames f97 (22°), f110 (19°), f200 (19°), f213 (19°), f123 (19°), f269 (18°) | run/run |
| 111 | judder: toeL judders in the gait | f111: J 0.93 (limit 0.35); worst frames f111 (42°), f201 (41°), f110 (40°), f214 (39°), f200 (39°), f124 (39°) | run/run |
| 119 | judder: shinL judders in the gait | f119: J 0.48 (limit 0.35); worst frames f119 (26°), f209 (26°), f120 (25°), f210 (25°), f106 (22°), f196 (21°) | run/run |
| 135 | pop: head jumps | f135: 6 cm in one frame between 2 and 2 cm | run/run |
| 135 | judder: footL judders in the gait | f135: J 0.56 (limit 0.35); worst frames f135 (32°), f148 (32°), f134 (30°), f161 (29°), f97 (26°), f312 (25°) | run/run |
| 142 | judder: thighR judders in the gait | f142: J 0.45 (limit 0.35); worst frames f142 (19°), f155 (19°), f168 (18°), f129 (17°), f219 (17°), f250 (15°) | run/run |
| 143 | judder: toeR judders in the gait | f143: J 0.69 (limit 0.35); worst frames f143 (41°), f156 (40°), f155 (39°), f142 (39°), f141 (37°), f154 (35°) | run/run |
| 164 | judder: shinR judders in the gait | f164: J 0.48 (limit 0.35); worst frames f164 (24°), f165 (22°), f152 (22°), f263 (20°), f345 (19°), f151 (19°) | run/run |
| 167 | pop: head jumps | f167: 6 cm in one frame between 2 and 2 cm | run/run |
| 226 | pop: hips jump | f226: 11 cm/frame² relative to the ground | run/slide |
| 249 | pop: head jumps | f249: 7 cm in one frame between 2 and 1 cm | run/run |
| 260 | slide: footR slides | f260: 2.8 cm/frame while planted | run/run |
| 273 | slide: footR slides | f273: 3.6 cm/frame while planted | run/run |
| 282 | pop: hips jump | f282: 11 cm/frame² relative to the ground | run/slide |
| 305 | pop: head jumps | f305: 6 cm in one frame between 2 and 2 cm | run/run |
| 318 | pop: head jumps | f318: 7 cm in one frame between 2 and 2 cm | run/run |
| 331 | judder: footR judders in the gait | f331: J 0.75 (limit 0.35); worst frames f331 (33°), f318 (33°), f344 (33°), f357 (32°), f180 (32°), f103 (32°) | run/run |

![beam](sheet-beam.png)

## pillar

Timeline: 78–93 run/start · 94–221 run/run · 222–244 run/vault · 245–289 run/run · 290–313 run/slide · 314–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 90 | pop: shinR snaps | f90: 27°/frame between 8° and 0° | run/start |
| 97 | judder: thighL judders in the gait | f97: J 0.49 (limit 0.35); worst frames f97 (22°), f110 (19°), f200 (19°), f213 (19°), f123 (19°), f136 (17°) | run/run |
| 111 | judder: toeL judders in the gait | f111: J 0.86 (limit 0.35); worst frames f111 (42°), f201 (41°), f110 (40°), f214 (39°), f200 (39°), f124 (39°) | run/run |
| 119 | judder: shinL judders in the gait | f119: J 0.49 (limit 0.35); worst frames f119 (26°), f209 (26°), f120 (25°), f210 (25°), f106 (22°), f196 (21°) | run/run |
| 135 | pop: head jumps | f135: 6 cm in one frame between 2 and 2 cm | run/run |
| 135 | judder: footL judders in the gait | f135: J 0.61 (limit 0.35); worst frames f135 (32°), f148 (32°), f254 (30°), f134 (30°), f267 (30°), f161 (29°) | run/run |
| 142 | judder: thighR judders in the gait | f142: J 0.47 (limit 0.35); worst frames f142 (19°), f155 (19°), f261 (19°), f168 (18°), f274 (18°), f248 (17°) | run/run |
| 167 | pop: head jumps | f167: 6 cm in one frame between 2 and 2 cm | run/run |
| 228–235 | joint: thighR twist | f230: 99° (limit 55°) | run/vault |
| 228 | pop: shinL snaps | f228: 59°/frame between 12° and 6° | run/vault |
| 229–230 | joint: thighL twist | f230: 83° (limit 55°) | run/vault |
| 231–234 | joint: thighL swing | f232: 148° (limit 135°) | run/vault |
| 231 | joint: footL swing | f231: 72° (limit 60°) | run/vault |
| 249 | judder: toeR judders in the gait | f249: J 0.79 (limit 0.35); worst frames f249 (41°), f143 (41°), f248 (40°), f247 (40°), f156 (40°), f262 (40°) | run/run |
| 270 | judder: shinR judders in the gait | f270: J 0.47 (limit 0.35); worst frames f270 (25°), f164 (24°), f271 (23°), f165 (22°), f258 (22°), f152 (22°) | run/run |
| 286 | pop: head jumps | f286: 6 cm in one frame between 2 and 2 cm | run/run |
| 294 | pop: hips jump | f294: 11 cm/frame² relative to the ground | run/slide |
| 317 | pop: head jumps | f317: 6 cm in one frame between 2 and 2 cm | run/run |
| 330 | judder: footR judders in the gait | f330: J 0.72 (limit 0.35); worst frames f330 (33°), f343 (33°), f356 (32°), f286 (32°), f180 (32°), f103 (32°) | run/run |

![pillar](sheet-pillar.png)

## blocks

Timeline: 78–93 run/start · 94–208 run/run · 209–247 run/leap_gap · 248–279 run/run · 280–318 run/leap_gap · 319–350 run/run · 351–363 run/leap_gap

| frames | check | peak | clip at peak |
|---|---|---|---|
| 90 | pop: shinR snaps | f90: 27°/frame between 8° and 0° | run/start |
| 95 | slide: footL slides | f95: 6.2 cm/frame while planted | run/run |
| 97 | judder: thighL judders in the gait | f97: J 0.46 (limit 0.35); worst frames f97 (22°), f110 (19°), f200 (19°), f123 (19°), f136 (17°), f187 (17°) | run/run |
| 107 | slide: footL slides | f107: 3.6 cm/frame while planted | run/run |
| 111 | judder: toeL judders in the gait | f111: J 0.77 (limit 0.35); worst frames f111 (42°), f201 (41°), f110 (40°), f200 (39°), f124 (39°), f123 (37°) | run/run |
| 119 | judder: shinL judders in the gait | f119: J 0.49 (limit 0.35); worst frames f119 (26°), f120 (25°), f106 (22°), f196 (21°), f107 (21°), f197 (20°) | run/run |
| 135 | pop: head jumps | f135: 6 cm in one frame between 2 and 2 cm | run/run |
| 167 | pop: head jumps | f167: 6 cm in one frame between 2 and 2 cm | run/run |
| 180 | judder: footR judders in the gait | f180: J 0.63 (limit 0.35); worst frames f180 (32°), f103 (32°), f167 (31°), f193 (30°), f276 (29°), f166 (29°) | run/run |
| 215 | pop: hips jump | f215: 16 cm/frame² relative to the ground | run/leap_gap |
| 251 | judder: thighR judders in the gait | f251: J 0.51 (limit 0.35); worst frames f251 (23°), f322 (20°), f142 (19°), f155 (19°), f264 (19°), f168 (18°) | run/run |
| 261 | slide: footR slides | f261: 3.8 cm/frame while planted | run/run |
| 273 | judder: shinR judders in the gait | f273: J 0.46 (limit 0.35); worst frames f273 (25°), f164 (24°), f274 (23°), f165 (22°), f261 (22°), f152 (22°) | run/run |
| 281 | slide: footL slides | f281: 3.4 cm/frame while planted | run/leap_gap |
| 286 | pop: hips jump | f286: 16 cm/frame² relative to the ground | run/leap_gap |
| 328 | judder: footL judders in the gait | f328: J 0.72 (limit 0.35); worst frames f328 (33°), f341 (33°), f135 (32°), f148 (32°), f257 (32°), f134 (30°) | run/run |
| 335 | judder: toeR judders in the gait | f335: J 0.97 (limit 0.35); worst frames f335 (43°), f336 (42°), f252 (41°), f143 (41°), f348 (41°), f321 (40°) | run/run |
| 357 | pop: hips jump | f357: 15 cm/frame² relative to the ground | run/leap_gap |

![blocks](sheet-blocks.png)

## corner

Timeline: 78–93 run/start · 94–285 run/run · 286–307 run/jump_log · 308–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 90 | pop: shinR snaps | f90: 27°/frame between 8° and 0° | run/start |
| 95 | slide: footL slides | f95: 6.2 cm/frame while planted | run/run |
| 97 | judder: thighL judders in the gait | f97: J 0.50 (limit 0.35); worst frames f97 (22°), f110 (19°), f200 (19°), f213 (19°), f123 (19°), f226 (18°) | run/run |
| 107 | slide: footL slides | f107: 3.6 cm/frame while planted | run/run |
| 135 | pop: head jumps | f135: 6 cm in one frame between 2 and 2 cm | run/run |
| 135 | judder: footL judders in the gait | f135: J 0.64 (limit 0.35); worst frames f135 (32°), f238 (32°), f148 (32°), f225 (32°), f134 (30°), f251 (30°) | run/run |
| 142 | judder: thighR judders in the gait | f142: J 0.46 (limit 0.35); worst frames f142 (19°), f245 (19°), f232 (19°), f155 (19°), f258 (18°), f168 (18°) | run/run |
| 143 | judder: toeR judders in the gait | f143: J 0.80 (limit 0.35); worst frames f143 (41°), f246 (41°), f233 (41°), f245 (40°), f156 (40°), f155 (39°) | run/run |
| 167 | pop: head jumps | f167: 6 cm in one frame between 2 and 2 cm | run/run |
| 225 | pop: head jumps | f225: 6 cm in one frame between 2 and 2 cm | run/run |
| 254 | judder: shinR judders in the gait | f254: J 0.45 (limit 0.35); worst frames f254 (25°), f164 (24°), f255 (22°), f165 (22°), f152 (22°), f242 (21°) | run/run |
| 270 | judder: footR judders in the gait | f270: J 0.66 (limit 0.35); worst frames f270 (32°), f180 (32°), f103 (32°), f283 (31°), f167 (31°), f257 (31°) | run/run |
| 291 | pop: hips jump | f291: 15 cm/frame² relative to the ground | run/jump_log |
| 306 | pop: shinR snaps | f306: 27°/frame between 4° and 3° | run/jump_log |
| 311 | judder: shinL judders in the gait | f311: J 0.50 (limit 0.35); worst frames f311 (27°), f119 (26°), f209 (26°), f120 (25°), f210 (25°), f310 (25°) | run/run |
| 341 | judder: toeL judders in the gait | f341: J 0.95 (limit 0.35); worst frames f341 (43°), f111 (42°), f201 (41°), f342 (41°), f354 (41°), f110 (40°) | run/run |

![corner](sheet-corner.png)

## cash1.5

Timeline: 166–255 run/run · 256–277 cashout/run · 278–496 cashout/win_salute

| frames | check | peak | clip at peak |
|---|---|---|---|
| 180 | judder: footR judders in the gait | f180: J 0.62 (limit 0.35); worst frames f180 (32°), f193 (30°), f179 (25°), f206 (25°), f244 (22°), f243 (21°) | run/run |
| 200 | judder: thighL judders in the gait | f200: J 0.50 (limit 0.35); worst frames f200 (19°), f213 (19°), f226 (18°), f187 (17°), f227 (15°), f240 (14°) | run/run |
| 201 | judder: toeL judders in the gait | f201: J 0.87 (limit 0.35); worst frames f201 (41°), f214 (39°), f200 (39°), f213 (38°), f199 (37°), f188 (36°) | run/run |
| 209 | judder: shinL judders in the gait | f209: J 0.49 (limit 0.35); worst frames f209 (26°), f210 (25°), f196 (21°), f197 (20°), f223 (18°), f239 (18°) | run/run |
| 225 | pop: head jumps | f225: 6 cm in one frame between 2 and 2 cm | run/run |
| 238 | judder: footL judders in the gait | f238: J 0.68 (limit 0.35); worst frames f238 (32°), f225 (32°), f251 (30°), f224 (30°), f237 (25°), f174 (24°) | run/run |
| 245 | judder: thighR judders in the gait | f245: J 0.48 (limit 0.35); worst frames f245 (19°), f232 (19°), f168 (18°), f219 (17°), f169 (15°), f182 (14°) | run/run |
| 246 | judder: toeR judders in the gait | f246: J 0.88 (limit 0.35); worst frames f246 (41°), f233 (41°), f245 (40°), f232 (38°), f231 (36°), f244 (36°) | run/run |
| 254 | judder: shinR judders in the gait | f254: J 0.45 (limit 0.35); worst frames f254 (25°), f242 (21°), f241 (19°), f229 (18°), f181 (17°), f206 (17°) | run/run |
| 270 | pop: head jumps | f270: 7 cm in one frame between 2 and 2 cm | cashout/run |
| 279 | camera: position jerk | f279: 57 cm/frame² | cashout/win_salute |
| 287–292 | slide: footR slides | f290: 61.3 cm/frame while planted | cashout/win_salute |
| 290 | pop: footR snaps | f290: 31°/frame between 7° and 0° | cashout/win_salute |
| 290 | pop: footR jumps | f290: 50 cm in one frame between 12 and 3 cm | cashout/win_salute |
| 298 | pop: footL jumps | f298: 41 cm in one frame between 10 and 4 cm | cashout/win_salute |
| 311 | pop: head jumps | f311: 10 cm in one frame between 2 and 1 cm | cashout/win_salute |
| 311 | pop: footR jumps | f311: 7 cm in one frame between 0 and 2 cm | cashout/win_salute |
| 311 | pop: footL jumps | f311: 9 cm in one frame between 1 and 2 cm | cashout/win_salute |
| 332 | pop: head jumps | f332: 6 cm in one frame between 0 and 1 cm | cashout/win_salute |
| 360 | pop: head jumps | f360: 22 cm in one frame between 1 and 0 cm | cashout/win_salute |
| 360 | pop: chest snaps | f360: 26°/frame between 1° and 0° | cashout/win_salute |
| 360 | pop: handL jumps | f360: 10 cm in one frame between 1 and 0 cm | cashout/win_salute |
| 360 | pop: handR jumps | f360: 20 cm in one frame between 3 and 3 cm | cashout/win_salute |
| 371 | pop: footL jumps | f371: 5 cm in one frame between 0 and 0 cm | cashout/win_salute |
| 371 | pop: thighL snaps | f371: 28°/frame between 0° and 0° | cashout/win_salute |

![cash1.5](sheet-cash1.5.png)

## cash5

Timeline: 739–798 run/run · 799–813 run/turn_cut_R · 814–828 run/run · 829–834 cashout/run · 835–1069 cashout/win_cheer

| frames | check | peak | clip at peak |
|---|---|---|---|
| 749 | judder: footR judders in the gait | f749: J 0.65 (limit 0.35); worst frames f749 (53°), f748 (47°), f789 (43°), f816 (41°), f747 (35°), f788 (29°) | run/run |
| 762 | judder: toeR judders in the gait | f762: J 0.84 (limit 0.35); worst frames f762 (45°), f776 (41°), f775 (41°), f777 (39°), f816 (35°), f761 (31°) | run/run |
| 764 | judder: shinR judders in the gait | f764: J 0.38 (limit 0.35); worst frames f764 (29°), f763 (25°), f818 (25°), f777 (23°), f746 (23°), f817 (22°) | run/run |
| 769 | judder: footL judders in the gait | f769: J 0.68 (limit 0.35); worst frames f769 (50°), f756 (48°), f768 (43°), f823 (42°), f767 (35°), f755 (34°) | run/run |
| 784 | judder: shinL judders in the gait | f784: J 0.40 (limit 0.35); worst frames f784 (29°), f797 (27°), f783 (24°), f766 (24°), f744 (23°), f824 (21°) | run/run |
| 789 | judder: thighR judders in the gait | f789: J 0.44 (limit 0.35); worst frames f789 (18°), f816 (18°), f760 (18°), f776 (17°), f773 (17°), f750 (17°) | run/run |
| 795 | judder: toeL judders in the gait | f795: J 0.93 (limit 0.35); worst frames f795 (45°), f742 (45°), f782 (44°), f743 (44°), f796 (40°), f744 (39°) | run/run |
| 801 | pop: thighR snaps | f801: 36°/frame between 9° and 11° | run/turn_cut_R |
| 816 | judder: thighL judders in the gait | f816: J 0.43 (limit 0.35); worst frames f816 (21°), f817 (21°), f793 (18°), f756 (18°), f823 (18°), f743 (17°) | run/run |
| 829–830 | camera: position jerk | f829: 88 cm/frame² | cashout/run |
| 850 | pop: thighL snaps | f850: 27°/frame between 6° and 4° | cashout/win_cheer |
| 852–856 | slide: footL slides | f854: 60.9 cm/frame while planted | cashout/win_cheer |
| 854 | pop: footL snaps | f854: 28°/frame between 5° and 0° | cashout/win_cheer |
| 854 | pop: footL jumps | f854: 51 cm in one frame between 10 and 3 cm | cashout/win_cheer |
| 864 | pop: footR snaps | f864: 30°/frame between 8° and 0° | cashout/win_cheer |
| 864 | pop: footR jumps | f864: 42 cm in one frame between 8 and 3 cm | cashout/win_cheer |
| 886–905 | frozen: airborne, limbs still | f886: 0.48°/frame mean limb motion, 4 frames in the air | cashout/win_cheer |
| 899 | camera: position jerk | f899: 81 cm/frame² | cashout/win_cheer |
| 899–901 | camera: fast turn | f900: 15.7°/frame | cashout/win_cheer |
| 899 | camera: snap | f899: angular velocity 2.3 → 15.3°/frame | cashout/win_cheer |
| 920 | pop: head jumps | f920: 10 cm in one frame between 1 and 1 cm | cashout/win_cheer |
| 924 | pop: thighL snaps | f924: 28°/frame between 1° and 4° | cashout/win_cheer |
| 925 | camera: position jerk | f925: 99 cm/frame² | cashout/win_cheer |
| 925–927 | camera: fast turn | f925: 20.5°/frame | cashout/win_cheer |
| 925 | camera: snap | f925: angular velocity 1.8 → 20.5°/frame | cashout/win_cheer |
| 926 | joint: upper_armL twist | f926: 110° (limit 110°) | cashout/win_cheer |
| 926 | joint: upper_armR twist | f926: -110° (limit 110°) | cashout/win_cheer |
| 935–936 | joint: upper_armL twist | f936: 113° (limit 110°) | cashout/win_cheer |
| 935–936 | joint: upper_armR twist | f936: -113° (limit 110°) | cashout/win_cheer |
| 945–946 | camera: position jerk | f946: 78 cm/frame² | cashout/win_cheer |
| 945–946 | camera: snap | f945: angular velocity 0.1 → 7.1°/frame | cashout/win_cheer |
| 948–949 | joint: upper_armL twist | f949: 114° (limit 110°) | cashout/win_cheer |
| 948–952 | joint: upper_armR twist | f950: -114° (limit 110°) | cashout/win_cheer |

![cash5](sheet-cash5.png)

## cash20

Timeline: 1400–1404 run/leap_gap · 1405–1489 run/run · 1490–1530 cashout/run · 1531–1730 cashout/win_leap

| frames | check | peak | clip at peak |
|---|---|---|---|
| 1407 | joint: footR swing | f1407: 61° (limit 60°) | run/run |
| 1407 | judder: thighL judders in the gait | f1407: J 0.40 (limit 0.35); worst frames f1407 (27°), f1464 (24°), f1461 (24°), f1436 (23°), f1408 (21°), f1412 (21°) | run/run |
| 1407 | judder: thighR judders in the gait | f1407: J 0.37 (limit 0.35); worst frames f1407 (23°), f1467 (21°), f1417 (21°), f1470 (19°), f1432 (18°), f1457 (17°) | run/run |
| 1432 | judder: footR judders in the gait | f1432: J 0.64 (limit 0.35); worst frames f1432 (57°), f1431 (55°), f1457 (53°), f1456 (51°), f1407 (49°), f1469 (43°) | run/run |
| 1455 | pop: head jumps | f1455: 5 cm in one frame between 1 and 1 cm | run/run |
| 1475 | judder: toeL judders in the gait | f1475: J 0.90 (limit 0.35); worst frames f1475 (40°), f1438 (38°), f1427 (37°), f1452 (37°), f1463 (33°), f1462 (33°) | run/run |
| 1477 | judder: shinL judders in the gait | f1477: J 0.42 (limit 0.35); worst frames f1477 (35°), f1452 (32°), f1427 (32°), f1476 (27°), f1448 (24°), f1485 (23°) | run/run |
| 1481 | judder: toeR judders in the gait | f1481: J 0.77 (limit 0.35); worst frames f1481 (40°), f1444 (39°), f1419 (39°), f1469 (36°), f1468 (32°), f1458 (31°) | run/run |
| 1483 | judder: shinR judders in the gait | f1483: J 0.38 (limit 0.35); worst frames f1483 (35°), f1458 (30°), f1433 (28°), f1482 (25°), f1446 (25°), f1479 (24°) | run/run |
| 1488 | judder: footL judders in the gait | f1488: J 0.76 (limit 0.35); worst frames f1488 (55°), f1413 (55°), f1463 (52°), f1487 (51°), f1451 (41°), f1426 (40°) | run/run |
| 1492 | pop: head jumps | f1492: 5 cm in one frame between 1 and 0 cm | cashout/run |
| 1503 | pop: head jumps | f1503: 6 cm in one frame between 1 and 1 cm | cashout/run |
| 1528–1530 | camera: position jerk | f1528: 127 cm/frame² | cashout/run |
| 1536 | slide: footR slides | f1536: 11.0 cm/frame while planted | cashout/win_leap |
| 1537 | pop: shinR snaps | f1537: 25°/frame between 3° and 0° | cashout/win_leap |
| 1556 | pop: footL jumps | f1556: 4 cm in one frame between 1 and 0 cm | cashout/win_leap |
| 1556–1557 | frozen: airborne, limbs still | f1556: 0.98°/frame mean limb motion, 4 frames in the air | cashout/win_leap |
| 1558–1564 | joint: upper_armR twist | f1564: -116° (limit 110°) | cashout/win_leap |
| 1565–1575 | joint: shoulderL swing | f1569: 42° (limit 40°) | cashout/win_leap |
| 1565–1575 | joint: shoulderR swing | f1569: 42° (limit 40°) | cashout/win_leap |
| 1565 | pop: footL snaps | f1565: 33°/frame between 0° and 0° | cashout/win_leap |
| 1586–1592 | frozen: airborne, limbs still | f1592: 0.66°/frame mean limb motion, 10 frames in the air | cashout/win_leap |
| 1592 | pop: head jumps | f1592: 13 cm in one frame between 1 and 3 cm | cashout/win_leap |
| 1592 | pop: handL jumps | f1592: 15 cm in one frame between 1 and 2 cm | cashout/win_leap |
| 1592 | pop: handR jumps | f1592: 13 cm in one frame between 1 and 3 cm | cashout/win_leap |
| 1609–1613 | joint: shoulderL swing | f1611: 41° (limit 40°) | cashout/win_leap |
| 1609–1613 | joint: shoulderR swing | f1611: 41° (limit 40°) | cashout/win_leap |
| 1616 | pop: thighL snaps | f1616: 25°/frame between 1° and 4° | cashout/win_leap |
| 1636–1649 | joint: shoulderL swing | f1641: 46° (limit 40°) | cashout/win_leap |
| 1636–1649 | joint: shoulderR swing | f1641: 46° (limit 40°) | cashout/win_leap |
| 1647 | pop: head jumps | f1647: 4 cm in one frame between 1 and 1 cm | cashout/win_leap |
| 1653–1655 | joint: upper_armR twist | f1653: -114° (limit 110°) | cashout/win_leap |
| 1664–1686 | joint: shoulderL swing | f1673: 52° (limit 40°) | cashout/win_leap |
| 1664–1686 | joint: shoulderR swing | f1673: 52° (limit 40°) | cashout/win_leap |
| 1692–1730 | joint: shoulderL swing | f1706: 57° (limit 40°) | cashout/win_leap |
| 1692–1730 | joint: shoulderR swing | f1706: 57° (limit 40°) | cashout/win_leap |

![cash20](sheet-cash20.png)

## cash60

Timeline: 1938–1990 run/run · 1991–2003 run/turn_cut_L · 2004–2027 run/run · 2028–2070 cashout/run · 2071–2268 cashout/win_slide

| frames | check | peak | clip at peak |
|---|---|---|---|
| 1938–1939 | joint: shinL reverse bend | f1939: -164° (limit -10°) | run/run |
| 1940 | joint: shinL over-flexed | f1940: 177° (limit 160°) | run/run |
| 1941 | judder: thighR judders in the gait | f1941: J 0.39 (limit 0.35); worst frames f1941 (23°), f1988 (22°), f1962 (22°), f1985 (21°), f1987 (19°), f2021 (19°) | run/run |
| 1945 | judder: thighL judders in the gait | f1945: J 0.35 (limit 0.35); worst frames f1945 (27°), f1968 (25°), f2018 (22°), f2015 (21°), f2017 (19°), f2006 (16°) | run/run |
| 1947 | judder: footL judders in the gait | f1947: J 0.63 (limit 0.35); worst frames f1947 (57°), f1970 (57°), f2017 (50°), f2006 (43°), f1946 (42°), f2018 (40°) | run/run |
| 1951 | pop: head jumps | f1951: 5 cm in one frame between 1 and 1 cm | run/run |
| 1952 | judder: toeR judders in the gait | f1952: J 0.88 (limit 0.35); worst frames f1952 (41°), f1975 (38°), f1976 (36°), f1977 (36°), f2011 (36°), f2024 (34°) | run/run |
| 1954 | judder: shinR judders in the gait | f1954: J 0.36 (limit 0.35); worst frames f1954 (37°), f1977 (36°), f2024 (34°), f1953 (29°), f1976 (25°), f1965 (23°) | run/run |
| 1974 | pop: head jumps | f1974: 5 cm in one frame between 1 and 1 cm | run/run |
| 1981 | judder: toeL judders in the gait | f1981: J 0.86 (limit 0.35); worst frames f1981 (38°), f1958 (37°), f2007 (33°), f2017 (31°), f2016 (31°), f1948 (27°) | run/run |
| 1983 | judder: shinL judders in the gait | f1983: J 0.40 (limit 0.35); worst frames f1983 (38°), f1982 (32°), f1948 (32°), f1960 (31°), f1971 (30°), f2006 (30°) | run/run |
| 2006 | joint: footL swing | f2006: 63° (limit 60°) | run/run |
| 2023 | judder: footR judders in the gait | f2023: J 0.70 (limit 0.35); worst frames f2023 (56°), f1941 (55°), f2022 (55°), f1964 (52°), f1987 (50°), f1988 (40°) | run/run |
| 2068–2070 | camera: position jerk | f2068: 129 cm/frame² | cashout/run |
| 2070 | pop: handL jumps | f2070: 14 cm in one frame between 2 and 3 cm | cashout/run |
| 2083–2117 | frozen: airborne, limbs still | f2117: 0.55°/frame mean limb motion, 38 frames in the air | cashout/win_slide |
| 2107–2124 | joint: shoulderL swing | f2115: 46° (limit 40°) | cashout/win_slide |
| 2107–2124 | joint: shoulderR swing | f2115: 46° (limit 40°) | cashout/win_slide |
| 2111 | camera: position jerk | f2111: 102 cm/frame² | cashout/win_slide |
| 2111 | camera: snap | f2111: angular velocity 0.7 → 9.1°/frame | cashout/win_slide |
| 2112–2116 | camera: fast turn | f2115: 21.4°/frame | cashout/win_slide |
| 2117–2118 | camera: position jerk | f2117: 27 cm/frame² | cashout/win_slide |
| 2117 | camera: snap | f2117: angular velocity 17.2 → 8.4°/frame | cashout/win_slide |
| 2123 | slide: footL slides | f2123: 19.6 cm/frame while planted | cashout/win_slide |
| 2123–2124 | slide: footR slides | f2124: 10.2 cm/frame while planted | cashout/win_slide |
| 2143 | pop: handL jumps | f2143: 18 cm in one frame between 3 and 0 cm | cashout/win_slide |
| 2143 | pop: shoulderL snaps | f2143: 26°/frame between 0° and 0° | cashout/win_slide |
| 2143 | pop: shoulderR snaps | f2143: 26°/frame between 1° and 0° | cashout/win_slide |
| 2143 | pop: handR jumps | f2143: 20 cm in one frame between 7 and 0 cm | cashout/win_slide |
| 2146–2155 | frozen: airborne, limbs still | f2149: 0.21°/frame mean limb motion, 7 frames in the air | cashout/win_slide |
| 2162–2166 | pop: hips jump | f2164: 12 cm/frame² relative to the ground | cashout/win_slide |
| 2166–2167 | camera: position jerk | f2166: 129 cm/frame² | cashout/win_slide |
| 2166–2167 | camera: snap | f2166: angular velocity 2.5 → 29.0°/frame | cashout/win_slide |
| 2166 | camera: fast turn | f2166: 29.0°/frame | cashout/win_slide |
| 2168–2169 | framing: runner clipped | f2168: handR at the frame edge | cashout/win_slide |
| 2171–2172 | pop: hips jump | f2172: 14 cm/frame² relative to the ground | cashout/win_slide |
| 2187–2191 | joint: upper_armL twist | f2188: 115° (limit 110°) | cashout/win_slide |
| 2187–2189 | joint: upper_armR twist | f2188: -114° (limit 110°) | cashout/win_slide |

![cash60](sheet-cash60.png)

## fall_start

Timeline: 20–29 setup/idle · 30–44 lead/ready · 45–270 crash/fall_start

| frames | check | peak | clip at peak |
|---|---|---|---|
| 66 | camera: position jerk | f66: 28 cm/frame² | crash/fall_start |
| 80–270 | joint: footL swing | f87: 82° (limit 60°) | crash/fall_start |
| 80–270 | joint: footR swing | f94: 79° (limit 60°) | crash/fall_start |
| 81 | pop: thighL snaps | f81: 26°/frame between 4° and 3° | crash/fall_start |

![fall_start](sheet-fall_start.png)

## chasm0

Timeline: 526–530 run/leap_gap · 531–563 run/run · 564–585 run/leap_gap · 586–796 crash/fall_chasm

| frames | check | peak | clip at peak |
|---|---|---|---|
| 533 | judder: thighL judders in the gait | f533: J 0.39 (limit 0.35); worst frames f533 (19°), f540 (12°), f552 (11°), f551 (11°), f535 (8°), f534 (8°) | run/run |
| 540 | judder: footL judders in the gait | f540: J 0.88 (limit 0.35); worst frames f540 (41°), f539 (32°), f553 (28°), f552 (25°), f538 (23°), f537 (21°) | run/run |
| 546 | judder: toeR judders in the gait | f546: J 1.00 (limit 0.35); worst frames f546 (44°), f533 (42°), f547 (40°), f548 (33°), f534 (31°), f535 (28°) | run/run |
| 550 | judder: shinL judders in the gait | f550: J 0.53 (limit 0.35); worst frames f550 (25°), f551 (23°), f554 (19°), f555 (18°), f537 (16°), f558 (14°) | run/run |
| 553 | judder: toeL judders in the gait | f553: J 0.84 (limit 0.35); worst frames f553 (39°), f554 (29°), f555 (27°), f552 (21°), f540 (17°), f542 (14°) | run/run |
| 560 | judder: thighR judders in the gait | f560: J 0.49 (limit 0.35); worst frames f560 (18°), f547 (17°), f544 (14°), f561 (14°), f548 (11°), f557 (11°) | run/run |
| 560 | judder: footR judders in the gait | f560: J 0.52 (limit 0.35); worst frames f560 (36°), f561 (26°), f533 (24°), f559 (19°), f548 (16°), f547 (15°) | run/run |
| 570 | pop: hips jump | f570: 13 cm/frame² relative to the ground | run/leap_gap |
| 586–587 | pop: hips jump | f587: 10 cm/frame² relative to the ground | crash/fall_chasm |
| 586 | camera: position jerk | f586: 36 cm/frame² | crash/fall_chasm |
| 641–646 | pop: hips jump | f641: 18 cm/frame² relative to the ground | crash/fall_chasm |
| 649 | pop: footL jumps | f649: 19 cm in one frame between 5 and 5 cm | crash/fall_chasm |
| 651–659 | pop: hips jump | f655: 30 cm/frame² relative to the ground | crash/fall_chasm |
| 651 | pop: neck snaps | f651: 27°/frame between 2° and 4° | crash/fall_chasm |
| 651 | pop: head snaps | f651: 39°/frame between 3° and 6° | crash/fall_chasm |
| 658–796 | joint: head swing | f705: 98° (limit 55°) | crash/fall_chasm |
| 662 | pop: hips jump | f662: 11 cm/frame² relative to the ground | crash/fall_chasm |
| 663–668 | joint: neck swing | f666: 50° (limit 50°) | crash/fall_chasm |
| 665–673 | pop: hips jump | f669: 31 cm/frame² relative to the ground | crash/fall_chasm |
| 679–685 | pop: hips jump | f683: 32 cm/frame² relative to the ground | crash/fall_chasm |
| 685–694 | joint: shoulderL swing | f689: 43° (limit 40°) | crash/fall_chasm |
| 685–694 | joint: shoulderR swing | f689: 43° (limit 40°) | crash/fall_chasm |
| 686–752 | joint: neck swing | f705: 89° (limit 50°) | crash/fall_chasm |
| 714–731 | joint: shoulderL swing | f721: 49° (limit 40°) | crash/fall_chasm |
| 714–731 | joint: shoulderR swing | f721: 49° (limit 40°) | crash/fall_chasm |
| 744–796 | joint: shoulderL swing | f790: 59° (limit 40°) | crash/fall_chasm |
| 744–796 | joint: shoulderR swing | f790: 59° (limit 40°) | crash/fall_chasm |
| 759–782 | joint: neck swing | f772: 70° (limit 50°) | crash/fall_chasm |

![chasm0](sheet-chasm0.png)

## chasm1

Timeline: 526–530 run/leap_gap · 531–563 run/run · 564–585 run/leap_gap · 586–796 crash/fall_chasm_b

| frames | check | peak | clip at peak |
|---|---|---|---|
| 533 | judder: thighL judders in the gait | f533: J 0.39 (limit 0.35); worst frames f533 (19°), f540 (12°), f552 (11°), f551 (11°), f535 (8°), f534 (8°) | run/run |
| 540 | judder: footL judders in the gait | f540: J 0.88 (limit 0.35); worst frames f540 (41°), f539 (32°), f553 (28°), f552 (25°), f538 (23°), f537 (21°) | run/run |
| 546 | judder: toeR judders in the gait | f546: J 1.00 (limit 0.35); worst frames f546 (44°), f533 (42°), f547 (40°), f548 (33°), f534 (31°), f535 (28°) | run/run |
| 550 | judder: shinL judders in the gait | f550: J 0.53 (limit 0.35); worst frames f550 (25°), f551 (23°), f554 (19°), f555 (18°), f537 (16°), f558 (14°) | run/run |
| 553 | judder: toeL judders in the gait | f553: J 0.84 (limit 0.35); worst frames f553 (39°), f554 (29°), f555 (27°), f552 (21°), f540 (17°), f542 (14°) | run/run |
| 560 | judder: thighR judders in the gait | f560: J 0.49 (limit 0.35); worst frames f560 (18°), f547 (17°), f544 (14°), f561 (14°), f548 (11°), f557 (11°) | run/run |
| 560 | judder: footR judders in the gait | f560: J 0.52 (limit 0.35); worst frames f560 (36°), f561 (26°), f533 (24°), f559 (19°), f548 (16°), f547 (15°) | run/run |
| 570 | pop: hips jump | f570: 13 cm/frame² relative to the ground | run/leap_gap |
| 586–587 | pop: hips jump | f587: 10 cm/frame² relative to the ground | crash/fall_chasm_b |
| 586 | camera: position jerk | f586: 36 cm/frame² | crash/fall_chasm_b |
| 612 | pop: footL jumps | f612: 29 cm in one frame between 6 and 0 cm | crash/fall_chasm_b |
| 644 | pop: footL jumps | f644: 32 cm in one frame between 0 and 3 cm | crash/fall_chasm_b |
| 644 | pop: shinL snaps | f644: 47°/frame between 0° and 5° | crash/fall_chasm_b |
| 655–796 | joint: footL swing | f698: 80° (limit 60°) | crash/fall_chasm_b |
| 655–796 | joint: footR swing | f699: 80° (limit 60°) | crash/fall_chasm_b |
| 685–694 | joint: shoulderL swing | f689: 43° (limit 40°) | crash/fall_chasm_b |
| 685–694 | joint: shoulderR swing | f689: 43° (limit 40°) | crash/fall_chasm_b |
| 714–731 | joint: shoulderL swing | f721: 49° (limit 40°) | crash/fall_chasm_b |
| 714–731 | joint: shoulderR swing | f721: 49° (limit 40°) | crash/fall_chasm_b |
| 744–796 | joint: shoulderL swing | f790: 59° (limit 40°) | crash/fall_chasm_b |
| 744–796 | joint: shoulderR swing | f790: 59° (limit 40°) | crash/fall_chasm_b |

![chasm1](sheet-chasm1.png)

## gate0

Timeline: 526–530 run/leap_gap · 531–563 run/run · 564–585 run/leap_gap · 586–796 crash/fall_gate

| frames | check | peak | clip at peak |
|---|---|---|---|
| 533 | judder: thighL judders in the gait | f533: J 0.39 (limit 0.35); worst frames f533 (19°), f540 (12°), f552 (11°), f551 (11°), f535 (8°), f534 (8°) | run/run |
| 540 | judder: footL judders in the gait | f540: J 0.88 (limit 0.35); worst frames f540 (41°), f539 (32°), f553 (28°), f552 (25°), f538 (23°), f537 (21°) | run/run |
| 546 | judder: toeR judders in the gait | f546: J 1.00 (limit 0.35); worst frames f546 (44°), f533 (42°), f547 (40°), f548 (33°), f534 (31°), f535 (28°) | run/run |
| 550 | judder: shinL judders in the gait | f550: J 0.53 (limit 0.35); worst frames f550 (25°), f551 (23°), f554 (19°), f555 (18°), f537 (16°), f558 (14°) | run/run |
| 553 | judder: toeL judders in the gait | f553: J 0.84 (limit 0.35); worst frames f553 (39°), f554 (29°), f555 (27°), f552 (21°), f540 (17°), f542 (14°) | run/run |
| 560 | judder: thighR judders in the gait | f560: J 0.49 (limit 0.35); worst frames f560 (18°), f547 (17°), f544 (14°), f561 (14°), f548 (11°), f557 (11°) | run/run |
| 560 | judder: footR judders in the gait | f560: J 0.52 (limit 0.35); worst frames f560 (36°), f561 (26°), f533 (24°), f559 (19°), f548 (16°), f547 (15°) | run/run |
| 565 | slide: footL slides | f565: 4.0 cm/frame while planted | run/leap_gap |
| 570 | pop: hips jump | f570: 13 cm/frame² relative to the ground | run/leap_gap |
| 586 | pop: hips jump | f586: 10 cm/frame² relative to the ground | crash/fall_gate |
| 586 | camera: position jerk | f586: 47 cm/frame² | crash/fall_gate |
| 605 | camera: snap | f605: angular velocity 0.4 → 6.6°/frame | crash/fall_gate |
| 618 | camera: position jerk | f618: 27 cm/frame² | crash/fall_gate |
| 630 | pop: handL jumps | f630: 13 cm in one frame between 4 and 3 cm | crash/fall_gate |
| 630 | pop: handR jumps | f630: 14 cm in one frame between 4 and 3 cm | crash/fall_gate |
| 640 | camera: position jerk | f640: 27 cm/frame² | crash/fall_gate |
| 660 | pop: handL jumps | f660: 7 cm in one frame between 1 and 0 cm | crash/fall_gate |
| 660 | pop: handR jumps | f660: 7 cm in one frame between 1 and 1 cm | crash/fall_gate |
| 660 | pop: head jumps | f660: 5 cm in one frame between 0 and 1 cm | crash/fall_gate |
| 673–796 | frozen: airborne, limbs still | f690: 0.18°/frame mean limb motion, 21 frames in the air | crash/fall_gate |
| 788–792 | joint: shoulderL swing | f790: 41° (limit 40°) | crash/fall_gate |

![gate0](sheet-gate0.png)

## gate1

Timeline: 526–530 run/leap_gap · 531–563 run/run · 564–585 run/leap_gap · 586–796 crash/fall_gate_b

| frames | check | peak | clip at peak |
|---|---|---|---|
| 533 | judder: thighL judders in the gait | f533: J 0.39 (limit 0.35); worst frames f533 (19°), f540 (12°), f552 (11°), f551 (11°), f535 (8°), f534 (8°) | run/run |
| 540 | judder: footL judders in the gait | f540: J 0.88 (limit 0.35); worst frames f540 (41°), f539 (32°), f553 (28°), f552 (25°), f538 (23°), f537 (21°) | run/run |
| 546 | judder: toeR judders in the gait | f546: J 1.00 (limit 0.35); worst frames f546 (44°), f533 (42°), f547 (40°), f548 (33°), f534 (31°), f535 (28°) | run/run |
| 550 | judder: shinL judders in the gait | f550: J 0.53 (limit 0.35); worst frames f550 (25°), f551 (23°), f554 (19°), f555 (18°), f537 (16°), f558 (14°) | run/run |
| 553 | judder: toeL judders in the gait | f553: J 0.84 (limit 0.35); worst frames f553 (39°), f554 (29°), f555 (27°), f552 (21°), f540 (17°), f542 (14°) | run/run |
| 560 | judder: thighR judders in the gait | f560: J 0.49 (limit 0.35); worst frames f560 (18°), f547 (17°), f544 (14°), f561 (14°), f548 (11°), f557 (11°) | run/run |
| 560 | judder: footR judders in the gait | f560: J 0.52 (limit 0.35); worst frames f560 (36°), f561 (26°), f533 (24°), f559 (19°), f548 (16°), f547 (15°) | run/run |
| 565 | slide: footL slides | f565: 4.0 cm/frame while planted | run/leap_gap |
| 570 | pop: hips jump | f570: 13 cm/frame² relative to the ground | run/leap_gap |
| 586 | pop: hips jump | f586: 10 cm/frame² relative to the ground | crash/fall_gate_b |
| 586 | camera: position jerk | f586: 46 cm/frame² | crash/fall_gate_b |
| 605–606 | camera: snap | f605: angular velocity 0.1 → 6.7°/frame | crash/fall_gate_b |
| 618 | camera: position jerk | f618: 26 cm/frame² | crash/fall_gate_b |
| 629–796 | joint: footR swing | f794: 63° (limit 60°) | crash/fall_gate_b |
| 638–640 | camera: position jerk | f638: 36 cm/frame² | crash/fall_gate_b |
| 687–691 | joint: shoulderL swing | f689: 41° (limit 40°) | crash/fall_gate_b |
| 715–729 | joint: shoulderL swing | f721: 46° (limit 40°) | crash/fall_gate_b |
| 745–769 | joint: shoulderL swing | f755: 52° (limit 40°) | crash/fall_gate_b |
| 775–796 | joint: shoulderL swing | f790: 57° (limit 40°) | crash/fall_gate_b |

![gate1](sheet-gate1.png)

## rock0

Timeline: 526–530 run/leap_gap · 531–563 run/run · 564–585 run/leap_gap · 586–796 crash/fall_rock

| frames | check | peak | clip at peak |
|---|---|---|---|
| 533 | judder: thighL judders in the gait | f533: J 0.39 (limit 0.35); worst frames f533 (19°), f540 (12°), f552 (11°), f551 (11°), f535 (8°), f534 (8°) | run/run |
| 540 | judder: footL judders in the gait | f540: J 0.88 (limit 0.35); worst frames f540 (41°), f539 (32°), f553 (28°), f552 (25°), f538 (23°), f537 (21°) | run/run |
| 546 | judder: toeR judders in the gait | f546: J 1.00 (limit 0.35); worst frames f546 (44°), f533 (42°), f547 (40°), f548 (33°), f534 (31°), f535 (28°) | run/run |
| 550 | judder: shinL judders in the gait | f550: J 0.53 (limit 0.35); worst frames f550 (25°), f551 (23°), f554 (19°), f555 (18°), f537 (16°), f558 (14°) | run/run |
| 553 | judder: toeL judders in the gait | f553: J 0.84 (limit 0.35); worst frames f553 (39°), f554 (29°), f555 (27°), f552 (21°), f540 (17°), f542 (14°) | run/run |
| 560 | judder: thighR judders in the gait | f560: J 0.49 (limit 0.35); worst frames f560 (18°), f547 (17°), f544 (14°), f561 (14°), f548 (11°), f557 (11°) | run/run |
| 560 | judder: footR judders in the gait | f560: J 0.52 (limit 0.35); worst frames f560 (36°), f561 (26°), f533 (24°), f559 (19°), f548 (16°), f547 (15°) | run/run |
| 565 | slide: footL slides | f565: 4.0 cm/frame while planted | run/leap_gap |
| 570 | pop: hips jump | f570: 13 cm/frame² relative to the ground | run/leap_gap |
| 586 | pop: hips jump | f586: 10 cm/frame² relative to the ground | crash/fall_rock |
| 586 | camera: position jerk | f586: 40 cm/frame² | crash/fall_rock |
| 608–610 | frozen: airborne, limbs still | f608: 0.84°/frame mean limb motion, 4 frames in the air | crash/fall_rock |
| 640–641 | camera: position jerk | f640: 33 cm/frame² | crash/fall_rock |
| 649 | camera: position jerk | f649: 34 cm/frame² | crash/fall_rock |
| 658 | camera: position jerk | f658: 27 cm/frame² | crash/fall_rock |
| 666 | camera: position jerk | f666: 31 cm/frame² | crash/fall_rock |
| 684 | camera: position jerk | f684: 27 cm/frame² | crash/fall_rock |

![rock0](sheet-rock0.png)

## rock1

Timeline: 526–530 run/leap_gap · 531–563 run/run · 564–585 run/leap_gap · 586–796 crash/fall_rock_b

| frames | check | peak | clip at peak |
|---|---|---|---|
| 533 | judder: thighL judders in the gait | f533: J 0.39 (limit 0.35); worst frames f533 (19°), f540 (12°), f552 (11°), f551 (11°), f535 (8°), f534 (8°) | run/run |
| 540 | judder: footL judders in the gait | f540: J 0.88 (limit 0.35); worst frames f540 (41°), f539 (32°), f553 (28°), f552 (25°), f538 (23°), f537 (21°) | run/run |
| 546 | judder: toeR judders in the gait | f546: J 1.00 (limit 0.35); worst frames f546 (44°), f533 (42°), f547 (40°), f548 (33°), f534 (31°), f535 (28°) | run/run |
| 550 | judder: shinL judders in the gait | f550: J 0.53 (limit 0.35); worst frames f550 (25°), f551 (23°), f554 (19°), f555 (18°), f537 (16°), f558 (14°) | run/run |
| 553 | judder: toeL judders in the gait | f553: J 0.84 (limit 0.35); worst frames f553 (39°), f554 (29°), f555 (27°), f552 (21°), f540 (17°), f542 (14°) | run/run |
| 560 | judder: thighR judders in the gait | f560: J 0.49 (limit 0.35); worst frames f560 (18°), f547 (17°), f544 (14°), f561 (14°), f548 (11°), f557 (11°) | run/run |
| 560 | judder: footR judders in the gait | f560: J 0.52 (limit 0.35); worst frames f560 (36°), f561 (26°), f533 (24°), f559 (19°), f548 (16°), f547 (15°) | run/run |
| 565 | slide: footL slides | f565: 4.0 cm/frame while planted | run/leap_gap |
| 570 | pop: hips jump | f570: 13 cm/frame² relative to the ground | run/leap_gap |
| 586–587 | pop: hips jump | f587: 10 cm/frame² relative to the ground | crash/fall_rock_b |
| 586 | camera: position jerk | f586: 40 cm/frame² | crash/fall_rock_b |
| 601 | camera: position jerk | f601: 27 cm/frame² | crash/fall_rock_b |
| 617 | pop: handR jumps | f617: 21 cm in one frame between 4 and 6 cm | crash/fall_rock_b |
| 622–688 | joint: footL swing | f635: 81° (limit 60°) | crash/fall_rock_b |
| 622–796 | joint: footR swing | f624: 76° (limit 60°) | crash/fall_rock_b |
| 641 | camera: position jerk | f641: 47 cm/frame² | crash/fall_rock_b |
| 649 | camera: position jerk | f649: 42 cm/frame² | crash/fall_rock_b |
| 666 | camera: position jerk | f666: 36 cm/frame² | crash/fall_rock_b |
| 675 | camera: position jerk | f675: 35 cm/frame² | crash/fall_rock_b |
| 685–693 | joint: shoulderL swing | f689: 43° (limit 40°) | crash/fall_rock_b |
| 714–731 | joint: shoulderL swing | f721: 48° (limit 40°) | crash/fall_rock_b |
| 744–796 | joint: shoulderL swing | f790: 59° (limit 40°) | crash/fall_rock_b |

![rock1](sheet-rock1.png)
