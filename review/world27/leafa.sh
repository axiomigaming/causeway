#!/bin/sh
# World round 27: a leaf-only "before" — this tree's build with the shipped kit of 7011da2 (its leaf
# atlases with the hard 0/1 cut-outs) — so the 1x phone stills compare the same leaves in the same frame.
#   sh review/world27/leafa.sh <out-dir> <base-tree>
cd "$(dirname "$0")/../.."
OUT=$1
BASE=$2
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r dist "$OUT/dist"
cp package.json vite.config.ts "$OUT/"
ln -s "$(pwd)/node_modules" "$OUT/node_modules"
cp "$BASE/dist/assets/kit.mobile.glb" "$BASE/dist/assets/kit.high.glb" "$OUT/dist/assets/"
echo LEAFA "$OUT"
