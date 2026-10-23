#!/bin/sh
# Round 19 audit frames (resumable): sh review/world19/audit.sh <prefix> [port]
cd "$(dirname "$0")/../.."
P=${1:-a}
PORT=${2:-5196}
U="http://localhost:$PORT/?qa&q=high"
su() {
  [ -f "review/world19/$P-$1.png" ] && return
  DPR=1 node tools/shoot.mjs "$U&$2" "review/world19/$P-$1" 1280 720 ../review/world19/setup.mjs 2>&1 | grep -E "STATE|FAILED" | sed "s/^/$1 /" | cut -c1-220
}
run() {
  [ -f "review/world19/$P-$1.png" ] && return
  DPR=1 node tools/shoot.mjs "$U&$2" "review/world19/$P-$1" 1280 720 ../review/world5/shoot-sec.mjs 2>&1 | grep -E "STATE|FAILED" | sed "s/^/$1 /" | cut -c1-220
}
su setup-w7 "w=7"
su setup-w11 "w=11&look=golden"
su setup-w19 "w=19&look=golden"
run run-w7 "w=7&adv=60&t=3"
run morning-w7 "w=7&look=morning&adv=20&t=3"
run morning-falls "w=3&look=morning&sec=cliff,cliff,corridor&adv=4&t=3"
[ -f "review/world19/$P-approach-w7.png" ] || DPR=1 node tools/shoot.mjs "$U&w=7&off=40" "review/world19/$P-approach-w7" 1280 720 ../review/world13/reveal.mjs 2>&1 | grep -E "STATE|FAILED" | cut -c1-160
echo ALLDONE
