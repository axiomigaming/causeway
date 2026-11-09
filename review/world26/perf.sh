#!/bin/sh
# Inside serve.sh: perf-run before (5195, b82421e) / after (5196) on phone Low and desktop High.
cd "$(dirname "$0")/../.."
for u in 5195 5196; do URL=http://localhost:$u node tools/perf-run.mjs --q low --w 390 --h 844 --dpr 2 2>&1 | tail -1; done > review/world26/perf-low.log
for u in 5195 5196; do URL=http://localhost:$u node tools/perf-run.mjs --q high --w 1280 --h 720 --dpr 1 2>&1 | tail -1; done > review/world26/perf-high.log
echo PERFDONE
