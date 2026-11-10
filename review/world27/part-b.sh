#!/bin/sh
# Inside serve.sh: round 27's after captures (this tree on 5196): look views, phone openings, the 1x leaf pairs.
cd "$(dirname "$0")/../.."
sh review/world27/look.sh b
sh review/world27/openings.sh b
sh review/world27/leaf1x.sh
echo PARTB
