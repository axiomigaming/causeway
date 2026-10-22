#!/bin/sh
# Result shots looking back at the causeway's start (resumable): sh review/world16/back.sh <prefix> <port>
cd "$(dirname "$0")/../.."
P=${1:-b}
PORT=${2:-5197}
for t in 2 9; do
  [ -f "review/world16/$P-back-t$t.png" ] && continue
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=high&look=golden&drive=0&t=$t&after=3.5&w=5" "review/world16/$P-back-t$t" 960 540 ../review/world10/crash.mjs 2>&1 | grep -E "STATE|FAILED" | cut -c1-200
done
echo ALLDONE
