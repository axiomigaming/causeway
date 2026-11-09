#!/bin/sh
# Inside serve.sh: phone Low at 1x device pixels (the canopies' cut-outs), before (5195) and after (5196).
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
mkdir -p review/world27/frames
for p in a b; do
  PORT=5195; [ $p = b ] && PORT=5196
  for w in 7 23 77; do
    f="review/world27/frames/$p-leaf1x-w$w"
    [ -f "$f-t25.png" ] && continue
    DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=low&w=$w&ts=4,12,25" "$f" 390 844 ../review/world24/run3.mjs 2>&1 | grep -E "STATE|FAILED|pageerror" | sed "s/^/leaf $p w$w /" | cut -c1-160
  done
done
echo LEAFDONE
