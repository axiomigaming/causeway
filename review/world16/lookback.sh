#!/bin/sh
# Looking back at the causeway's beginning (resumable): sh review/world16/lookback.sh <prefix> <port>
cd "$(dirname "$0")/../.."
P=${1:-b}
PORT=${2:-5197}
U="http://localhost:$PORT/?qa&q=high&look=golden&drive=0&w=5"
shot() {
  [ -f "review/world16/$P-$1.png" ] && return
  DPR=1 node tools/shoot.mjs "$U&$2" "review/world16/$P-$1" 960 540 ../review/world16/lookback.mjs 2>&1 | grep -E "STATE|FAILED" | cut -c1-200
}
shot lb-low "cam=1.5,2.2,-5&at=0,-0.5,20"
shot lb-wide "cam=-5,5,-12&at=1,-1,18"
echo ALLDONE
