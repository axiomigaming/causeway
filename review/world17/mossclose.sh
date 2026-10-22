#!/bin/sh
# Moss close-ups (resumable): sh review/world17/mossclose.sh <prefix> <port> <mesh prefix>
cd "$(dirname "$0")/../.."
P=${1:-a}
PORT=${2:-5196}
M=${3:-moss|}
for sec in ruins roots; do
  [ -f "review/world17/$P-mossclose-$sec.png" ] && continue
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&look=golden&drive=0&q=high&w=3&sec=$sec,$sec,corridor&adv=4&t=3&mesh=$M&d=1.5" "review/world17/$P-mossclose-$sec" 960 540 ../review/world17/moss.mjs 2>&1 | grep -E "STATE|FAILED" | cut -c1-200
done
echo ALLDONE
