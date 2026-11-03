#!/bin/sh
# Final captures with their own servers (a container restart or a killed task took the servers down
# twice): the frozen baseline build on 5195 (BASE=<its dir>), this tree's dist on 5196.
#   BASE=<baseline tree> sh review/world24/final.sh
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
(cd "$BASE" && exec npx vite preview --port 5195 --strictPort --host 127.0.0.1) > /dev/null 2>&1 &
A=$!
npx vite preview --port 5196 --strictPort --host 127.0.0.1 > /dev/null 2>&1 &
B=$!
sleep 6
shot() { # prefix port name query
  f="review/world24/frames/$1-$3"
  [ -f "$f.png" ] && return
  DPR=1 node tools/shoot.mjs "http://localhost:$2/?qa&q=high&$4" "$f" 1280 720 ../review/world24/proof.mjs 2>&1 | grep -E "STATE|SIDE|FAILED" | sed "s/^/$1 $3 /" | cut -c1-200
}
for p in "pa 5195" "pb 5196"; do
  set -- $p
  shot $1 $2 ravine "w=7&look=golden&sec=ravine,ravine,ravine&t=26&side=-1"
done
sh review/world24/sheet.sh b 5196
sh review/world24/near.sh b 5196
kill $A $B
echo FINALDONE
