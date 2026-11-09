#!/bin/sh
# Inside serve.sh: same-frame before (5195, b82421e) / after (5196) stills of the hunt's shots (world 7,
# as tools/premium-hunt.mjs stages them). Frames in review/world26/proofs/<shot>-{a,b}.png.
#   sh review/world26/proofs.sh [a|b|"a b"]
cd "$(dirname "$0")/../.."
PS=${1:-"a b"}
O=review/world26/proofs
mkdir -p $O
shot() { # name view q at
  for p in $PS; do
    port=5195; [ $p = b ] && port=5196
    [ -f "$O/$1-$p.png" ] && continue
    URL=http://localhost:$port node tools/same-frame.mjs --view $2 --q $3 --w 7 --at "$4" --out $O --name "$1-$p" 2>&1 | tail -1 | cut -c1-200
  done
}
shot title desktop high title:3.0
shot beam desktop high run:8.0
shot near desktop high run:3.5
shot arcade desktop high run:14.0
shot arcade-phone phone low run:14.5
shot boulder desktop high run:22.0
shot ledge-phone phone low crash:ledge:0:5:2.5
shot cliff desktop high cash:30.02:1.0
shot rockfall desktop high crash:rockfall:1:8:1.0
echo PROOFSDONE
