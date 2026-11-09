#!/bin/sh
# Inside serve.sh: the title, staged as the hunt stages it, at 3 s and 6 s, desktop High and phone Low,
# before (5195, b82421e) and after (5196). Stills in review/world26/title/.
cd "$(dirname "$0")/../.."
O=review/world26/title
mkdir -p $O
for p in b a; do
  port=5196; [ $p = a ] && port=5195
  for t in 3.0 6.0; do
    URL=http://localhost:$port node tools/same-frame.mjs --view desktop --q high --w 7 --at title:$t --out $O --name "desk-$t-$p" 2>&1 | tail -2 | cut -c1-300
    URL=http://localhost:$port node tools/same-frame.mjs --view phone --q low --w 7 --at title:$t --dpr 3 --out $O --name "phone-$t-$p" 2>&1 | tail -2 | cut -c1-300
  done
done
echo TITLEDONE
