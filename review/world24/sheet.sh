#!/bin/sh
# Contact sheet captures (resumable): sh review/world24/sheet.sh <prefix> <port> [seeds] [tiers]
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
P=${1:-a}
PORT=${2:-5194}
SEEDS=${3:-"3 7 11 19 23 31 42 58 64 77 83 97 105 118 126 141"}
TIERS=${4:-"high low"}
mkdir -p review/world24/frames
for q in $TIERS; do
  for w in $SEEDS; do
    f="review/world24/frames/$P-$q-w$w"
    [ -f "$f-t55.png" ] && continue
    if [ "$q" = low ]; then W=390; H=844; D=2; else W=1280; H=720; D=1; fi
    DPR=$D node tools/shoot.mjs "http://localhost:$PORT/?qa&q=$q&w=$w" "$f" $W $H ../review/world24/run3.mjs 2>&1 | grep -E "STATE|FAILED|pageerror" | sed "s/^/$q w$w /" | cut -c1-260
  done
done
echo ALLDONE
