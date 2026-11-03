#!/bin/sh
# World round 25: run a capture with its own servers — the frozen baseline build on 5195 (BASE=<its dir>)
# and this tree's dist on 5196 — stopped when it ends (they were lost twice with the task that held them).
#   BASE=<baseline tree> sh review/world25/serve.sh <command> [args...]
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
(cd "$BASE" && exec node node_modules/vite/bin/vite.js preview --port 5195 --strictPort --host 127.0.0.1) > /dev/null 2>&1 &
A=$!
node node_modules/vite/bin/vite.js preview --port 5196 --strictPort --host 127.0.0.1 > /dev/null 2>&1 &
B=$!
sleep 6
curl -s -o /dev/null -w "servers 5195:%{http_code} " http://127.0.0.1:5195/; curl -s -o /dev/null -w "5196:%{http_code}\n" http://127.0.0.1:5196/
"$@"
kill $A $B
echo SERVEDONE
