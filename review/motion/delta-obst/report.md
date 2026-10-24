# Motion audit — review/motion/delta-obst

World 7, quality high, 1280×720, 30 fps time-stepped. Frame numbers count from the sequence start (frame 0 = the world built, setup shot).
Each row is a run of consecutive flagged frames (same check); the peak frame and value are given. Sheets show the frame each new kind of flag was first seen.

| sequence | frames | judder | joint | slide | pop | frozen | framing | camera | staged |
|---|---|---|---|---|---|---|---|---|---|
| start | 0–228 | 8 | 0 | 2 | 3 | 0 | 0 | 0 |  |
| log | 78–363 | 7 | 0 | 3 | 2 | 0 | 0 | 0 | placed true, fired {"log":1} |
| beam | 78–363 | 8 | 0 | 1 | 2 | 0 | 0 | 0 | placed true, fired {"beam":1} |
| pillar | 78–363 | 8 | 4 | 1 | 3 | 0 | 0 | 0 | placed true, fired {"pillar":1} |
| blocks | 78–363 | 7 | 0 | 8 | 3 | 0 | 0 | 0 | placed true, fired {"blocks":1} |
| corner | 78–363 | 7 | 0 | 10 | 1 | 0 | 0 | 0 |  |

## start

Timeline: 0–44 setup/idle · 45–76 lead/ready · 77–107 run/start · 108–228 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 104 | pop: shinR snaps | f104: 27°/frame between 8° and 0° | run/start |
| 109 | slide: footL slides | f109: 6.2 cm/frame while planted | run/run |
| 111 | judder: thighL judders in the gait | f111: J 0.51 (limit 0.35); worst frames f111 (22°), f124 (19°), f214 (19°), f227 (19°), f137 (19°), f150 (17°) | run/run |
| 121 | slide: footL slides | f121: 3.7 cm/frame while planted | run/run |
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
| 97 | judder: thighL judders in the gait | f97: J 0.36 (limit 0.35); worst frames f97 (21°), f98 (17°), f265 (13°), f137 (12°), f238 (12°), f110 (12°) | run/run |
| 97 | judder: footL judders in the gait | f97: J 0.51 (limit 0.35); worst frames f97 (16°), f262 (12°), f134 (11°), f275 (10°), f249 (10°), f121 (10°) | run/run |
| 152 | slide: footR slides | f152: 3.9 cm/frame while planted | run/run |
| 166 | judder: footR judders in the gait | f166: J 0.44 (limit 0.35); worst frames f166 (11°), f325 (11°), f338 (10°), f103 (10°), f179 (9°), f153 (9°) | run/run |
| 214 | pop: hips jump | f214: 17 cm/frame² relative to the ground | run/jump_log |
| 229 | slide: footR slides | f229: 3.0 cm/frame while planted | run/jump_log |
| 233 | judder: shinL judders in the gait | f233: J 0.47 (limit 0.35); worst frames f233 (25°), f234 (25°), f247 (20°), f119 (20°), f149 (19°), f106 (19°) | run/run |
| 234 | judder: shinR judders in the gait | f234: J 0.48 (limit 0.35); worst frames f234 (30°), f164 (21°), f233 (21°), f181 (18°), f340 (18°), f151 (17°) | run/run |
| 264 | judder: toeL judders in the gait | f264: J 0.45 (limit 0.35); worst frames f264 (15°), f136 (15°), f277 (15°), f149 (14°), f251 (12°), f123 (12°) | run/run |
| 280 | slide: footR slides | f280: 4.0 cm/frame while planted | run/run |
| 290 | pop: hips jump | f290: 12 cm/frame² relative to the ground | run/slide |
| 327 | judder: toeR judders in the gait | f327: J 0.48 (limit 0.35); worst frames f327 (16°), f314 (15°), f168 (14°), f181 (14°), f340 (14°), f353 (12°) | run/run |

## beam

