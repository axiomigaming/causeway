#!/bin/sh
# Inside serve.sh: round 27's after captures (this tree on 5196) and the 1x leaf pairs, then perf.
cd "$(dirname "$0")/../.."
sh review/world27/look.sh b
sh review/world27/openings.sh b
sh review/world27/leaf1x.sh
sh review/world26/perf.sh
mv review/world26/perf-low.log review/world27/perf-low.log
mv review/world26/perf-high.log review/world27/perf-high.log
sh review/world24/sheet.sh b27 5196 "" high
sh review/world24/sheet.sh b27 5196 "" low
echo PARTB
