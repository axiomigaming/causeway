#!/bin/sh
# Inside serve.sh: the final same-frame proofs of the glyphs and the title (before and after), and the
# w7 gate's hanging roots at t=25 (before and after).
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
O=review/world26/proofs
mkdir -p $O
for p in a b; do
  port=5195; [ $p = b ] && port=5196
  for spec in "beam desktop high run:8.0" "rockfall desktop high crash:rockfall:1:8:1.0" "title desktop high title:3.0"; do
    set -- $spec
    URL=http://localhost:$port node tools/same-frame.mjs --view $2 --q $3 --w 7 --at "$4" --out $O --name "$1-$p" 2>&1 | tail -1 | cut -c1-200
  done
  DPR=1 node tools/shoot.mjs "http://localhost:$port/?qa&q=high&w=7&ts=25" "$O/roots-$p" 1280 720 ../review/world24/run3.mjs 2>&1 | grep -E "STATE|FAILED" | cut -c1-160
done
echo PROOFSDONE