Timeline: 78–93 run/start · 94–221 run/run · 222–245 run/slide · 246–277 run/run · 278–301 run/slide · 302–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 97 | judder: thighL judders in the gait | f97: J 0.36 (limit 0.35); worst frames f97 (21°), f98 (17°), f137 (12°), f110 (12°), f200 (12°), f269 (12°) | run/run |
| 97 | judder: footL judders in the gait | f97: J 0.49 (limit 0.35); worst frames f97 (16°), f134 (11°), f121 (10°), f211 (10°), f147 (9°), f340 (9°) | run/run |
| 136 | judder: toeL judders in the gait | f136: J 0.43 (limit 0.35); worst frames f136 (15°), f149 (14°), f123 (12°), f213 (12°), f162 (11°), f109 (10°) | run/run |
| 152 | slide: footR slides | f152: 3.9 cm/frame while planted | run/run |
| 164 | judder: shinR judders in the gait | f164: J 0.50 (limit 0.35); worst frames f164 (21°), f181 (18°), f263 (18°), f315 (18°), f345 (18°), f151 (17°) | run/run |
| 166 | judder: footR judders in the gait | f166: J 0.47 (limit 0.35); worst frames f166 (11°), f317 (11°), f330 (11°), f343 (10°), f103 (10°), f179 (9°) | run/run |
| 169 | judder: thighR judders in the gait | f169: J 0.36 (limit 0.35); worst frames f169 (13°), f142 (12°), f103 (12°), f251 (12°), f129 (12°), f219 (12°) | run/run |
| 209 | judder: shinL judders in the gait | f209: J 0.46 (limit 0.35); worst frames f209 (20°), f119 (20°), f149 (19°), f106 (19°), f196 (18°), f265 (16°) | run/run |
| 226 | pop: hips jump | f226: 12 cm/frame² relative to the ground | run/slide |
| 250 | judder: toeR judders in the gait | f250: J 0.51 (limit 0.35); worst frames f250 (16°), f332 (15°), f319 (15°), f306 (15°), f168 (14°), f181 (14°) | run/run |
| 282 | pop: hips jump | f282: 12 cm/frame² relative to the ground | run/slide |

![beam](sheet-beam.png)

## pillar

Timeline: 78–93 run/start · 94–221 run/run · 222–244 run/vault · 245–289 run/run · 290–313 run/slide · 314–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 97 | judder: thighL judders in the gait | f97: J 0.36 (limit 0.35); worst frames f97 (21°), f98 (17°), f247 (13°), f137 (12°), f110 (12°), f200 (12°) | run/run |
| 97 | judder: footL judders in the gait | f97: J 0.48 (limit 0.35); worst frames f97 (16°), f134 (11°), f121 (10°), f211 (10°), f147 (9°), f247 (9°) | run/run |
| 136 | judder: toeL judders in the gait | f136: J 0.44 (limit 0.35); worst frames f136 (15°), f149 (14°), f255 (14°), f123 (12°), f213 (12°), f268 (11°) | run/run |
| 152 | slide: footR slides | f152: 3.9 cm/frame while planted | run/run |
| 164 | judder: shinR judders in the gait | f164: J 0.49 (limit 0.35); worst frames f164 (21°), f270 (21°), f181 (18°), f283 (18°), f344 (17°), f257 (17°) | run/run |
| 169 | judder: thighR judders in the gait | f169: J 0.37 (limit 0.35); worst frames f169 (13°), f275 (12°), f142 (12°), f103 (12°), f288 (12°), f129 (12°) | run/run |
| 209 | judder: shinL judders in the gait | f209: J 0.48 (limit 0.35); worst frames f209 (20°), f119 (20°), f255 (19°), f149 (19°), f106 (19°), f196 (18°) | run/run |
| 227 | pop: hips jump | f227: 11 cm/frame² relative to the ground | run/vault |
| 228–235 | joint: thighR twist | f230: 99° (limit 55°) | run/vault |
| 228 | pop: shinL snaps | f228: 69°/frame between 0° and 5° | run/vault |
| 229–230 | joint: thighL twist | f230: 82° (limit 55°) | run/vault |
| 231–234 | joint: thighL swing | f232: 148° (limit 135°) | run/vault |
| 231 | joint: footL swing | f231: 73° (limit 60°) | run/vault |
| 247 | judder: toeR judders in the gait | f247: J 0.51 (limit 0.35); worst frames f247 (16°), f318 (16°), f287 (15°), f331 (15°), f168 (14°), f181 (14°) | run/run |
| 272 | judder: footR judders in the gait | f272: J 0.49 (limit 0.35); worst frames f272 (12°), f166 (11°), f285 (11°), f329 (11°), f342 (10°), f103 (10°) | run/run |
| 294 | pop: hips jump | f294: 12 cm/frame² relative to the ground | run/slide |

![pillar](sheet-pillar.png)

## blocks

Timeline: 78–93 run/start · 94–208 run/run · 209–247 run/leap_gap · 248–279 run/run · 280–318 run/leap_gap · 319–350 run/run · 351–363 run/leap_gap

