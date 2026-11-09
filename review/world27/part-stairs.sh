#!/bin/sh
# Inside serve.sh: world 5's forced flights on the phone, before (5195) and after (5196).
cd "$(dirname "$0")/../.."
export CHROME=${CHROME:-/opt/pw-browsers/chromium-1243/chrome-linux64/chrome}
mkdir -p review/world27/frames
URL=http://localhost:5195 node review/world27/stairs.mjs review/world27/frames/a-stairs 2>&1 | grep -E "STAIRSDONE|Error|error" | cut -c1-200
URL=http://localhost:5196 node review/world27/stairs.mjs review/world27/frames/b-stairs 2>&1 | grep -E "STAIRSDONE|Error|error" | cut -c1-200
