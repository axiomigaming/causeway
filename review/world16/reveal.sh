#!/bin/sh
# Round 16 landmark reveals (resumable): sh review/world16/reveal.sh colossus|phone
cd "$(dirname "$0")/../.."
R=../review/world13/reveal.mjs
shot() {
  [ -f "review/world16/$1.png" ] && return
  DPR=${5:-1} node tools/shoot.mjs "$2" "review/world16/$1" "$3" "$4" $R 2>&1 | grep -E "STATE|FAILED" | cut -c1-120
}
U="http://localhost:${PORT:-5196}/?qa&look=golden&drive=0"
W() { case $1 in turquoise) echo 3 ;; jade) echo 14 ;; lagoon) echo 25 ;; dry) echo 36 ;; rainforest) echo 47 ;; esac; }
case "${1:-colossus}" in
colossus) for off in 55 40 25; do shot "rv-turquoise-$off" "$U&q=high&style=turquoise&w=3&off=$off" 1280 720; done ;;
phone) for st in turquoise jade lagoon dry rainforest; do shot "rv-phone-$st" "$U&q=low&style=$st&w=$(W $st)&off=40" 390 844 2; done ;;
esac
echo ALLDONE
