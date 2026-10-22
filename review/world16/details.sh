#!/bin/sh
# Round 16 small-details pass (resumable): sh review/world16/details.sh desk|phone [prefix] [port]
# Five worlds at 100% near the path (desktop High) and on phone Low; STATE lines carry calls/tris.
cd "$(dirname "$0")/../.."
S=../review/world5/shoot-sec.mjs
P=${2:-d}
PORT=${3:-5196}
shot() {
  [ -f "review/world16/$1.png" ] && return
  DPR=${5:-1} node tools/shoot.mjs "$2" "review/world16/$1" "$3" "$4" $S 2>&1 | grep -E "STATE|FAILED" | sed "s/^/$1 /" | cut -c1-200
}
U="http://localhost:$PORT/?qa&look=golden&drive=0"
case "${1:-desk}" in
desk) for w in 7 19 42 58 83; do shot "$P-desk-w$w" "$U&q=high&w=$w&adv=40&t=3" 1280 720; done ;;
phone) for w in 7 19 42 58 83; do shot "$P-phone-w$w" "$U&q=low&w=$w&adv=40&t=3" 390 844 2; done ;;
esac
echo ALLDONE
