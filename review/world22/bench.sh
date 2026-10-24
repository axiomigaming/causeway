#!/bin/sh
# Land sections' frame cost (resumable): sh review/world22/bench.sh <prefix> <port> [tiers]
cd "$(dirname "$0")/../.."
P=${1:-a}
PORT=${2:-5196}
TIERS=${3:-"low high"}
for q in $TIERS; do
  for t in forest forestWall cutting overgrown ravine corridor bridge; do
    f="review/world22/$P-$q-$t"
    [ -f "$f.png" ] && continue
    if [ "$q" = low ]; then W=390; H=844; D=2; else W=960; H=540; D=1; fi
    DPR=$D node tools/shoot.mjs "http://localhost:$PORT/?qa&q=$q&look=golden&drive=0&w=3&sec=$t,$t,$t,$t&adv=10&t=3" "$f" $W $H ../review/world22/cost.mjs 2>&1 | grep -E "STATE|COST|FAILED" | sed "s/^/$q $t /" | cut -c1-260
  done
done
echo ALLDONE
