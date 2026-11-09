#!/bin/sh
# World round 26: before (b82421e on 5195) and after (this tree on 5196) side views of the way's
# supports, one browser at a time. Waits for the first before batch (a-side.log) to end.
cd "$(dirname "$0")/../.."
until grep -q SERVEDONE review/world26/a-side.log; do sleep 15; done
export BASE=/tmp/claude-0/-home-user-branchfall/8bad0aba-7915-5210-bf1b-c2375b4d19f3/scratchpad/base26
sh review/world25/serve.sh sh -c '
  sh review/world26/side.sh a 5195 high 23:11.7,21.3,51.4 3:23,31,79.5
  sh review/world26/side.sh b 5196 high 7:2.5 31:2.5 105:4 83:2.5 11:13 118:2.5 42:27.5 23:11.7,21.3,51.4 3:23,31,79.5
'
echo QUEUEDONE
