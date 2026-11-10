#!/bin/sh
# Inside serve.sh: the phone openings after (5196), perf before/after, then the 16-world High sheets (before 5195, after 5196).
cd "$(dirname "$0")/../.."
sh review/world27/openings.sh b
sh review/world27/perf.sh
sh review/world24/sheet.sh a27 5195 "" high
sh review/world24/sheet.sh b27 5196 "" high
echo PARTC
