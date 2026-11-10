#!/bin/sh
# Inside serve.sh: the 16 worlds' openings on a phone held upright (Low, 390x844), at 5 s and 8 s of run.
#   sh review/world27/openings.sh <prefix a|b>
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
P=$1
PORT=5195; [ "$P" = b ] && PORT=5196
mkdir -p review/world27/frames
for w in 3 7 11 19 23 31 42 58 64 77 83 97 105 118 126 141; do
  f="review/world27/frames/$P-open-w$w"
  [ -f "$f-t8.png" ] && continue
  DPR=2 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=low&w=$w&ts=5,8" "$f" 390 844 ../review/world24/run3.mjs 2>&1 | grep -E "STATE|FAILED|pageerror" | sed "s/^/open w$w /" | cut -c1-200
done
echo OPENDONE
