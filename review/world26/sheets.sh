#!/bin/sh
# Inside serve.sh: the 16-world sheets (resumable; frames in review/world24/frames). sh review/world26/sheets.sh <part> [seeds]
#   high-a | high-b | low-a | low-b : desktop High / phone Low, before (5195, b82421e) or after (5196)
#   near-a | near-b                 : the near-side close-ups (High)
cd "$(dirname "$0")/../.."
S=${2:-"3 7 11 19 23 31 42 58 64 77 83 97 105 118 126 141"}
case "$1" in
  high-a) sh review/world24/sheet.sh a26 5195 "$S" high ;;
  high-b) sh review/world24/sheet.sh b26 5196 "$S" high ;;
  low-a) sh review/world24/sheet.sh a26 5195 "$S" low ;;
  low-b) sh review/world24/sheet.sh b26 5196 "$S" low ;;
  near-a) sh review/world24/near.sh a26 5195 "$S" ;;
  near-b) sh review/world24/near.sh b26 5196 "$S" ;;
esac
echo SHEETPART "$1"
