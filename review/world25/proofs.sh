#!/bin/sh
# World round 25: same-seed before (5195) / after (5196) stills of the round's items (resumable).
#   sh review/world25/proofs.sh   (inside serve.sh)
cd "$(dirname "$0")/../.."
mkdir -p review/world25/frames
shot() { # prefix port name query
  f="review/world25/frames/$1-$3"
  [ -f "$f.png" ] && return
  DPR=1 node tools/shoot.mjs "http://localhost:$2/?qa&q=high&$4" "$f" 1280 720 ../review/world24/proof.mjs 2>&1 | grep -E "STATE|SIDE|FAILED" | sed "s/^/$1 $3 /" | cut -c1-200
}
for p in "pa 5195" "pb 5196"; do
  set -- $p
  shot $1 $2 ravine "w=7&look=golden&sec=ravine,ravine,ravine&t=26"
  shot $1 $2 seam "w=23&look=golden&sec=overgrown,ravine,ravine&t=27&side=-1&ahead=12"
  shot $1 $2 open126 "w=126&t=3"
  shot $1 $2 open141 "w=141&t=3"
done
echo PROOFSDONE
