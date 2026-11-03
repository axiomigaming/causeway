#!/bin/sh
# Draw-call breakdown of the phone Low perf run, on a port (inside serve.sh): sh review/world25/calls.sh <port> <tag>
cd "$(dirname "$0")/../.."
mkdir -p review/world25/frames
DPR=2 node tools/shoot.mjs "http://localhost:$1/?qa&q=low&seed=perf&over=${OVER:-80}" "review/world25/frames/calls-$2" 390 844 ../review/world25/calls.mjs 2>&1 | grep -E "CALLS|FRAME|FAILED" | sed "s/^/$2 /"
