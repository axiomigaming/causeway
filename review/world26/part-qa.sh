#!/bin/sh
# Inside serve.sh: the QA re-hunt's shots on this tree (after) — the arcade on Low, the rockfall's end
# shot on Low (rock variant 1 at 8x, the rock that rested through him), the boulder on High.
cd "$(dirname "$0")/../.."
O=review/world26/qa
mkdir -p $O
URL=http://localhost:5196 node tools/same-frame.mjs --view phone --q low --w 7 --at run:12.5 --out $O --name arcade-phone 2>&1 | tail -1
URL=http://localhost:5196 node tools/same-frame.mjs --view phone --q low --w 7 --at crash:rockfall:1:8:6.0 --out $O --name rockfall-end-phone 2>&1 | tail -1
URL=http://localhost:5196 node tools/same-frame.mjs --view desktop --q high --w 7 --at crash:rockfall:1:8:1.0 --out $O --name rockfall-desk 2>&1 | tail -1
URL=http://localhost:5196 node tools/same-frame.mjs --view desktop --q high --w 7 --at run:14.0 --out $O --name arcade-desk 2>&1 | tail -1
echo QADONE
