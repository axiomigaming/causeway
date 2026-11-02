#!/bin/sh
# Controlled before/after stills (resumable): sh review/world24/proof.sh <prefix> <port>
#   (a = the frozen baseline build, b = this tree)
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
P=${1:-pa}
PORT=${2:-5195}
mkdir -p review/world24/frames
shot() {
  f="review/world24/frames/$P-$1"
  [ -f "$f.png" ] && return
  DPR=1 node tools/shoot.mjs "http://localhost:$PORT/?qa&q=high&$2" "$f" 1280 720 ../review/world24/proof.mjs 2>&1 | grep -E "STATE|SIDE|FAILED|pageerror" | sed "s/^/$1 /" | cut -c1-220
}
shot overgrown "w=7&look=golden&sec=overgrown,overgrown,overgrown&t=26&side=1"
shot overgrown-l "w=7&look=golden&sec=overgrown,overgrown,overgrown&t=26&side=-1"
shot islets "w=3&look=golden&sec=approach,approach,approach&t=26&side=1"
shot cutting "w=64&look=golden&sec=cutting,cutting,cutting&t=26&side=1"
shot log "w=118&look=golden&t=12&obs=log&obsT=1.7"
shot start "w=126&t=3"
echo ALLDONE
