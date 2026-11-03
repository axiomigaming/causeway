#!/bin/sh
# Inside serve.sh: phone Low perf-run of this tree (5196) and its draw-call breakdown.
cd "$(dirname "$0")/../.."
URL=http://localhost:5196 node tools/perf-run.mjs --q low --w 390 --h 844 --dpr 2 2>&1 | tail -1 > review/world25/perf-low-after.log
sh review/world25/calls.sh 5196 after3 > review/world25/calls-after3.log
echo PERFLOWDONE
