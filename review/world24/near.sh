#!/bin/sh
# Near-side close-ups (resumable): sh review/world24/near.sh <prefix> <port> [seeds]
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
P=${1:-a}
PORT=${2:-5194}
SEEDS=${3:-"3 23 64 105"}
mkdir -p review/world24/frames
for w in $SEEDS; do
  f="review/world24/frames/$P-near-w$w"
  [ -f "$f-t30-R.png" ] && continue
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=high&w=$w&ts=8,30" "$f" 1280 720 ../review/world24/near.mjs 2>&1 | grep -E "STATE|FAILED|pageerror" | sed "s/^/near w$w /" | cut -c1-300
done
echo ALLDONE
