#!/bin/sh
# What the way stands on (resumable): sh review/world26/side.sh <prefix> <port> <tier> <w:ts[:side]>...
#   e.g. sh review/world26/side.sh b 5196 high 7:2.5 83:2.5 141:15:-1
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
P=$1; PORT=$2; Q=$3; shift 3
mkdir -p review/world26/frames
W=1280; H=720
[ "$Q" = low ] && W=390 && H=844
for spec in "$@"; do
  w=${spec%%:*}; rest=${spec#*:}; ts=${rest%%:*}; side=1
  [ "$rest" != "$ts" ] && side=${rest#*:}
  f="review/world26/frames/$P-$Q-w$w"
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=$Q&w=$w&ts=$ts&side=$side" "$f" $W $H ../review/world26/side.mjs 2>&1 | grep -E "STATE|FAILED|pageerror" | sed "s/^/side w$w /" | cut -c1-300
done
echo ALLDONE
