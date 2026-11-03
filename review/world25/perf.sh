#!/bin/sh
# Inside serve.sh: perf-run before (5195) / after (5196) on phone Low and desktop High, then the after
# phone Low draw-call breakdown.
cd "$(dirname "$0")/../.."
for u in 5195 5196; do URL=http://localhost:$u node tools/perf-run.mjs --q low --w 390 --h 844 --dpr 2 2>&1 | tail -1; done > review/world25/perf-low.log
sh review/world25/calls.sh 5196 after2 > review/world25/calls-after.log
for u in 5195 5196; do URL=http://localhost:$u node tools/perf-run.mjs --q high --w 1280 --h 720 --dpr 1 2>&1 | tail -1; done > review/world25/perf-high.log
echo PERFDONE
