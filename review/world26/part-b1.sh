#!/bin/sh
# Inside serve.sh: phone Low perf (after, again), its call breakdown, then the after High sheets.
cd "$(dirname "$0")/../.."
URL=http://localhost:5196 node tools/perf-run.mjs --q low --w 390 --h 844 --dpr 2 2>&1 | tail -1 > review/world26/perf-low-after2.log
OVER=80 sh review/world25/calls.sh 5196 b26b > review/world26/calls-after2.log
sh review/world26/sheets.sh high-b
