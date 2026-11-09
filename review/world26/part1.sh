#!/bin/sh
# Inside serve.sh: perf before/after, then the after High sheets of the first eight worlds.
cd "$(dirname "$0")/../.."
sh review/world26/perf.sh
sh review/world26/sheets.sh high-b "3 7 11 19 23 31 42 58"
