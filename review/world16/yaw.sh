#!/bin/sh
# Fallen-head yaw trials at 40 m, desktop (resumable): sh review/world16/yaw.sh
cd "$(dirname "$0")/../.."
for y in ${YAWS:-0.6 0 -0.5 -1.0}; do
  [ -f "review/world16/hy${TAG:-}$y.png" ] && continue
  DPR=1 node tools/shoot.mjs "http://localhost:5196/?qa&look=golden&drive=0&q=high&style=turquoise&w=3&off=40&headyaw=$y" "review/world16/hy${TAG:-}$y" 1280 720 ../review/world13/reveal.mjs 2>&1 | grep -E "STATE|FAILED" | cut -c1-160
done
echo ALLDONE
