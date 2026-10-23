#!/bin/sh
# 12 seeds at chase distance (resumable): sh review/world21/sheet.sh <prefix> <port> [adv]
cd "$(dirname "$0")/../.."
P=${1:-a}
PORT=${2:-5196}
ADV=${3:-150}
S=../review/world21/sides.mjs
for w in 3 7 11 19 23 31 42 58 64 77 83 97; do
  [ -f "review/world21/$P-w$w.png" ] && continue
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=high&w=$w&adv=$ADV&t=3" "review/world21/$P-w$w" 960 540 $S 2>&1 | grep -E "STATE|FAILED|SIDES" | sed "s/^/w$w /" | cut -c1-160
done
echo ALLDONE
