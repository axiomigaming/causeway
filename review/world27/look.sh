#!/bin/sh
# Inside serve.sh: sky/distance, water's edge and near foliage views (look.mjs), resumable.
#   sh review/world27/look.sh <prefix a|b> [seeds] [tier]
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
P=$1; S=${2:-"7 23 64 105 141"}; Q=${3:-high}
PORT=5195; [ "$P" = b ] && PORT=5196
mkdir -p review/world27/frames
for w in $S; do
  f="review/world27/frames/$P-$Q-w$w"
  [ -f "$f-t30-F.png" ] && continue
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=$Q&w=$w&ts=4,30" "$f" 1280 720 ../review/world27/look.mjs 2>&1 | grep -E "STATE|FAILED|pageerror" | sed "s/^/look w$w /" | cut -c1-200
done
echo LOOKDONE
