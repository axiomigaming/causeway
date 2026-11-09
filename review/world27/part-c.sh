#!/bin/sh
# Inside serve.sh: perf before/after, then the 16-world High sheets (before 5195, after 5196).
cd "$(dirname "$0")/../.."
sh review/world26/perf.sh
mv review/world26/perf-low.log review/world27/perf-low.log
mv review/world26/perf-high.log review/world27/perf-high.log
sh review/world24/sheet.sh a27 5195 "" high
sh review/world24/sheet.sh b27 5196 "" high
echo PARTC
