#!/bin/sh
# One capture chunk with its own servers (base b82421e on 5195, this tree on 5196), after <wait-file>
# holds <marker>: sh review/world26/chunk.sh <wait-file> <marker> <command...>
cd "$(dirname "$0")/../.."
W=$1; M=$2; shift 2
until grep -q "$M" "$W" 2>/dev/null; do sleep 15; done
export BASE=/tmp/claude-0/-home-user-branchfall/8bad0aba-7915-5210-bf1b-c2375b4d19f3/scratchpad/base26
sh review/world25/serve.sh "$@"
echo CHUNKDONE
