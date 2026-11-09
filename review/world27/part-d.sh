#!/bin/sh
# Inside serve.sh: the 16-world phone Low sheets (before 5195, after 5196).
cd "$(dirname "$0")/../.."
sh review/world24/sheet.sh a27 5195 "" low
sh review/world24/sheet.sh b27 5196 "" low
echo PARTD
