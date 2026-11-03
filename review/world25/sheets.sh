#!/bin/sh
# Inside serve.sh: the 16-world sheets (resumable). sh review/world25/sheets.sh <part>
#   high-a | high-b : desktop High, before (5195) or after (5196)
#   rest            : phone Low before and after, then the near-side close-ups before and after
cd "$(dirname "$0")/../.."
case "$1" in
  high-a) sh review/world24/sheet.sh a25 5195 "" high ;;
  high-b) sh review/world24/sheet.sh b25 5196 "" high ;;
  rest)
    sh review/world24/sheet.sh a25 5195 "" low
    sh review/world24/sheet.sh b25 5196 "" low
    sh review/world24/near.sh a25 5195
    sh review/world24/near.sh b25 5196 ;;
esac
echo SHEETPART "$1"
