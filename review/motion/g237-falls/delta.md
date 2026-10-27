# Motion audit delta — review/motion/g237-falls vs review/motion/run-b5f0d5c/flags.json

New flags: 17. Gone: 59.

## New

| sequence | frames | check | peak |
|---|---|---|---|
| pillar0 | 635–635 | pop: hips jump | f635: 12 cm/frame² relative to the ground (crash/fall_pillar) |
| pillar0 | 641–642 | joint: footR swing | f642: 63° (limit 60°) (crash/fall_pillar) |
| pillar0 | 642–796 | joint: thighR twist | f648: 62° (limit 55°) (crash/fall_pillar) |
| trip0 | 541–541 | slide: footR slides | f541: 4.1 cm/frame while planted (run/run) |
| trip0 | 561–561 | slide: footL slides | f561: 3.0 cm/frame while planted (run/run) |
| trip0 | 581–581 | slide: footR slides | f581: 2.8 cm/frame while planted (run/run) |
| trip0 | 612–612 | pop: toeL snaps | f612: 34°/frame between 8° and 6° (crash/fall_trip) |
| trip0 | 613–613 | pop: footL snaps | f613: 38°/frame between 4° and 3° (crash/fall_trip) |
| trip0 | 645–645 | pop: head jumps | f645: 18 cm in one frame between 5 and 2 cm (crash/fall_trip) |
| trip0 | 795–796 | joint: neck swing | f796: 55° (limit 50°) (crash/fall_trip) |
| rock2 | 541–541 | slide: footR slides | f541: 4.1 cm/frame while planted (run/run) |
| rock2 | 581–581 | slide: footR slides | f581: 2.8 cm/frame while planted (run/run) |
| rock2 | 618–618 | pop: hips jump | f618: 10 cm/frame² relative to the ground (crash/fall_side_hit) |
| chasm0 | 687–688 | joint: upper_armR twist | f687: 116° (limit 110°) (crash/fall_chasm) |
| chasm0 | 740–740 | joint: upper_armR twist | f740: 113° (limit 110°) (crash/fall_chasm) |
| chasm1 | 541–541 | slide: footR slides | f541: 4.1 cm/frame while planted (run/run) |
| chasm1 | 581–581 | slide: footR slides | f581: 2.8 cm/frame while planted (run/run) |

## Gone

| sequence | frames | check | peak |
|---|---|---|---|
| chasm0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 |
| chasm0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 |
| chasm0 | 649–649 | joint: upper_armL twist | f649: -117° (limit 110°) |
| chasm0 | 652–652 | pop: neck snaps | f652: 27°/frame between 2° and 5° |
| chasm0 | 652–652 | pop: head snaps | f652: 41°/frame between 1° and 8° |
| chasm0 | 656–660 | joint: head swing | f658: 56° (limit 55°) |
| chasm0 | 661–661 | joint: upper_armR twist | f661: 110° (limit 110°) |
| chasm0 | 663–670 | joint: neck swing | f666: 53° (limit 50°) |
| chasm0 | 667–674 | joint: head swing | f671: 60° (limit 55°) |
| chasm0 | 675–675 | joint: upper_armL twist | f675: -121° (limit 110°) |
| chasm0 | 681–691 | joint: head swing | f688: 72° (limit 55°) |
| chasm0 | 686–713 | joint: neck swing | f707: 86° (limit 50°) |
| chasm0 | 694–796 | joint: head swing | f701: 110° (limit 55°) |
| chasm0 | 695–695 | joint: upper_armL swing | f695: 180° (limit 178°) |
| chasm0 | 722–782 | joint: neck swing | f765: 87° (limit 50°) |
| chasm0 | 741–741 | joint: upper_armL twist | f741: 119° (limit 110°) |
| chasm0 | 780–780 | joint: upper_armL swing | f780: 178° (limit 178°) |
| chasm0 | 787–796 | joint: neck swing | f793: 63° (limit 50°) |
| chasm1 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 |
| chasm1 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 |
| chasm1 | 616–644 | joint: footL swing | f629: 163° (limit 60°) |
| chasm1 | 645–645 | pop: footL flips | f645: 142°/frame |
| chasm1 | 645–645 | pop: footL jumps | f645: 10 cm in one frame between 0 and 3 cm |
| chasm1 | 783–787 | joint: neck swing | f785: 51° (limit 50°) |
| rock2 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 |
| rock2 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 |
| rock2 | 610–610 | pop: shinR snaps | f610: 33°/frame between 10° and 1° |
| rock2 | 690–796 | joint: head swing | f785: 90° (limit 55°) |
| rock2 | 692–692 | joint: neck swing | f692: 50° (limit 50°) |
| rock2 | 709–729 | joint: neck swing | f718: 68° (limit 50°) |
| rock2 | 738–796 | joint: neck swing | f785: 86° (limit 50°) |
| pillar0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 |
| pillar0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 |
| pillar0 | 639–639 | pop: hips jump | f639: 12 cm/frame² relative to the ground |
| trip0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 |
| trip0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 |
| trip0 | 607–607 | pop: toeL snaps | f607: 42°/frame between 9° and 0° |
| trip0 | 607–607 | pop: handL jumps | f607: 10 cm in one frame between 2 and 3 cm |
| trip0 | 621–621 | pop: shinL snaps | f621: 27°/frame between 4° and 2° |
| trip0 | 646–646 | pop: neck snaps | f646: 29°/frame between 7° and 4° |
| trip0 | 646–646 | pop: head snaps | f646: 43°/frame between 10° and 5° |
| trip0 | 651–656 | joint: neck+head twist | f653: 108° (limit 100°) |
| trip0 | 676–692 | joint: neck+head twist | f684: 104° (limit 100°) |
| trip0 | 697–796 | joint: neck+head twist | f718: 144° (limit 100°) |
| trip0 | 702–724 | joint: neck twist | f718: 62° (limit 60°) |
| trip0 | 706–728 | joint: head twist | f719: 82° (limit 70°) |
| trip0 | 714–722 | joint: neck swing | f718: 54° (limit 50°) |
| trip0 | 730–741 | joint: neck twist | f733: 63° (limit 60°) |
| trip0 | 731–738 | joint: head swing | f734: 59° (limit 55°) |
| trip0 | 743–758 | joint: head twist | f751: 76° (limit 70°) |
| trip0 | 748–752 | joint: neck twist | f750: 60° (limit 60°) |
| trip0 | 760–796 | joint: neck twist | f795: 82° (limit 60°) |
| trip0 | 760–777 | joint: head swing | f770: 94° (limit 55°) |
| trip0 | 782–788 | joint: head twist | f785: 71° (limit 70°) |
| trip0 | 791–796 | joint: head swing | f796: 105° (limit 55°) |
| ledge0 | 568–568 | judder: toeR judders in the gait | f568: J 0.87 vs 0.75 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.12 (limit 0.1); worst frames f568, f569, f584, f556, f531, f555 |
| ledge0 | 575–575 | judder: toeL judders in the gait | f575: J 0.93 vs 0.76 for its own curve low-passed at 4× stride (2.50 Hz): excess 0.17 (limit 0.1); worst frames f575, f576, f536, f535, f551, f563 |
| ledge0 | 600–601 | joint: upper_armR twist | f601: 146° (limit 110°) |
| ledge0 | 607–607 | joint: upper_armR twist | f607: 114° (limit 110°) |