#!/bin/sh
# Lagoon close-ups (resumable): sh review/world20/lagoon.sh <prefix> <port>
cd "$(dirname "$0")/../.."
P=${1:-a}
PORT=${2:-5196}
U="http://localhost:$PORT/?qa&q=high&look=golden&drive=0&w=3&t=3"
shot() {
  [ -f "review/world20/$P-$1.png" ] && return
  DPR=1 node tools/shoot.mjs "$U&$2" "review/world20/$P-$1" 1280 720 ../review/world20/lagoon.mjs 2>&1 | grep -E "STATE|FAILED" | sed "s/^/$1 /" | cut -c1-200
}
shot stepping-r "sec=stepping,stepping,stepping&adv=4&side=1"
shot stepping-l "sec=stepping,stepping,stepping&adv=4&side=-1"
shot approach-r "sec=approach,approach,approach&adv=4&side=1"
shot ruins-r "sec=ruins,ruins,ruins&adv=4&side=1&h=3.2"
echo ALLDONE
