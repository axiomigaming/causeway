#!/bin/sh
# Round 17 near detail (resumable): sh review/world17/near.sh <prefix> [port]
# The roots section (buttress roots) and moss cushions close to the lens.
cd "$(dirname "$0")/../.."
P=${1:-a}
PORT=${2:-5196}
S=../review/world5/shoot-sec.mjs
shot() {
  [ -f "review/world17/$P-$1.png" ] && return
  DPR=1 node tools/shoot.mjs "$2" "review/world17/$P-$1" 1280 720 $S 2>&1 | grep -E "STATE|FAILED" | sed "s/^/$1 /" | cut -c1-200
}
U="http://localhost:$PORT/?qa&look=golden&drive=0&q=high&w=3"
shot roots "$U&sec=roots,roots,corridor&adv=6&t=3"
shot roots2 "$U&sec=roots,roots,corridor&adv=12&t=3"
shot moss "$U&sec=ruins,ruins,corridor&adv=4&t=3"
echo ALLDONE
