#!/bin/sh
# World round 27's before/after sheets from review/world27/frames (look views, phone openings, 1x leaves:
# their "before" is this build with 7011da2's kit, part-leaf.sh)
# and review/world24/frames (the 16-world High and phone Low sheets, when captured).
cd "$(dirname "$0")/../.."
for v in H E F; do
  python3 review/world27/pairs.py look-$v-high-before-after --cols 2 \
    high-w7-t4-$v high-w7-t30-$v high-w23-t4-$v high-w23-t30-$v high-w64-t4-$v high-w64-t30-$v \
    high-w105-t4-$v high-w105-t30-$v high-w141-t4-$v high-w141-t30-$v
done
OPEN=""
for w in 3 7 11 19 23 31 42 58 64 77 83 97 105 118 126 141; do OPEN="$OPEN open-w$w-t5"; done
python3 review/world27/pairs.py openings-phone-t5-before-after --cell 200x433 --cols 4 $OPEN
OPEN=""
for w in 3 7 11 19 23 31 42 58 64 77 83 97 105 118 126 141; do OPEN="$OPEN open-w$w-t8"; done
python3 review/world27/pairs.py openings-phone-t8-before-after --cell 200x433 --cols 4 $OPEN
python3 review/world27/pairs.py leaf1x-phone-before-after --before "7011da2's leaf atlas" --cell 390x844 --cols 3 \
  leaf1x-w7-t4 leaf1x-w23-t4 leaf1x-w77-t4 leaf1x-w7-t12 leaf1x-w23-t12 leaf1x-w77-t12 leaf1x-w7-t25 leaf1x-w23-t25 leaf1x-w77-t25
python3 review/world27/pairs.py leaf1x-zoom-w23-palm --before "7011da2's leaf atlas (3x)" --cell 900x600 --zoom 90,0,390,200,3 leaf1x-w23-t25
python3 review/world27/pairs.py leaf1x-zoom-w77-palm --before "7011da2's leaf atlas (3x)" --cell 480x600 --zoom 0,140,160,340,3 leaf1x-w77-t4
python3 review/world27/pairs.py leaf1x-zoom-w7-canopy --before "7011da2's leaf atlas (3x)" --cell 570x600 --zoom 200,60,390,260,3 leaf1x-w7-t4
if [ -f review/world24/frames/b27-high-w141-t55.png ]; then
  python3 review/world24/montage.py --pair a27 b27 high review/world27/sheets/high-before-after.jpg
fi
if [ -f review/world24/frames/b27-low-w141-t55.png ]; then
  python3 review/world24/montage.py --pair a27 b27 low review/world27/sheets/phone-before-after.jpg
fi
echo SHEETSDONE
