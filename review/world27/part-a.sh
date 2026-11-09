#!/bin/sh
# Inside serve.sh: round 27's before captures (7011da2 on 5195): the look views, the phone openings,
# then the 16-world sheets (High, then Low).
cd "$(dirname "$0")/../.."
sh review/world27/look.sh a
sh review/world27/openings.sh a
sh review/world24/sheet.sh a27 5195 "" high
sh review/world24/sheet.sh a27 5195 "" low
echo PARTA
