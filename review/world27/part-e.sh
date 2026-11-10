#!/bin/sh
# Inside serve.sh: the look views and phone openings after (5196) again, on the final build (stairs and opening heroes in).
cd "$(dirname "$0")/../.."
rm -f review/world27/frames/b-high-* review/world27/frames/b-open-*
sh review/world27/openings.sh b
sh review/world27/look.sh b
echo PARTE