| frames | check | peak | clip at peak |
|---|---|---|---|
| 95 | slide: footL slides | f95: 7.5 cm/frame while planted | run/run |
| 97 | judder: footL judders in the gait | f97: J 0.49 (limit 0.35); worst frames f97 (16°), f134 (11°), f321 (11°), f250 (11°), f340 (10°), f121 (10°) | run/run |
| 107 | slide: footL slides | f107: 6.2 cm/frame while planted | run/run |
| 119 | judder: shinL judders in the gait | f119: J 0.49 (limit 0.35); worst frames f119 (20°), f149 (19°), f106 (19°), f258 (18°), f196 (18°), f342 (17°) | run/run |
| 120 | slide: footL slides | f120: 3.7 cm/frame while planted | run/run |
| 136 | judder: toeL judders in the gait | f136: J 0.48 (limit 0.35); worst frames f136 (15°), f329 (15°), f149 (14°), f258 (14°), f342 (13°), f123 (12°) | run/run |
| 152 | slide: footR slides | f152: 3.9 cm/frame while planted | run/run |
| 164 | judder: shinR judders in the gait | f164: J 0.46 (limit 0.35); worst frames f164 (21°), f273 (21°), f181 (18°), f260 (18°), f151 (17°), f344 (16°) | run/run |
| 215 | pop: hips jump | f215: 17 cm/frame² relative to the ground | run/leap_gap |
| 250 | judder: toeR judders in the gait | f250: J 0.49 (limit 0.35); worst frames f250 (16°), f321 (16°), f168 (14°), f181 (14°), f277 (14°), f155 (11°) | run/run |
| 251 | judder: thighR judders in the gait | f251: J 0.38 (limit 0.35); worst frames f251 (14°), f252 (14°), f323 (13°), f322 (13°), f169 (13°), f278 (12°) | run/run |
| 261 | slide: footR slides | f261: 6.4 cm/frame while planted | run/run |
| 275 | judder: footR judders in the gait | f275: J 0.48 (limit 0.35); worst frames f275 (12°), f166 (11°), f251 (11°), f322 (10°), f103 (10°), f179 (9°) | run/run |
| 281 | slide: footL slides | f281: 3.7 cm/frame while planted | run/leap_gap |
| 286 | pop: hips jump | f286: 16 cm/frame² relative to the ground | run/leap_gap |
| 345 | slide: footR slides | f345: 5.1 cm/frame while planted | run/run |
| 352 | slide: footL slides | f352: 3.4 cm/frame while planted | run/leap_gap |
| 357 | pop: hips jump | f357: 16 cm/frame² relative to the ground | run/leap_gap |

![blocks](sheet-blocks.png)

## corner

Timeline: 78–93 run/start · 94–285 run/run · 286–307 run/jump_log · 308–363 run/run

| frames | check | peak | clip at peak |
|---|---|---|---|
| 95 | slide: footL slides | f95: 7.5 cm/frame while planted | run/run |
| 97 | judder: thighL judders in the gait | f97: J 0.35 (limit 0.35); worst frames f97 (21°), f98 (17°), f227 (13°), f137 (12°), f110 (12°), f200 (12°) | run/run |
| 97 | judder: footL judders in the gait | f97: J 0.51 (limit 0.35); worst frames f97 (16°), f224 (12°), f134 (11°), f121 (10°), f211 (10°), f237 (9°) | run/run |
| 107 | slide: footL slides | f107: 6.2 cm/frame while planted | run/run |
| 120 | slide: footL slides | f120: 3.7 cm/frame while planted | run/run |
| 136 | judder: toeL judders in the gait | f136: J 0.45 (limit 0.35); worst frames f136 (15°), f226 (15°), f239 (14°), f149 (14°), f123 (12°), f213 (12°) | run/run |
| 152 | slide: footR slides | f152: 3.9 cm/frame while planted | run/run |
| 242 | slide: footR slides | f242: 2.9 cm/frame while planted | run/run |
| 256 | judder: footR judders in the gait | f256: J 0.44 (limit 0.35); worst frames f256 (12°), f166 (11°), f269 (10°), f103 (10°), f179 (9°), f153 (9°) | run/run |
| 271 | judder: toeR judders in the gait | f271: J 0.47 (limit 0.35); worst frames f271 (15°), f168 (14°), f258 (14°), f181 (14°), f284 (13°), f155 (11°) | run/run |
| 291 | pop: hips jump | f291: 16 cm/frame² relative to the ground | run/jump_log |
| 306 | slide: footR slides | f306: 3.0 cm/frame while planted | run/jump_log |
| 310 | judder: shinL judders in the gait | f310: J 0.47 (limit 0.35); worst frames f310 (25°), f311 (24°), f350 (20°), f209 (20°), f119 (20°), f149 (19°) | run/run |
| 311 | judder: shinR judders in the gait | f311: J 0.48 (limit 0.35); worst frames f311 (31°), f310 (21°), f254 (21°), f164 (21°), f181 (18°), f284 (18°) | run/run |
| 312 | slide: footL slides | f312: 7.2 cm/frame while planted | run/run |
| 325 | slide: footL slides | f325: 6.8 cm/frame while planted | run/run |
| 338 | slide: footL slides | f338: 5.9 cm/frame while planted | run/run |
| 351 | slide: footL slides | f351: 4.7 cm/frame while planted | run/run |

![corner](sheet-corner.png)
